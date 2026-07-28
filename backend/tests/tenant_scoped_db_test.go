package tests

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"pawrd-merchant-backend/handlers"
	"pawrd-merchant-backend/middleware"
	"pawrd-merchant-backend/models"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestTenantScopedDBMiddleware_AppKeySharedRLSProvidesScopedDB(t *testing.T) {
	db, rawKey, _, _, _, _ := setupVaccinationSyncTestDB(t)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	appV1 := r.Group("/app/v1")
	appV1.Use(middleware.AppKeyAuthMiddleware(db))
	appV1.Use(middleware.TenantScopedDBMiddleware(db))
	appV1.GET("/ping", func(c *gin.Context) {
		if middleware.GetTenantDB(c, nil) == nil {
			c.JSON(http.StatusInternalServerError, gin.H{"ok": false})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	req, _ := http.NewRequest(http.MethodGet, "/app/v1/ping", nil)
	req.Header.Set("X-Merchant-App-Key", rawKey)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestTenantScopedDBMiddleware_DedicatedDatabaseFailsClosed(t *testing.T) {
	db, user, tenant := setupAuthTestDB(t)
	session := createTestSession(db, user.ID, tenant.ID)

	if err := db.Model(&models.TenantRoutingConfig{}).
		Where("tenant_id = ?", tenant.ID).
		Updates(map[string]any{
			"subscription_tier": models.SubscriptionTierPremium,
			"tenancy_mode":      models.TenancyModeDedicatedDB,
			"database_key":      "clinic-prod-001",
		}).Error; err != nil {
		t.Fatalf("failed to update routing config: %v", err)
	}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.MerchantAuthMiddleware(db))
	r.Use(middleware.TenantScopedDBMiddleware(db))
	r.GET("/merchant/me", handlers.GetMe(db))

	req, _ := http.NewRequest(http.MethodGet, "/merchant/me", nil)
	req.Header.Set("X-Session-ID", session.ID)
	req.Header.Set("X-Business-Type", "shop")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestTenantScopedDBMiddleware_DedicatedDatabaseUsesRegistry(t *testing.T) {
	db, user, tenant := setupAuthTestDB(t)
	session := createTestSession(db, user.ID, tenant.ID)

	tmpPath := filepath.Join(t.TempDir(), "premium-clinic.db")
	dedicated, err := gorm.Open(sqlite.Open(tmpPath), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open dedicated db: %v", err)
	}
	if err := dedicated.AutoMigrate(&models.Tenant{}, &models.MerchantUser{}, &models.MerchantSession{}, &models.TenantRoutingConfig{}, &models.DatabaseTarget{}); err != nil {
		t.Fatalf("failed to migrate dedicated db: %v", err)
	}
	if err := dedicated.Create(&models.Tenant{ID: tenant.ID, Name: tenant.Name, Type: tenant.Type, Status: tenant.Status, CreatedAt: time.Now(), UpdatedAt: time.Now()}).Error; err != nil {
		t.Fatalf("failed to seed tenant in dedicated db: %v", err)
	}
	if err := dedicated.Create(&models.MerchantUser{ID: user.ID, TenantID: tenant.ID, Email: user.Email, PasswordHash: user.PasswordHash, Name: user.Name, Role: user.Role, ActiveBusinessType: user.ActiveBusinessType, CanSwitch: user.CanSwitch, Status: user.Status}).Error; err != nil {
		t.Fatalf("failed to seed user in dedicated db: %v", err)
	}
	if err := dedicated.Create(&models.MerchantSession{ID: session.ID, UserID: user.ID, TenantID: tenant.ID, ExpiresAt: session.ExpiresAt}).Error; err != nil {
		t.Fatalf("failed to seed session in dedicated db: %v", err)
	}

	envKey := "PAWRD_TEST_DEDICATED_DSN_" + uuid.New().String()[0:8]
	if err := os.Setenv(envKey, tmpPath); err != nil {
		t.Fatalf("failed to set env: %v", err)
	}
	defer os.Unsetenv(envKey)

	target := models.DatabaseTarget{
		DatabaseKey: "clinic-prod-001",
		Driver:      models.DatabaseDriverSQLite,
		DSNEnvVar:   envKey,
		Status:      models.DatabaseTargetStatusActive,
	}
	if err := target.Validate(); err != nil {
		t.Fatalf("invalid target: %v", err)
	}
	if err := db.Create(&target).Error; err != nil {
		t.Fatalf("failed to create database target: %v", err)
	}
	if err := db.Model(&models.TenantRoutingConfig{}).
		Where("tenant_id = ?", tenant.ID).
		Updates(map[string]any{
			"subscription_tier": models.SubscriptionTierPremium,
			"tenancy_mode":      models.TenancyModeDedicatedDB,
			"database_key":      target.DatabaseKey,
		}).Error; err != nil {
		t.Fatalf("failed to update routing config: %v", err)
	}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.MerchantAuthMiddleware(db))
	r.Use(middleware.TenantScopedDBMiddleware(db))
	r.GET("/merchant/me", handlers.GetMe(db))

	req, _ := http.NewRequest(http.MethodGet, "/merchant/me", nil)
	req.Header.Set("X-Session-ID", session.ID)
	req.Header.Set("X-Business-Type", "shop")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestNormalizeSchemaName(t *testing.T) {
	t.Parallel()

	valid := []string{"clinic_abc", "Clinic123", "_private_schema"}
	for _, schema := range valid {
		if _, err := middleware.NormalizeSchemaNameForTest(schema); err != nil {
			t.Fatalf("expected %q to be valid, got %v", schema, err)
		}
	}

	invalid := []string{"", "clinic-abc", "123clinic", "clinic abc", `clinic"abc`}
	for _, schema := range invalid {
		if _, err := middleware.NormalizeSchemaNameForTest(schema); err == nil {
			t.Fatalf("expected %q to be invalid", schema)
		}
	}
}
