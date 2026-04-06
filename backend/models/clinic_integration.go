package models

import "time"

// ClinicIntegrationBinding maps an app-facing clinic integration id to a tenant/project.
type ClinicIntegrationBinding struct {
	ID                  uint      `gorm:"primaryKey" json:"id"`
	ProjectID           uint      `gorm:"not null;index" json:"project_id"`
	TenantID            uint      `gorm:"not null;index" json:"tenant_id"`
	ClinicIntegrationID string    `gorm:"size:64;not null;uniqueIndex" json:"clinic_integration_id"`
	BusinessType        string    `gorm:"size:16;not null;default:'clinic'" json:"business_type"`
	DefaultDoctorID     *uint     `json:"default_doctor_id"`
	Timezone            string    `gorm:"size:64;not null;default:'Asia/Hong_Kong'" json:"timezone"`
	Status              string    `gorm:"size:16;not null;default:'active';index" json:"status"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`

	Project MerchantProject `gorm:"foreignKey:ProjectID"`
	Tenant  Tenant          `gorm:"foreignKey:TenantID"`
	Doctor  *MerchantUser   `gorm:"foreignKey:DefaultDoctorID"`
}

func (ClinicIntegrationBinding) TableName() string {
	return "clinic_integration_bindings"
}

// ClinicScheduleTemplate stores default clinic working hours per weekday.
type ClinicScheduleTemplate struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	TenantID        uint      `gorm:"not null;uniqueIndex:idx_clinic_schedule_templates_tenant_day,priority:1;index" json:"tenant_id"`
	DayOfWeek       int       `gorm:"not null;uniqueIndex:idx_clinic_schedule_templates_tenant_day,priority:2" json:"day_of_week"`
	OpenTime        string    `gorm:"size:8;not null" json:"open_time"`
	CloseTime       string    `gorm:"size:8;not null" json:"close_time"`
	SlotDurationMin int       `gorm:"not null;default:30" json:"slot_duration_min"`
	IsActive        bool      `gorm:"not null;default:true" json:"is_active"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`

	Tenant Tenant `gorm:"foreignKey:TenantID"`
}

func (ClinicScheduleTemplate) TableName() string {
	return "clinic_schedule_templates"
}
