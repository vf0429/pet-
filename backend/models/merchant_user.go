package models

import "time"

// UserRole represents the role of a merchant user
type UserRole string

const (
	UserRoleOwner     UserRole = "owner"
	UserRoleManager   UserRole = "manager"
	UserRoleStaff     UserRole = "staff"
	UserRoleDoctor    UserRole = "doctor"
	UserRoleFrontdesk UserRole = "frontdesk"
)

// UserStatus represents the status of a merchant user
type UserStatus string

const (
	UserStatusActive   UserStatus = "active"
	UserStatusDisabled UserStatus = "disabled"
)

// BusinessType represents the business type context
type BusinessType string

const (
	BusinessTypeShop   BusinessType = "shop"
	BusinessTypeClinic BusinessType = "clinic"
)

// MerchantUser represents a user in the merchant system
type MerchantUser struct {
	ID                      uint         `gorm:"primaryKey" json:"id"`
	TenantID                uint         `gorm:"not null;index" json:"tenant_id"`
	Email                   string       `gorm:"size:255;not null;uniqueIndex" json:"email"`
	PasswordHash            string       `gorm:"size:255;not null" json:"-"`
	Name                    string       `gorm:"size:128;not null" json:"name"`
	Role                    UserRole     `gorm:"size:32;not null;index" json:"role"`
	ActiveBusinessType      BusinessType `gorm:"size:16;not null;index" json:"active_business_type"`
	CanSwitch               bool         `gorm:"not null;default:false;index" json:"can_switch"`
	Status                  UserStatus   `gorm:"size:16;not null;default:'active';index" json:"status"`
	ExternalEzyvetContactID *int64       `gorm:"uniqueIndex:idx_merchant_user_ezyvet" json:"external_ezyvet_contact_id"`
	CreatedAt               time.Time    `json:"created_at"`
	UpdatedAt               time.Time    `json:"updated_at"`

	Tenant   Tenant            `gorm:"foreignKey:TenantID"`
	Sessions []MerchantSession `gorm:"foreignKey:UserID"`
}

// TableName returns the table name for MerchantUser
func (MerchantUser) TableName() string {
	return "merchant_users"
}

// IsActive checks if the user is active
func (u *MerchantUser) IsActive() bool {
	return u.Status == UserStatusActive
}

// CanSwitchBusinessType checks if the user can switch to the target business type
func (u *MerchantUser) CanSwitchBusinessType(target BusinessType, tenant *Tenant) bool {
	if !u.CanSwitch {
		return false
	}
	if tenant.Type != TenantTypeBoth {
		return false
	}
	return target == BusinessTypeShop || target == BusinessTypeClinic
}
