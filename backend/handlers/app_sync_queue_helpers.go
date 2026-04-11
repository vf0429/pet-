package handlers

import (
	"encoding/json"
	"fmt"
	"time"

	"pawrd-merchant-backend/models"

	"gorm.io/gorm"
)

func buildAppointmentSyncPayload(
	appointmentID uint,
	fromStatus string,
	toStatus string,
	cancelReason string,
	changedAt time.Time,
	facade *models.VaccinationBookingFacade,
) string {
	payload := map[string]interface{}{
		"appointment_id": appointmentID,
		"from_status":    fromStatus,
		"to_status":      toStatus,
		"cancel_reason":  cancelReason,
		"changed_at":     changedAt.UTC().Format(time.RFC3339),
	}

	if facade != nil {
		payload["external_booking_id"] = facade.ExternalBookingID
		payload["clinic_integration_id"] = facade.ClinicIntegrationID
		payload["project_id"] = facade.ProjectID
		payload["booking_status"] = facade.Status
		payload["scheduled_at"] = facade.ScheduledAt.UTC().Format(time.RFC3339)
	}

	payloadJSON, _ := json.Marshal(payload)
	return string(payloadJSON)
}

func enqueueAppointmentSyncQueue(
	tx *gorm.DB,
	tenantID uint,
	appointmentID uint,
	action string,
	payload string,
) (models.AppSyncQueue, error) {
	entry := models.AppSyncQueue{
		TenantID:   tenantID,
		EntityType: "appointment",
		EntityID:   fmt.Sprintf("%d", appointmentID),
		Action:     action,
		Payload:    payload,
		Status:     models.AppSyncQueueStatusPending,
	}
	return entry, tx.Create(&entry).Error
}
