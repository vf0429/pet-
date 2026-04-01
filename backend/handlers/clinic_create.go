package handlers

import (
	"fmt"
	"net/http"
	"petwell-merchant-backend/middleware"
	"petwell-merchant-backend/models"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ─── Create Appointment ────────────────────────────────────────────────────

type CreateAppointmentRequest struct {
	PetName       string  `json:"pet_name" binding:"required"`
	PetOwnerName  string  `json:"pet_owner_name" binding:"required"`
	PetOwnerPhone string  `json:"pet_owner_phone"`
	VisitType     string  `json:"visit_type" binding:"required"`
	DoctorID      uint    `json:"doctor_id" binding:"required"`
	ScheduledAt   string  `json:"scheduled_at" binding:"required"` // RFC3339
	Notes         string  `json:"notes"`
	PatientID     *uint   `json:"patient_id"`
	ClientID      *uint   `json:"client_id"`
}

func CreateClinicAppointment(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "unauthorized"})
			return
		}

		var req CreateAppointmentRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40001, "data": nil, "message": err.Error()})
			return
		}

		scheduledAt, err := time.Parse(time.RFC3339, req.ScheduledAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40002, "data": nil, "message": "invalid scheduled_at format, use RFC3339"})
			return
		}

		// Verify doctor belongs to same tenant
		var doctor models.MerchantUser
		if err := db.Where("id = ? AND tenant_id = ? AND role = 'doctor'", req.DoctorID, authCtx.TenantID).First(&doctor).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40003, "data": nil, "message": "doctor not found"})
			return
		}

		// Clinic times are stored in local timezone (Asia/Hong_Kong = UTC+8).
		// Convert scheduledAt to local before comparing with open/close strings.
		clinicLoc, _ := time.LoadLocation("Asia/Hong_Kong")
		scheduledLocal := scheduledAt.In(clinicLoc)

		// ─── Layer 1: Clinic operating hours ─────────────────────────────────
		dayOfWeek := int(scheduledLocal.Weekday()) // 0=Sunday in Go
		var tmpl models.ClinicScheduleTemplate
		tmplErr := db.Where("tenant_id = ? AND day_of_week = ?", authCtx.TenantID, dayOfWeek).First(&tmpl).Error
		if tmplErr == nil {
			// Template found — enforce it
			if !tmpl.IsActive {
				c.JSON(http.StatusBadRequest, gin.H{
					"code": 40010, "data": nil,
					"message": "clinic is not open on this day",
				})
				return
			}
			timeStr := scheduledLocal.Format("15:04")
			if timeStr < tmpl.OpenTime || timeStr >= tmpl.CloseTime {
				c.JSON(http.StatusBadRequest, gin.H{
					"code": 40011, "data": nil,
					"message": fmt.Sprintf("appointment time %s is outside clinic hours (%s–%s)", timeStr, tmpl.OpenTime, tmpl.CloseTime),
				})
				return
			}
		}
		// If no template configured yet → skip hours check (don't block during initial setup)

		// ─── Layer 2: Doctor shift (is this doctor working?) ─────────────────
		// Use local date to find the doctor's shift row for this calendar day.
		localY, localM, localD := scheduledLocal.Date()
		dateStart := time.Date(localY, localM, localD, 0, 0, 0, 0, time.UTC)
		dateEnd := dateStart.Add(24 * time.Hour)
		var shift models.DoctorShift
		if db.Where(
			"tenant_id = ? AND doctor_id = ? AND shift_date >= ? AND shift_date < ?",
			authCtx.TenantID, req.DoctorID, dateStart, dateEnd,
		).First(&shift).Error == nil {
			if shift.IsOff {
				c.JSON(http.StatusBadRequest, gin.H{
					"code": 40012, "data": nil,
					"message": "doctor is not available on this date",
				})
				return
			}
			// If shift has custom hours, check against them (also local time)
			if shift.StartTime != "" && shift.EndTime != "" {
				timeStr := scheduledLocal.Format("15:04")
				if timeStr < shift.StartTime || timeStr >= shift.EndTime {
					c.JSON(http.StatusBadRequest, gin.H{
						"code": 40013, "data": nil,
						"message": fmt.Sprintf("appointment time %s is outside doctor's working hours (%s–%s)", timeStr, shift.StartTime, shift.EndTime),
					})
					return
				}
			}
		}

		// ─── Layer 3: Conflict check + INSERT (inside transaction) ───────────
		// Wrapping in a transaction ensures that two concurrent requests cannot
		// both pass the conflict check and both insert — SQLite serialises writes.
		var createdAppt models.ClinicAppointment
		txErr := db.Transaction(func(tx *gorm.DB) error {
			var conflictCount int64
			tx.Model(&models.ClinicAppointment{}).
				Where(
					"tenant_id = ? AND doctor_id = ? AND scheduled_at = ? AND status != ?",
					authCtx.TenantID, req.DoctorID, scheduledAt,
					string(models.ClinicAppointmentStatusCancelled),
				).Count(&conflictCount)
			if conflictCount > 0 {
				return fmt.Errorf("SLOT_CONFLICT")
			}

			appt := models.ClinicAppointment{
				TenantID:      authCtx.TenantID,
				PetName:       req.PetName,
				PetOwnerName:  req.PetOwnerName,
				PetOwnerPhone: req.PetOwnerPhone,
				VisitType:     req.VisitType,
				DoctorID:      req.DoctorID,
				ScheduledAt:   scheduledAt,
				Status:        models.ClinicAppointmentStatusPending,
				Notes:         req.Notes,
				PatientID:     req.PatientID,
				ClientID:      req.ClientID,
			}
			if err := tx.Create(&appt).Error; err != nil {
				return err
			}
			createdAppt = appt
			return nil
		})

		if txErr != nil {
			if txErr.Error() == "SLOT_CONFLICT" {
				c.JSON(http.StatusConflict, gin.H{
					"code": 40901, "data": nil,
					"message": "this time slot is already booked for the selected doctor, please choose another time",
				})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50001, "data": nil, "message": "failed to create appointment"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"code":    0,
			"message": "ok",
			"data": gin.H{
				"id":              createdAppt.ID,
				"pet_name":        createdAppt.PetName,
				"pet_owner_name":  createdAppt.PetOwnerName,
				"pet_owner_phone": createdAppt.PetOwnerPhone,
				"visit_type":      createdAppt.VisitType,
				"doctor_id":       createdAppt.DoctorID,
				"doctor_name":     doctor.Name,
				"scheduled_at":    createdAppt.ScheduledAt.Format(time.RFC3339),
				"status":          string(createdAppt.Status),
				"notes":           createdAppt.Notes,
				"patient_id":      createdAppt.PatientID,
				"created_at":      createdAppt.CreatedAt.Format(time.RFC3339),
			},
		})
	}
}

// ─── Create Patient ────────────────────────────────────────────────────────

type CreatePatientRequest struct {
	ClientID    *uint   `json:"client_id"`
	Name        string  `json:"name" binding:"required"`
	Species     string  `json:"species"`
	Breed       string  `json:"breed"`
	Gender      string  `json:"gender"`
	DateOfBirth string  `json:"date_of_birth"` // YYYY-MM-DD
	Weight      float64 `json:"weight"`
	WeightUnit  string  `json:"weight_unit"`
	Microchip   string  `json:"microchip"`
	Notes       string  `json:"notes"`
	// If no client_id, create owner inline
	OwnerFirstName string `json:"owner_first_name"`
	OwnerLastName  string `json:"owner_last_name"`
	OwnerPhone     string `json:"owner_phone"`
	OwnerEmail     string `json:"owner_email"`
}

func CreateClinicPatient(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "unauthorized"})
			return
		}

		var req CreatePatientRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40001, "data": nil, "message": err.Error()})
			return
		}

		// Resolve or create client
		var clientID *uint
		if req.ClientID != nil {
			var existing models.ClinicClient
			if err := db.Where("id = ? AND tenant_id = ?", *req.ClientID, authCtx.TenantID).First(&existing).Error; err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 40004, "data": nil, "message": "client not found"})
				return
			}
			clientID = req.ClientID
		} else if req.OwnerFirstName != "" {
			newClient := models.ClinicClient{
				TenantID:  authCtx.TenantID,
				FirstName: req.OwnerFirstName,
				LastName:  req.OwnerLastName,
				Phone:     req.OwnerPhone,
				Email:     req.OwnerEmail,
				Active:    true,
			}
			if err := db.Create(&newClient).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 50002, "data": nil, "message": "failed to create owner"})
				return
			}
			clientID = &newClient.ID
		}

		patient := models.ClinicPatient{
			TenantID:   authCtx.TenantID,
			ClientID:   0,
			Name:       req.Name,
			Gender:     req.Gender,
			Weight:     req.Weight,
			WeightUnit: req.WeightUnit,
			Microchip:  req.Microchip,
			Notes:      req.Notes,
			Active:     true,
		}
		if clientID != nil {
			patient.ClientID = *clientID
		}

		if req.DateOfBirth != "" {
			dob, err := time.Parse("2006-01-02", req.DateOfBirth)
			if err == nil {
				patient.DateOfBirth = &dob
			}
		}

		// Resolve species/breed
		if req.Species != "" {
			var sp models.AnimalSpecies
			if db.Where("name = ? OR name_zh = ?", req.Species, req.Species).First(&sp).Error == nil {
				patient.SpeciesID = &sp.ID
			}
		}
		if req.Breed != "" {
			var br models.AnimalBreed
			if db.Where("name = ? OR name_zh = ?", req.Breed, req.Breed).First(&br).Error == nil {
				patient.BreedID = &br.ID
			}
		}

		if err := db.Create(&patient).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50001, "data": nil, "message": "failed to create patient"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"code":    0,
			"message": "ok",
			"data": gin.H{
				"id":           patient.ID,
				"name":         patient.Name,
				"gender":       patient.Gender,
				"weight":       patient.Weight,
				"weight_unit":  patient.WeightUnit,
				"microchip":    patient.Microchip,
				"client_id":    clientID,
				"created_at":   patient.CreatedAt.Format(time.RFC3339),
			},
		})
	}
}

// ─── Create Health Reminder ────────────────────────────────────────────────

type CreateReminderRequest struct {
	PatientID  uint   `json:"patient_id" binding:"required"`
	Category   string `json:"category" binding:"required"`
	Name       string `json:"name" binding:"required"`
	Importance string `json:"importance"`
	DueAt      string `json:"due_at"` // YYYY-MM-DD
}

func CreateClinicReminder(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "unauthorized"})
			return
		}

		var req CreateReminderRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40001, "data": nil, "message": err.Error()})
			return
		}

		// Verify patient belongs to tenant
		var patient models.ClinicPatient
		if err := db.Where("id = ? AND tenant_id = ?", req.PatientID, authCtx.TenantID).First(&patient).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40004, "data": nil, "message": "patient not found"})
			return
		}

		importance := req.Importance
		if importance == "" {
			importance = "medium"
		}

		reminder := models.HealthReminder{
			TenantID:   authCtx.TenantID,
			PatientID:  req.PatientID,
			Category:   req.Category,
			Name:       req.Name,
			Importance: importance,
			Active:     true,
		}

		if req.DueAt != "" {
			dueAt, err := time.Parse("2006-01-02", req.DueAt)
			if err == nil {
				reminder.DueAt = &dueAt
			}
		}

		if err := db.Create(&reminder).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50001, "data": nil, "message": "failed to create reminder"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"code":    0,
			"message": "ok",
			"data": gin.H{
				"id":         reminder.ID,
				"patient_id": reminder.PatientID,
				"category":   reminder.Category,
				"name":       reminder.Name,
				"importance": reminder.Importance,
				"due_at":     req.DueAt,
				"created_at": reminder.CreatedAt.Format(time.RFC3339),
			},
		})
	}
}

// ─── List Doctors (for appointment create form) ────────────────────────────

func ListClinicDoctors(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "unauthorized"})
			return
		}

		var doctors []models.MerchantUser
		db.Where("tenant_id = ? AND role = 'doctor' AND status = 'active'", authCtx.TenantID).
			Select("id, name, email").
			Find(&doctors)

		items := make([]gin.H, len(doctors))
		for i, d := range doctors {
			items[i] = gin.H{"id": d.ID, "name": d.Name}
		}

		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"doctors": items}})
	}
}
