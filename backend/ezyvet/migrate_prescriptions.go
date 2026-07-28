package ezyvet

import (
	"encoding/json"
	"fmt"
	"log"

	"pawrd-merchant-backend/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// MigratePrescriptions migrates ezyVet Prescriptions + PrescriptionItems → ClinicPrescription.
func MigratePrescriptions(c *Client, db *gorm.DB, tenantID uint, dryRun bool) (imported, skipped int, err error) {
	log.Println("[migrate_prescriptions] fetching prescriptions...")
	rxRaws, err := c.GetAll("/v1/prescription", nil)
	if err != nil {
		return 0, 0, fmt.Errorf("fetch prescriptions: %w", err)
	}

	for i, raw := range rxRaws {
		inner, _ := UnwrapItem(raw, "prescription")
		var ez EzPrescription
		if err := json.Unmarshal(inner, &ez); err != nil {
			continue
		}
		if ez.Active == 0 {
			skipped++
			continue
		}

		// Resolve visit
		var visit models.ClinicVisit
		db.Where("external_ezyvet_id = ? AND tenant_id = ?", ez.ConsultID, tenantID).First(&visit)
		if visit.ID == 0 {
			log.Printf("[migrate_prescriptions] skip rx %d: visit for consult %d not found", ez.ID, ez.ConsultID)
			skipped++
			continue
		}

		// Resolve prescribing vet
		var prescribingVetID *uint
		var vet models.MerchantUser
		db.Where("external_ezyvet_contact_id = ? AND tenant_id = ?", ez.PrescribingVetUserID, tenantID).First(&vet)
		if vet.ID > 0 {
			prescribingVetID = &vet.ID
		}

		// Fetch prescription items
		itemRaws, iErr := c.GetFiltered("/v1/prescriptionitem", "prescription_id", fmt.Sprintf("%d", ez.ID))
		if iErr != nil {
			log.Printf("[migrate_prescriptions] warn: could not fetch items for rx %d: %v", ez.ID, iErr)
		}

		if len(itemRaws) == 0 {
			skipped++
			continue
		}

		for _, itemRaw := range itemRaws {
			iInner, _ := UnwrapItem(itemRaw, "prescriptionitem")
			var item EzPrescriptionItem
			if err := json.Unmarshal(iInner, &item); err != nil {
				continue
			}

			// Resolve drug name from pharmacy
			drugName := "Unknown Drug"
			var pharma models.PharmacyItem
			db.Where("external_ezyvet_id = ? AND tenant_id = ?", item.ProductID, tenantID).First(&pharma)
			if pharma.ID > 0 {
				drugName = pharma.Name
			}

			instructions := item.Instructions
			if len(instructions) > 128 {
				instructions = instructions[:128]
			}

			dosage := fmt.Sprintf("%.2f %s", item.Quantity, "units")
			status := item.Status
			if status == "" {
				status = "active"
			}

			ezItemID := item.ID

			if dryRun {
				log.Printf("[migrate_prescriptions] DRY RUN: would upsert ClinicPrescription drug=%s visit=%d ezyvet_item_id=%d", drugName, visit.ID, ezItemID)
				imported++
				continue
			}

			rx := models.ClinicPrescription{
				TenantID:           tenantID,
				VisitID:            visit.ID,
				DrugName:           drugName,
				Dosage:             dosage,
				Frequency:          instructions,
				DurationDays:       1,
				Notes:              "",
				PrescribingVetID:   prescribingVetID,
				Instructions:       item.Instructions,
				PrescriptionStatus: status,
				ExternalEzyvetID:   &ezItemID,
			}

			result := db.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "external_ezyvet_id"}},
				DoUpdates: clause.AssignmentColumns([]string{"drug_name", "dosage", "frequency", "instructions", "prescription_status"}),
			}).Create(&rx)
			if result.Error != nil {
				log.Printf("[migrate_prescriptions] error upserting rx item %d: %v", item.ID, result.Error)
				continue
			}
			imported++
		}

		if (i+1)%50 == 0 {
			log.Printf("[migrate_prescriptions] %d/%d prescriptions processed", i+1, len(rxRaws))
		}
	}

	log.Printf("[migrate_prescriptions] done: imported=%d skipped=%d", imported, skipped)
	return imported, skipped, nil
}
