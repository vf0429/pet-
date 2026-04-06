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

// MigrateVisits migrates ezyVet Consults → ClinicVisit,
// then fetches Assessments and merges notes into AssessmentNotes.
func MigrateVisits(c *Client, db *gorm.DB, tenantID uint, dryRun bool) (imported, skipped int, err error) {
	log.Println("[migrate_visits] fetching consults...")
	raws, err := c.GetAll("/v1/consult", nil)
	if err != nil {
		return 0, 0, fmt.Errorf("fetch consults: %w", err)
	}

	for i, raw := range raws {
		inner, _ := UnwrapItem(raw, "consult")
		var ez EzConsult
		if err := json.Unmarshal(inner, &ez); err != nil {
			continue
		}
		if ez.Active == 0 {
			skipped++
			continue
		}

		// Resolve appointment via external_ezyvet_id on clinic_appointments
		// ezyVet Appointment.consult_id links to Consult.id
		var appt models.ClinicAppointment
		db.Where("external_ezyvet_id IN (SELECT id FROM clinic_appointments WHERE tenant_id = ?)", tenantID).
			Where("tenant_id = ?", tenantID).
			First(&appt)
		// Simpler: find appointment where its ezyvet consult maps back
		// We stored the ezyvet appointment id; find the appointment whose consult_id = ez.ID
		// Since we stored appointment external_id but not consult_id on appointment, we do a best-effort lookup
		// by matching animal_id timing proximity. For now link by patient name.
		var patient models.ClinicPatient
		db.Where("external_ezyvet_id = ? AND tenant_id = ?", ez.AnimalID, tenantID).First(&patient)

		// Find matching appointment for this patient
		appt = models.ClinicAppointment{}
		if patient.ID > 0 {
			db.Where("patient_id = ? AND tenant_id = ?", patient.ID, tenantID).
				Order("scheduled_at DESC").First(&appt)
		}

		petName := patient.Name
		if petName == "" {
			petName = "Unknown"
		}

		consultDate := EpochToTime(ez.ConsultDate)
		ezID := ez.ID

		// Fetch assessments for this consult
		assessmentNotes := ""
		if !dryRun {
			asmtRaws, aErr := c.GetFiltered("/v1/assessment", "consult_id", fmt.Sprintf("%d", ez.ID))
			if aErr == nil {
				var notesParts []string
				for _, ar := range asmtRaws {
					ai, _ := UnwrapItem(ar, "assessment")
					var asmt EzAssessment
					if json.Unmarshal(ai, &asmt) == nil && asmt.Notes != "" {
						notesParts = append(notesParts, asmt.Notes)
					}
				}
				assessmentNotes = strings.Join(notesParts, "\n\n")
			}
		}

		if dryRun {
			log.Printf("[migrate_visits] DRY RUN: would upsert ClinicVisit pet=%s consult_id=%d", petName, ez.ID)
			imported++
			continue
		}

		visit := models.ClinicVisit{
			TenantID:         tenantID,
			AppointmentID:    appt.ID,
			PetName:          petName,
			ConsultDate:      consultDate,
			AssessmentNotes:  assessmentNotes,
			Status:           models.ClinicVisitStatusClosed, // historical = closed
			ExternalEzyvetID: &ezID,
		}

		// Fill appointment-linked fields if available
		if appt.ID > 0 {
			visit.AppointmentID = appt.ID
		}

		result := db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "external_ezyvet_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"assessment_notes", "consult_date", "pet_name"}),
		}).Create(&visit)
		if result.Error != nil {
			log.Printf("[migrate_visits] error upserting consult %d: %v", ez.ID, result.Error)
			continue
		}
		imported++

		if (i+1)%100 == 0 {
			log.Printf("[migrate_visits] %d/%d processed", i+1, len(raws))
		}
	}

	log.Printf("[migrate_visits] done: imported=%d skipped=%d", imported, skipped)
	return imported, skipped, nil
}
