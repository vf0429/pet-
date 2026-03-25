package backend

import (
	"petwell-merchant-backend/handlers"
	"petwell-merchant-backend/middleware"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// SetupRoutes configures all API routes for the merchant backend
func SetupRoutes(r *gin.Engine, db *gorm.DB) {
	// API group /merchant
	merchant := r.Group("/merchant")

	// Auth routes (no authentication required)
	auth := merchant.Group("/auth")
	{
		auth.POST("/login", handlers.Login(db))
	}

	// Protected routes (authentication required)
	protected := merchant.Group("")
	protected.Use(middleware.MerchantAuthMiddleware(db))
	{
		// /merchant/me
		protected.GET("/me", handlers.GetMe(db))
		protected.PATCH("/me/switch", handlers.SwitchBusiness(db))
	}
}
