package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"petwell-merchant-backend/models"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

var errFacadeBindingNotFound = errors.New("clinic integration not found")

type FacadeResp struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data"`
}

func facadeOK(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, FacadeResp{Code: 0, Message: "ok", Data: data})
}

func facadeErr(c *gin.Context, httpStatus, code int, msg string) {
	c.JSON(httpStatus, FacadeResp{Code: code, Message: msg, Data: nil})
}

func resolveBinding(db *gorm.DB, clinicIntegrationID string, projectID uint) (*models.ClinicIntegrationBinding, error) {
	var binding models.ClinicIntegrationBinding
	err := db.Where("clinic_integration_id = ? AND project_id = ? AND status = ?", clinicIntegrationID, projectID, "active").First(&binding).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errFacadeBindingNotFound
		}
		return nil, err
	}
	return &binding, nil
}

type vaccinationBookingPet struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Species string `json:"species,omitempty"`
	Breed   string `json:"breed,omitempty"`
}

type vaccinationBookingOwner struct {
	Name  string `json:"name"`
	Phone string `json:"phone"`
	Email string `json:"email,omitempty"`
}

type createVaccinationBookingRequest struct {
	ClinicIntegrationID string                  `json:"clinic_integration_id"`
	VaccineCode         string                  `json:"vaccine_code"`
	ScheduledAt         string                  `json:"scheduled_at"`
	Pet                 vaccinationBookingPet   `json:"pet"`
	Owner               vaccinationBookingOwner `json:"owner"`
	Notes               string                  `json:"notes"`
}

type cancelVaccinationBookingRequest struct {
	Reason string `json:"reason"`
}

func appProjectID(c *gin.Context) (uint, bool) {
	val, exists := c.Get("app_project_id")
	if !exists {
		return 0, false
	}
	projectID, ok := val.(uint)
	return projectID, ok
}

func buildBookingDetail(facade models.VaccinationBookingFacade, appointment *models.ClinicAppointment) gin.H {
	data := gin.H{
		"external_booking_id":   facade.ExternalBookingID,
		"clinic_integration_id": facade.ClinicIntegrationID,
		"status":                facade.Status,
		"scheduled_at":          facade.ScheduledAt.Format(time.RFC3339),
		"vaccine_code":          facade.VaccineCode,
		"pet": gin.H{
			"id":   facade.PetID,
			"name": facade.PetName,
		},
		"owner": gin.H{
			"name":  facade.OwnerName,
			"phone": facade.OwnerPhone,
		},
		"updated_at": facade.UpdatedAt.Format(time.RFC3339),
	}
	if appointment != nil {
		data["merchant_status"] = gin.H{
			"appointment_status":      appointment.Status,
			"internal_appointment_id": appointment.ID,
		}
	}
	return data
}

func bookingResponseFromModel(db *gorm.DB, facade models.VaccinationBookingFacade) gin.H {
	var appointment models.ClinicAppointment
	var apptPtr *models.ClinicAppointment
	if facade.InternalAppointmentID != nil {
		if err := db.Where("id = ?", *facade.InternalAppointmentID).First(&appointment).Error; err == nil {
			apptPtr = &appointment
		}
	}
	return buildBookingDetail(facade, apptPtr)
}

// GetVaccinationAvailability handles GET /app/v1/vaccinations/availability
func GetVaccinationAvailability(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID, ok := appProjectID(c)
		if !ok {
			facadeErr(c, http.StatusUnauthorized, 40102, "invalid app key")
			return
		}

		clinicIntegrationID := strings.TrimSpace(c.Query("clinic_integration_id"))
		vaccineCode := strings.TrimSpace(c.Query("vaccine_code"))
		dateStr := strings.TrimSpace(c.Query("date"))

		if clinicIntegrationID == "" {
			facadeErr(c, http.StatusBadRequest, 40011, "missing clinic_integration_id")
			return
		}
		if vaccineCode == "" {
			facadeErr(c, http.StatusBadRequest, 40013, "invalid vaccine_code")
			return
		}
		parsedDate, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			facadeErr(c, http.StatusBadRequest, 40012, "invalid scheduled_at")
			return
		}

		binding, err := resolveBinding(db, clinicIntegrationID, projectID)
		if err != nil {
			if errors.Is(err, errFacadeBindingNotFound) {
				facadeErr(c, http.StatusNotFound, 40401, "clinic integration not found")
				return
			}
			facadeErr(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		location, err := time.LoadLocation(binding.Timezone)
		if err != nil {
			location = time.FixedZone("UTC+8", 8*60*60)
		}
		targetDate := time.Date(parsedDate.Year(), parsedDate.Month(), parsedDate.Day(), 0, 0, 0, 0, location)

		var template models.ClinicScheduleTemplate
		if err := db.Where("tenant_id = ? AND day_of_week = ?", binding.TenantID, int(targetDate.Weekday())).First(&template).Error; err != nil || !template.IsActive {
			facadeOK(c, gin.H{
				"clinic_integration_id": clinicIntegrationID,
				"vaccine_code":          vaccineCode,
				"date":                  dateStr,
				"timezone":              binding.Timezone,
				"slots":                 []gin.H{},
			})
			return
		}

		openAt, err1 := time.ParseInLocation("15:04", template.OpenTime, location)
		closeAt, err2 := time.ParseInLocation("15:04", template.CloseTime, location)
		if err1 != nil || err2 != nil || template.SlotDurationMin <= 0 {
			facadeErr(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}
		dayStart := time.Date(targetDate.Year(), targetDate.Month(), targetDate.Day(), 0, 0, 0, 0, location)
		openTime := time.Date(targetDate.Year(), targetDate.Month(), targetDate.Day(), openAt.Hour(), openAt.Minute(), 0, 0, location)
		closeTime := time.Date(targetDate.Year(), targetDate.Month(), targetDate.Day(), closeAt.Hour(), closeAt.Minute(), 0, 0, location)
		dayEnd := dayStart.Add(24 * time.Hour)

		var appointments []models.ClinicAppointment
		if err := db.Where("tenant_id = ? AND scheduled_at >= ? AND scheduled_at < ? AND status <> ?", binding.TenantID, dayStart.UTC(), dayEnd.UTC(), models.ClinicAppointmentStatusCancelled).Find(&appointments).Error; err != nil {
			facadeErr(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		now := time.Now().In(location)
		slotDuration := time.Duration(template.SlotDurationMin) * time.Minute
		slots := make([]gin.H, 0)
		for slotStart := openTime; slotStart.Before(closeTime); slotStart = slotStart.Add(slotDuration) {
			slotEnd := slotStart.Add(slotDuration)
			isAvailable := slotStart.After(now)
			for _, appt := range appointments {
				apptAt := appt.ScheduledAt.In(location)
				if apptAt.Before(slotEnd) && apptAt.Add(slotDuration).After(slotStart) {
					isAvailable = false
					break
				}
			}
			slots = append(slots, gin.H{
				"slot_id":      slotStart.Format(time.RFC3339),
				"start_at":     slotStart.Format(time.RFC3339),
				"end_at":       slotEnd.Format(time.RFC3339),
				"is_available": isAvailable,
			})
		}

		facadeOK(c, gin.H{
			"clinic_integration_id": clinicIntegrationID,
			"vaccine_code":          vaccineCode,
			"date":                  dateStr,
			"timezone":              binding.Timezone,
			"slots":                 slots,
		})
	}
}

// CreateVaccinationBooking handles POST /app/v1/vaccinations/bookings
func CreateVaccinationBooking(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID, ok := appProjectID(c)
		if !ok {
			facadeErr(c, http.StatusUnauthorized, 40102, "invalid app key")
			return
		}

		idempotencyKey := strings.TrimSpace(c.GetHeader("Idempotency-Key"))
		if idempotencyKey == "" {
			facadeErr(c, http.StatusBadRequest, 40010, "idempotency key required")
			return
		}

		var req createVaccinationBookingRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			facadeErr(c, http.StatusBadRequest, 40010, "invalid request")
			return
		}

		var existing models.VaccinationBookingFacade
		if err := db.Where("idempotency_key = ?", idempotencyKey).First(&existing).Error; err == nil {
			facadeOK(c, bookingResponseFromModel(db, existing))
			return
		} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			facadeErr(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		if strings.TrimSpace(req.ClinicIntegrationID) == "" || strings.TrimSpace(req.VaccineCode) == "" ||
			strings.TrimSpace(req.ScheduledAt) == "" || strings.TrimSpace(req.Pet.ID) == "" ||
			strings.TrimSpace(req.Pet.Name) == "" || strings.TrimSpace(req.Owner.Name) == "" || strings.TrimSpace(req.Owner.Phone) == "" {
			facadeErr(c, http.StatusBadRequest, 40010, "invalid request")
			return
		}

		scheduledAt, err := time.Parse(time.RFC3339, req.ScheduledAt)
		if err != nil {
			facadeErr(c, http.StatusBadRequest, 40012, "invalid scheduled_at")
			return
		}

		binding, err := resolveBinding(db, req.ClinicIntegrationID, projectID)
		if err != nil {
			if errors.Is(err, errFacadeBindingNotFound) {
				facadeErr(c, http.StatusNotFound, 40401, "clinic integration not found")
				return
			}
			facadeErr(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		rawJSON, _ := json.Marshal(req)
		externalBookingID := fmt.Sprintf("vbk_%s", uuid.New().String()[:8])

		var createdFacade models.VaccinationBookingFacade
		var createdAppointment models.ClinicAppointment
		txErr := db.Transaction(func(tx *gorm.DB) error {
			doctorID := binding.DefaultDoctorID
			if doctorID == nil {
				var doctor models.MerchantUser
				if err := tx.Where("tenant_id = ? AND role = ? AND status = ?", binding.TenantID, models.UserRoleDoctor, models.UserStatusActive).Order("id ASC").First(&doctor).Error; err != nil {
					return err
				}
				doctorID = &doctor.ID
			}

			appointment := models.ClinicAppointment{
				TenantID:      binding.TenantID,
				BusinessType:  "clinic",
				PetName:       req.Pet.Name,
				PetOwnerName:  req.Owner.Name,
				PetOwnerPhone: req.Owner.Phone,
				DoctorID:      *doctorID,
				VisitType:     "vaccination",
				ScheduledAt:   scheduledAt.UTC(),
				Status:        models.ClinicAppointmentStatusPending,
				Notes:         req.Notes,
				Source:        "app_facade",
			}
			if err := tx.Create(&appointment).Error; err != nil {
				return err
			}

			facade := models.VaccinationBookingFacade{
				ProjectID:             binding.ProjectID,
				TenantID:              binding.TenantID,
				ClinicIntegrationID:   binding.ClinicIntegrationID,
				ExternalBookingID:     externalBookingID,
				IdempotencyKey:        idempotencyKey,
				InternalAppointmentID: &appointment.ID,
				PetID:                 req.Pet.ID,
				PetName:               req.Pet.Name,
				OwnerName:             req.Owner.Name,
				OwnerPhone:            req.Owner.Phone,
				OwnerEmail:            req.Owner.Email,
				VaccineCode:           req.VaccineCode,
				ScheduledAt:           scheduledAt.UTC(),
				Status:                "requested",
				RawRequestJSON:        string(rawJSON),
			}
			if err := tx.Create(&facade).Error; err != nil {
				return err
			}

			createdFacade = facade
			createdAppointment = appointment
			return nil
		})
		if txErr != nil {
			facadeErr(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		facadeOK(c, gin.H{
			"external_booking_id":   createdFacade.ExternalBookingID,
			"clinic_integration_id": createdFacade.ClinicIntegrationID,
			"status":                createdFacade.Status,
			"scheduled_at":          createdFacade.ScheduledAt.Format(time.RFC3339),
			"portal_visibility": gin.H{
				"visible":                 true,
				"internal_appointment_id": createdAppointment.ID,
			},
			"created_at": createdFacade.CreatedAt.Format(time.RFC3339),
		})
	}
}

// GetVaccinationBooking handles GET /app/v1/vaccinations/bookings/:external_booking_id
func GetVaccinationBooking(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID, ok := appProjectID(c)
		if !ok {
			facadeErr(c, http.StatusUnauthorized, 40102, "invalid app key")
			return
		}

		externalBookingID := strings.TrimSpace(c.Param("external_booking_id"))
		var facade models.VaccinationBookingFacade
		if err := db.Where("external_booking_id = ?", externalBookingID).First(&facade).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				facadeErr(c, http.StatusNotFound, 40402, "booking not found")
				return
			}
			facadeErr(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		if facade.ProjectID != projectID {
			facadeErr(c, http.StatusForbidden, 40301, "forbidden")
			return
		}

		var appointment *models.ClinicAppointment
		if facade.InternalAppointmentID != nil {
			var appt models.ClinicAppointment
			if err := db.Where("id = ?", *facade.InternalAppointmentID).First(&appt).Error; err == nil {
				appointment = &appt
			}
		}

		facadeOK(c, buildBookingDetail(facade, appointment))
	}
}

// CancelVaccinationBooking handles POST /app/v1/vaccinations/bookings/:external_booking_id/cancel
func CancelVaccinationBooking(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID, ok := appProjectID(c)
		if !ok {
			facadeErr(c, http.StatusUnauthorized, 40102, "invalid app key")
			return
		}

		var req cancelVaccinationBookingRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			facadeErr(c, http.StatusBadRequest, 40010, "invalid request")
			return
		}

		var facade models.VaccinationBookingFacade
		if err := db.Where("external_booking_id = ?", c.Param("external_booking_id")).First(&facade).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				facadeErr(c, http.StatusNotFound, 40402, "booking not found")
				return
			}
			facadeErr(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		if facade.ProjectID != projectID {
			facadeErr(c, http.StatusForbidden, 40301, "forbidden")
			return
		}

		if facade.Status != "requested" && facade.Status != "confirmed" {
			facadeErr(c, http.StatusUnprocessableEntity, 42201, "illegal booking status transition")
			return
		}

		now := time.Now()
		txErr := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&models.VaccinationBookingFacade{}).Where("id = ?", facade.ID).Updates(map[string]interface{}{
				"status":     "cancelled_by_user",
				"updated_at": now,
			}).Error; err != nil {
				return err
			}

			if facade.InternalAppointmentID != nil {
				if err := tx.Model(&models.ClinicAppointment{}).Where("id = ?", *facade.InternalAppointmentID).Updates(map[string]interface{}{
					"status":        models.ClinicAppointmentStatusCancelled,
					"cancel_reason": req.Reason,
					"updated_at":    now,
				}).Error; err != nil {
					return err
				}
			}
			return nil
		})
		if txErr != nil {
			facadeErr(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		facade.Status = "cancelled_by_user"
		facade.UpdatedAt = now
		facadeOK(c, gin.H{
			"external_booking_id": facade.ExternalBookingID,
			"status":              facade.Status,
			"updated_at":          facade.UpdatedAt.Format(time.RFC3339),
		})
	}
}
