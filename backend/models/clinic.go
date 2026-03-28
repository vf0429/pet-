package models

import "time"

// ─── Appointment ───────────────────────────────────────────────────────────────

// ClinicAppointmentStatus represents the status of a clinic appointment
type ClinicAppointmentStatus string

const (
	ClinicAppointmentStatusPending    ClinicAppointmentStatus = "pending"
	ClinicAppointmentStatusConfirmed  ClinicAppointmentStatus = "confirmed"
	ClinicAppointmentStatusCheckedIn  ClinicAppointmentStatus = "checked_in"
	ClinicAppointmentStatusInProgress ClinicAppointmentStatus = "in_progress"
	ClinicAppointmentStatusCompleted  ClinicAppointmentStatus = "completed"
	ClinicAppointmentStatusCancelled  ClinicAppointmentStatus = "cancelled"
)

// ValidClinicAppointmentStatuses returns all valid appointment statuses
func ValidClinicAppointmentStatuses() []ClinicAppointmentStatus {
	return []ClinicAppointmentStatus{
		ClinicAppointmentStatusPending,
		ClinicAppointmentStatusConfirmed,
		ClinicAppointmentStatusCheckedIn,
		ClinicAppointmentStatusInProgress,
		ClinicAppointmentStatusCompleted,
		ClinicAppointmentStatusCancelled,
	}
}

// IsValidClinicAppointmentStatus checks if a string is a valid appointment status
func IsValidClinicAppointmentStatus(s string) bool {
	for _, status := range ValidClinicAppointmentStatuses() {
		if string(status) == s {
			return true
		}
	}
	return false
}

// ClinicAppointment represents a clinic appointment record
type ClinicAppointment struct {
	ID            uint                    `gorm:"primaryKey" json:"id"`
	TenantID      uint                    `gorm:"not null;index:idx_clinic_appt_tenant_status,priority:1;index:idx_clinic_appt_tenant_date,priority:1;index:idx_clinic_appt_tenant_doctor,priority:1" json:"tenant_id"`
	BusinessType  string                  `gorm:"size:16;not null;default:'clinic';index" json:"business_type"`
	PetName       string                  `gorm:"size:128;not null;index" json:"pet_name"`
	PetOwnerName  string                  `gorm:"size:128;not null;index" json:"pet_owner_name"`
	PetOwnerPhone string                  `gorm:"size:32;not null" json:"pet_owner_phone"`
	DoctorID      uint                    `gorm:"not null;index:idx_clinic_appt_tenant_doctor,priority:2" json:"doctor_id"`
	VisitType     string                  `gorm:"size:32;not null;index" json:"visit_type"`
	ScheduledAt   time.Time               `gorm:"not null;index:idx_clinic_appt_tenant_date,priority:2" json:"scheduled_at"`
	Status        ClinicAppointmentStatus `gorm:"size:24;not null;index:idx_clinic_appt_tenant_status,priority:2" json:"status"`
	CancelReason  string                  `gorm:"size:255" json:"cancel_reason"`
	Notes         string                  `gorm:"type:text" json:"notes"`
	Source        string                  `gorm:"size:16;not null;default:'manual'" json:"source"`
	CreatedAt     time.Time               `json:"created_at"`
	UpdatedAt     time.Time               `json:"updated_at"`

	Tenant Tenant       `gorm:"foreignKey:TenantID"`
	Doctor MerchantUser `gorm:"foreignKey:DoctorID"`
	Visit  *ClinicVisit `gorm:"foreignKey:AppointmentID"`
}

// TableName returns the table name for ClinicAppointment
func (ClinicAppointment) TableName() string {
	return "clinic_appointments"
}

// ─── Visit ─────────────────────────────────────────────────────────────────────

// ClinicVisitStatus represents the status of a clinic visit
type ClinicVisitStatus string

const (
	ClinicVisitStatusInProgress       ClinicVisitStatus = "in_progress"
	ClinicVisitStatusDiagnosed        ClinicVisitStatus = "diagnosed"
	ClinicVisitStatusTreated          ClinicVisitStatus = "treated"
	ClinicVisitStatusPrescriptionDone ClinicVisitStatus = "prescription_done"
	ClinicVisitStatusClosed           ClinicVisitStatus = "closed"
)

// ValidClinicVisitStatuses returns all valid visit statuses
func ValidClinicVisitStatuses() []ClinicVisitStatus {
	return []ClinicVisitStatus{
		ClinicVisitStatusInProgress,
		ClinicVisitStatusDiagnosed,
		ClinicVisitStatusTreated,
		ClinicVisitStatusPrescriptionDone,
		ClinicVisitStatusClosed,
	}
}

// IsValidClinicVisitStatus checks if a string is a valid visit status
func IsValidClinicVisitStatus(s string) bool {
	for _, status := range ValidClinicVisitStatuses() {
		if string(status) == s {
			return true
		}
	}
	return false
}

// ClinicVisit represents a clinic visit (medical record) record
type ClinicVisit struct {
	ID                     uint              `gorm:"primaryKey" json:"id"`
	TenantID               uint              `gorm:"not null;index:idx_clinic_visits_tenant_status,priority:1;index:idx_clinic_visits_tenant_appt,priority:1" json:"tenant_id"`
	AppointmentID          uint              `gorm:"not null;index:idx_clinic_visits_tenant_appt,priority:2" json:"appointment_id"`
	PetName                string            `gorm:"size:128;not null;index" json:"pet_name"`
	PetBreed               string            `gorm:"size:128" json:"pet_breed"`
	PetAge                 string            `gorm:"size:32" json:"pet_age"`
	PetWeight              float64           `gorm:"type:decimal(6,2)" json:"pet_weight"`
	PetMedicalHistory      string            `gorm:"type:text" json:"pet_medical_history"`
	ChiefComplaint         string            `gorm:"type:text" json:"chief_complaint"`
	Temperature            *float64          `gorm:"type:decimal(4,1)" json:"temperature"`
	HeartRate              *int              `json:"heart_rate"`
	RespiratoryRate        *int              `json:"respiratory_rate"`
	GeneralMedicationNotes string            `gorm:"type:text" json:"general_medication_notes"`
	Status                 ClinicVisitStatus `gorm:"size:24;not null;index:idx_clinic_visits_tenant_status,priority:2" json:"status"`
	PushedAt               *time.Time        `json:"pushed_at"`
	ClosedAt               *time.Time        `gorm:"index" json:"closed_at"`
	CreatedAt              time.Time         `json:"created_at"`
	UpdatedAt              time.Time         `json:"updated_at"`

	Tenant        Tenant               `gorm:"foreignKey:TenantID"`
	Appointment   ClinicAppointment    `gorm:"foreignKey:AppointmentID"`
	Diagnoses     []ClinicDiagnosis    `gorm:"foreignKey:VisitID"`
	Prescriptions []ClinicPrescription `gorm:"foreignKey:VisitID"`
	Treatments    []ClinicTreatment    `gorm:"foreignKey:VisitID"`
	Followups     []ClinicFollowup     `gorm:"foreignKey:VisitID"`
	Files         []ClinicVisitFile    `gorm:"foreignKey:VisitID"`
}

// TableName returns the table name for ClinicVisit
func (ClinicVisit) TableName() string {
	return "clinic_visits"
}

// ─── Diagnosis ─────────────────────────────────────────────────────────────────

// ClinicDiagnosis represents a diagnosis record for a visit
type ClinicDiagnosis struct {
	ID        uint   `gorm:"primaryKey" json:"id"`
	VisitID   uint   `gorm:"not null;index:idx_clinic_diagnoses_tenant_visit,priority:2" json:"visit_id"`
	TenantID  uint   `gorm:"not null;index:idx_clinic_diagnoses_tenant_visit,priority:1" json:"tenant_id"`
	Name      string `gorm:"size:255;not null" json:"name"`
	IsPrimary bool   `gorm:"not null;default:false" json:"is_primary"`
	Notes     string `gorm:"type:text" json:"notes"`

	Visit  ClinicVisit `gorm:"foreignKey:VisitID"`
	Tenant Tenant      `gorm:"foreignKey:TenantID"`
}

// TableName returns the table name for ClinicDiagnosis
func (ClinicDiagnosis) TableName() string {
	return "clinic_diagnoses"
}

// ─── Prescription ──────────────────────────────────────────────────────────────

// ClinicPrescription represents a prescription record for a visit
type ClinicPrescription struct {
	ID           uint   `gorm:"primaryKey" json:"id"`
	VisitID      uint   `gorm:"not null;index:idx_clinic_prescriptions_tenant_visit,priority:2" json:"visit_id"`
	TenantID     uint   `gorm:"not null;index:idx_clinic_prescriptions_tenant_visit,priority:1" json:"tenant_id"`
	DrugName     string `gorm:"size:255;not null" json:"drug_name"`
	Dosage       string `gorm:"size:128;not null" json:"dosage"`
	Frequency    string `gorm:"size:128;not null" json:"frequency"`
	DurationDays int    `gorm:"not null;default:1" json:"duration_days"`
	Notes        string `gorm:"type:text" json:"notes"`

	Visit  ClinicVisit `gorm:"foreignKey:VisitID"`
	Tenant Tenant      `gorm:"foreignKey:TenantID"`
}

// TableName returns the table name for ClinicPrescription
func (ClinicPrescription) TableName() string {
	return "clinic_prescriptions"
}

// ─── Treatment ─────────────────────────────────────────────────────────────────

// ClinicTreatment represents a treatment item for a visit
type ClinicTreatment struct {
	ID            uint    `gorm:"primaryKey" json:"id"`
	VisitID       uint    `gorm:"not null;index:idx_clinic_treatments_tenant_visit,priority:2" json:"visit_id"`
	TenantID      uint    `gorm:"not null;index:idx_clinic_treatments_tenant_visit,priority:1" json:"tenant_id"`
	Name          string  `gorm:"size:255;not null" json:"name"`
	PerformedByID uint    `gorm:"not null;index" json:"performed_by_id"`
	Fee           float64 `gorm:"type:decimal(10,2);not null;default:0" json:"fee"`
	Currency      string  `gorm:"size:8;not null;default:'HKD'" json:"currency"`
	Notes         string  `gorm:"type:text" json:"notes"`

	Visit       ClinicVisit  `gorm:"foreignKey:VisitID"`
	Tenant      Tenant       `gorm:"foreignKey:TenantID"`
	PerformedBy MerchantUser `gorm:"foreignKey:PerformedByID"`
}

// TableName returns the table name for ClinicTreatment
func (ClinicTreatment) TableName() string {
	return "clinic_treatments"
}

// ─── Followup ──────────────────────────────────────────────────────────────────

// ClinicFollowupStatus represents the status of a clinic followup
type ClinicFollowupStatus string

const (
	ClinicFollowupStatusPending ClinicFollowupStatus = "pending"
	ClinicFollowupStatusDone    ClinicFollowupStatus = "done"
	ClinicFollowupStatusSkipped ClinicFollowupStatus = "skipped"
)

// ClinicFollowup represents a follow-up record linked to a visit
type ClinicFollowup struct {
	ID         uint                 `gorm:"primaryKey" json:"id"`
	VisitID    uint                 `gorm:"not null;index:idx_clinic_followups_tenant_visit,priority:2" json:"visit_id"`
	TenantID   uint                 `gorm:"not null;index:idx_clinic_followups_tenant_visit,priority:1;index:idx_clinic_followups_tenant_status,priority:1;index:idx_clinic_followups_tenant_due,priority:1" json:"tenant_id"`
	PetName    string               `gorm:"size:128;not null;index" json:"pet_name"`
	Reason     string               `gorm:"size:255;not null" json:"reason"`
	DoctorID   uint                 `gorm:"not null;index" json:"doctor_id"`
	DueAt      time.Time            `gorm:"not null;index:idx_clinic_followups_tenant_due,priority:2" json:"due_at"`
	Status     ClinicFollowupStatus `gorm:"size:16;not null;default:'pending';index:idx_clinic_followups_tenant_status,priority:2" json:"status"`
	ResultNote string               `gorm:"type:text" json:"result_note"`
	CreatedAt  time.Time            `json:"created_at"`
	UpdatedAt  time.Time            `json:"updated_at"`

	Visit  ClinicVisit  `gorm:"foreignKey:VisitID"`
	Tenant Tenant       `gorm:"foreignKey:TenantID"`
	Doctor MerchantUser `gorm:"foreignKey:DoctorID"`
}

// TableName returns the table name for ClinicFollowup
func (ClinicFollowup) TableName() string {
	return "clinic_followups"
}

// ─── PharmacyItem ──────────────────────────────────────────────────────────────

// PharmacyItem represents a drug/medicine item in the clinic pharmacy inventory
type PharmacyItem struct {
	ID                 uint      `gorm:"primaryKey" json:"id"`
	TenantID           uint      `gorm:"not null;index:idx_pharmacy_items_tenant_rx,priority:1;index:idx_pharmacy_items_tenant_expiry,priority:1" json:"tenant_id"`
	Name               string    `gorm:"size:255;not null;index" json:"name"`
	Specification      string    `gorm:"size:255;not null" json:"specification"`
	BatchNo            string    `gorm:"size:64;not null;index" json:"batch_no"`
	ExpiresAt          time.Time `gorm:"not null;index:idx_pharmacy_items_tenant_expiry,priority:2" json:"expires_at"`
	StockLevel         int       `gorm:"not null;default:0" json:"stock_level"`
	LowStockThreshold  int       `gorm:"not null;default:0" json:"low_stock_threshold"`
	StorageCondition   string    `gorm:"size:32;not null;default:'room_temp'" json:"storage_condition"`
	IsPrescriptionOnly bool      `gorm:"not null;default:false;index:idx_pharmacy_items_tenant_rx,priority:2" json:"is_prescription_only"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`

	Tenant Tenant `gorm:"foreignKey:TenantID"`
}

// TableName returns the table name for PharmacyItem
func (PharmacyItem) TableName() string {
	return "pharmacy_items"
}

// ─── ClinicVisitFile ───────────────────────────────────────────────────────────

// ClinicVisitFile represents an uploaded file attached to a visit
type ClinicVisitFile struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	VisitID    uint      `gorm:"not null;index:idx_clinic_visit_files_tenant_visit,priority:2" json:"visit_id"`
	TenantID   uint      `gorm:"not null;index:idx_clinic_visit_files_tenant_visit,priority:1" json:"tenant_id"`
	FileName   string    `gorm:"size:255;not null" json:"file_name"`
	FileURL    string    `gorm:"size:512;not null" json:"file_url"`
	FileSize   int64     `gorm:"not null" json:"file_size"`
	FileType   string    `gorm:"size:64;not null" json:"file_type"`
	UploadedAt time.Time `gorm:"not null" json:"uploaded_at"`
	CreatedAt  time.Time `json:"created_at"`

	Visit  ClinicVisit `gorm:"foreignKey:VisitID"`
	Tenant Tenant      `gorm:"foreignKey:TenantID"`
}

// TableName returns the table name for ClinicVisitFile
func (ClinicVisitFile) TableName() string {
	return "clinic_visit_files"
}
