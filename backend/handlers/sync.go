package handlers

import (
	"net/http"
	"time"

	"petwell-merchant-backend/middleware"
	"petwell-merchant-backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GetPendingTasks handles GET /v1/merchant/pending-tasks
// Returns tasks from app_sync_queue created in the last 5 minutes for the current tenant and business type.
func GetPendingTasks(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "session_expired"})
			return
		}

		fiveMinutesAgo := time.Now().Add(-5 * time.Minute)

		var tasks []models.AppSyncQueue
		err := db.Where(
			"tenant_id = ? AND created_at >= ? AND status = ?",
			authCtx.TenantID,
			fiveMinutesAgo,
			models.AppSyncQueueStatusPending,
		).Order("created_at DESC").Find(&tasks).Error

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		taskResponses := make([]PendingTaskItem, len(tasks))
		for i, task := range tasks {
			taskResponses[i] = PendingTaskItem{
				Type:      task.EntityType,
				EntityID:  task.EntityID,
				Payload:   task.Payload,
				CreatedAt: task.CreatedAt.Format(time.RFC3339),
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"tasks": taskResponses,
				"count": len(taskResponses),
			},
			"message": "ok",
		})
	}
}

// PendingTaskItem represents a single pending task in the response
type PendingTaskItem struct {
	Type      string `json:"type"`
	EntityID  string `json:"entity_id"`
	Payload   string `json:"payload"`
	CreatedAt string `json:"created_at"`
}

// GetSyncStatus handles GET /v1/merchant/sync/status
// Returns aggregated sync status for the current tenant covering orders, appointments,
// notifications sent today, and dead letter count.
func GetSyncStatus(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "session_expired"})
			return
		}

		tenantID := authCtx.TenantID

		// --- Orders ---
		var orderLastSynced *time.Time
		var orderPendingCount int64
		var orderFailedCount int64

		db.Model(&models.AppSyncQueue{}).
			Where("tenant_id = ? AND entity_type = ? AND status = ?", tenantID, "order", models.AppSyncQueueStatusPending).
			Count(&orderPendingCount)

		db.Model(&models.AppSyncQueue{}).
			Where("tenant_id = ? AND entity_type = ? AND status = ?", tenantID, "order", models.AppSyncQueueStatusDeadLetter).
			Count(&orderFailedCount)

		var orderLastSyncedRaw *time.Time
		db.Model(&models.AppSyncQueue{}).
			Select("MAX(updated_at) as last_synced").
			Where("tenant_id = ? AND entity_type = ? AND status IN (?, ?)", tenantID, "order", models.AppSyncQueueStatusSent, models.AppSyncQueueStatusDeadLetter).
			Scan(&orderLastSyncedRaw)
		orderLastSynced = orderLastSyncedRaw

		// --- Appointments ---
		var apptLastSynced *time.Time
		var apptPendingCount int64
		var apptFailedCount int64

		db.Model(&models.AppSyncQueue{}).
			Where("tenant_id = ? AND entity_type = ? AND status = ?", tenantID, "appointment", models.AppSyncQueueStatusPending).
			Count(&apptPendingCount)

		db.Model(&models.AppSyncQueue{}).
			Where("tenant_id = ? AND entity_type = ? AND status = ?", tenantID, "appointment", models.AppSyncQueueStatusDeadLetter).
			Count(&apptFailedCount)

		var apptLastSyncedRaw *time.Time
		db.Model(&models.AppSyncQueue{}).
			Select("MAX(updated_at) as last_synced").
			Where("tenant_id = ? AND entity_type = ? AND status IN (?, ?)", tenantID, "appointment", models.AppSyncQueueStatusSent, models.AppSyncQueueStatusDeadLetter).
			Scan(&apptLastSyncedRaw)
		apptLastSynced = apptLastSyncedRaw

		// --- Notifications sent today ---
		today := time.Now().Format("2006-01-02")
		var notificationsSentToday int64
		db.Model(&models.AppSyncQueue{}).
			Where("tenant_id = ? AND status = ? AND DATE(created_at) = ?", tenantID, models.AppSyncQueueStatusSent, today).
			Count(&notificationsSentToday)

		// --- Dead letter count ---
		var deadLetterCount int64
		db.Model(&models.AppSyncQueue{}).
			Where("tenant_id = ? AND status = ?", tenantID, models.AppSyncQueueStatusDeadLetter).
			Count(&deadLetterCount)

		// Format timestamps
		formatTime := func(t *time.Time) string {
			if t == nil {
				return ""
			}
			return t.Format(time.RFC3339)
		}

		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"orders": gin.H{
					"last_synced_at": formatTime(orderLastSynced),
					"pending_count":  orderPendingCount,
					"failed_count":   orderFailedCount,
				},
				"appointments": gin.H{
					"last_synced_at": formatTime(apptLastSynced),
					"pending_count":  apptPendingCount,
					"failed_count":   apptFailedCount,
				},
				"notifications_sent_today": notificationsSentToday,
				"dead_letter_count":        deadLetterCount,
			},
			"message": "ok",
		})
	}
}
