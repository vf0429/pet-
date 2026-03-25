package models

import "time"

// TenantStatus represents the status of a tenant
type TenantStatus string

const (
	TenantStatusActive    TenantStatus = "active"
	TenantStatusSuspended TenantStatus = "suspended"
)

// TenantType represents the business type of a tenant
type TenantType string

const (
	TenantTypeShop   TenantType = "shop"
	TenantTypeClinic TenantType = "clinic"
	TenantTypeBoth   TenantType = "both"
)

// Tenant represents a merchant tenant in the system
type Tenant struct {
	ID        uint         `gorm:"primaryKey" json:"id"`
	Name      string       `gorm:"size:128;not null" json:"name"`
	Type      TenantType   `gorm:"size:16;not null;index" json:"type"`
	Status    TenantStatus `gorm:"size:16;not null;index" json:"status"`
	CreatedAt time.Time    `json:"created_at"`
	UpdatedAt time.Time    `json:"updated_at"`

	MerchantUsers []MerchantUser    `gorm:"foreignKey:TenantID"`
	Sessions      []MerchantSession `gorm:"foreignKey:TenantID"`
}

// TableName returns the table name for Tenant
func (Tenant) TableName() string {
	return "tenants"
}

// IsActive checks if the tenant is active
func (t *Tenant) IsActive() bool {
	return t.Status == TenantStatusActive
}

// CanAccessBusinessType checks if the tenant can access a specific business type
func (t *Tenant) CanAccessBusinessType(bt BusinessType) bool {
	switch t.Type {
	case TenantTypeBoth:
		return true
	case TenantTypeShop:
		return bt == BusinessTypeShop
	case TenantTypeClinic:
		return bt == BusinessTypeClinic
	default:
		return false
	}
}
