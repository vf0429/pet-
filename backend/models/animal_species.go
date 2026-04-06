package models

// AnimalSpecies represents a species lookup table (maps to ezyVet Species).
type AnimalSpecies struct {
	ID               uint   `gorm:"primaryKey" json:"id"`
	ExternalEzyvetID *int64 `gorm:"uniqueIndex:idx_animal_species_ezyvet" json:"external_ezyvet_id"`
	Name             string `gorm:"size:128;not null;uniqueIndex" json:"name"`
	Active           bool   `gorm:"not null;default:true" json:"active"`
}
