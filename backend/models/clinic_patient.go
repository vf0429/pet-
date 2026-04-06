package models

import "time"

// ClinicPatient represents a pet profile (maps to ezyVet Animal).
type ClinicPatient struct {
	ID               uint           `gorm:"primaryKey" json:"id"`
	TenantID         uint           `gorm:"not null;index:idx_clinic_patients_tenant,priority:1" json:"tenant_id"`
	ExternalEzyvetID *int64         `gorm:"uniqueIndex:idx_clinic_patients_ezyvet" json:"external_ezyvet_id"`
	ClientID         uint           `gorm:"not null;index:idx_clinic_patients_client" json:"client_id"`
	Name             string         `gorm:"size:128;not null;index" json:"name"`
	SpeciesID        *uint          `gorm:"index" json:"species_id"`
	BreedID          *uint          `gorm:"index" json:"breed_id"`
	Gender           string         `gorm:"size:32" json:"gender"`
	DateOfBirth      *time.Time     `json:"date_of_birth"`
	Weight           float64        `gorm:"type:decimal(8,2)" json:"weight"`
	WeightUnit       string         `gorm:"size:8;default:'kg'" json:"weight_unit"`
	IsDeceased       bool           `gorm:"not null;default:false" json:"is_deceased"`
	Microchip        string         `gorm:"size:64;index" json:"microchip"`
	Notes            string         `gorm:"type:text" json:"notes"`
	NotesImportant   string         `gorm:"type:text" json:"notes_important"`
	Active           bool           `gorm:"not null;default:true;index" json:"active"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
	Tenant           Tenant         `gorm:"foreignKey:TenantID" json:"-"`
	Client           ClinicClient   `gorm:"foreignKey:ClientID" json:"-"`
	Species          *AnimalSpecies `gorm:"foreignKey:SpeciesID" json:"-"`
	Breed            *AnimalBreed   `gorm:"foreignKey:BreedID" json:"-"`
}
