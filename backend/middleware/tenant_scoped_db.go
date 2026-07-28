package middleware

import (
	"fmt"
	"net/http"
	"os"
	"pawrd-merchant-backend/authctx"
	"pawrd-merchant-backend/models"
	"strconv"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

const tenantScopedDBKey = "tenant_scoped_db"

var dedicatedDBCache sync.Map

func GetTenantDB(c *gin.Context, fallback *gorm.DB) *gorm.DB {
	if c == nil {
		return fallback
	}
	if val, exists := c.Get(tenantScopedDBKey); exists {
		if scoped, ok := val.(*gorm.DB); ok && scoped != nil {
			return scoped
		}
	}
	return fallback
}

func TenantScopedDBMiddleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		tenantID, tier, mode, schemaName, databaseKey, ok := resolveTenantRouteContext(c)
		if !ok {
			c.Next()
			return
		}

		scopedDB, tx, err := buildTenantScopedDB(db, tenantID, tier, mode, schemaName, databaseKey)
		if err != nil {
			writeError(c, http.StatusServiceUnavailable, "tenant_route_runtime_unavailable", err.Error())
			c.Abort()
			return
		}

		c.Set(tenantScopedDBKey, scopedDB)
		c.Next()

		if tx == nil {
			return
		}
		if len(c.Errors) > 0 || c.Writer.Status() >= http.StatusBadRequest {
			_ = tx.Rollback().Error
			return
		}
		_ = tx.Commit().Error
	}
}

func resolveTenantRouteContext(c *gin.Context) (uint, models.SubscriptionTier, models.TenancyMode, string, string, bool) {
	if authCtx, ok := GetAuthContext(c); ok {
		return authCtx.TenantID, authCtx.SubscriptionTier, authCtx.TenancyMode, authCtx.SchemaName, authCtx.DatabaseKey, true
	}

	tenantIDVal, exists := c.Get("app_tenant_id")
	if !exists {
		return 0, "", "", "", "", false
	}

	tenantID, ok := tenantIDVal.(uint)
	if !ok || tenantID == 0 {
		return 0, "", "", "", "", false
	}

	return tenantID,
		models.SubscriptionTier(c.GetString("app_subscription_tier")),
		models.TenancyMode(c.GetString("app_tenancy_mode")),
		c.GetString("app_schema_name"),
		c.GetString("app_database_key"),
		true
}

func buildTenantScopedDB(base *gorm.DB, tenantID uint, tier models.SubscriptionTier, mode models.TenancyMode, schemaName, databaseKey string) (*gorm.DB, *gorm.DB, error) {
	if base == nil {
		return nil, nil, fmt.Errorf("tenant route runtime unavailable: base database missing")
	}

	scoped := base.Session(&gorm.Session{NewDB: true})
	dialect := scoped.Dialector.Name()

	switch mode {
	case models.TenancyModeSharedRLS:
		if dialect == "postgres" {
			tx := scoped.Begin()
			if tx.Error != nil {
				return nil, nil, fmt.Errorf("tenant route runtime unavailable: begin failed")
			}
			if err := tx.Exec(
				"SELECT set_config('app.current_clinic_id', ?, true), set_config('app.subscription_tier', ?, true)",
				strconv.FormatUint(uint64(tenantID), 10),
				string(tier),
			).Error; err != nil {
				_ = tx.Rollback().Error
				return nil, nil, fmt.Errorf("tenant route runtime unavailable: failed to apply shared RLS context")
			}
			return tx, tx, nil
		}
		return scoped, nil, nil
	case models.TenancyModeSharedSchema:
		if dialect == "postgres" {
			safeSchema, err := normalizeSchemaName(schemaName)
			if err != nil {
				return nil, nil, fmt.Errorf("tenant route runtime unavailable: invalid schema")
			}
			tx := scoped.Begin()
			if tx.Error != nil {
				return nil, nil, fmt.Errorf("tenant route runtime unavailable: begin failed")
			}
			if err := tx.Exec(fmt.Sprintf(`SET LOCAL search_path TO "%s", public`, safeSchema)).Error; err != nil {
				_ = tx.Rollback().Error
				return nil, nil, fmt.Errorf("tenant route runtime unavailable: failed to apply shared schema context")
			}
			return tx, tx, nil
		}
		return scoped.Set("tenant_schema_name", schemaName), nil, nil
	case models.TenancyModeDedicatedDB:
		if strings.TrimSpace(databaseKey) == "" {
			return nil, nil, fmt.Errorf("tenant route runtime unavailable: dedicated database key missing")
		}
		target, err := resolveDatabaseTarget(scoped, databaseKey)
		if err != nil {
			return nil, nil, err
		}
		dedicatedDB, err := openDedicatedDatabase(target)
		if err != nil {
			return nil, nil, err
		}
		return dedicatedDB.Session(&gorm.Session{NewDB: true}), nil, nil
	default:
		return nil, nil, fmt.Errorf("tenant route runtime unavailable: unsupported tenancy mode")
	}
}

func resolveDatabaseTarget(base *gorm.DB, databaseKey string) (*models.DatabaseTarget, error) {
	var target models.DatabaseTarget
	if err := base.Where("database_key = ?", databaseKey).First(&target).Error; err != nil {
		return nil, fmt.Errorf("tenant route runtime unavailable: dedicated database target missing")
	}
	if !target.IsActive() {
		return nil, fmt.Errorf("tenant route runtime unavailable: dedicated database target inactive")
	}
	if err := target.Validate(); err != nil {
		return nil, fmt.Errorf("tenant route runtime unavailable: dedicated database target invalid")
	}
	return &target, nil
}

func openDedicatedDatabase(target *models.DatabaseTarget) (*gorm.DB, error) {
	cacheKey := strings.TrimSpace(target.DatabaseKey)
	if cached, ok := dedicatedDBCache.Load(cacheKey); ok {
		if db, ok := cached.(*gorm.DB); ok && db != nil {
			return db, nil
		}
	}

	dsn := strings.TrimSpace(os.Getenv(strings.TrimSpace(target.DSNEnvVar)))
	if dsn == "" {
		return nil, fmt.Errorf("tenant route runtime unavailable: dedicated database DSN env missing")
	}

	var (
		db  *gorm.DB
		err error
	)
	switch target.Driver {
	case models.DatabaseDriverPostgres:
		db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	case models.DatabaseDriverSQLite:
		db, err = gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	default:
		return nil, fmt.Errorf("tenant route runtime unavailable: dedicated database driver unsupported")
	}
	if err != nil {
		return nil, fmt.Errorf("tenant route runtime unavailable: dedicated database open failed")
	}

	dedicatedDBCache.Store(cacheKey, db)
	return db, nil
}

func normalizeSchemaName(schemaName string) (string, error) {
	schemaName = strings.TrimSpace(schemaName)
	if schemaName == "" {
		return "", fmt.Errorf("schema name required")
	}
	for i, r := range schemaName {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || r == '_' || (i > 0 && r >= '0' && r <= '9') {
			continue
		}
		return "", fmt.Errorf("invalid schema")
	}
	return schemaName, nil
}

func NormalizeSchemaNameForTest(schemaName string) (string, error) {
	return normalizeSchemaName(schemaName)
}

var _ = authctx.MerchantAuthContext{}
