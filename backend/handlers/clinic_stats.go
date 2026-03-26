package handlers

import (
	"net/http"
	"petwell-merchant-backend/middleware"
	"petwell-merchant-backend/models"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ClinicSyncStatus represents the app sync queue summary in clinic stats
type ClinicSyncStatus struct {
	PendingCount int64   `json:"pending_count"`
	FailedCount  int64   `json:"failed_count"`
	LastSyncedAt *string `json:"last_synced_at"`
}

// ClinicTodayAppointmentItem represents a single appointment in the today list
type ClinicTodayAppointmentItem struct {
	ID           uint   `json:"id"`
	ScheduledAt  string `json:"scheduled_at"`
	PetName      string `json:"pet_name"`
	PetOwnerName string `json:"pet_owner_name"`
	VisitType    string `json:"visit_type"`
	DoctorID     uint   `json:"doctor_id"`
	DoctorName   string `json:"doctor_name"`
	Status       string `json:"status"`
}

// ClinicStatsResponse represents the response for GET /merchant/clinic/stats
type ClinicStatsResponse struct {
	TodayAppointments        int64                        `json:"today_appointments"`
	TodayAppointmentsDelta   int64                        `json:"today_appointments_delta"`
	InProgressVisits         int64                        `json:"in_progress_visits"`
	PendingFollowupsOverdue  int64                        `json:"pending_followups_overdue"`
	NewPatientsThisMonth     int64                        `json:"new_patients_this_month"`
	TodayAppointmentList     []ClinicTodayAppointmentItem `json:"today_appointment_list"`
	SyncStatus               ClinicSyncStatus             `json:"sync_status"`
}

// GetClinicStats handles GET /merchant/clinic/stats
func GetClinicStats(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		tenantID := authCtx.TenantID
		now := time.Now()

		// Date boundaries
		todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		todayEnd := todayStart.Add(24 * time.Hour)
		yesterdayStart := todayStart.Add(-24 * time.Hour)
		monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)

		// today_appointments
		var todayAppointments int64
		db.Model(&models.ClinicAppointment{}).
			Where("tenant_id = ? AND scheduled_at >= ? AND scheduled_at < ?", tenantID, todayStart, todayEnd).
			Count(&todayAppointments)

		// yesterday_appointments (for delta)
		var yesterdayAppointments int64
		db.Model(&models.ClinicAppointment{}).
			Where("tenant_id = ? AND scheduled_at >= ? AND scheduled_at < ?", tenantID, yesterdayStart, todayStart).
			Count(&yesterdayAppointments)

		todayDelta := todayAppointments - yesterdayAppointments

		// in_progress_visits
		var inProgressVisits int64
		db.Model(&models.ClinicVisit{}).
			Where("tenant_id = ? AND status = ?", tenantID, models.ClinicVisitStatusInProgress).
			Count(&inProgressVisits)

		// pending_followups_overdue: due_at < now AND status=pending
		var overdueFollowups int64
		db.Model(&models.ClinicFollowup{}).
			Where("tenant_id = ? AND status = ? AND due_at < ?", tenantID, models.ClinicFollowupStatusPending, now).
			Count(&overdueFollowups)

		// new_patients_this_month: distinct pet_name first appearing this month
		// Count pet_names whose minimum scheduled_at falls within this month
		type petResult struct {
			PetName string
			MinDate time.Time
		}
		var newPatients int64
		db.Model(&models.ClinicAppointment{}).
			Select("COUNT(DISTINCT pet_name)").
			Where("tenant_id = ? AND scheduled_at >= ? AND scheduled_at < ?", tenantID, monthStart, todayEnd).
			Where("pet_name NOT IN (?)",
				db.Model(&models.ClinicAppointment{}).
					Select("DISTINCT pet_name").
					Where("tenant_id = ? AND scheduled_at < ?", tenantID, monthStart),
			).
			Scan(&newPatients)

		// today_appointment_list (max 20, ordered by scheduled_at ASC)
		var todayAppts []models.ClinicAppointment
		db.Preload("Doctor").
			Where("tenant_id = ? AND scheduled_at >= ? AND scheduled_at < ?", tenantID, todayStart, todayEnd).
			Order("scheduled_at ASC").
			Limit(20).
			Find(&todayAppts)

		apptList := make([]ClinicTodayAppointmentItem, len(todayAppts))
		for i, a := range todayAppts {
			apptList[i] = ClinicTodayAppointmentItem{
				ID:           a.ID,
				ScheduledAt:  a.ScheduledAt.Format(time.RFC3339),
				PetName:      a.PetName,
				PetOwnerName: a.PetOwnerName,
				VisitType:    a.VisitType,
				DoctorID:     a.DoctorID,
				DoctorName:   a.Doctor.Name,
				Status:       string(a.Status),
			}
		}

		// sync_status: medical_record entries
		var syncPending int64
		db.Model(&models.AppSyncQueue{}).
			Where("tenant_id = ? AND entity_type = ? AND status = ?", tenantID, "medical_record", models.AppSyncQueueStatusPending).
			Count(&syncPending)

		var syncFailed int64
		db.Model(&models.AppSyncQueue{}).
			Where("tenant_id = ? AND entity_type = ? AND status = ?", tenantID, "medical_record", models.AppSyncQueueStatusFailed).
			Count(&syncFailed)

		var lastSyncEntry models.AppSyncQueue
		var lastSyncedAt *string
		if err := db.Where("tenant_id = ? AND entity_type = ? AND status = ?", tenantID, "medical_record", models.AppSyncQueueStatusSent).
			Order("created_at DESC").
			First(&lastSyncEntry).Error; err == nil {
			s := lastSyncEntry.CreatedAt.Format(time.RFC3339)
			lastSyncedAt = &s
		}

		response := ClinicStatsResponse{
			TodayAppointments:       todayAppointments,
			TodayAppointmentsDelta:  todayDelta,
			InProgressVisits:        inProgressVisits,
			PendingFollowupsOverdue: overdueFollowups,
			NewPatientsThisMonth:    newPatients,
			TodayAppointmentList:    apptList,
			SyncStatus: ClinicSyncStatus{
				PendingCount: syncPending,
				FailedCount:  syncFailed,
				LastSyncedAt: lastSyncedAt,
			},
		}

		c.JSON(http.StatusOK, gin.H{"code": 0, "data": response, "message": "ok"})
	}
}
