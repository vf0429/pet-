package ezyvet

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"petwell-merchant-backend/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// MigrateClients migrates ezyVet contacts (non-staff, non-vet) → ClinicClient.
func MigrateClients(c *Client, db *gorm.DB, tenantID uint, dryRun bool) (imported, skipped int, err error) {
	log.Println("[migrate_clients] fetching contacts...")
	raws, err := c.GetAll("/v1/contact", nil)
	if err != nil {
		return 0, 0, fmt.Errorf("fetch contacts: %w", err)
	}

	for i, raw := range raws {
		inner, _ := UnwrapItem(raw, "contact")
		var ez EzContact
		if err := json.Unmarshal(inner, &ez); err != nil {
			continue
		}

		// Staff/vets are handled by migrate_staff
		if ez.IsVet == 1 || ez.IsStaff == 1 {
			skipped++
			continue
		}

		phone, email, cdErr := c.ContactDetailsFor(ez.ID)
		if cdErr != nil {
			log.Printf("[migrate_clients] warn: contact %d contactdetail error: %v", ez.ID, cdErr)
		}

		name := strings.TrimSpace(ez.FirstName + " " + ez.LastName)

		ezID := ez.ID
		if dryRun {
			log.Printf("[migrate_clients] DRY RUN: would upsert ClinicClient name=%s email=%s ezyvet_id=%d", name, email, ezID)
			imported++
			continue
		}

		client := models.ClinicClient{
			TenantID:         tenantID,
			ExternalEzyvetID: &ezID,
			FirstName:        ez.FirstName,
			LastName:         ez.LastName,
			Phone:            phone,
			Email:            email,
			Active:           ez.Active == 1,
		}
		result := db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "external_ezyvet_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"first_name", "last_name", "phone", "email", "active"}),
		}).Create(&client)
		if result.Error != nil {
			log.Printf("[migrate_clients] error upserting client %d: %v", ez.ID, result.Error)
			continue
		}
		imported++

		if (i+1)%100 == 0 {
			log.Printf("[migrate_clients] %d/%d processed", i+1, len(raws))
		}
	}

	log.Printf("[migrate_clients] done: imported=%d skipped=%d", imported, skipped)
	return imported, skipped, nil
}
