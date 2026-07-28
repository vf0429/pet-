package ezyvet

import (
	"encoding/json"
	"fmt"
	"log"

	"pawrd-merchant-backend/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// MigrateHealthReminders migrates ezyVet Standard of Care → HealthReminder.
func MigrateHealthReminders(c *Client, db *gorm.DB, tenantID uint, dryRun bool) (imported, skipped int, err error) {
	log.Println("[migrate_health_reminders] fetching standard of care records...")
	raws, err := c.GetAll("/v2/standardofcare", nil)
	if err != nil {
		return 0, 0, fmt.Errorf("fetch standardofcare: %w", err)
	}

	for i, raw := range raws {
		inner, _ := UnwrapItem(raw, "standardofcare")
		var ez EzStandardOfCare
		if err := json.Unmarshal(inner, &ez); err != nil {
			continue
		}
		if ez.Active == 0 {
			skipped++
			continue
		}

		// Resolve patient
		var patient models.ClinicPatient
		db.Where("external_ezyvet_id = ? AND tenant_id = ?", ez.AnimalID, tenantID).First(&patient)
		if patient.ID == 0 {
			log.Printf("[migrate_health_reminders] skip SOC %d: patient for animal %d not found", ez.ID, ez.AnimalID)
			skipped++
			continue
		}

		dueAt := EpochToTime(ez.DueAt)
		lastFulfilled := EpochToTime(ez.LastFulfilledAt)
		ezID := ez.ID

		if dryRun {
			log.Printf("[migrate_health_reminders] DRY RUN: would upsert HealthReminder patient=%d name=%s due=%v ezyvet_id=%d",
				patient.ID, ez.SocGroupName, dueAt, ezID)
			imported++
			continue
		}

		reminder := models.HealthReminder{
			TenantID:         tenantID,
			ExternalEzyvetID: &ezID,
			PatientID:        patient.ID,
			Category:         ez.SocGroupType,
			Name:             ez.SocGroupName,
			Importance:       ez.Importance,
			DueAt:            dueAt,
			LastFulfilledAt:  lastFulfilled,
			Active:           true,
		}

		result := db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "external_ezyvet_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"due_at", "last_fulfilled_at", "name", "category", "importance", "active"}),
		}).Create(&reminder)
		if result.Error != nil {
			log.Printf("[migrate_health_reminders] error upserting SOC %d: %v", ez.ID, result.Error)
			continue
		}
		imported++

		if (i+1)%100 == 0 {
			log.Printf("[migrate_health_reminders] %d/%d processed", i+1, len(raws))
		}
	}

	log.Printf("[migrate_health_reminders] done: imported=%d skipped=%d", imported, skipped)
	return imported, skipped, nil
}
