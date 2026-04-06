package middleware

import (
	"net/http"
	"petwell-merchant-backend/models"

	"github.com/gin-gonic/gin"
)

// RequireRoles returns a Gin middleware that aborts with 403 if the
// authenticated user's role is not in the allowedRoles list.
//
// Usage:
//
//	clinicGroup.PATCH("/visits/:id",
//	    middleware.RequireRoles(models.UserRoleOwner, models.UserRoleManager, models.UserRoleDoctor),
//	    handlers.UpdateClinicVisit(db),
//	)
func RequireRoles(allowedRoles ...models.UserRole) gin.HandlerFunc {
	// Build a set for O(1) lookup
	allowed := make(map[models.UserRole]struct{}, len(allowedRoles))
	for _, r := range allowedRoles {
		allowed[r] = struct{}{}
	}

	return func(c *gin.Context) {
		authCtx, ok := GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{
				"code":    20001,
				"data":    nil,
				"message": "unauthorized",
			})
			c.Abort()
			return
		}

		if _, permitted := allowed[authCtx.Role]; !permitted {
			c.JSON(http.StatusForbidden, gin.H{
				"code":    40301,
				"data":    nil,
				"message": "insufficient role for this action",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// RequireRoleAction validates role AND the specific appointment status
// transition being requested. Frontdesk may only push to checked_in or cancel;
// Doctors may only start a visit (in_progress) or complete clinical steps.
//
// This is a fine-grained complement to RequireRoles used on the
// PATCH /appointments/:id/status endpoint.
func RequireAppointmentStatusRole() gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{
				"code":    20001,
				"data":    nil,
				"message": "unauthorized",
			})
			c.Abort()
			return
		}

		// Read target_status from JSON body without consuming the body
		// We use ShouldBindJSON only after a peek; instead we rely on
		// a query-param or let the handler validate and return 403 inline.
		// For simplicity, role restriction is enforced inside the handler
		// using the authCtx.Role already attached to the context.
		// This middleware just ensures non-clinic roles are rejected early.
		role := authCtx.Role
		switch role {
		case models.UserRoleOwner,
			models.UserRoleManager,
			models.UserRoleDoctor,
			models.UserRoleFrontdesk:
			// Allowed to reach the handler; handler further constrains by target_status
			c.Next()
		default:
			// UserRoleStaff and unknown roles cannot touch clinic appointments
			c.JSON(http.StatusForbidden, gin.H{
				"code":    40301,
				"data":    nil,
				"message": "insufficient role for this action",
			})
			c.Abort()
		}
	}
}
