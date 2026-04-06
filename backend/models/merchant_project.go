package models

import "time"

// MerchantProject represents an app-facing project configuration.
type MerchantProject struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	ProjectCode string    `gorm:"size:64;not null;uniqueIndex" json:"project_code"`
	TenantID    uint      `gorm:"not null;index" json:"tenant_id"`
	Name        string    `gorm:"size:128;not null" json:"name"`
	BaseURL     string    `gorm:"size:255;not null" json:"base_url"`
	Status      string    `gorm:"size:16;not null;default:'active';index" json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`

	Tenant Tenant `gorm:"foreignKey:TenantID"`
}

func (MerchantProject) TableName() string {
	return "merchant_projects"
}

// MerchantAppKey stores app-key authentication credentials.
type MerchantAppKey struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	ProjectID   uint       `gorm:"not null;index" json:"project_id"`
	KeyPrefix   string     `gorm:"size:24;not null;index" json:"key_prefix"`
	KeyHash     string     `gorm:"size:255;not null" json:"-"`
	Environment string     `gorm:"size:16;not null;default:'prod'" json:"environment"`
	Status      string     `gorm:"size:16;not null;default:'active';index" json:"status"`
	LastUsedAt  *time.Time `json:"last_used_at"`
	ExpiresAt   *time.Time `json:"expires_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`

	Project MerchantProject `gorm:"foreignKey:ProjectID"`
}

func (MerchantAppKey) TableName() string {
	return "merchant_app_keys"
}
