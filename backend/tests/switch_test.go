package tests

import (
	"bytes"
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

func setupSwitchTestDB(t *testing.T) (*gorm.DB, *models.MerchantUser, *models.Tenant) {
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

	// Create tenant with type=both
	tenant := models.Tenant{
		Name:   "Happy Paws",
		Type:   models.TenantTypeBoth,
		Status: models.TenantStatusActive,
	}
	db.Create(&tenant)

	// Create switchable user
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

func TestSwitchBusiness_Success(t *testing.T) {
	db, user, tenant := setupSwitchTestDB(t)
	session := createTestSession(db, user.ID, tenant.ID)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.MerchantAuthMiddleware(db))
	r.PATCH("/merchant/me/switch", handlers.SwitchBusiness(db))

	body := map[string]string{
		"business_type": "clinic",
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("PATCH", "/merchant/me/switch", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Session-ID", session.ID)
	req.Header.Set("X-Business-Type", "shop")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	var response handlers.SwitchBusinessResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response.ActiveBusinessType != "clinic" {
		t.Errorf("Expected active_business_type clinic, got %s", response.ActiveBusinessType)
	}

	// Verify database was updated
	var updatedUser models.MerchantUser
	db.First(&updatedUser, user.ID)
	if updatedUser.ActiveBusinessType != models.BusinessTypeClinic {
		t.Errorf("Expected database active_business_type clinic, got %s", updatedUser.ActiveBusinessType)
	}
}

func TestSwitchBusiness_InvalidBusinessType(t *testing.T) {
	db, user, tenant := setupSwitchTestDB(t)
	session := createTestSession(db, user.ID, tenant.ID)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.MerchantAuthMiddleware(db))
	r.PATCH("/merchant/me/switch", handlers.SwitchBusiness(db))

	body := map[string]string{
		"business_type": "invalid",
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("PATCH", "/merchant/me/switch", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Session-ID", session.ID)
	req.Header.Set("X-Business-Type", "shop")
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

func TestSwitchBusiness_SwitchNotAllowed(t *testing.T) {
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

	// Create non-switchable user
	user := models.MerchantUser{
		TenantID:           tenant.ID,
		Email:              "staff@happypaws.com",
		PasswordHash:       string(passwordHash),
		Name:               "Happy Paws Staff",
		Role:               models.UserRoleStaff,
		ActiveBusinessType: models.BusinessTypeShop,
		CanSwitch:          false, // Cannot switch
		Status:             models.UserStatusActive,
	}
	db.Create(&user)

	session := createTestSession(db, user.ID, tenant.ID)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.MerchantAuthMiddleware(db))
	r.PATCH("/merchant/me/switch", handlers.SwitchBusiness(db))

	body := map[string]string{
		"business_type": "clinic",
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("PATCH", "/merchant/me/switch", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
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

	if response.Error != "switch_not_allowed" {
		t.Errorf("Expected error switch_not_allowed, got %s", response.Error)
	}
}

func TestSwitchBusiness_BusinessScopeForbidden_SingleTypeTenant(t *testing.T) {
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

	// Create shop-only tenant
	tenant := models.Tenant{
		Name:   "Shop Only",
		Type:   models.TenantTypeShop,
		Status: models.TenantStatusActive,
	}
	db.Create(&tenant)

	// Create switchable user on shop-only tenant
	user := models.MerchantUser{
		TenantID:           tenant.ID,
		Email:              "staff@shoponly.com",
		PasswordHash:       string(passwordHash),
		Name:               "Shop Staff",
		Role:               models.UserRoleStaff,
		ActiveBusinessType: models.BusinessTypeShop,
		CanSwitch:          true, // Even if can_switch is true, tenant.type=shop should prevent switching
		Status:             models.UserStatusActive,
	}
	db.Create(&user)

	session := createTestSession(db, user.ID, tenant.ID)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.MerchantAuthMiddleware(db))
	r.PATCH("/merchant/me/switch", handlers.SwitchBusiness(db))

	body := map[string]string{
		"business_type": "clinic",
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("PATCH", "/merchant/me/switch", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
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

func TestSwitchBusiness_MissingBusinessType(t *testing.T) {
	db, user, tenant := setupSwitchTestDB(t)
	session := createTestSession(db, user.ID, tenant.ID)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.MerchantAuthMiddleware(db))
	r.PATCH("/merchant/me/switch", handlers.SwitchBusiness(db))

	body := map[string]string{}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("PATCH", "/merchant/me/switch", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Session-ID", session.ID)
	req.Header.Set("X-Business-Type", "shop")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", w.Code)
	}

	var response handlers.ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response.Error != "invalid_request" {
		t.Errorf("Expected error invalid_request, got %s", response.Error)
	}
}

func TestSwitchBusiness_SessionExpired(t *testing.T) {
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

	tenant := models.Tenant{
		Name:   "Happy Paws",
		Type:   models.TenantTypeBoth,
		Status: models.TenantStatusActive,
	}
	db.Create(&tenant)

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

	// Create expired session
	session := models.MerchantSession{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		TenantID:  tenant.ID,
		ExpiresAt: time.Now().Add(-1 * time.Hour),
	}
	db.Create(&session)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.MerchantAuthMiddleware(db))
	r.PATCH("/merchant/me/switch", handlers.SwitchBusiness(db))

	body := map[string]string{
		"business_type": "clinic",
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("PATCH", "/merchant/me/switch", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
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
