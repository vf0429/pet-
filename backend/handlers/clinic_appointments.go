package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"petwell-merchant-backend/middleware"
	"petwell-merchant-backend/models"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ListAppointmentsQuery represents query parameters for GET /merchant/clinic/appointments
type ListAppointmentsQuery struct {
	View     string `form:"view,default=list"`
	Status   string `form:"status"`
	Date     string `form:"date"`
	DoctorID *uint  `form:"doctor_id"`
	Page     int    `form:"page,default=1"`
	PerPage  int    `form:"per_page,default=20"`
}

// AppointmentListItem represents a single appointment in the list response
type AppointmentListItem struct {
	ID            uint   `json:"id"`
	PetName       string `json:"pet_name"`
	PetOwnerName  string `json:"pet_owner_name"`
	PetOwnerPhone string `json:"pet_owner_phone"`
	VisitType     string `json:"visit_type"`
	DoctorID      uint   `json:"doctor_id"`
	DoctorName    string `json:"doctor_name"`
	ScheduledAt   string `json:"scheduled_at"`
	Status        string `json:"status"`
	CancelReason  string `json:"cancel_reason"`
	Notes         string `json:"notes"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
}

// AppointmentListFilters represents active filters in the list response
type AppointmentListFilters struct {
	Status   string `json:"status"`
	Date     string `json:"date"`
	DoctorID *uint  `json:"doctor_id"`
}

// MatrixSlot represents a time slot in the matrix view
type MatrixSlot struct {
	Time            string  `json:"time"`
	AppointmentID   *uint   `json:"appointment_id"`
	PetName         *string `json:"pet_name"`
	VisitType       *string `json:"visit_type"`
	Status          string  `json:"status"`
	DurationMinutes int     `json:"duration_minutes"`
}

// MatrixDoctor represents a doctor row in the matrix view
type MatrixDoctor struct {
	DoctorID   uint         `json:"doctor_id"`
	DoctorName string       `json:"doctor_name"`
	Slots      []MatrixSlot `json:"slots"`
}

// ListClinicAppointments handles GET /merchant/clinic/appointments
func ListClinicAppointments(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		var query ListAppointmentsQuery
		if err := c.ShouldBindQuery(&query); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40005, "data": nil, "message": "invalid query params"})
			return
		}

		tenantID := authCtx.TenantID

		// Validate status
		if query.Status != "" && !models.IsValidClinicAppointmentStatus(query.Status) {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40001, "data": nil, "message": "invalid appointment status"})
			return
		}

		// Validate view
		if query.View != "list" && query.View != "matrix" {
			query.View = "list"
		}

		// Default date to today
		dateStr := query.Date
		if dateStr == "" {
			dateStr = time.Now().UTC().Format("2006-01-02")
		}

		// Parse date
		parsedDate, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40005, "data": nil, "message": "invalid query params"})
			return
		}

		dateStart := parsedDate
		dateEnd := parsedDate.Add(24 * time.Hour)

		// Pagination
		if query.Page < 1 {
			query.Page = 1
		}
		if query.PerPage < 1 {
			query.PerPage = 20
		}
		if query.PerPage > 100 {
			query.PerPage = 100
		}

		if query.View == "matrix" {
			handleMatrixView(c, db, tenantID, dateStr, dateStart, dateEnd, query.DoctorID)
			return
		}

		// List view
		baseQuery := db.Model(&models.ClinicAppointment{}).
			Where("tenant_id = ? AND scheduled_at >= ? AND scheduled_at < ?", tenantID, dateStart, dateEnd)

		if query.Status != "" {
			baseQuery = baseQuery.Where("status = ?", query.Status)
		}
		if query.DoctorID != nil {
			baseQuery = baseQuery.Where("doctor_id = ?", *query.DoctorID)
		}

		var total int64
		baseQuery.Count(&total)

		offset := (query.Page - 1) * query.PerPage
		var appointments []models.ClinicAppointment
		baseQuery.Preload("Doctor").
			Order("scheduled_at ASC").
			Offset(offset).
			Limit(query.PerPage).
			Find(&appointments)

		items := make([]AppointmentListItem, len(appointments))
		for i, a := range appointments {
			items[i] = AppointmentListItem{
				ID:            a.ID,
				PetName:       a.PetName,
				PetOwnerName:  a.PetOwnerName,
				PetOwnerPhone: a.PetOwnerPhone,
				VisitType:     a.VisitType,
				DoctorID:      a.DoctorID,
				DoctorName:    a.Doctor.Name,
				ScheduledAt:   a.ScheduledAt.Format(time.RFC3339),
				Status:        string(a.Status),
				CancelReason:  a.CancelReason,
				Notes:         a.Notes,
				CreatedAt:     a.CreatedAt.Format(time.RFC3339),
				UpdatedAt:     a.UpdatedAt.Format(time.RFC3339),
			}
		}

		hasMore := int64(query.Page*query.PerPage) < total

		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"view":         "list",
				"appointments": items,
				"total":        total,
				"page":         query.Page,
				"per_page":     query.PerPage,
				"has_more":     hasMore,
				"filters": AppointmentListFilters{
					Status:   query.Status,
					Date:     dateStr,
					DoctorID: query.DoctorID,
				},
			},
			"message": "ok",
		})
	}
}

// handleMatrixView builds the matrix (schedule board) response
func handleMatrixView(c *gin.Context, db *gorm.DB, tenantID uint, dateStr string, dateStart, dateEnd time.Time, filterDoctorID *uint) {
	// Fixed time slots (clinic hours)
	timeSlots := []string{
		"09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00",
		"14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00",
	}

	// Fetch all doctors (clinic users for this tenant)
	doctorQuery := db.Where("tenant_id = ? AND role = ? AND status = ?", tenantID, models.UserRoleDoctor, models.UserStatusActive)
	if filterDoctorID != nil {
		doctorQuery = doctorQuery.Where("id = ?", *filterDoctorID)
	}
	var doctors []models.MerchantUser
	doctorQuery.Find(&doctors)

	// Fetch appointments for the date
	var appointments []models.ClinicAppointment
	db.Where("tenant_id = ? AND scheduled_at >= ? AND scheduled_at < ?", tenantID, dateStart, dateEnd).
		Find(&appointments)

	// Build doctor -> slot map
	// Key: "doctor_id:HH:mm"
	type apptKey struct {
		doctorID uint
		slot     string
	}
	apptMap := make(map[apptKey]*models.ClinicAppointment)
	for i := range appointments {
		a := &appointments[i]
		slotTime := a.ScheduledAt.UTC().Format("15:04")
		apptMap[apptKey{doctorID: a.DoctorID, slot: slotTime}] = a
	}

	matrixDoctors := make([]MatrixDoctor, len(doctors))
	for i, doc := range doctors {
		slots := make([]MatrixSlot, len(timeSlots))
		for j, ts := range timeSlots {
			key := apptKey{doctorID: doc.ID, slot: ts}
			if appt, found := apptMap[key]; found {
				slots[j] = MatrixSlot{
					Time:            ts,
					AppointmentID:   &appt.ID,
					PetName:         &appt.PetName,
					VisitType:       &appt.VisitType,
					Status:          string(appt.Status),
					DurationMinutes: 30,
				}
			} else {
				slots[j] = MatrixSlot{
					Time:            ts,
					AppointmentID:   nil,
					PetName:         nil,
					VisitType:       nil,
					Status:          "available",
					DurationMinutes: 30,
				}
			}
		}
		matrixDoctors[i] = MatrixDoctor{
			DoctorID:   doc.ID,
			DoctorName: doc.Name,
			Slots:      slots,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"view":       "matrix",
			"date":       dateStr,
			"time_slots": timeSlots,
			"doctors":    matrixDoctors,
		},
		"message": "ok",
	})
}

// UpdateAppointmentStatusRequest represents the request body for PATCH /merchant/clinic/appointments/:id/status
type UpdateAppointmentStatusRequest struct {
	TargetStatus string `json:"target_status"`
	Status       string `json:"status"`
	CancelReason string `json:"cancel_reason"`
	Note         string `json:"note"`
}

// UpdateClinicAppointmentStatus handles PATCH /merchant/clinic/appointments/:id/status
func UpdateClinicAppointmentStatus(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		tenantID := authCtx.TenantID

		idStr := c.Param("id")
		id, err := strconv.ParseUint(idStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40010, "data": nil, "message": "invalid request"})
			return
		}

		var req UpdateAppointmentStatusRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40010, "data": nil, "message": "invalid request"})
			return
		}

		// Validate target_status (accept both target_status and status for compatibility)
		targetValue := strings.TrimSpace(req.TargetStatus)
		if targetValue == "" {
			targetValue = strings.TrimSpace(req.Status)
		}
		targetStatus := models.ClinicAppointmentStatus(targetValue)
		if !models.IsValidClinicAppointmentStatus(string(targetStatus)) {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40001, "data": nil, "message": "invalid appointment status"})
			return
		}

		// cancel_reason required when cancelling
		if targetStatus == models.ClinicAppointmentStatusCancelled && strings.TrimSpace(req.CancelReason) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40006, "data": nil, "message": "cancel_reason is required when status=cancelled"})
			return
		}

		// Fetch appointment
		var appt models.ClinicAppointment
		if err := db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&appt).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"code": 30001, "data": nil, "message": "clinic appointment not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		previousStatus := appt.Status

		// Idempotent: same status
		if previousStatus == targetStatus {
			c.JSON(http.StatusOK, gin.H{
				"code": 0,
				"data": gin.H{
					"id":              appt.ID,
					"previous_status": string(previousStatus),
					"current_status":  string(targetStatus),
					"cancel_reason":   appt.CancelReason,
					"visit_id":        nil,
					"sync_queue":      nil,
					"updated_at":      appt.UpdatedAt.Format(time.RFC3339),
				},
				"message": "ok",
			})
			return
		}

		// Validate state machine transition
		sm := models.NewClinicAppointmentStateMachine()
		if err := sm.ValidateTransition(previousStatus, targetStatus); err != nil {
			if err == models.ErrInvalidAppointmentStatus {
				c.JSON(http.StatusBadRequest, gin.H{"code": 40001, "data": nil, "message": "invalid appointment status"})
			} else {
				c.JSON(http.StatusBadRequest, gin.H{"code": 40002, "data": nil, "message": "illegal appointment status transition"})
			}
			return
		}

		// Build sync queue payload
		payload := map[string]interface{}{
			"appointment_id": appt.ID,
			"from_status":    string(previousStatus),
			"to_status":      string(targetStatus),
			"cancel_reason":  req.CancelReason,
			"changed_at":     time.Now().UTC().Format(time.RFC3339),
		}
		payloadJSON, _ := json.Marshal(payload)

		// Execute in transaction
		var syncQueueEntry models.AppSyncQueue
		var newVisit *models.ClinicVisit

		txErr := db.Transaction(func(tx *gorm.DB) error {
			updates := map[string]interface{}{
				"status":     targetStatus,
				"updated_at": time.Now(),
			}
			if targetStatus == models.ClinicAppointmentStatusCancelled {
				updates["cancel_reason"] = req.CancelReason
			}
			if req.Note != "" {
				updates["notes"] = req.Note
			}

			if err := tx.Model(&appt).Updates(updates).Error; err != nil {
				return err
			}

			// Auto-create ClinicVisit when checked_in -> in_progress
			if previousStatus == models.ClinicAppointmentStatusCheckedIn &&
				targetStatus == models.ClinicAppointmentStatusInProgress {
				visit := models.ClinicVisit{
					TenantID:      tenantID,
					AppointmentID: appt.ID,
					PetName:       appt.PetName,
					Status:        models.ClinicVisitStatusInProgress,
					CreatedAt:     time.Now(),
					UpdatedAt:     time.Now(),
				}
				if err := tx.Create(&visit).Error; err != nil {
					return err
				}
				newVisit = &visit
			}

			// Write sync queue entry
			syncQueueEntry = models.AppSyncQueue{
				TenantID:   tenantID,
				EntityType: "appointment",
				EntityID:   fmt.Sprintf("%d", appt.ID),
				Action:     "status_changed",
				Payload:    string(payloadJSON),
				Status:     models.AppSyncQueueStatusPending,
			}
			if err := tx.Create(&syncQueueEntry).Error; err != nil {
				return err
			}

			var facade models.VaccinationBookingFacade
			if err := tx.Where("internal_appointment_id = ?", appt.ID).First(&facade).Error; err == nil {
				mappedStatus := ""
				switch targetStatus {
				case models.ClinicAppointmentStatusConfirmed, models.ClinicAppointmentStatusCheckedIn, models.ClinicAppointmentStatusInProgress:
					mappedStatus = "confirmed"
				case models.ClinicAppointmentStatusCompleted:
					mappedStatus = "completed"
				case models.ClinicAppointmentStatusCancelled:
					if strings.Contains(strings.ToLower(req.CancelReason), "user") {
						mappedStatus = "cancelled_by_user"
					} else {
						mappedStatus = "cancelled_by_clinic"
					}
				}
				if mappedStatus != "" {
					if err := tx.Model(&models.VaccinationBookingFacade{}).Where("id = ?", facade.ID).Updates(map[string]interface{}{
						"status":     mappedStatus,
						"updated_at": time.Now(),
					}).Error; err != nil {
						return err
					}
				}
			} else if err != nil && err != gorm.ErrRecordNotFound {
				return err
			}

			return nil
		})

		if txErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		// Reload appointment
		db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&appt)

		var visitIDResp interface{}
		if newVisit != nil {
			visitIDResp = newVisit.ID
		}

		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"id":              appt.ID,
				"previous_status": string(previousStatus),
				"current_status":  string(targetStatus),
				"cancel_reason":   appt.CancelReason,
				"visit_id":        visitIDResp,
				"sync_queue": gin.H{
					"id":          syncQueueEntry.ID,
					"entity_type": "appointment",
					"entity_id":   fmt.Sprintf("%d", appt.ID),
					"action":      "status_changed",
					"status":      string(syncQueueEntry.Status),
				},
				"updated_at": appt.UpdatedAt.Format(time.RFC3339),
			},
			"message": "ok",
		})
	}
}
