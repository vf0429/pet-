package tests

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"petwell-merchant-backend/handlers"
	"petwell-merchant-backend/models"
	"testing"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to connect to test database: %v", err)
	}

	// Migrate models
	if err := db.AutoMigrate(
		&models.Tenant{},
		&models.MerchantUser{},
		&models.MerchantSession{},
	); err != nil {
		t.Fatalf("Failed to migrate test database: %v", err)
	}

	return db
}

func seedTestData(db *gorm.DB) {
	passwordHash, _ := bcrypt.GenerateFromPassword([]byte("Test123!"), bcrypt.DefaultCost)

	// Create Tenant 1: Happy Paws (type=both)
	tenant1 := models.Tenant{
		Name:   "Happy Paws",
		Type:   models.TenantTypeBoth,
		Status: models.TenantStatusActive,
	}
	db.Create(&tenant1)

	users1 := []models.MerchantUser{
		{
			TenantID:           tenant1.ID,
			Email:              "owner@happypaws.com",
			PasswordHash:       string(passwordHash),
			Name:               "Happy Paws Owner",
			Role:               models.UserRoleOwner,
			ActiveBusinessType: models.BusinessTypeShop,
			CanSwitch:          true,
			Status:             models.UserStatusActive,
		},
		{
			TenantID:           tenant1.ID,
			Email:              "shop@happypaws.com",
			PasswordHash:       string(passwordHash),
			Name:               "Happy Paws Staff",
			Role:               models.UserRoleStaff,
			ActiveBusinessType: models.BusinessTypeShop,
			CanSwitch:          false,
			Status:             models.UserStatusActive,
		},
	}
	for _, u := range users1 {
		db.Create(&u)
	}

	// Create Tenant 2: Paws Clinic (type=clinic)
	tenant2 := models.Tenant{
		Name:   "Paws Clinic",
		Type:   models.TenantTypeClinic,
		Status: models.TenantStatusActive,
	}
	db.Create(&tenant2)
}

func TestLogin_Success(t *testing.T) {
	db := setupTestDB(t)
	seedTestData(db)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/merchant/auth/login", handlers.Login(db))

	body := map[string]string{
		"email":    "owner@happypaws.com",
		"password": "Test123!",
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("POST", "/merchant/auth/login", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response handlers.LoginResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response.SessionID == "" {
		t.Error("Expected session_id to be set")
	}
	if response.User.Email != "owner@happypaws.com" {
		t.Errorf("Expected email owner@happypaws.com, got %s", response.User.Email)
	}
	if response.User.Role != "owner" {
		t.Errorf("Expected role owner, got %s", response.User.Role)
	}
	if !response.User.CanSwitch {
		t.Error("Expected can_switch to be true")
	}
	if response.User.ActiveBusinessType != "shop" {
		t.Errorf("Expected active_business_type shop, got %s", response.User.ActiveBusinessType)
	}
}

func TestLogin_InvalidCredentials(t *testing.T) {
	db := setupTestDB(t)
	seedTestData(db)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/merchant/auth/login", handlers.Login(db))

	body := map[string]string{
		"email":    "owner@happypaws.com",
		"password": "WrongPassword!",
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("POST", "/merchant/auth/login", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401, got %d", w.Code)
	}

	var response handlers.ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response.Error != "invalid_credentials" {
		t.Errorf("Expected error invalid_credentials, got %s", response.Error)
	}
}

func TestLogin_NonExistentUser(t *testing.T) {
	db := setupTestDB(t)
	seedTestData(db)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/merchant/auth/login", handlers.Login(db))

	body := map[string]string{
		"email":    "nonexistent@example.com",
		"password": "Test123!",
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("POST", "/merchant/auth/login", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401, got %d", w.Code)
	}

	var response handlers.ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response.Error != "invalid_credentials" {
		t.Errorf("Expected error invalid_credentials, got %s", response.Error)
	}
}

func TestLogin_MissingEmail(t *testing.T) {
	db := setupTestDB(t)
	seedTestData(db)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/merchant/auth/login", handlers.Login(db))

	body := map[string]string{
		"password": "Test123!",
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("POST", "/merchant/auth/login", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
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

func TestLogin_SuspendedTenant(t *testing.T) {
	db := setupTestDB(t)

	passwordHash, _ := bcrypt.GenerateFromPassword([]byte("Test123!"), bcrypt.DefaultCost)

	// Create suspended tenant
	tenant := models.Tenant{
		Name:   "Suspended Tenant",
		Type:   models.TenantTypeShop,
		Status: models.TenantStatusSuspended,
	}
	db.Create(&tenant)

	user := models.MerchantUser{
		TenantID:           tenant.ID,
		Email:              "suspended@example.com",
		PasswordHash:       string(passwordHash),
		Name:               "Suspended User",
		Role:               models.UserRoleOwner,
		ActiveBusinessType: models.BusinessTypeShop,
		CanSwitch:          false,
		Status:             models.UserStatusActive,
	}
	db.Create(&user)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/merchant/auth/login", handlers.Login(db))

	body := map[string]string{
		"email":    "suspended@example.com",
		"password": "Test123!",
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("POST", "/merchant/auth/login", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("Expected status 403, got %d", w.Code)
	}

	var response handlers.ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response.Error != "account_suspended" {
		t.Errorf("Expected error account_suspended, got %s", response.Error)
	}
}
