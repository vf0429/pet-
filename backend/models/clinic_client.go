package models

import "time"

// ClinicClient represents a pet owner profile (maps to ezyVet Contact).
type ClinicClient struct {
	ID               uint      `gorm:"primaryKey" json:"id"`
	TenantID         uint      `gorm:"not null;index:idx_clinic_clients_tenant,priority:1" json:"tenant_id"`
	ExternalEzyvetID *int64    `gorm:"uniqueIndex:idx_clinic_clients_ezyvet" json:"external_ezyvet_id"`
	FirstName        string    `gorm:"size:128;not null" json:"first_name"`
	LastName         string    `gorm:"size:128;not null;index" json:"last_name"`
	Phone            string    `gorm:"size:64" json:"phone"`
	Email            string    `gorm:"size:255;index" json:"email"`
	Address          string    `gorm:"type:text" json:"address"`
	IsVet            bool      `gorm:"not null;default:false" json:"is_vet"`
	IsStaff          bool      `gorm:"not null;default:false" json:"is_staff"`
	Active           bool      `gorm:"not null;default:true;index" json:"active"`
	Notes            string    `gorm:"type:text" json:"notes"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
	Tenant           Tenant    `gorm:"foreignKey:TenantID" json:"-"`
}
