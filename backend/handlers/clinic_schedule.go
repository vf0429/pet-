package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"petwell-merchant-backend/middleware"
	"petwell-merchant-backend/models"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ─── helpers ──────────────────────────────────────────────────────────────────

// generateSlots returns "HH:MM" strings from openTime to closeTime (exclusive)
// with durationMin spacing.
func generateSlots(openTime, closeTime string, durationMin int) []string {
	open, err1 := time.Parse("15:04", openTime)
	close, err2 := time.Parse("15:04", closeTime)
	if err1 != nil || err2 != nil || durationMin <= 0 {
		return nil
	}
	var slots []string
	for cur := open; cur.Before(close); cur = cur.Add(time.Duration(durationMin) * time.Minute) {
		slots = append(slots, cur.Format("15:04"))
	}
	return slots
}

// resolveWorkingHours returns the effective start/end time and slot duration for
// a specific (tenantID, doctorID, date) combination.
// Returns (openTime, closeTime, slotMin, isWorking, err).
func resolveWorkingHours(
	db *gorm.DB,
	tenantID, doctorID uint,
	date time.Time,
) (open, close string, slotMin int, isWorking bool, err error) {
	// Default slot
	slotMin = 30

	// --- Clinic template for that weekday ---
	dayOfWeek := int(date.Weekday()) // 0=Sun
	var tmpl models.ClinicScheduleTemplate
	tmplErr := db.Where("tenant_id = ? AND day_of_week = ?", tenantID, dayOfWeek).
		First(&tmpl).Error
	if tmplErr != nil {
		// No template configured → treat as open (don't block by default)
		isWorking = true
		return "09:00", "18:00", slotMin, true, nil
	}
	if !tmpl.IsActive {
		// Clinic closed this weekday
		return "", "", 0, false, nil
	}
	open = tmpl.OpenTime
	close = tmpl.CloseTime
	slotMin = tmpl.SlotDurationMin
	isWorking = true

	// --- Doctor shift override for this specific date ---
	dateStart := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)
	dateEnd := dateStart.Add(24 * time.Hour)
	var shift models.DoctorShift
	shiftErr := db.Where(
		"tenant_id = ? AND doctor_id = ? AND shift_date >= ? AND shift_date < ?",
		tenantID, doctorID, dateStart, dateEnd,
	).First(&shift).Error

	if shiftErr == nil {
		if shift.IsOff {
			return "", "", 0, false, nil
		}
		if shift.StartTime != "" && shift.EndTime != "" {
			open = shift.StartTime
			close = shift.EndTime
		}
	}
	return open, close, slotMin, true, nil
}

// ─── GET /clinic/availability ─────────────────────────────────────────────────
//
// Query params: doctor_id (required), date (YYYY-MM-DD, defaults to today)
// Returns per-slot availability for the requested doctor on the requested day.

func GetDoctorAvailability(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "unauthorized"})
			return
		}

		var doctorID uint
		if _, err := fmt.Sscanf(c.Query("doctor_id"), "%d", &doctorID); err != nil || doctorID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40001, "data": nil, "message": "doctor_id is required"})
			return
		}

		dateStr := c.Query("date")
		if dateStr == "" {
			dateStr = time.Now().UTC().Format("2006-01-02")
		}
		date, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40002, "data": nil, "message": "invalid date format, use YYYY-MM-DD"})
			return
		}

		// Verify doctor belongs to tenant
		var doctor models.MerchantUser
		if err := db.Where("id = ? AND tenant_id = ? AND role = 'doctor'", doctorID, authCtx.TenantID).
			First(&doctor).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40003, "data": nil, "message": "doctor not found"})
			return
		}

		// date was parsed from YYYY-MM-DD — treat it as a local clinic date (HKT)
		clinicLoc, _ := time.LoadLocation("Asia/Hong_Kong")
		dateLocal := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, clinicLoc)
		openTime, closeTime, slotDuration, isWorking, _ := resolveWorkingHours(db, authCtx.TenantID, doctorID, dateLocal)

		if !isWorking {
			c.JSON(http.StatusOK, gin.H{
				"code": 0, "message": "ok",
				"data": gin.H{
					"doctor_id":   doctorID,
					"doctor_name": doctor.Name,
					"date":        dateStr,
					"is_working":  false,
					"slots":       []gin.H{},
				},
			})
			return
		}

		slotTimes := generateSlots(openTime, closeTime, slotDuration)

		// Fetch existing non-cancelled appointments for this doctor on this date (local day boundaries)
		dateStart := dateLocal
		dateEnd := dateLocal.Add(24 * time.Hour)
		var appointments []models.ClinicAppointment
		db.Where(
			"tenant_id = ? AND doctor_id = ? AND scheduled_at >= ? AND scheduled_at < ? AND status != ?",
			authCtx.TenantID, doctorID, dateStart, dateEnd, string(models.ClinicAppointmentStatusCancelled),
		).Select("id, scheduled_at, status, pet_name, pet_owner_name").Find(&appointments)

		// Build booked map: "HH:MM" (local/HKT) → appointment summary
		type bookedInfo struct {
			AppointmentID uint
			PetName       string
			Status        string
		}
		bookedMap := make(map[string]bookedInfo)
		for _, a := range appointments {
			// Convert to local time so the key matches the slot strings ("09:00", "10:00" …)
			t := a.ScheduledAt.In(clinicLoc).Format("15:04")
			bookedMap[t] = bookedInfo{AppointmentID: a.ID, PetName: a.PetName, Status: string(a.Status)}
		}

		type SlotItem struct {
			Time          string `json:"time"`
			Available     bool   `json:"available"`
			Reason        string `json:"reason,omitempty"`
			AppointmentID *uint  `json:"appointment_id,omitempty"`
			PetName       string `json:"pet_name,omitempty"`
			Status        string `json:"appt_status,omitempty"`
		}

		result := make([]SlotItem, len(slotTimes))
		for i, t := range slotTimes {
			if info, booked := bookedMap[t]; booked {
				id := info.AppointmentID
				result[i] = SlotItem{
					Time:          t,
					Available:     false,
					Reason:        "booked",
					AppointmentID: &id,
					PetName:       info.PetName,
					Status:        info.Status,
				}
			} else {
				result[i] = SlotItem{Time: t, Available: true}
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"code": 0, "message": "ok",
			"data": gin.H{
				"doctor_id":   doctorID,
				"doctor_name": doctor.Name,
				"date":        dateStr,
				"is_working":  true,
				"open_time":   openTime,
				"close_time":  closeTime,
				"slots":       result,
			},
		})
	}
}

// ─── GET /clinic/schedule?week_start=YYYY-MM-DD ───────────────────────────────
//
// Returns a 7-day schedule grid for all doctors:
// { week_start, doctors, days, schedule: {doctor_id: {date: DayInfo}} }

func GetWeeklySchedule(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "unauthorized"})
			return
		}

		weekStr := c.Query("week_start")
		var weekStart time.Time
		if weekStr == "" {
			// Default: start of current week (Monday)
			now := time.Now().UTC()
			weekday := int(now.Weekday())
			if weekday == 0 {
				weekday = 7
			}
			weekStart = time.Date(now.Year(), now.Month(), now.Day()-weekday+1, 0, 0, 0, 0, time.UTC)
		} else {
			t, err := time.Parse("2006-01-02", weekStr)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 40001, "data": nil, "message": "invalid week_start, use YYYY-MM-DD"})
				return
			}
			weekStart = time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
		}

		// Build the 7 dates
		days := make([]string, 7)
		for i := 0; i < 7; i++ {
			days[i] = weekStart.AddDate(0, 0, i).Format("2006-01-02")
		}

		// Get all active doctors for this tenant
		var doctors []models.MerchantUser
		db.Where("tenant_id = ? AND role = 'doctor' AND status = 'active'", authCtx.TenantID).
			Select("id, name, email").Find(&doctors)

		// Get clinic schedule templates (all days)
		var templates []models.ClinicScheduleTemplate
		db.Where("tenant_id = ?", authCtx.TenantID).Find(&templates)
		tmplMap := make(map[int]models.ClinicScheduleTemplate) // dayOfWeek → tmpl
		for _, tmpl := range templates {
			tmplMap[tmpl.DayOfWeek] = tmpl
		}

		// Get doctor shifts for the week
		weekEnd := weekStart.AddDate(0, 0, 7)
		var shifts []models.DoctorShift
		db.Where("tenant_id = ? AND shift_date >= ? AND shift_date < ?", authCtx.TenantID, weekStart, weekEnd).
			Find(&shifts)
		// Index: doctorID → date string → shift
		shiftMap := make(map[uint]map[string]models.DoctorShift)
		for _, s := range shifts {
			if shiftMap[s.DoctorID] == nil {
				shiftMap[s.DoctorID] = make(map[string]models.DoctorShift)
			}
			shiftMap[s.DoctorID][s.ShiftDate.UTC().Format("2006-01-02")] = s
		}

		// Build response
		type DayInfo struct {
			IsWorking  bool   `json:"is_working"`
			StartTime  string `json:"start_time"`
			EndTime    string `json:"end_time"`
			IsCustom   bool   `json:"is_custom"`   // true = doctor has a shift override
			Note       string `json:"note,omitempty"`
			ShiftID    *uint  `json:"shift_id,omitempty"`
		}

		// schedule: map[string]map[string]DayInfo  (doctorID_str → date → DayInfo)
		schedule := make(map[string]map[string]DayInfo)
		for _, doc := range doctors {
			docKey := fmt.Sprintf("%d", doc.ID)
			schedule[docKey] = make(map[string]DayInfo)
			for i, dayStr := range days {
				date := weekStart.AddDate(0, 0, i)
				dow := int(date.Weekday())
				tmpl, hasTmpl := tmplMap[dow]

				// Default: follow template
				info := DayInfo{}
				if hasTmpl && tmpl.IsActive {
					info.IsWorking = true
					info.StartTime = tmpl.OpenTime
					info.EndTime = tmpl.CloseTime
				}

				// Apply doctor shift override if it exists
				if docShifts, ok := shiftMap[doc.ID]; ok {
					if shift, ok := docShifts[dayStr]; ok {
						shiftID := shift.ID
						info.IsCustom = true
						info.ShiftID = &shiftID
						info.Note = shift.Note
						if shift.IsOff {
							info.IsWorking = false
							info.StartTime = ""
							info.EndTime = ""
						} else if shift.StartTime != "" {
							info.IsWorking = true
							info.StartTime = shift.StartTime
							info.EndTime = shift.EndTime
						}
					}
				}
				schedule[docKey][dayStr] = info
			}
		}

		doctorItems := make([]gin.H, len(doctors))
		for i, d := range doctors {
			doctorItems[i] = gin.H{"id": d.ID, "name": d.Name}
		}

		c.JSON(http.StatusOK, gin.H{
			"code": 0, "message": "ok",
			"data": gin.H{
				"week_start": weekStart.Format("2006-01-02"),
				"doctors":    doctorItems,
				"days":       days,
				"schedule":   schedule,
			},
		})
	}
}

// ─── PUT /clinic/doctor-shifts ────────────────────────────────────────────────
//
// Upserts a shift override for a specific doctor on a specific date.
// To remove an override (restore to clinic template), use DELETE.

type UpsertDoctorShiftRequest struct {
	DoctorID  uint   `json:"doctor_id" binding:"required"`
	Date      string `json:"date" binding:"required"` // YYYY-MM-DD
	IsOff     bool   `json:"is_off"`
	StartTime string `json:"start_time"` // "09:00" (empty = use clinic template)
	EndTime   string `json:"end_time"`   // "18:00"
	Note      string `json:"note"`
}

func UpsertDoctorShift(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "unauthorized"})
			return
		}

		var req UpsertDoctorShiftRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40001, "data": nil, "message": err.Error()})
			return
		}

		date, err := time.Parse("2006-01-02", req.Date)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40002, "data": nil, "message": "invalid date format, use YYYY-MM-DD"})
			return
		}
		dateUTC := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)

		// Validate custom hours if not off
		if !req.IsOff && req.StartTime != "" {
			if _, e1 := time.Parse("15:04", req.StartTime); e1 != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 40003, "data": nil, "message": "invalid start_time format, use HH:MM"})
				return
			}
			if _, e2 := time.Parse("15:04", req.EndTime); e2 != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 40004, "data": nil, "message": "invalid end_time format, use HH:MM"})
				return
			}
			if req.StartTime >= req.EndTime {
				c.JSON(http.StatusBadRequest, gin.H{"code": 40005, "data": nil, "message": "start_time must be before end_time"})
				return
			}
		}

		// Verify doctor belongs to tenant
		var doctor models.MerchantUser
		if err := db.Where("id = ? AND tenant_id = ? AND role = 'doctor'", req.DoctorID, authCtx.TenantID).
			First(&doctor).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40006, "data": nil, "message": "doctor not found"})
			return
		}

		// Upsert: find existing or create new
		var shift models.DoctorShift
		findErr := db.Where(
			"tenant_id = ? AND doctor_id = ? AND shift_date = ?",
			authCtx.TenantID, req.DoctorID, dateUTC,
		).First(&shift).Error

		shift.TenantID = authCtx.TenantID
		shift.DoctorID = req.DoctorID
		shift.ShiftDate = dateUTC
		shift.IsOff = req.IsOff
		shift.StartTime = req.StartTime
		shift.EndTime = req.EndTime
		shift.Note = req.Note

		if errors.Is(findErr, gorm.ErrRecordNotFound) {
			if err := db.Create(&shift).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 50001, "data": nil, "message": "failed to create shift"})
				return
			}
		} else {
			if err := db.Save(&shift).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 50002, "data": nil, "message": "failed to update shift"})
				return
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"code": 0, "message": "ok",
			"data": gin.H{
				"id":         shift.ID,
				"doctor_id":  shift.DoctorID,
				"doctor_name": doctor.Name,
				"date":       req.Date,
				"is_off":     shift.IsOff,
				"start_time": shift.StartTime,
				"end_time":   shift.EndTime,
				"note":       shift.Note,
			},
		})
	}
}

// ─── DELETE /clinic/doctor-shifts/:id ────────────────────────────────────────
//
// Removes a shift override → doctor reverts to clinic template for that day.

func DeleteDoctorShift(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "unauthorized"})
			return
		}

		var shiftID uint
		if _, err := fmt.Sscanf(c.Param("id"), "%d", &shiftID); err != nil || shiftID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40001, "data": nil, "message": "invalid shift id"})
			return
		}

		result := db.Where("id = ? AND tenant_id = ?", shiftID, authCtx.TenantID).
			Delete(&models.DoctorShift{})
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50001, "data": nil, "message": "failed to delete shift"})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"code": 40401, "data": nil, "message": "shift not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": nil})
	}
}

// ─── GET /clinic/schedule-templates ──────────────────────────────────────────
//
// Returns the 7-day clinic operating hours configuration.

func GetScheduleTemplates(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "unauthorized"})
			return
		}

		var templates []models.ClinicScheduleTemplate
		db.Where("tenant_id = ?", authCtx.TenantID).Order("day_of_week asc").Find(&templates)

		dayNames := []string{"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"}
		items := make([]gin.H, len(templates))
		for i, t := range templates {
			dayName := ""
			if t.DayOfWeek >= 0 && t.DayOfWeek <= 6 {
				dayName = dayNames[t.DayOfWeek]
			}
			items[i] = gin.H{
				"id":                t.ID,
				"day_of_week":       t.DayOfWeek,
				"day_name":          dayName,
				"open_time":         t.OpenTime,
				"close_time":        t.CloseTime,
				"slot_duration_min": t.SlotDurationMin,
				"is_active":         t.IsActive,
			}
		}

		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"templates": items}})
	}
}

// ─── PUT /clinic/schedule-templates/:day ─────────────────────────────────────
//
// Updates or creates a single day's clinic operating hours. :day is 0-6 (0=Sun).

type UpdateScheduleTemplateRequest struct {
	OpenTime        string `json:"open_time" binding:"required"`  // "09:00"
	CloseTime       string `json:"close_time" binding:"required"` // "18:00"
	SlotDurationMin int    `json:"slot_duration_min"`             // 15, 20, 30, 60
	IsActive        *bool  `json:"is_active"`                     // pointer so false is accepted
}

func UpdateScheduleTemplate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "unauthorized"})
			return
		}

		var dayOfWeek int
		if _, err := fmt.Sscanf(c.Param("day"), "%d", &dayOfWeek); err != nil || dayOfWeek < 0 || dayOfWeek > 6 {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40001, "data": nil, "message": "day must be 0-6 (0=Sunday)"})
			return
		}

		var req UpdateScheduleTemplateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40002, "data": nil, "message": err.Error()})
			return
		}

		if _, err := time.Parse("15:04", req.OpenTime); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40003, "data": nil, "message": "invalid open_time, use HH:MM"})
			return
		}
		if _, err := time.Parse("15:04", req.CloseTime); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40004, "data": nil, "message": "invalid close_time, use HH:MM"})
			return
		}
		if req.SlotDurationMin <= 0 {
			req.SlotDurationMin = 30
		}
		isActive := true
		if req.IsActive != nil {
			isActive = *req.IsActive
		}

		var tmpl models.ClinicScheduleTemplate
		findErr := db.Where("tenant_id = ? AND day_of_week = ?", authCtx.TenantID, dayOfWeek).First(&tmpl).Error

		tmpl.TenantID = authCtx.TenantID
		tmpl.DayOfWeek = dayOfWeek
		tmpl.OpenTime = req.OpenTime
		tmpl.CloseTime = req.CloseTime
		tmpl.SlotDurationMin = req.SlotDurationMin
		tmpl.IsActive = isActive

		if errors.Is(findErr, gorm.ErrRecordNotFound) {
			if err := db.Create(&tmpl).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 50001, "data": nil, "message": "failed to create template"})
				return
			}
		} else {
			if err := db.Save(&tmpl).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 50002, "data": nil, "message": "failed to update template"})
				return
			}
		}

		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{
			"id":                tmpl.ID,
			"day_of_week":       tmpl.DayOfWeek,
			"open_time":         tmpl.OpenTime,
			"close_time":        tmpl.CloseTime,
			"slot_duration_min": tmpl.SlotDurationMin,
			"is_active":         tmpl.IsActive,
		}})
	}
}
