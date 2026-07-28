package models

import "time"

// DoctorShift records per-doctor schedule deviations from the clinic template.
// Only "exceptions" need to be stored — if no row exists for a doctor+date,
// the system falls back to the tenant's ClinicScheduleTemplate.
//
// Three cases:
//  1. No row       → doctor follows clinic template (open/close times)
//  2. IsOff = true → doctor is absent; all slots blocked
//  3. StartTime set → doctor works custom hours that day (e.g. 10:00-15:00)
type DoctorShift struct {
	ID        uint      `gorm:"primaryKey"                                                                json:"id"`
	TenantID  uint      `gorm:"not null;uniqueIndex:idx_doctor_shift_uniq,priority:1;index"               json:"tenant_id"`
	DoctorID  uint      `gorm:"not null;uniqueIndex:idx_doctor_shift_uniq,priority:2;index"               json:"doctor_id"`
	ShiftDate time.Time `gorm:"not null;uniqueIndex:idx_doctor_shift_uniq,priority:3"                     json:"shift_date"` // midnight UTC
	IsOff     bool      `gorm:"not null;default:false"                                                    json:"is_off"`
	StartTime string    `gorm:"size:8"                                                                    json:"start_time"` // "09:00" override
	EndTime   string    `gorm:"size:8"                                                                    json:"end_time"`   // "18:00" override
	Note      string    `gorm:"size:255"                                                                  json:"note"`       // e.g. "Annual leave"
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	Tenant Tenant       `gorm:"foreignKey:TenantID" json:"-"`
	Doctor MerchantUser `gorm:"foreignKey:DoctorID" json:"-"`
}

func (DoctorShift) TableName() string {
	return "doctor_shifts"
}
