package handlers

import (
	"net/http"
	"pawrd-merchant-backend/middleware"
	"pawrd-merchant-backend/models"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ClinicPatientListItem is a single row in the patients list response.
type ClinicPatientListItem struct {
	ID                    uint    `json:"id"`
	Name                  string  `json:"name"`
	Species               string  `json:"species"`
	Breed                 string  `json:"breed"`
	Gender                string  `json:"gender"`
	DateOfBirth           *string `json:"date_of_birth"`
	Weight                float64 `json:"weight"`
	WeightUnit            string  `json:"weight_unit"`
	IsDeceased            bool    `json:"is_deceased"`
	Microchip             string  `json:"microchip"`
	OwnerName             string  `json:"owner_name"`
	OwnerPhone            string  `json:"owner_phone"`
	LastVisitAt           *string `json:"last_visit_at"`
	PendingRemindersCount int64   `json:"pending_reminders_count"`
}

// ListClinicPatientsQuery holds query params for GET /clinic/patients.
type ListClinicPatientsQuery struct {
	Q        string `form:"q"`
	ClientID *uint  `form:"client_id"`
	Page     int    `form:"page,default=1"`
	PerPage  int    `form:"per_page,default=20"`
}

// ListClinicPatients handles GET /v1/merchant/clinic/patients
func ListClinicPatients(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		db = middleware.GetTenantDB(c, db)
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		var query ListClinicPatientsQuery
		if err := c.ShouldBindQuery(&query); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40005, "data": nil, "message": "invalid query params"})
			return
		}
		if query.Page < 1 {
			query.Page = 1
		}
		if query.PerPage < 1 || query.PerPage > 100 {
			query.PerPage = 20
		}

		tenantID := authCtx.TenantID

		base := db.Model(&models.ClinicPatient{}).Where("clinic_patients.tenant_id = ?", tenantID)

		if query.ClientID != nil {
			base = base.Where("clinic_patients.client_id = ?", *query.ClientID)
		}

		if query.Q != "" {
			like := "%" + query.Q + "%"
			base = base.
				Joins("LEFT JOIN clinic_clients ON clinic_clients.id = clinic_patients.client_id").
				Where("clinic_patients.name LIKE ? OR clinic_clients.first_name LIKE ? OR clinic_clients.last_name LIKE ? OR clinic_clients.phone LIKE ?",
					like, like, like, like)
		}

		var total int64
		base.Count(&total)

		var patients []models.ClinicPatient
		base.Preload("Species").Preload("Breed").Preload("Client").
			Order("clinic_patients.name ASC").
			Offset((query.Page - 1) * query.PerPage).
			Limit(query.PerPage).
			Find(&patients)

		items := make([]ClinicPatientListItem, len(patients))
		for i, p := range patients {
			species := ""
			if p.Species != nil {
				species = p.Species.Name
			}
			breed := ""
			if p.Breed != nil {
				breed = p.Breed.Name
			}
			var dobStr *string
			if p.DateOfBirth != nil {
				s := p.DateOfBirth.Format("2006-01-02")
				dobStr = &s
			}

			ownerName := ""
			ownerPhone := ""
			ownerName = p.Client.FirstName + " " + p.Client.LastName
			ownerPhone = p.Client.Phone

			// Last visit
			var lastVisitAt *string
			var lastVisit models.ClinicVisit
			if err := db.Where("tenant_id = ?", tenantID).
				Joins("JOIN clinic_appointments ON clinic_appointments.id = clinic_visits.appointment_id").
				Where("clinic_appointments.patient_id = ?", p.ID).
				Order("clinic_visits.created_at DESC").
				First(&lastVisit).Error; err == nil {
				s := lastVisit.CreatedAt.Format("2006-01-02T15:04:05Z07:00")
				lastVisitAt = &s
			}

			// Pending reminders count (overdue + upcoming 30d)
			var reminderCount int64
			db.Model(&models.HealthReminder{}).
				Where("patient_id = ? AND tenant_id = ? AND active = ? AND (due_at <= datetime('now','+30 days'))", p.ID, tenantID, true).
				Count(&reminderCount)

			items[i] = ClinicPatientListItem{
				ID:                    p.ID,
				Name:                  p.Name,
				Species:               species,
				Breed:                 breed,
				Gender:                p.Gender,
				DateOfBirth:           dobStr,
				Weight:                p.Weight,
				WeightUnit:            p.WeightUnit,
				IsDeceased:            p.IsDeceased,
				Microchip:             p.Microchip,
				OwnerName:             ownerName,
				OwnerPhone:            ownerPhone,
				LastVisitAt:           lastVisitAt,
				PendingRemindersCount: reminderCount,
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"patients": items,
				"total":    total,
				"page":     query.Page,
				"per_page": query.PerPage,
				"has_more": int64(query.Page*query.PerPage) < total,
			},
			"message": "ok",
		})
	}
}

// GetClinicPatientDetail handles GET /v1/merchant/clinic/patients/:id
func GetClinicPatientDetail(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		db = middleware.GetTenantDB(c, db)
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		idStr := c.Param("id")
		id, err := strconv.ParseUint(idStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40010, "data": nil, "message": "invalid id"})
			return
		}

		tenantID := authCtx.TenantID

		var patient models.ClinicPatient
		if err := db.Where("id = ? AND tenant_id = ?", id, tenantID).
			Preload("Species").Preload("Breed").Preload("Client").
			First(&patient).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"code": 30011, "data": nil, "message": "patient not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		// Recent visits (last 10)
		type VisitSummary struct {
			ID             uint   `json:"id"`
			ConsultDate    string `json:"consult_date"`
			ChiefComplaint string `json:"chief_complaint"`
			Status         string `json:"status"`
		}
		var visits []models.ClinicVisit
		db.Where("tenant_id = ?", tenantID).
			Joins("JOIN clinic_appointments ON clinic_appointments.id = clinic_visits.appointment_id").
			Where("clinic_appointments.patient_id = ?", patient.ID).
			Order("clinic_visits.created_at DESC").
			Limit(10).
			Find(&visits)

		visitSummaries := make([]VisitSummary, len(visits))
		for i, v := range visits {
			date := v.CreatedAt.Format("2006-01-02")
			if v.ConsultDate != nil {
				date = v.ConsultDate.Format("2006-01-02")
			}
			visitSummaries[i] = VisitSummary{
				ID:             v.ID,
				ConsultDate:    date,
				ChiefComplaint: v.ChiefComplaint,
				Status:         string(v.Status),
			}
		}

		// Reminders
		var reminders []models.HealthReminder
		db.Where("patient_id = ? AND tenant_id = ?", patient.ID, tenantID).
			Order("due_at ASC").
			Find(&reminders)

		type ReminderSummary struct {
			ID              uint    `json:"id"`
			Name            string  `json:"name"`
			Category        string  `json:"category"`
			DueAt           *string `json:"due_at"`
			LastFulfilledAt *string `json:"last_fulfilled_at"`
		}
		reminderSummaries := make([]ReminderSummary, len(reminders))
		for i, r := range reminders {
			var dueStr, lastStr *string
			if r.DueAt != nil {
				s := r.DueAt.Format("2006-01-02T15:04:05Z07:00")
				dueStr = &s
			}
			if r.LastFulfilledAt != nil {
				s := r.LastFulfilledAt.Format("2006-01-02T15:04:05Z07:00")
				lastStr = &s
			}
			reminderSummaries[i] = ReminderSummary{
				ID:              r.ID,
				Name:            r.Name,
				Category:        r.Category,
				DueAt:           dueStr,
				LastFulfilledAt: lastStr,
			}
		}

		// Build response
		speciesName := ""
		if patient.Species != nil {
			speciesName = patient.Species.Name
		}
		breedName := ""
		if patient.Breed != nil {
			breedName = patient.Breed.Name
		}
		var dobStr *string
		if patient.DateOfBirth != nil {
			s := patient.DateOfBirth.Format("2006-01-02")
			dobStr = &s
		}

		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"patient": gin.H{
					"id":              patient.ID,
					"name":            patient.Name,
					"species":         speciesName,
					"breed":           breedName,
					"gender":          patient.Gender,
					"date_of_birth":   dobStr,
					"weight":          patient.Weight,
					"weight_unit":     patient.WeightUnit,
					"is_deceased":     patient.IsDeceased,
					"microchip":       patient.Microchip,
					"notes":           patient.Notes,
					"notes_important": patient.NotesImportant,
				},
				"owner": gin.H{
					"id":         patient.Client.ID,
					"first_name": patient.Client.FirstName,
					"last_name":  patient.Client.LastName,
					"phone":      patient.Client.Phone,
					"email":      patient.Client.Email,
				},
				"recent_visits": visitSummaries,
				"reminders":     reminderSummaries,
			},
			"message": "ok",
		})
	}
}
