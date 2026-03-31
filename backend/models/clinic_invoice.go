package models

import "time"

// ClinicInvoice represents an invoice header (maps to ezyVet Invoice).
type ClinicInvoice struct {
	ID               uint           `gorm:"primaryKey" json:"id"`
	TenantID         uint           `gorm:"not null;index:idx_clinic_invoices_tenant,priority:1" json:"tenant_id"`
	ExternalEzyvetID *int64         `gorm:"uniqueIndex:idx_clinic_invoices_ezyvet" json:"external_ezyvet_id"`
	VisitID          *uint          `gorm:"index" json:"visit_id"`
	ClientID         uint           `gorm:"not null;index" json:"client_id"`
	PatientID        *uint          `gorm:"index" json:"patient_id"`
	TotalExTax       float64        `gorm:"type:decimal(12,2);not null;default:0" json:"total_ex_tax"`
	TotalTax         float64        `gorm:"type:decimal(12,2);not null;default:0" json:"total_tax"`
	Currency         string         `gorm:"size:8;not null;default:'HKD'" json:"currency"`
	Status           string         `gorm:"size:24;not null;default:'draft';index" json:"status"`
	IssuedAt         *time.Time     `json:"issued_at"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
	Tenant           Tenant         `gorm:"foreignKey:TenantID" json:"-"`
	Visit            *ClinicVisit   `gorm:"foreignKey:VisitID" json:"-"`
	Client           ClinicClient   `gorm:"foreignKey:ClientID" json:"-"`
	Patient          *ClinicPatient `gorm:"foreignKey:PatientID" json:"-"`
}
