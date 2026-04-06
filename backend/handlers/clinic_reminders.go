package handlers

import (
	"net/http"
	"petwell-merchant-backend/middleware"
	"petwell-merchant-backend/models"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// HealthReminderListItem is a single row in the reminders list.
type HealthReminderListItem struct {
	ID              uint    `json:"id"`
	PatientID       uint    `json:"patient_id"`
	PatientName     string  `json:"patient_name"`
	OwnerName       string  `json:"owner_name"`
	Category        string  `json:"category"`
	Name            string  `json:"name"`
	Importance      string  `json:"importance"`
	DueAt           *string `json:"due_at"`
	LastFulfilledAt *string `json:"last_fulfilled_at"`
	DaysUntilDue    *int    `json:"days_until_due"` // negative = overdue
}

// ListClinicRemindersQuery holds query params for GET /clinic/reminders.
type ListClinicRemindersQuery struct {
	// status: overdue | upcoming | fulfilled | "" (all active)
	Status  string `form:"status"`
	Page    int    `form:"page,default=1"`
	PerPage int    `form:"per_page,default=20"`
}

// ListClinicReminders handles GET /v1/merchant/clinic/reminders
func ListClinicReminders(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		var query ListClinicRemindersQuery
		if err := c.ShouldBindQuery(&query); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40005, "data": nil, "message": "invalid query params"})
			return
		}
		if query.Page < 1 {
			query.Page = 1
		}
		if query.PerPage < 1 || query.PerPage > 100 {
			query.PerPage = 20
		}

		tenantID := authCtx.TenantID
		now := time.Now()
		upcoming := now.Add(30 * 24 * time.Hour)

		// Counts for all tabs (always compute)
		countBase := db.Model(&models.HealthReminder{}).Where("tenant_id = ? AND active = ?", tenantID, true)
		var overdueCount, upcomingCount, fulfilledCount int64
		countBase.Where("due_at < ? AND last_fulfilled_at IS NULL", now).Count(&overdueCount)
		countBase.Where("due_at >= ? AND due_at <= ?", now, upcoming).Count(&upcomingCount)
		db.Model(&models.HealthReminder{}).
			Where("tenant_id = ? AND last_fulfilled_at IS NOT NULL", tenantID).
			Count(&fulfilledCount)

		base := db.Model(&models.HealthReminder{}).Where("health_reminders.tenant_id = ?", tenantID)

		switch query.Status {
		case "overdue":
			base = base.Where("health_reminders.active = ? AND health_reminders.due_at < ? AND health_reminders.last_fulfilled_at IS NULL", true, now)
		case "upcoming":
			base = base.Where("health_reminders.active = ? AND health_reminders.due_at >= ? AND health_reminders.due_at <= ?", true, now, upcoming)
		case "fulfilled":
			base = base.Where("health_reminders.last_fulfilled_at IS NOT NULL")
		default:
			base = base.Where("health_reminders.active = ?", true)
		}

		var total int64
		base.Count(&total)

		var reminders []models.HealthReminder
		base.Preload("Patient").Preload("Patient.Client").
			Order("health_reminders.due_at ASC").
			Offset((query.Page - 1) * query.PerPage).
			Limit(query.PerPage).
			Find(&reminders)

		items := make([]HealthReminderListItem, len(reminders))
		for i, r := range reminders {
			var dueStr, lastStr *string
			var daysUntilDue *int
			if r.DueAt != nil {
				s := r.DueAt.Format("2006-01-02T15:04:05Z07:00")
				dueStr = &s
				days := int(r.DueAt.Sub(now).Hours() / 24)
				daysUntilDue = &days
			}
			if r.LastFulfilledAt != nil {
				s := r.LastFulfilledAt.Format("2006-01-02T15:04:05Z07:00")
				lastStr = &s
			}

			patientName := ""
			ownerName := ""
			if r.Patient.ID > 0 {
				patientName = r.Patient.Name
				ownerName = r.Patient.Client.FirstName + " " + r.Patient.Client.LastName
			}

			items[i] = HealthReminderListItem{
				ID:              r.ID,
				PatientID:       r.PatientID,
				PatientName:     patientName,
				OwnerName:       ownerName,
				Category:        r.Category,
				Name:            r.Name,
				Importance:      r.Importance,
				DueAt:           dueStr,
				LastFulfilledAt: lastStr,
				DaysUntilDue:    daysUntilDue,
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"reminders": items,
				"total":     total,
				"page":      query.Page,
				"per_page":  query.PerPage,
				"has_more":  int64(query.Page*query.PerPage) < total,
				"counts": gin.H{
					"overdue":   overdueCount,
					"upcoming":  upcomingCount,
					"fulfilled": fulfilledCount,
				},
			},
			"message": "ok",
		})
	}
}

// FulfillReminderRequest is the request body for PATCH /clinic/reminders/:id
type FulfillReminderRequest struct {
	FulfilledAt string `json:"fulfilled_at"` // RFC3339, optional — defaults to now
}

// FulfillClinicReminder handles PATCH /v1/merchant/clinic/reminders/:id
func FulfillClinicReminder(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		idStr := c.Param("id")
		id, err := strconv.ParseUint(idStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40010, "data": nil, "message": "invalid id"})
			return
		}

		tenantID := authCtx.TenantID

		var req FulfillReminderRequest
		_ = c.ShouldBindJSON(&req) // optional body

		fulfilledAt := time.Now()
		if req.FulfilledAt != "" {
			if t, err := time.Parse(time.RFC3339, req.FulfilledAt); err == nil {
				fulfilledAt = t
			}
		}

		var reminder models.HealthReminder
		if err := db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&reminder).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"code": 30012, "data": nil, "message": "reminder not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		if err := db.Model(&reminder).Updates(map[string]interface{}{
			"last_fulfilled_at": fulfilledAt,
			"updated_at":        time.Now(),
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		fulfilledStr := fulfilledAt.Format("2006-01-02T15:04:05Z07:00")
		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"id":               reminder.ID,
				"last_fulfilled_at": fulfilledStr,
				"updated_at":        time.Now().Format("2006-01-02T15:04:05Z07:00"),
			},
			"message": "ok",
		})
	}
}
