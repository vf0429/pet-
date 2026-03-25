package handlers

import (
	"net/http"
	"petwell-merchant-backend/middleware"
	"petwell-merchant-backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// MeResponse represents the response for GET /merchant/me
type MeResponse struct {
	SessionID string         `json:"session_id"`
	ExpiresAt string         `json:"expires_at"`
	User      UserResponse   `json:"user"`
	Tenant    TenantResponse `json:"tenant"`
}

// GetMe handles GET /merchant/me
func GetMe(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, ErrorResponse{
				Error:   "session_expired",
				Message: "Session is invalid or expired.",
			})
			return
		}

		// Load user and tenant with tenant_id filter for multi-tenancy
		var user models.MerchantUser
		if err := db.Where("id = ? AND tenant_id = ?", authCtx.UserID, authCtx.TenantID).First(&user).Error; err != nil {
			c.JSON(http.StatusUnauthorized, ErrorResponse{
				Error:   "session_expired",
				Message: "Session is invalid or expired.",
			})
			return
		}

		var tenant models.Tenant
		if err := db.Where("id = ?", authCtx.TenantID).First(&tenant).Error; err != nil {
			c.JSON(http.StatusInternalServerError, ErrorResponse{
				Error:   "internal_error",
				Message: "Unexpected server error.",
			})
			return
		}

		// Load session for expires_at
		var session models.MerchantSession
		if err := db.Where("id = ?", authCtx.SessionID).First(&session).Error; err != nil {
			c.JSON(http.StatusUnauthorized, ErrorResponse{
				Error:   "session_expired",
				Message: "Session is invalid or expired.",
			})
			return
		}

		response := MeResponse{
			SessionID: authCtx.SessionID,
			ExpiresAt: session.ExpiresAt.Format("2006-01-02T15:04:05Z"),
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

// SwitchBusinessRequest represents the request body for PATCH /merchant/me/switch
type SwitchBusinessRequest struct {
	BusinessType string `json:"business_type" binding:"required"`
}

// SwitchBusinessResponse represents the response for PATCH /merchant/me/switch
type SwitchBusinessResponse struct {
	ActiveBusinessType string `json:"active_business_type"`
}

// SwitchBusiness handles PATCH /merchant/me/switch
func SwitchBusiness(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, ErrorResponse{
				Error:   "session_expired",
				Message: "Session is invalid or expired.",
			})
			return
		}

		var req SwitchBusinessRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, ErrorResponse{
				Error:   "invalid_request",
				Message: "business_type is required.",
			})
			return
		}

		// Validate business_type
		if !models.IsValidBusinessType(req.BusinessType) {
			c.JSON(http.StatusBadRequest, ErrorResponse{
				Error:   "invalid_business_type",
				Message: "business_type must be shop or clinic.",
			})
			return
		}

		targetBusinessType := models.BusinessType(req.BusinessType)

		// Load user with tenant_id filter for multi-tenancy
		var user models.MerchantUser
		if err := db.Where("id = ? AND tenant_id = ?", authCtx.UserID, authCtx.TenantID).First(&user).Error; err != nil {
			c.JSON(http.StatusUnauthorized, ErrorResponse{
				Error:   "session_expired",
				Message: "Session is invalid or expired.",
			})
			return
		}

		// Load tenant
		var tenant models.Tenant
		if err := db.Where("id = ?", authCtx.TenantID).First(&tenant).Error; err != nil {
			c.JSON(http.StatusInternalServerError, ErrorResponse{
				Error:   "internal_error",
				Message: "Unexpected server error.",
			})
			return
		}

		// Use state machine to validate the switch
		sm := models.NewUserBusinessStateMachine()
		if err := sm.ValidateSwitch(user.CanSwitch, targetBusinessType, tenant.Type); err != nil {
			if err == models.ErrSwitchNotAllowed {
				c.JSON(http.StatusForbidden, ErrorResponse{
					Error:   "switch_not_allowed",
					Message: "Current account cannot switch business type.",
				})
				return
			}
			if err == models.ErrBusinessScopeForbidden {
				c.JSON(http.StatusForbidden, ErrorResponse{
					Error:   "business_scope_forbidden",
					Message: "Target business type is not available for current tenant or user.",
				})
				return
			}
			c.JSON(http.StatusBadRequest, ErrorResponse{
				Error:   "invalid_business_type",
				Message: "business_type must be shop or clinic.",
			})
			return
		}

		// Update user's active business type
		if err := db.Model(&user).Update("active_business_type", targetBusinessType).Error; err != nil {
			c.JSON(http.StatusInternalServerError, ErrorResponse{
				Error:   "internal_error",
				Message: "Unexpected server error.",
			})
			return
		}

		response := SwitchBusinessResponse{
			ActiveBusinessType: string(targetBusinessType),
		}

		c.JSON(http.StatusOK, response)
	}
}
