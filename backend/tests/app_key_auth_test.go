package tests

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"pawrd-merchant-backend/middleware"
	"pawrd-merchant-backend/models"
	"testing"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/gin-gonic/gin"
)

func TestAppKeyAuthMiddleware_TenantRoutingMissingFailsClosed(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to connect to test database: %v", err)
	}

	if err := db.AutoMigrate(
		&models.Tenant{},
		&models.TenantRoutingConfig{},
		&models.DatabaseTarget{},
		&models.MerchantProject{},
		&models.MerchantAppKey{},
	); err != nil {
		t.Fatalf("Failed to migrate test database: %v", err)
	}

	tenant := models.Tenant{Name: "Happy Paws", Type: models.TenantTypeClinic, Status: models.TenantStatusActive}
	if err := db.Create(&tenant).Error; err != nil {
		t.Fatalf("Failed to create tenant: %v", err)
	}

	project := models.MerchantProject{
		ProjectCode: "pawrd-app",
		TenantID:    tenant.ID,
		Name:        "Pawrd App",
		BaseURL:     "https://app.example.com",
		Status:      "active",
	}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("Failed to create project: %v", err)
	}

	rawKey := "pk_app_route_secret"
	keyHash, _ := bcrypt.GenerateFromPassword([]byte(rawKey), bcrypt.DefaultCost)
	appKey := models.MerchantAppKey{
		ProjectID:   project.ID,
		KeyPrefix:   "pk_app_route",
		KeyHash:     string(keyHash),
		Environment: "prod",
		Status:      "active",
	}
	if err := db.Create(&appKey).Error; err != nil {
		t.Fatalf("Failed to create app key: %v", err)
	}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.AppKeyAuthMiddleware(db))
	r.GET("/app/v1/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	req, _ := http.NewRequest(http.MethodGet, "/app/v1/ping", nil)
	req.Header.Set("X-Merchant-App-Key", rawKey)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503, got %d body=%s", w.Code, w.Body.String())
	}

	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if got := int(body["code"].(float64)); got != 50301 {
		t.Fatalf("expected code 50301, got %d", got)
	}
}

func TestAppKeyAuthMiddleware_SucceedsWhenTenantRoutingConfigured(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to connect to test database: %v", err)
	}

	if err := db.AutoMigrate(
		&models.Tenant{},
		&models.TenantRoutingConfig{},
		&models.DatabaseTarget{},
		&models.MerchantProject{},
		&models.MerchantAppKey{},
	); err != nil {
		t.Fatalf("Failed to migrate test database: %v", err)
	}

	tenant := models.Tenant{Name: "Happy Paws", Type: models.TenantTypeClinic, Status: models.TenantStatusActive}
	if err := db.Create(&tenant).Error; err != nil {
		t.Fatalf("Failed to create tenant: %v", err)
	}
	mustCreateTenantRoutingConfig(t, db, tenant.ID, models.SubscriptionTierOnboarding, models.TenancyModeSharedRLS, "", "")

	project := models.MerchantProject{
		ProjectCode: "pawrd-app",
		TenantID:    tenant.ID,
		Name:        "Pawrd App",
		BaseURL:     "https://app.example.com",
		Status:      "active",
	}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("Failed to create project: %v", err)
	}

	rawKey := "pk_app_route_secret"
	keyHash, _ := bcrypt.GenerateFromPassword([]byte(rawKey), bcrypt.DefaultCost)
	appKey := models.MerchantAppKey{
		ProjectID:   project.ID,
		KeyPrefix:   "pk_app_route",
		KeyHash:     string(keyHash),
		Environment: "prod",
		Status:      "active",
	}
	if err := db.Create(&appKey).Error; err != nil {
		t.Fatalf("Failed to create app key: %v", err)
	}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.AppKeyAuthMiddleware(db))
	r.GET("/app/v1/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"tenant_id":         c.GetUint("app_tenant_id"),
			"subscription_tier": c.GetString("app_subscription_tier"),
			"tenancy_mode":      c.GetString("app_tenancy_mode"),
		})
	})

	req, _ := http.NewRequest(http.MethodGet, "/app/v1/ping", nil)
	req.Header.Set("X-Merchant-App-Key", rawKey)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", w.Code, w.Body.String())
	}
}
