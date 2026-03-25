package middleware

import (
	"context"
	"net/http"
	"petwell-merchant-backend/authctx"
	"petwell-merchant-backend/models"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	// AuthContextKey is the key used to store auth context in request context
	AuthContextKey = "merchant_auth_context"
)

// MerchantAuthMiddleware creates a middleware for session-based authentication
func MerchantAuthMiddleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		sessionID := c.GetHeader("X-Session-ID")
		if sessionID == "" {
			writeError(c, http.StatusUnauthorized, "session_missing", "X-Session-ID header is required.")
			c.Abort()
			return
		}

		requestedBusinessType := c.GetHeader("X-Business-Type")
		if requestedBusinessType == "" {
			writeError(c, http.StatusBadRequest, "missing_business_type", "X-Business-Type header is required.")
			c.Abort()
			return
		}

		if !models.IsValidBusinessType(requestedBusinessType) {
			writeError(c, http.StatusBadRequest, "invalid_business_type", "Business type must be shop or clinic.")
			c.Abort()
			return
		}

		// Preload session + user + tenant
		var session models.MerchantSession
		if err := db.Preload("User").Preload("Tenant").
			Where("id = ?", sessionID).
			First(&session).Error; err != nil {
			writeError(c, http.StatusUnauthorized, "session_expired", "Session is invalid or expired.")
			c.Abort()
			return
		}

		// Validate session status
		sessionStatus := session.GetStatus()
		if sessionStatus == models.SessionStatusExpired {
			writeError(c, http.StatusUnauthorized, "session_expired", "Session is invalid or expired.")
			c.Abort()
			return
		}
		if sessionStatus == models.SessionStatusRevoked {
			writeError(c, http.StatusUnauthorized, "session_expired", "Session is invalid or expired.")
			c.Abort()
			return
		}

		// Validate tenant status
		if session.Tenant.Status != models.TenantStatusActive {
			writeError(c, http.StatusForbidden, "account_suspended", "This tenant account is suspended.")
			c.Abort()
			return
		}

		// Validate business scope
		user := &session.User
		tenant := &session.Tenant

		// Check if tenant type allows the requested business type
		if !tenant.CanAccessBusinessType(models.BusinessType(requestedBusinessType)) {
			writeError(c, http.StatusForbidden, "business_scope_forbidden", "Current account cannot access this business scope.")
			c.Abort()
			return
		}

		// Check if user can access the requested business type
		if !user.CanSwitch && models.BusinessType(requestedBusinessType) != user.ActiveBusinessType {
			writeError(c, http.StatusForbidden, "business_scope_forbidden", "Current account cannot access this business scope.")
			c.Abort()
			return
		}

		// Inject auth context into request context
		authCtx := &authctx.MerchantAuthContext{
			SessionID:             session.ID,
			UserID:                user.ID,
			TenantID:              tenant.ID,
			Role:                  user.Role,
			CanSwitch:             user.CanSwitch,
			ActiveBusinessType:    user.ActiveBusinessType,
			RequestedBusinessType: models.BusinessType(requestedBusinessType),
		}

		c.Set(AuthContextKey, authCtx)
		c.Request = c.Request.WithContext(context.WithValue(c.Request.Context(), AuthContextKey, authCtx))

		c.Next()
	}
}

// GetAuthContext retrieves the auth context from the gin context
func GetAuthContext(c *gin.Context) (*authctx.MerchantAuthContext, bool) {
	val, exists := c.Get(AuthContextKey)
	if !exists {
		return nil, false
	}
	authCtx, ok := val.(*authctx.MerchantAuthContext)
	return authCtx, ok
}

// writeError writes an error response in the standard format
func writeError(c *gin.Context, status int, errorCode, message string) {
	c.JSON(status, gin.H{
		"error":   errorCode,
		"message": message,
	})
}

// SessionCleanupMiddleware periodically cleans up expired sessions
func SessionCleanupMiddleware(db *gorm.DB, interval time.Duration) gin.HandlerFunc {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			cleanupExpiredSessions(db)
		}
	}()
	return func(c *gin.Context) {
		c.Next()
	}
}

func cleanupExpiredSessions(db *gorm.DB) {
	now := time.Now()
	db.Model(&models.MerchantSession{}).
		Where("expires_at < ? AND revoked_at IS NULL", now).
		Update("revoked_at", now)
}
