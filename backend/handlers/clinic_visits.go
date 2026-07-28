package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"pawrd-merchant-backend/middleware"
	"pawrd-merchant-backend/models"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ─── GET /merchant/clinic/visits/:id ──────────────────────────────────────────

// VisitDiagnosisItem represents a diagnosis in the visit detail response
type VisitDiagnosisItem struct {
	ID        uint   `json:"id"`
	Name      string `json:"name"`
	IsPrimary bool   `json:"is_primary"`
	Notes     string `json:"notes"`
}

// VisitPrescriptionItem represents a prescription in the visit detail response
type VisitPrescriptionItem struct {
	ID           uint   `json:"id"`
	DrugName     string `json:"drug_name"`
	Dosage       string `json:"dosage"`
	Frequency    string `json:"frequency"`
	DurationDays int    `json:"duration_days"`
	Notes        string `json:"notes"`
}

// VisitTreatmentItem represents a treatment in the visit detail response
type VisitTreatmentItem struct {
	ID              uint    `json:"id"`
	Name            string  `json:"name"`
	PerformedByID   uint    `json:"performed_by_id"`
	PerformedByName string  `json:"performed_by_name"`
	Fee             float64 `json:"fee"`
	Currency        string  `json:"currency"`
	Notes           string  `json:"notes"`
}

// VisitFollowupItem represents a followup in the visit detail response
type VisitFollowupItem struct {
	ID         uint   `json:"id"`
	Reason     string `json:"reason"`
	DoctorID   uint   `json:"doctor_id"`
	DoctorName string `json:"doctor_name"`
	DueAt      string `json:"due_at"`
	Status     string `json:"status"`
	ResultNote string `json:"result_note"`
}

// VisitFileItem represents a file in the visit detail response
type VisitFileItem struct {
	ID         uint   `json:"id"`
	FileName   string `json:"file_name"`
	FileURL    string `json:"file_url"`
	FileSize   int64  `json:"file_size"`
	FileType   string `json:"file_type"`
	UploadedAt string `json:"uploaded_at"`
}

// GetClinicVisit handles GET /merchant/clinic/visits/:id
func GetClinicVisit(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		db = middleware.GetTenantDB(c, db)
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

		var visit models.ClinicVisit
		if err := db.
			Preload("Diagnoses").
			Preload("Prescriptions").
			Preload("Treatments").
			Preload("Treatments.PerformedBy").
			Preload("Followups").
			Preload("Followups.Doctor").
			Preload("Files").
			Where("id = ? AND tenant_id = ?", id, tenantID).
			First(&visit).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"code": 30002, "data": nil, "message": "clinic visit not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		// Build diagnoses
		diagnoses := make([]VisitDiagnosisItem, len(visit.Diagnoses))
		for i, d := range visit.Diagnoses {
			diagnoses[i] = VisitDiagnosisItem{
				ID:        d.ID,
				Name:      d.Name,
				IsPrimary: d.IsPrimary,
				Notes:     d.Notes,
			}
		}

		// Build prescriptions
		prescriptions := make([]VisitPrescriptionItem, len(visit.Prescriptions))
		for i, p := range visit.Prescriptions {
			prescriptions[i] = VisitPrescriptionItem{
				ID:           p.ID,
				DrugName:     p.DrugName,
				Dosage:       p.Dosage,
				Frequency:    p.Frequency,
				DurationDays: p.DurationDays,
				Notes:        p.Notes,
			}
		}

		// Build treatments + total fee
		treatments := make([]VisitTreatmentItem, len(visit.Treatments))
		var treatmentTotalFee float64
		for i, t := range visit.Treatments {
			treatments[i] = VisitTreatmentItem{
				ID:              t.ID,
				Name:            t.Name,
				PerformedByID:   t.PerformedByID,
				PerformedByName: t.PerformedBy.Name,
				Fee:             t.Fee,
				Currency:        t.Currency,
				Notes:           t.Notes,
			}
			treatmentTotalFee += t.Fee
		}

		// Build followups
		followups := make([]VisitFollowupItem, len(visit.Followups))
		for i, f := range visit.Followups {
			followups[i] = VisitFollowupItem{
				ID:         f.ID,
				Reason:     f.Reason,
				DoctorID:   f.DoctorID,
				DoctorName: f.Doctor.Name,
				DueAt:      f.DueAt.Format(time.RFC3339),
				Status:     string(f.Status),
				ResultNote: f.ResultNote,
			}
		}

		// Build files
		files := make([]VisitFileItem, len(visit.Files))
		for i, f := range visit.Files {
			files[i] = VisitFileItem{
				ID:         f.ID,
				FileName:   f.FileName,
				FileURL:    f.FileURL,
				FileSize:   f.FileSize,
				FileType:   f.FileType,
				UploadedAt: f.UploadedAt.Format(time.RFC3339),
			}
		}

		// Build pushed_at
		var pushedAt interface{}
		if visit.PushedAt != nil {
			pushedAt = visit.PushedAt.Format(time.RFC3339)
		}

		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"id":                       visit.ID,
				"tenant_id":                visit.TenantID,
				"appointment_id":           visit.AppointmentID,
				"pet_name":                 visit.PetName,
				"pet_breed":                visit.PetBreed,
				"pet_age":                  visit.PetAge,
				"pet_weight":               visit.PetWeight,
				"pet_medical_history":      visit.PetMedicalHistory,
				"chief_complaint":          visit.ChiefComplaint,
				"temperature":              visit.Temperature,
				"heart_rate":               visit.HeartRate,
				"respiratory_rate":         visit.RespiratoryRate,
				"ai_summary":               visit.AISummary,
				"care_notes":               visit.CareNotes,
				"status":                   string(visit.Status),
				"pushed_at":                pushedAt,
				"created_at":               visit.CreatedAt.Format(time.RFC3339),
				"updated_at":               visit.UpdatedAt.Format(time.RFC3339),
				"diagnoses":                diagnoses,
				"prescriptions":            prescriptions,
				"treatments":               treatments,
				"followups":                followups,
				"files":                    files,
				"general_medication_notes": visit.GeneralMedicationNotes,
				"treatment_total_fee":      treatmentTotalFee,
				"currency":                 "HKD",
			},
			"message": "ok",
		})
	}
}

// ─── PATCH /merchant/clinic/visits/:id ────────────────────────────────────────

// UpdateVisitDiagnosisInput is a diagnosis item in the PATCH request
type UpdateVisitDiagnosisInput struct {
	ID        *uint  `json:"id"`
	Name      string `json:"name"`
	IsPrimary bool   `json:"is_primary"`
	Notes     string `json:"notes"`
}

// UpdateVisitPrescriptionInput is a prescription item in the PATCH request
type UpdateVisitPrescriptionInput struct {
	ID           *uint  `json:"id"`
	DrugName     string `json:"drug_name"`
	Dosage       string `json:"dosage"`
	Frequency    string `json:"frequency"`
	DurationDays int    `json:"duration_days"`
	Notes        string `json:"notes"`
}

// UpdateVisitTreatmentInput is a treatment item in the PATCH request
type UpdateVisitTreatmentInput struct {
	ID            *uint   `json:"id"`
	Name          string  `json:"name"`
	PerformedByID uint    `json:"performed_by_id"`
	Fee           float64 `json:"fee"`
	Notes         string  `json:"notes"`
}

// UpdateVisitFollowupInput is a followup item in the PATCH request
type UpdateVisitFollowupInput struct {
	ID       *uint  `json:"id"`
	Reason   string `json:"reason"`
	DoctorID uint   `json:"doctor_id"`
	DueAt    string `json:"due_at"`
}

// UpdateVisitRequest represents the request body for PATCH /merchant/clinic/visits/:id
type UpdateVisitRequest struct {
	ChiefComplaint         *string                         `json:"chief_complaint"`
	Temperature            *float64                        `json:"temperature"`
	HeartRate              *int                            `json:"heart_rate"`
	RespiratoryRate        *int                            `json:"respiratory_rate"`
	AISummary              *string                         `json:"ai_summary"`
	CareNotes              *string                         `json:"care_notes"`
	TargetStatus           *string                         `json:"target_status"`
	Diagnoses              *[]UpdateVisitDiagnosisInput    `json:"diagnoses"`
	Prescriptions          *[]UpdateVisitPrescriptionInput `json:"prescriptions"`
	Treatments             *[]UpdateVisitTreatmentInput    `json:"treatments"`
	Followups              *[]UpdateVisitFollowupInput     `json:"followups"`
	GeneralMedicationNotes *string                         `json:"general_medication_notes"`
}

// UpdateClinicVisit handles PATCH /merchant/clinic/visits/:id
func UpdateClinicVisit(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		db = middleware.GetTenantDB(c, db)
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

		var req UpdateVisitRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40010, "data": nil, "message": "invalid request"})
			return
		}

		// Fetch visit
		var visit models.ClinicVisit
		if err := db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&visit).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"code": 30002, "data": nil, "message": "clinic visit not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		// Validate target_status if provided
		if req.TargetStatus != nil {
			targetStatus := models.ClinicVisitStatus(*req.TargetStatus)
			if !models.IsValidClinicVisitStatus(string(targetStatus)) {
				c.JSON(http.StatusBadRequest, gin.H{"code": 40003, "data": nil, "message": "invalid visit status"})
				return
			}
			vsm := models.NewClinicVisitStateMachine()
			if err := vsm.ValidateTransition(visit.Status, targetStatus); err != nil {
				if err == models.ErrInvalidVisitStatus {
					c.JSON(http.StatusBadRequest, gin.H{"code": 40003, "data": nil, "message": "invalid visit status"})
				} else {
					c.JSON(http.StatusBadRequest, gin.H{"code": 40004, "data": nil, "message": "illegal visit status transition"})
				}
				return
			}
		}

		// Execute in transaction
		txErr := db.Transaction(func(tx *gorm.DB) error {
			// Update scalar fields
			now := time.Now()
			updates := map[string]interface{}{"updated_at": now}

			if req.ChiefComplaint != nil {
				updates["chief_complaint"] = *req.ChiefComplaint
			}
			if req.Temperature != nil {
				updates["temperature"] = *req.Temperature
			}
			if req.HeartRate != nil {
				updates["heart_rate"] = *req.HeartRate
			}
			if req.RespiratoryRate != nil {
				updates["respiratory_rate"] = *req.RespiratoryRate
			}
			if req.AISummary != nil {
				updates["ai_summary"] = *req.AISummary
			}
			if req.CareNotes != nil {
				updates["care_notes"] = *req.CareNotes
			}
			if req.GeneralMedicationNotes != nil {
				updates["general_medication_notes"] = *req.GeneralMedicationNotes
			}
			if req.TargetStatus != nil {
				targetStatus := models.ClinicVisitStatus(*req.TargetStatus)
				updates["status"] = targetStatus
				if targetStatus == models.ClinicVisitStatusClosed {
					updates["closed_at"] = now
				}
			}

			if err := tx.Model(&visit).Updates(updates).Error; err != nil {
				return err
			}

			// Auto-complete the linked Appointment when Visit is closed
			if req.TargetStatus != nil &&
				models.ClinicVisitStatus(*req.TargetStatus) == models.ClinicVisitStatusClosed {
				if err := tx.Model(&models.ClinicAppointment{}).
					Where("id = ? AND tenant_id = ? AND status = ?",
						visit.AppointmentID, tenantID, models.ClinicAppointmentStatusInProgress).
					Updates(map[string]interface{}{
						"status":     models.ClinicAppointmentStatusCompleted,
						"updated_at": now,
					}).Error; err != nil {
					return err
				}
			}

			// Full-replace: diagnoses
			if req.Diagnoses != nil {
				if err := tx.Where("visit_id = ? AND tenant_id = ?", visit.ID, tenantID).
					Delete(&models.ClinicDiagnosis{}).Error; err != nil {
					return err
				}
				for _, d := range *req.Diagnoses {
					diag := models.ClinicDiagnosis{
						VisitID:   visit.ID,
						TenantID:  tenantID,
						Name:      d.Name,
						IsPrimary: d.IsPrimary,
						Notes:     d.Notes,
					}
					if err := tx.Create(&diag).Error; err != nil {
						return err
					}
				}
			}

			// Full-replace: prescriptions
			if req.Prescriptions != nil {
				if err := tx.Where("visit_id = ? AND tenant_id = ?", visit.ID, tenantID).
					Delete(&models.ClinicPrescription{}).Error; err != nil {
					return err
				}
				for _, p := range *req.Prescriptions {
					presc := models.ClinicPrescription{
						VisitID:      visit.ID,
						TenantID:     tenantID,
						DrugName:     p.DrugName,
						Dosage:       p.Dosage,
						Frequency:    p.Frequency,
						DurationDays: p.DurationDays,
						Notes:        p.Notes,
					}
					if err := tx.Create(&presc).Error; err != nil {
						return err
					}
				}
			}

			// Full-replace: treatments
			if req.Treatments != nil {
				if err := tx.Where("visit_id = ? AND tenant_id = ?", visit.ID, tenantID).
					Delete(&models.ClinicTreatment{}).Error; err != nil {
					return err
				}
				for _, t := range *req.Treatments {
					treat := models.ClinicTreatment{
						VisitID:       visit.ID,
						TenantID:      tenantID,
						Name:          t.Name,
						PerformedByID: t.PerformedByID,
						Fee:           t.Fee,
						Currency:      "HKD",
						Notes:         t.Notes,
					}
					if err := tx.Create(&treat).Error; err != nil {
						return err
					}
				}
			}

			// Full-replace: followups
			if req.Followups != nil {
				if err := tx.Where("visit_id = ? AND tenant_id = ?", visit.ID, tenantID).
					Delete(&models.ClinicFollowup{}).Error; err != nil {
					return err
				}
				for _, f := range *req.Followups {
					dueAt, parseErr := time.Parse("2006-01-02", f.DueAt)
					if parseErr != nil {
						// Try RFC3339
						dueAt, parseErr = time.Parse(time.RFC3339, f.DueAt)
						if parseErr != nil {
							return fmt.Errorf("invalid due_at format: %s", f.DueAt)
						}
					}
					fu := models.ClinicFollowup{
						VisitID:   visit.ID,
						TenantID:  tenantID,
						PetName:   visit.PetName,
						Reason:    f.Reason,
						DoctorID:  f.DoctorID,
						DueAt:     dueAt,
						Status:    models.ClinicFollowupStatusPending,
						CreatedAt: time.Now(),
						UpdatedAt: time.Now(),
					}
					if err := tx.Create(&fu).Error; err != nil {
						return err
					}
				}
			}

			return nil
		})

		if txErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		// Reload
		db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&visit)

		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"id":         visit.ID,
				"status":     string(visit.Status),
				"updated_at": visit.UpdatedAt.Format(time.RFC3339),
			},
			"message": "ok",
		})
	}
}

// ─── POST /merchant/clinic/visits/:id/push-to-app ─────────────────────────────

// PushVisitToApp handles POST /merchant/clinic/visits/:id/push-to-app
func PushVisitToApp(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		db = middleware.GetTenantDB(c, db)
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

		// Fetch visit with prescriptions and followups for payload
		var visit models.ClinicVisit
		if err := db.
			Preload("Diagnoses").
			Preload("Prescriptions").
			Preload("Followups").
			Where("id = ? AND tenant_id = ?", id, tenantID).
			First(&visit).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"code": 30002, "data": nil, "message": "clinic visit not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		// Build medical record payload
		var primaryDiagnosis string
		for _, d := range visit.Diagnoses {
			if d.IsPrimary {
				primaryDiagnosis = d.Name
				break
			}
		}
		if primaryDiagnosis == "" && len(visit.Diagnoses) > 0 {
			primaryDiagnosis = visit.Diagnoses[0].Name
		}

		var medsSummary string
		if len(visit.Prescriptions) > 0 {
			p := visit.Prescriptions[0]
			medsSummary = fmt.Sprintf("%s %s %s %d天", p.DrugName, p.Dosage, p.Frequency, p.DurationDays)
		}

		var nextFollowupAt string
		for _, f := range visit.Followups {
			if f.Status == models.ClinicFollowupStatusPending {
				nextFollowupAt = f.DueAt.Format("2006-01-02")
				break
			}
		}

		innerPayload := map[string]interface{}{
			"visit_date":        visit.CreatedAt.Format("2006-01-02"),
			"pet_name":          visit.PetName,
			"primary_diagnosis": primaryDiagnosis,
			"ai_summary":        visit.AISummary,
			"care_notes":        visit.CareNotes,
			"meds_summary":      medsSummary,
			"next_followup_at":  nextFollowupAt,
		}
		innerPayloadJSON, _ := json.Marshal(innerPayload)

		outerPayload := map[string]interface{}{
			"entity_type": "medical_record",
			"entity_id":   fmt.Sprintf("%d", visit.ID),
			"action":      "record_published",
			"payload":     innerPayload,
		}
		outerPayloadJSON, _ := json.Marshal(outerPayload)

		// Execute in transaction
		var syncQueueEntry models.AppSyncQueue
		now := time.Now()

		txErr := db.Transaction(func(tx *gorm.DB) error {
			// Update pushed_at
			if err := tx.Model(&visit).Updates(map[string]interface{}{
				"pushed_at":  now,
				"updated_at": now,
			}).Error; err != nil {
				return err
			}

			syncQueueEntry = models.AppSyncQueue{
				TenantID:   tenantID,
				EntityType: "medical_record",
				EntityID:   fmt.Sprintf("%d", visit.ID),
				Action:     "record_published",
				Payload:    string(outerPayloadJSON),
				Status:     models.AppSyncQueueStatusPending,
			}
			return tx.Create(&syncQueueEntry).Error
		})

		if txErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		_ = innerPayloadJSON // used in payload building above

		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"visit_id":  visit.ID,
				"pushed_at": now.Format(time.RFC3339),
				"sync_queue": gin.H{
					"id":          syncQueueEntry.ID,
					"entity_type": "medical_record",
					"entity_id":   fmt.Sprintf("%d", visit.ID),
					"action":      "record_published",
					"status":      string(syncQueueEntry.Status),
				},
			},
			"message": "ok",
		})
	}
}
