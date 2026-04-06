package tests

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"petwell-merchant-backend/handlers"
	"petwell-merchant-backend/middleware"
	"petwell-merchant-backend/models"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupAuthTestDB(t *testing.T) (*gorm.DB, *models.MerchantUser, *models.Tenant) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to connect to test database: %v", err)
	}

	if err := db.AutoMigrate(
		&models.Tenant{},
		&models.MerchantUser{},
		&models.MerchantSession{},
	); err != nil {
		t.Fatalf("Failed to migrate test database: %v", err)
	}

	passwordHash, _ := bcrypt.GenerateFromPassword([]byte("Test123!"), bcrypt.DefaultCost)

	// Create tenant
	tenant := models.Tenant{
		Name:   "Happy Paws",
		Type:   models.TenantTypeBoth,
		Status: models.TenantStatusActive,
	}
	db.Create(&tenant)

	// Create user
	user := models.MerchantUser{
		TenantID:           tenant.ID,
		Email:              "owner@happypaws.com",
		PasswordHash:       string(passwordHash),
		Name:               "Happy Paws Owner",
		Role:               models.UserRoleOwner,
		ActiveBusinessType: models.BusinessTypeShop,
		CanSwitch:          true,
		Status:             models.UserStatusActive,
	}
	db.Create(&user)

	return db, &user, &tenant
}

func createTestSession(db *gorm.DB, userID, tenantID uint) *models.MerchantSession {
	session := models.MerchantSession{
		ID:        uuid.New().String(),
		UserID:    userID,
		TenantID:  tenantID,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	db.Create(&session)
	return &session
}

func TestGetMe_Success(t *testing.T) {
	db, user, tenant := setupAuthTestDB(t)
	session := createTestSession(db, user.ID, tenant.ID)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.MerchantAuthMiddleware(db))
	r.GET("/merchant/me", handlers.GetMe(db))

	req, _ := http.NewRequest("GET", "/merchant/me", nil)
	req.Header.Set("X-Session-ID", session.ID)
	req.Header.Set("X-Business-Type", "shop")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	var response handlers.MeResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response.SessionID != session.ID {
		t.Errorf("Expected session_id %s, got %s", session.ID, response.SessionID)
	}
	if response.User.Email != "owner@happypaws.com" {
		t.Errorf("Expected email owner@happypaws.com, got %s", response.User.Email)
	}
	if response.User.Role != "owner" {
		t.Errorf("Expected role owner, got %s", response.User.Role)
	}
}

func TestGetMe_SessionMissing(t *testing.T) {
	db, _, _ := setupAuthTestDB(t)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.MerchantAuthMiddleware(db))
	r.GET("/merchant/me", handlers.GetMe(db))

	req, _ := http.NewRequest("GET", "/merchant/me", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401, got %d", w.Code)
	}

	var response handlers.ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response.Error != "session_missing" {
		t.Errorf("Expected error session_missing, got %s", response.Error)
	}
}

func TestGetMe_BusinessTypeMissing(t *testing.T) {
	db, user, tenant := setupAuthTestDB(t)
	session := createTestSession(db, user.ID, tenant.ID)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.MerchantAuthMiddleware(db))
	r.GET("/merchant/me", handlers.GetMe(db))

	req, _ := http.NewRequest("GET", "/merchant/me", nil)
	req.Header.Set("X-Session-ID", session.ID)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", w.Code)
	}

	var response handlers.ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response.Error != "missing_business_type" {
		t.Errorf("Expected error missing_business_type, got %s", response.Error)
	}
}

func TestGetMe_InvalidBusinessType(t *testing.T) {
	db, user, tenant := setupAuthTestDB(t)
	session := createTestSession(db, user.ID, tenant.ID)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.MerchantAuthMiddleware(db))
	r.GET("/merchant/me", handlers.GetMe(db))

	req, _ := http.NewRequest("GET", "/merchant/me", nil)
	req.Header.Set("X-Session-ID", session.ID)
	req.Header.Set("X-Business-Type", "invalid")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", w.Code)
	}

	var response handlers.ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response.Error != "invalid_business_type" {
		t.Errorf("Expected error invalid_business_type, got %s", response.Error)
	}
}

func TestGetMe_SessionExpired(t *testing.T) {
	db, user, tenant := setupAuthTestDB(t)

	// Create expired session
	session := models.MerchantSession{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		TenantID:  tenant.ID,
		ExpiresAt: time.Now().Add(-1 * time.Hour), // Expired
	}
	db.Create(&session)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.MerchantAuthMiddleware(db))
	r.GET("/merchant/me", handlers.GetMe(db))

	req, _ := http.NewRequest("GET", "/merchant/me", nil)
	req.Header.Set("X-Session-ID", session.ID)
	req.Header.Set("X-Business-Type", "shop")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401, got %d", w.Code)
	}

	var response handlers.ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response.Error != "session_expired" {
		t.Errorf("Expected error session_expired, got %s", response.Error)
	}
}

func TestGetMe_BusinessScopeForbidden(t *testing.T) {
	db, _, tenant := setupAuthTestDB(t)

	passwordHash, _ := bcrypt.GenerateFromPassword([]byte("Test123!"), bcrypt.DefaultCost)

	// Create user with clinic only access
	user := models.MerchantUser{
		TenantID:           tenant.ID,
		Email:              "clinicuser@happypaws.com",
		PasswordHash:       string(passwordHash),
		Name:               "Clinic User",
		Role:               models.UserRoleDoctor,
		ActiveBusinessType: models.BusinessTypeClinic,
		CanSwitch:          false,
		Status:             models.UserStatusActive,
	}
	db.Create(&user)

	session := createTestSession(db, user.ID, tenant.ID)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.MerchantAuthMiddleware(db))
	r.GET("/merchant/me", handlers.GetMe(db))

	// Try to access shop with clinic-only user
	req, _ := http.NewRequest("GET", "/merchant/me", nil)
	req.Header.Set("X-Session-ID", session.ID)
	req.Header.Set("X-Business-Type", "shop")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("Expected status 403, got %d", w.Code)
	}

	var response handlers.ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response.Error != "business_scope_forbidden" {
		t.Errorf("Expected error business_scope_forbidden, got %s", response.Error)
	}
}
