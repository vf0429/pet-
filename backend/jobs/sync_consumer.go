package jobs

import (
	"fmt"
	"log"
	"math/rand"
	"time"

	"petwell-merchant-backend/models"

	"gorm.io/gorm"
)

// StartSyncConsumer launches the background sync queue consumer.
// It runs every `interval` duration until the context is cancelled.
func StartSyncConsumer(db *gorm.DB, interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		log.Println("Sync consumer started")
		for range ticker.C {
			ConsumeAppSyncQueue(db)
		}
	}()
}

// ConsumeAppSyncQueue processes pending app sync queue tasks.
// It queries tasks that are pending, within retry limits, and due for retry,
// dispatches each, and marks them as sent or schedules retry with backoff.
// Tasks exceeding retry limits are moved to dead_letter status.
func ConsumeAppSyncQueue(db *gorm.DB) {
	var tasks []models.AppSyncQueue

	// Query: status=pending AND retry_count < 3 AND (next_retry_at IS NULL OR next_retry_at <= NOW())
	// Ordered by created_at ASC, LIMIT 50
	err := db.Where(
		"status = ? AND retry_count < ? AND (next_retry_at IS NULL OR next_retry_at <= ?)",
		models.AppSyncQueueStatusPending,
		3,
		time.Now(),
	).Order("created_at ASC").Limit(50).Find(&tasks).Error

	if err != nil {
		log.Printf("[SyncConsumer] Failed to query pending tasks: %v", err)
		return
	}

	for _, task := range tasks {
		// Panic recover: protect the consumer goroutine from a single task crash
		var dispatchErr error
		func() {
			defer func() {
				if r := recover(); r != nil {
					dispatchErr = fmt.Errorf("panic recovered: %v", r)
					log.Printf("[SyncConsumer] Task %d panicked: %v", task.ID, r)
				}
			}()
			dispatchErr = dispatchTask(task)
		}()

		if dispatchErr != nil {
			// Failure: increment retry count, record error, schedule next retry
			// Backoff is keyed on the retry count BEFORE increment (retry 0→30s, 1→2min, 2→10min)
			retryCount := task.RetryCount + 1
			nextRetryAt := calculateBackoff(task.RetryCount)

			db.Model(&models.AppSyncQueue{}).Where("id = ?", task.ID).Updates(map[string]interface{}{
				"retry_count":   retryCount,
				"last_error":    truncateError(dispatchErr.Error()),
				"next_retry_at": nextRetryAt,
			})

			log.Printf("[SyncConsumer] Task %d failed (attempt %d): %v. Next retry at %v",
				task.ID, retryCount, dispatchErr, nextRetryAt)
		} else {
			// Success: mark as sent
			db.Model(&models.AppSyncQueue{}).Where("id = ?", task.ID).Update("status", models.AppSyncQueueStatusSent)
			log.Printf("[SyncConsumer] Task %d dispatched successfully", task.ID)
		}
	}

	// Mark tasks with retry_count >= 3 and status=pending as dead_letter
	result := db.Model(&models.AppSyncQueue{}).
		Where("status = ? AND retry_count >= ?", models.AppSyncQueueStatusPending, 3).
		Update("status", models.AppSyncQueueStatusDeadLetter)

	if result.Error == nil && result.RowsAffected > 0 {
		log.Printf("[SyncConsumer] Marked %d tasks as dead_letter", result.RowsAffected)
	}
}

// dispatchTask simulates dispatching a task to the app notification service (e.g., APNs).
// Currently returns nil (simulated success) to allow the pipeline to be exercised.
// Real APNs integration is deferred to a future version.
func dispatchTask(task models.AppSyncQueue) error {
	log.Printf("[SyncConsumer] Dispatching task %d: entity_type=%s, entity_id=%s, action=%s",
		task.ID, task.EntityType, task.EntityID, task.Action)

	// Simulate dispatch: randomly return nil (success) for now.
	// In production this would call an APNs or FCM push service.
	_ = task
	return nil // always succeeds in mock mode
}

// calculateBackoff returns the next retry time based on the current retry count.
// Backoff schedule: retry 0 → 30s, retry 1 → 2min, retry 2 → 10min
func calculateBackoff(retryCount int) *time.Time {
	var delay time.Duration
	switch retryCount {
	case 0:
		delay = 30 * time.Second
	case 1:
		delay = 2 * time.Minute
	case 2:
		delay = 10 * time.Minute
	default:
		delay = 10 * time.Minute
	}

	next := time.Now().Add(delay)
	return &next
}

// truncateError truncates error messages to fit the LastError column size (512 bytes).
func truncateError(errMsg string) string {
	const maxLen = 512
	if len(errMsg) > maxLen {
		return errMsg[:maxLen]
	}
	return errMsg
}

// Ensure rand is used (imported but we use deterministic delay above; keep for potential future random jitter)
var _ = rand.Intn
