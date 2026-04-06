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

// mapAppointmentStatus converts an ezyVet status name to petwell status.
func mapAppointmentStatus(ezStatus string) models.ClinicAppointmentStatus {
	switch strings.ToLower(strings.TrimSpace(ezStatus)) {
	case "pending", "unconfirmed":
		return models.ClinicAppointmentStatusPending
	case "confirmed":
		return models.ClinicAppointmentStatusConfirmed
	case "checked in", "arrived":
		return models.ClinicAppointmentStatusCheckedIn
	case "in progress", "in consultation":
		return models.ClinicAppointmentStatusInProgress
	case "completed", "done", "finished":
		return models.ClinicAppointmentStatusCompleted
	case "cancelled", "canceled", "no show":
		return models.ClinicAppointmentStatusCancelled
	default:
		return models.ClinicAppointmentStatusPending
	}
}

// defaultDoctorID returns any active doctor for the tenant (fallback when appointment has no vet resource).
func defaultDoctorID(db *gorm.DB, tenantID uint) uint {
	var u models.MerchantUser
	db.Where("tenant_id = ? AND role = ? AND status = ?", tenantID, models.UserRoleDoctor, models.UserStatusActive).First(&u)
	return u.ID
}

// MigrateAppointments migrates ezyVet Appointments → ClinicAppointment.
func MigrateAppointments(c *Client, db *gorm.DB, lookup *LookupTables, tenantID uint, dryRun bool) (imported, skipped int, err error) {
	log.Println("[migrate_appointments] fetching appointments...")
	raws, err := c.GetAll("/v1/appointment", nil)
	if err != nil {
		return 0, 0, fmt.Errorf("fetch appointments: %w", err)
	}

	fallbackDoctorID := defaultDoctorID(db, tenantID)

	for i, raw := range raws {
		inner, _ := UnwrapItem(raw, "appointment")
		var ez EzAppointment
		if err := json.Unmarshal(inner, &ez); err != nil {
			continue
		}
		if ez.Active == 0 {
			skipped++
			continue
		}

		// Resolve patient and client
		var patient models.ClinicPatient
		db.Where("external_ezyvet_id = ? AND tenant_id = ?", ez.AnimalID, tenantID).First(&patient)

		var client models.ClinicClient
		db.Where("external_ezyvet_id = ? AND tenant_id = ?", ez.ContactID, tenantID).First(&client)

		// Pet name fallback
		petName := patient.Name
		if petName == "" {
			petName = "Unknown"
		}
		ownerName := strings.TrimSpace(client.FirstName + " " + client.LastName)
		if ownerName == "" {
			ownerName = "Unknown"
		}
		ownerPhone := client.Phone

		scheduledAt := EpochToTime(ez.StartAt)
		if scheduledAt == nil {
			skipped++
			continue
		}

		durationMin := int(ez.Duration / 60)
		if durationMin == 0 {
			durationMin = 30
		}

		apptType := lookup.AppointmentTypes[ez.TypeID]
		if apptType == "" {
			apptType = "General"
		}
		statusName := lookup.AppointmentStatuses[ez.StatusID]
		status := mapAppointmentStatus(statusName)

		ezID := ez.ID

		// DoctorID: use fallback
		doctorID := fallbackDoctorID

		var patientIDPtr *uint
		if patient.ID > 0 {
			patientIDPtr = &patient.ID
		}
		var clientIDPtr *uint
		if client.ID > 0 {
			clientIDPtr = &client.ID
		}

		if dryRun {
			log.Printf("[migrate_appointments] DRY RUN: would upsert Appointment pet=%s status=%s ezyvet_id=%d", petName, status, ezID)
			imported++
			continue
		}

		appt := models.ClinicAppointment{
			TenantID:         tenantID,
			BusinessType:     "clinic",
			PetName:          petName,
			PetOwnerName:     ownerName,
			PetOwnerPhone:    ownerPhone,
			DoctorID:         doctorID,
			VisitType:        apptType,
			ScheduledAt:      *scheduledAt,
			Status:           status,
			CancelReason:     ez.CancellationReason,
			Notes:            ez.Description,
			Source:           "ezyvet",
			PatientID:        patientIDPtr,
			ClientID:         clientIDPtr,
			AppointmentType:  apptType,
			DurationMinutes:  durationMin,
			ExternalEzyvetID: &ezID,
		}

		result := db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "external_ezyvet_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"status", "notes", "cancel_reason", "duration_minutes"}),
		}).Create(&appt)
		if result.Error != nil {
			log.Printf("[migrate_appointments] error upserting appointment %d: %v", ez.ID, result.Error)
			continue
		}
		imported++

		if (i+1)%100 == 0 {
			log.Printf("[migrate_appointments] %d/%d processed", i+1, len(raws))
		}
	}

	log.Printf("[migrate_appointments] done: imported=%d skipped=%d", imported, skipped)
	return imported, skipped, nil
}
