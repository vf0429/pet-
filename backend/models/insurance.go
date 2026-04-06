package models

import "time"

// InsuranceClaimStatus represents the status of an insurance claim
type InsuranceClaimStatus string

const (
	InsuranceClaimStatusDraft      InsuranceClaimStatus = "draft"
	InsuranceClaimStatusSubmitted  InsuranceClaimStatus = "submitted"
	InsuranceClaimStatusProcessing InsuranceClaimStatus = "processing"
	InsuranceClaimStatusApproved   InsuranceClaimStatus = "approved"
	InsuranceClaimStatusRejected   InsuranceClaimStatus = "rejected"
)

// ValidInsuranceClaimStatuses returns all valid claim statuses
func ValidInsuranceClaimStatuses() []InsuranceClaimStatus {
	return []InsuranceClaimStatus{
		InsuranceClaimStatusDraft,
		InsuranceClaimStatusSubmitted,
		InsuranceClaimStatusProcessing,
		InsuranceClaimStatusApproved,
		InsuranceClaimStatusRejected,
	}
}

// IsValidInsuranceClaimStatus checks if a string is a valid claim status
func IsValidInsuranceClaimStatus(s string) bool {
	for _, status := range ValidInsuranceClaimStatuses() {
		if string(status) == s {
			return true
		}
	}
	return false
}

// InsuranceClaim represents an insurance claim record
type InsuranceClaim struct {
	ID               uint                 `gorm:"primaryKey" json:"id"`
	TenantID         uint                 `gorm:"not null;index:idx_insurance_claims_tenant_status,priority:1;index:idx_insurance_claims_tenant_visit,priority:1" json:"tenant_id"`
	VisitID          uint                 `gorm:"not null;index:idx_insurance_claims_tenant_visit,priority:2" json:"visit_id"`
	PolicyNo         string               `gorm:"size:64;not null;index" json:"policy_no"`
	ProviderName     string               `gorm:"size:128;not null" json:"provider_name"`
	PlanName         string               `gorm:"size:128;not null" json:"plan_name"`
	ClaimAmount      float64              `gorm:"type:decimal(10,2);not null" json:"claim_amount"`
	ApprovedAmount   float64              `gorm:"type:decimal(10,2);not null;default:0" json:"approved_amount"`
	Currency         string               `gorm:"size:8;not null;default:'HKD'" json:"currency"`
	DiagnosisSummary string               `gorm:"type:text;not null" json:"diagnosis_summary"`
	ExpenseItemsJSON string               `gorm:"type:text;not null" json:"expense_items_json"`
	Notes            string               `gorm:"type:text" json:"notes"`
	Status           InsuranceClaimStatus `gorm:"size:24;not null;default:'submitted';index:idx_insurance_claims_tenant_status,priority:2" json:"status"`
	SubmittedAt      time.Time            `gorm:"not null;index" json:"submitted_at"`
	CreatedAt        time.Time            `json:"created_at"`
	UpdatedAt        time.Time            `json:"updated_at"`

	Tenant Tenant               `gorm:"foreignKey:TenantID"`
	Visit  ClinicVisit          `gorm:"foreignKey:VisitID"`
	Files  []InsuranceClaimFile `gorm:"foreignKey:ClaimID"`
}

// TableName returns the table name for InsuranceClaim
func (InsuranceClaim) TableName() string {
	return "insurance_claims"
}

// InsuranceClaimFile represents a file attached to an insurance claim
type InsuranceClaimFile struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	TenantID   uint      `gorm:"not null;index:idx_insurance_claim_files_tenant_claim,priority:1" json:"tenant_id"`
	ClaimID    uint      `gorm:"not null;index:idx_insurance_claim_files_tenant_claim,priority:2" json:"claim_id"`
	FileName   string    `gorm:"size:255;not null" json:"file_name"`
	FileURL    string    `gorm:"size:512;not null" json:"file_url"`
	FileSize   int64     `gorm:"not null" json:"file_size"`
	FileType   string    `gorm:"size:64;not null" json:"file_type"`
	UploadedAt time.Time `gorm:"not null" json:"uploaded_at"`
	CreatedAt  time.Time `json:"created_at"`

	Tenant Tenant         `gorm:"foreignKey:TenantID"`
	Claim  InsuranceClaim `gorm:"foreignKey:ClaimID"`
}

// TableName returns the table name for InsuranceClaimFile
func (InsuranceClaimFile) TableName() string {
	return "insurance_claim_files"
}
