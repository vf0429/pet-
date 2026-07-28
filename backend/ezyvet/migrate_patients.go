package ezyvet

import (
	"encoding/json"
	"fmt"
	"log"

	"pawrd-merchant-backend/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// MigratePatients migrates ezyVet Animals → ClinicPatient.
func MigratePatients(c *Client, db *gorm.DB, lookup *LookupTables, tenantID uint, dryRun bool) (imported, skipped int, err error) {
	log.Println("[migrate_patients] fetching animals...")
	raws, err := c.GetAll("/v1.1/animal", nil) // v1.1 supports limit=2000
	if err != nil {
		// Fallback to v1
		log.Printf("[migrate_patients] v1.1 failed, falling back to v1: %v", err)
		raws, err = c.GetAll("/v1/animal", nil)
		if err != nil {
			return 0, 0, fmt.Errorf("fetch animals: %w", err)
		}
	}

	for i, raw := range raws {
		inner, _ := UnwrapItem(raw, "animal")
		var ez EzAnimal
		if err := json.Unmarshal(inner, &ez); err != nil {
			continue
		}

		if ez.Active == 0 {
			skipped++
			continue
		}

		// Resolve owner (ClinicClient)
		var owner models.ClinicClient
		db.Where("external_ezyvet_id = ? AND tenant_id = ?", ez.ContactID, tenantID).First(&owner)
		if owner.ID == 0 {
			log.Printf("[migrate_patients] skip animal %d: owner contact %d not found", ez.ID, ez.ContactID)
			skipped++
			continue
		}

		// Resolve species and breed FK
		var speciesRec models.AnimalSpecies
		db.Where("external_ezyvet_id = ?", ez.SpeciesID).First(&speciesRec)
		var breedRec models.AnimalBreed
		db.Where("external_ezyvet_id = ?", ez.BreedID).First(&breedRec)

		gender := lookup.SexNames[ez.SexID]
		dob := EpochToTime(ez.DateOfBirth)
		ezID := ez.ID

		weightUnit := ez.WeightUnit
		if weightUnit == "" {
			weightUnit = "kg"
		}

		if dryRun {
			log.Printf("[migrate_patients] DRY RUN: would upsert ClinicPatient name=%s owner=%d ezyvet_id=%d", ez.Name, owner.ID, ezID)
			imported++
			continue
		}

		patient := models.ClinicPatient{
			TenantID:         tenantID,
			ExternalEzyvetID: &ezID,
			ClientID:         owner.ID,
			Name:             ez.Name,
			Gender:           gender,
			DateOfBirth:      dob,
			Weight:           ez.Weight,
			WeightUnit:       weightUnit,
			IsDeceased:       ez.IsDead == 1,
			Notes:            ez.Notes,
			NotesImportant:   ez.NotesImportant,
			Active:           true,
		}
		if speciesRec.ID > 0 {
			patient.SpeciesID = &speciesRec.ID
		}
		if breedRec.ID > 0 {
			patient.BreedID = &breedRec.ID
		}

		result := db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "external_ezyvet_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"name", "gender", "date_of_birth", "weight", "weight_unit", "is_deceased", "notes", "notes_important", "species_id", "breed_id"}),
		}).Create(&patient)
		if result.Error != nil {
			log.Printf("[migrate_patients] error upserting animal %d: %v", ez.ID, result.Error)
			continue
		}
		imported++

		if (i+1)%100 == 0 {
			log.Printf("[migrate_patients] %d/%d processed", i+1, len(raws))
		}
	}

	log.Printf("[migrate_patients] done: imported=%d skipped=%d", imported, skipped)
	return imported, skipped, nil
}
