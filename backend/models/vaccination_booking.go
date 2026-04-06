package models

import "time"

// VaccinationBookingFacade stores app-facing vaccination booking metadata.
type VaccinationBookingFacade struct {
	ID                    uint      `gorm:"primaryKey" json:"id"`
	ProjectID             uint      `gorm:"not null;index" json:"project_id"`
	TenantID              uint      `gorm:"not null;index" json:"tenant_id"`
	ClinicIntegrationID   string    `gorm:"size:64;not null;index" json:"clinic_integration_id"`
	ExternalBookingID     string    `gorm:"size:64;not null;uniqueIndex" json:"external_booking_id"`
	IdempotencyKey        string    `gorm:"size:128;not null;uniqueIndex" json:"idempotency_key"`
	InternalAppointmentID *uint     `gorm:"index" json:"internal_appointment_id"`
	PetID                 string    `gorm:"size:64;not null;index" json:"pet_id"`
	PetName               string    `gorm:"size:128" json:"pet_name"`
	OwnerName             string    `gorm:"size:128" json:"owner_name"`
	OwnerPhone            string    `gorm:"size:32" json:"owner_phone"`
	OwnerEmail            string    `gorm:"size:255" json:"owner_email"`
	VaccineCode           string    `gorm:"size:64;not null;index" json:"vaccine_code"`
	ScheduledAt           time.Time `gorm:"not null;index" json:"scheduled_at"`
	Status                string    `gorm:"size:32;not null;index" json:"status"`
	RawRequestJSON        string    `gorm:"type:text" json:"-"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`

	Project             MerchantProject    `gorm:"foreignKey:ProjectID"`
	Tenant              Tenant             `gorm:"foreignKey:TenantID"`
	InternalAppointment *ClinicAppointment `gorm:"foreignKey:InternalAppointmentID"`
}

func (VaccinationBookingFacade) TableName() string {
	return "vaccination_booking_facades"
}
