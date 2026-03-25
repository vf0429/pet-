package handlers

import (
	"net/http"
	"petwell-merchant-backend/models"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// LoginRequest represents the login request body
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email,max=255"`
	Password string `json:"password" binding:"required,min=8,max=72"`
}

// LoginResponse represents the login response
type LoginResponse struct {
	SessionID string         `json:"session_id"`
	ExpiresAt string         `json:"expires_at"`
	User      UserResponse   `json:"user"`
	Tenant    TenantResponse `json:"tenant"`
}

// UserResponse represents the user info in responses
type UserResponse struct {
	ID                 uint   `json:"id"`
	Name               string `json:"name"`
	Email              string `json:"email"`
	Role               string `json:"role"`
	CanSwitch          bool   `json:"can_switch"`
	ActiveBusinessType string `json:"active_business_type"`
}

// TenantResponse represents the tenant info in responses
type TenantResponse struct {
	ID     uint   `json:"id"`
	Name   string `json:"name"`
	Type   string `json:"type"`
	Status string `json:"status"`
}

// APIResponse represents the unified API response format
type APIResponse struct {
	Code    int         `json:"code"`
	Data    interface{} `json:"data,omitempty"`
	Message string      `json:"message"`
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error     string `json:"error"`
	Message   string `json:"message"`
	RequestID string `json:"request_id,omitempty"`
}

// Login handles POST /merchant/auth/login
func Login(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req LoginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, ErrorResponse{
				Error:   "invalid_request",
				Message: "Email and password are required.",
			})
			return
		}

		// Find user by email
		var user models.MerchantUser
		if err := db.Where("email = ?", req.Email).First(&user).Error; err != nil {
			c.JSON(http.StatusUnauthorized, ErrorResponse{
				Error:   "invalid_credentials",
				Message: "Email or password is incorrect.",
			})
			return
		}

		// Verify password
		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
			c.JSON(http.StatusUnauthorized, ErrorResponse{
				Error:   "invalid_credentials",
				Message: "Email or password is incorrect.",
			})
			return
		}

		// Load tenant
		var tenant models.Tenant
		if err := db.Where("id = ?", user.TenantID).First(&tenant).Error; err != nil {
			c.JSON(http.StatusInternalServerError, ErrorResponse{
				Error:   "internal_error",
				Message: "Unexpected server error.",
			})
			return
		}

		// Check tenant status
		if tenant.Status == models.TenantStatusSuspended {
			c.JSON(http.StatusForbidden, ErrorResponse{
				Error:   "account_suspended",
				Message: "This tenant account is suspended.",
			})
			return
		}

		// Generate session ID (UUID v4)
		sessionID := uuid.New().String()
		expiresAt := time.Now().Add(24 * time.Hour)

		// Create session
		session := models.MerchantSession{
			ID:        sessionID,
			UserID:    user.ID,
			TenantID:  tenant.ID,
			ExpiresAt: expiresAt,
		}

		if err := db.Create(&session).Error; err != nil {
			c.JSON(http.StatusInternalServerError, ErrorResponse{
				Error:   "internal_error",
				Message: "Unexpected server error.",
			})
			return
		}

		// Build response
		response := LoginResponse{
			SessionID: sessionID,
			ExpiresAt: expiresAt.Format(time.RFC3339),
			User: UserResponse{
				ID:                 user.ID,
				Name:               user.Name,
				Email:              user.Email,
				Role:               string(user.Role),
				CanSwitch:          user.CanSwitch,
				ActiveBusinessType: string(user.ActiveBusinessType),
			},
			Tenant: TenantResponse{
				ID:     tenant.ID,
				Name:   tenant.Name,
				Type:   string(tenant.Type),
				Status: string(tenant.Status),
			},
		}

		c.JSON(http.StatusOK, response)
	}
}

// Logout handles session revocation (utility function, not an HTTP handler)
func Logout(db *gorm.DB, sessionID string) error {
	now := time.Now()
	return db.Model(&models.MerchantSession{}).
		Where("id = ?", sessionID).
		Update("revoked_at", now).Error
}
