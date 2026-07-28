package ezyvet

import (
	"encoding/json"
	"log"

	"pawrd-merchant-backend/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// LookupTables stores all ID→name translation maps pre-loaded from ezyVet.
type LookupTables struct {
	Species             map[int64]string // species_id → "Dog"
	Breeds              map[int64]string // breed_id → "Golden Retriever"
	BreedSpecies        map[int64]int64  // breed_id → species_id
	SexNames            map[int64]string // sex_id → "Male"
	AppointmentTypes    map[int64]string // type_id → "General Checkup"
	AppointmentStatuses map[int64]string // status_id → "Confirmed"
}

// LoadLookupTables fetches all translation tables from ezyVet and persists
// species/breeds into the local DB for future use without API dependency.
func LoadLookupTables(c *Client, db *gorm.DB) (*LookupTables, error) {
	lt := &LookupTables{
		Species:             make(map[int64]string),
		Breeds:              make(map[int64]string),
		BreedSpecies:        make(map[int64]int64),
		SexNames:            make(map[int64]string),
		AppointmentTypes:    make(map[int64]string),
		AppointmentStatuses: make(map[int64]string),
	}

	// Species
	log.Println("[lookup] loading species...")
	speciesRaws, err := c.GetAll("/v1/species", nil)
	if err != nil {
		return nil, err
	}
	for _, raw := range speciesRaws {
		inner, _ := UnwrapItem(raw, "species")
		var s EzSpecies
		if err := json.Unmarshal(inner, &s); err != nil {
			continue
		}
		lt.Species[s.ID] = s.Name
		// Persist to DB
		rec := models.AnimalSpecies{
			Name:   s.Name,
			Active: s.Active == 1,
		}
		ezID := s.ID
		rec.ExternalEzyvetID = &ezID
		db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "external_ezyvet_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"name", "active"}),
		}).Create(&rec)
	}
	log.Printf("[lookup] %d species loaded", len(lt.Species))

	// Breeds
	log.Println("[lookup] loading breeds...")
	breedRaws, err := c.GetAll("/v1/breed", nil)
	if err != nil {
		return nil, err
	}
	for _, raw := range breedRaws {
		inner, _ := UnwrapItem(raw, "breed")
		var b EzBreed
		if err := json.Unmarshal(inner, &b); err != nil {
			continue
		}
		lt.Breeds[b.ID] = b.Name
		lt.BreedSpecies[b.ID] = b.SpeciesID

		// Find species DB ID
		var speciesRec models.AnimalSpecies
		db.Where("external_ezyvet_id = ?", b.SpeciesID).First(&speciesRec)

		rec := models.AnimalBreed{
			Name:   b.Name,
			Active: b.Active == 1,
		}
		ezID := b.ID
		rec.ExternalEzyvetID = &ezID
		if speciesRec.ID > 0 {
			rec.SpeciesID = &speciesRec.ID
		}
		db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "external_ezyvet_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"name", "active", "species_id"}),
		}).Create(&rec)
	}
	log.Printf("[lookup] %d breeds loaded", len(lt.Breeds))

	// Sex
	log.Println("[lookup] loading sex types...")
	sexRaws, err := c.GetAll("/v1/sex", nil)
	if err != nil {
		log.Printf("[lookup] warning: could not load sex: %v", err)
	} else {
		for _, raw := range sexRaws {
			inner, _ := UnwrapItem(raw, "sex")
			var s EzSex
			if err := json.Unmarshal(inner, &s); err != nil {
				continue
			}
			lt.SexNames[s.ID] = s.Name
		}
	}
	log.Printf("[lookup] %d sex types loaded", len(lt.SexNames))

	// Appointment types
	log.Println("[lookup] loading appointment types...")
	apptTypeRaws, err := c.GetAll("/v1/appointmenttype", nil)
	if err != nil {
		log.Printf("[lookup] warning: could not load appointment types: %v", err)
	} else {
		for _, raw := range apptTypeRaws {
			inner, _ := UnwrapItem(raw, "appointmenttype")
			var t EzAppointmentType
			if err := json.Unmarshal(inner, &t); err != nil {
				continue
			}
			lt.AppointmentTypes[t.ID] = t.Name
		}
	}
	log.Printf("[lookup] %d appointment types loaded", len(lt.AppointmentTypes))

	// Appointment statuses
	log.Println("[lookup] loading appointment statuses...")
	apptStatusRaws, err := c.GetAll("/v1/appointmentstatus", nil)
	if err != nil {
		log.Printf("[lookup] warning: could not load appointment statuses: %v", err)
	} else {
		for _, raw := range apptStatusRaws {
			inner, _ := UnwrapItem(raw, "appointmentstatus")
			var s EzAppointmentStatus
			if err := json.Unmarshal(inner, &s); err != nil {
				continue
			}
			lt.AppointmentStatuses[s.ID] = s.Name
		}
	}
	log.Printf("[lookup] %d appointment statuses loaded", len(lt.AppointmentStatuses))

	return lt, nil
}
