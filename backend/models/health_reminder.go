package models

import "time"

// HealthReminder represents a health reminder or vaccination schedule
// (maps to ezyVet Standard of Care).
type HealthReminder struct {
	ID               uint          `gorm:"primaryKey" json:"id"`
	TenantID         uint          `gorm:"not null;index:idx_health_reminders_tenant,priority:1" json:"tenant_id"`
	ExternalEzyvetID *int64        `gorm:"uniqueIndex:idx_health_reminders_ezyvet" json:"external_ezyvet_id"`
	PatientID        uint          `gorm:"not null;index:idx_health_reminders_patient" json:"patient_id"`
	Category         string        `gorm:"size:32;not null;index" json:"category"` // "Vaccination" or "Treatment"
	Name             string        `gorm:"size:255;not null" json:"name"`          // e.g. "Rabies", "Flea and Tick"
	Importance       string        `gorm:"size:32" json:"importance"`              // e.g. "Core"
	DueAt            *time.Time    `gorm:"index:idx_health_reminders_due" json:"due_at"`
	LastFulfilledAt  *time.Time    `json:"last_fulfilled_at"`
	Active           bool          `gorm:"not null;default:true;index" json:"active"`
	CreatedAt        time.Time     `json:"created_at"`
	UpdatedAt        time.Time     `json:"updated_at"`
	Tenant           Tenant        `gorm:"foreignKey:TenantID" json:"-"`
	Patient          ClinicPatient `gorm:"foreignKey:PatientID" json:"-"`
}
