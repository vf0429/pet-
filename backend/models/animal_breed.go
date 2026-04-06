package models

// AnimalBreed represents a breed lookup table (maps to ezyVet Breed).
type AnimalBreed struct {
	ID               uint           `gorm:"primaryKey" json:"id"`
	ExternalEzyvetID *int64         `gorm:"uniqueIndex:idx_animal_breeds_ezyvet" json:"external_ezyvet_id"`
	SpeciesID        *uint          `gorm:"index" json:"species_id"`
	Name             string         `gorm:"size:128;not null;index" json:"name"`
	Active           bool           `gorm:"not null;default:true" json:"active"`
	Species          *AnimalSpecies `gorm:"foreignKey:SpeciesID" json:"-"`
}
