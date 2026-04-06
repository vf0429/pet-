package models

import "time"

// AppSyncQueueStatus represents the status of a sync queue entry
type AppSyncQueueStatus string

const (
	AppSyncQueueStatusPending    AppSyncQueueStatus = "pending"
	AppSyncQueueStatusSent       AppSyncQueueStatus = "sent"
	AppSyncQueueStatusFailed     AppSyncQueueStatus = "failed"
	AppSyncQueueStatusDeadLetter AppSyncQueueStatus = "dead_letter"
)

// AppSyncQueue represents a sync queue entry for app notifications
type AppSyncQueue struct {
	ID          uint               `gorm:"primaryKey" json:"id"`
	TenantID    uint               `gorm:"not null;index:idx_app_sync_queue_tenant_status,priority:1;index:idx_app_sync_queue_tenant_entity,priority:1" json:"tenant_id"`
	EntityType  string             `gorm:"size:32;not null;index:idx_app_sync_queue_tenant_entity,priority:2" json:"entity_type"`
	EntityID    string             `gorm:"size:64;not null;index:idx_app_sync_queue_tenant_entity,priority:3" json:"entity_id"`
	Action      string             `gorm:"size:32;not null;index" json:"action"`
	Payload     string             `gorm:"type:text;not null" json:"payload"`
	Status      AppSyncQueueStatus `gorm:"size:24;not null;default:'pending';index:idx_app_sync_queue_tenant_status,priority:2;index:idx_app_sync_queue_consumer_scan,priority:1" json:"status"`
	RetryCount  int                `gorm:"not null;default:0;index:idx_app_sync_queue_consumer_scan,priority:2" json:"retry_count"`
	LastError   string             `gorm:"size:512" json:"last_error"`
	NextRetryAt *time.Time         `gorm:"index;index:idx_app_sync_queue_consumer_scan,priority:3" json:"next_retry_at"`
	CreatedAt   time.Time          `gorm:"not null;index;index:idx_app_sync_queue_consumer_scan,priority:4" json:"created_at"`
	UpdatedAt   time.Time          `json:"updated_at"`

	Tenant Tenant `gorm:"foreignKey:TenantID"`
}

// TableName returns the table name for AppSyncQueue
func (AppSyncQueue) TableName() string {
	return "app_sync_queue"
}
