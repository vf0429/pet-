package middleware

import (
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// CORSMiddleware allows the hosted frontend to reach the hosted backend while
// keeping the allowlist explicit in production.
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := strings.TrimSpace(c.GetHeader("Origin"))
		allowedOrigins := strings.TrimSpace(os.Getenv("ALLOWED_ORIGINS"))
		if allowedOrigins == "" {
			allowedOrigins = "http://localhost:3500,http://localhost:3000"
		}

		allowed := false
		for _, candidate := range strings.Split(allowedOrigins, ",") {
			if strings.TrimSpace(candidate) == origin {
				allowed = true
				break
			}
		}

		if allowed {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, X-Session-ID, X-Business-Type, X-Merchant-App-Key, Idempotency-Key")
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Access-Control-Max-Age", "86400")
		}

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
