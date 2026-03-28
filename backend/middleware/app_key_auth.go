package middleware

import (
	"net/http"
	"petwell-merchant-backend/models"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func appKeyPrefix(key string) string {
	parts := strings.Split(key, "_")
	if len(parts) >= 3 {
		return strings.Join(parts[:3], "_")
	}
	if len(key) <= 12 {
		return key
	}
	return key[:12]
}

// AppKeyAuthMiddleware validates app-facing merchant project keys.
func AppKeyAuthMiddleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rawKey := strings.TrimSpace(c.GetHeader("X-Merchant-App-Key"))
		if rawKey == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 40101, "message": "missing app key", "data": nil})
			c.Abort()
			return
		}

		var appKey models.MerchantAppKey
		if err := db.Preload("Project").
			Where("key_prefix = ? AND status = ?", appKeyPrefix(rawKey), "active").
			First(&appKey).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 40102, "message": "invalid app key", "data": nil})
			c.Abort()
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(appKey.KeyHash), []byte(rawKey)); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 40102, "message": "invalid app key", "data": nil})
			c.Abort()
			return
		}

		if appKey.Project.Status != "active" {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 40301, "message": "project disabled", "data": nil})
			c.Abort()
			return
		}

		now := time.Now()
		_ = db.Model(&models.MerchantAppKey{}).Where("id = ?", appKey.ID).Update("last_used_at", now).Error

		c.Set("app_project_id", appKey.Project.ID)
		c.Set("app_tenant_id", appKey.Project.TenantID)
		c.Next()
	}
}
