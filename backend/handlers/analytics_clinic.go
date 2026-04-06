package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"petwell-merchant-backend/middleware"
	"petwell-merchant-backend/models"
	"sort"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type clinicAnalyticsResponse struct {
	Period                analyticsPeriodResponse         `json:"period"`
	Summary               clinicAnalyticsSummary          `json:"summary"`
	DailyVisits           []clinicDailyVisitsPoint        `json:"daily_visits"`
	DiagnosisBreakdown    []clinicDiagnosisBreakdownPoint `json:"diagnosis_breakdown"`
	DoctorWorkload        []map[string]interface{}        `json:"doctor_workload"`
	AppointmentAttendance []clinicAttendancePoint         `json:"appointment_attendance"`
}

type clinicAnalyticsSummary struct {
	TotalVisits         int64    `json:"total_visits"`
	AvgVisitDurationMin *float64 `json:"avg_visit_duration_min"`
	RevisitRate30d      float64  `json:"revisit_rate_30d"`
	PrescriptionRate    float64  `json:"prescription_rate"`
}

type clinicDailyVisitsPoint struct {
	Date   string `json:"date"`
	Visits int64  `json:"visits"`
}

type clinicDiagnosisBreakdownPoint struct {
	Name  string  `json:"name"`
	Count int64   `json:"count"`
	Pct   float64 `json:"pct"`
}

type clinicAttendancePoint struct {
	Date      string  `json:"date"`
	Confirmed int64   `json:"confirmed"`
	CheckedIn int64   `json:"checked_in"`
	Rate      float64 `json:"rate"`
}

type clinicDiagnosisCountRow struct {
	Name  string `gorm:"column:name"`
	Count int64  `gorm:"column:count"`
}

type clinicDoctorWeekRow struct {
	DoctorName string `gorm:"column:doctor_name"`
	Week       string `gorm:"column:week"`
	Count      int64  `gorm:"column:count"`
}

type clinicAttendanceRow struct {
	Date      string `gorm:"column:date"`
	Confirmed int64  `gorm:"column:confirmed"`
	CheckedIn int64  `gorm:"column:checked_in"`
}

// GetClinicAnalytics handles GET /merchant/analytics/clinic.
func GetClinicAnalytics(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			analyticsError(c, http.StatusUnauthorized, 20001, "X-Session-ID header is required")
			return
		}

		dateRange, err := resolveAnalyticsRange(c)
		if err != nil {
			switch err.Error() {
			case "date range exceeds 90 days":
				analyticsError(c, http.StatusBadRequest, 40012, err.Error())
			default:
				analyticsError(c, http.StatusBadRequest, 40010, err.Error())
			}
			return
		}

		tenantID := authCtx.TenantID

		var totalVisits int64
		if err := db.Model(&models.ClinicVisit{}).
			Where("tenant_id = ? AND created_at BETWEEN ? AND ?", tenantID, dateRange.FromStart, dateRange.ToEnd).
			Count(&totalVisits).Error; err != nil {
			analyticsError(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		avgVisitDurationMin, err := queryClinicAverageVisitDuration(db, tenantID, dateRange)
		if err != nil {
			analyticsError(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		revisitRate30d, err := calculateClinicRevisitRate30d(db, tenantID, dateRange)
		if err != nil {
			analyticsError(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		prescriptionRate, err := calculateClinicPrescriptionRate(db, tenantID, dateRange, totalVisits)
		if err != nil {
			analyticsError(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		var dailyVisits []clinicDailyVisitsPoint
		if err := db.Model(&models.ClinicVisit{}).
			Select("DATE(created_at) as date, COUNT(*) as visits").
			Where("tenant_id = ? AND created_at BETWEEN ? AND ?", tenantID, dateRange.FromStart, dateRange.ToEnd).
			Group("DATE(created_at)").
			Order("date ASC").
			Scan(&dailyVisits).Error; err != nil {
			analyticsError(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		diagnosisBreakdown, err := queryClinicDiagnosisBreakdown(db, tenantID, dateRange, totalVisits)
		if err != nil {
			analyticsError(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		doctorWorkload, err := queryClinicDoctorWorkload(db, tenantID, dateRange)
		if err != nil {
			analyticsError(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		appointmentAttendance, err := queryClinicAppointmentAttendance(db, tenantID, dateRange)
		if err != nil {
			analyticsError(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		analyticsOK(c, clinicAnalyticsResponse{
			Period: analyticsPeriodResponse{
				From: dateRange.FromDate,
				To:   dateRange.ToDate,
			},
			Summary: clinicAnalyticsSummary{
				TotalVisits:         totalVisits,
				AvgVisitDurationMin: avgVisitDurationMin,
				RevisitRate30d:      revisitRate30d,
				PrescriptionRate:    prescriptionRate,
			},
			DailyVisits:           dailyVisits,
			DiagnosisBreakdown:    diagnosisBreakdown,
			DoctorWorkload:        doctorWorkload,
			AppointmentAttendance: appointmentAttendance,
		})
	}
}

func queryClinicAverageVisitDuration(db *gorm.DB, tenantID uint, dateRange *analyticsRange) (*float64, error) {
	avgExpr := "AVG((JULIANDAY(closed_at) - JULIANDAY(created_at)) * 1440)"
	if db.Dialector.Name() == "postgres" {
		avgExpr = "AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 60.0)"
	}

	var value sql.NullFloat64
	row := db.Model(&models.ClinicVisit{}).
		Select(avgExpr).
		Where("tenant_id = ? AND closed_at IS NOT NULL AND created_at BETWEEN ? AND ?", tenantID, dateRange.FromStart, dateRange.ToEnd).
		Row()
	if err := row.Scan(&value); err != nil {
		return nil, err
	}
	if !value.Valid {
		return nil, nil
	}
	result := value.Float64
	return &result, nil
}

func calculateClinicRevisitRate30d(db *gorm.DB, tenantID uint, dateRange *analyticsRange) (float64, error) {
	revisitTo := dateRange.ToEnd.UTC()
	revisitFrom := revisitTo.AddDate(0, 0, -29)
	revisitFrom = time.Date(revisitFrom.Year(), revisitFrom.Month(), revisitFrom.Day(), 0, 0, 0, 0, time.UTC)

	var totalOwners int64
	if err := db.Table("clinic_visits").
		Joins("JOIN clinic_appointments ON clinic_appointments.id = clinic_visits.appointment_id AND clinic_appointments.tenant_id = clinic_visits.tenant_id").
		Distinct("clinic_appointments.pet_owner_phone").
		Where("clinic_visits.tenant_id = ? AND clinic_visits.created_at BETWEEN ? AND ? AND clinic_appointments.pet_owner_phone <> ''", tenantID, revisitFrom, revisitTo).
		Count(&totalOwners).Error; err != nil {
		return 0, err
	}
	if totalOwners == 0 {
		return 0, nil
	}

	var repeatOwners int64
	repeatSub := db.Table("clinic_visits").
		Select("clinic_appointments.pet_owner_phone").
		Joins("JOIN clinic_appointments ON clinic_appointments.id = clinic_visits.appointment_id AND clinic_appointments.tenant_id = clinic_visits.tenant_id").
		Where("clinic_visits.tenant_id = ? AND clinic_visits.created_at BETWEEN ? AND ? AND clinic_appointments.pet_owner_phone <> ''", tenantID, revisitFrom, revisitTo).
		Group("clinic_appointments.pet_owner_phone").
		Having("COUNT(*) > 1")
	if err := db.Table("(?) as repeat_owners", repeatSub).Count(&repeatOwners).Error; err != nil {
		return 0, err
	}

	return float64(repeatOwners) / float64(totalOwners), nil
}

func calculateClinicPrescriptionRate(db *gorm.DB, tenantID uint, dateRange *analyticsRange, totalVisits int64) (float64, error) {
	if totalVisits == 0 {
		return 0, nil
	}

	visitSub := db.Model(&models.ClinicVisit{}).
		Select("id").
		Where("tenant_id = ? AND created_at BETWEEN ? AND ?", tenantID, dateRange.FromStart, dateRange.ToEnd)

	var prescribedVisits int64
	if err := db.Model(&models.ClinicPrescription{}).
		Distinct("visit_id").
		Where("tenant_id = ? AND visit_id IN (?)", tenantID, visitSub).
		Count(&prescribedVisits).Error; err != nil {
		return 0, err
	}

	return float64(prescribedVisits) / float64(totalVisits), nil
}

func queryClinicDiagnosisBreakdown(db *gorm.DB, tenantID uint, dateRange *analyticsRange, totalVisits int64) ([]clinicDiagnosisBreakdownPoint, error) {
	var rows []clinicDiagnosisCountRow
	if err := db.Table("clinic_diagnoses").
		Select("clinic_diagnoses.name as name, COUNT(*) as count").
		Joins("JOIN clinic_visits ON clinic_visits.id = clinic_diagnoses.visit_id AND clinic_visits.tenant_id = clinic_diagnoses.tenant_id").
		Where("clinic_diagnoses.tenant_id = ? AND clinic_visits.created_at BETWEEN ? AND ?", tenantID, dateRange.FromStart, dateRange.ToEnd).
		Group("clinic_diagnoses.name").
		Order("count DESC").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	result := make([]clinicDiagnosisBreakdownPoint, 0, len(rows))
	var totalDiagnosisCount int64
	for _, row := range rows {
		totalDiagnosisCount += row.Count
	}
	for _, row := range rows {
		pct := 0.0
		if totalDiagnosisCount > 0 {
			pct = float64(row.Count) / float64(totalDiagnosisCount) * 100
		} else if totalVisits > 0 {
			pct = float64(row.Count) / float64(totalVisits) * 100
		}
		result = append(result, clinicDiagnosisBreakdownPoint{Name: row.Name, Count: row.Count, Pct: pct})
	}
	return result, nil
}

func queryClinicDoctorWorkload(db *gorm.DB, tenantID uint, dateRange *analyticsRange) ([]map[string]interface{}, error) {
	weekExpr := "strftime('%Y-W%W', clinic_appointments.scheduled_at)"
	if db.Dialector.Name() == "postgres" {
		weekExpr = "TO_CHAR(clinic_appointments.scheduled_at, 'IYYY-\"W\"IW')"
	}

	var rows []clinicDoctorWeekRow
	query := fmt.Sprintf("merchant_users.name as doctor_name, %s as week, COUNT(*) as count", weekExpr)
	groupClause := fmt.Sprintf("merchant_users.name, %s", weekExpr)
	if err := db.Table("clinic_appointments").
		Select(query).
		Joins("JOIN merchant_users ON merchant_users.id = clinic_appointments.doctor_id AND merchant_users.tenant_id = clinic_appointments.tenant_id").
		Where("clinic_appointments.tenant_id = ? AND clinic_appointments.status = ? AND clinic_appointments.scheduled_at BETWEEN ? AND ?", tenantID, models.ClinicAppointmentStatusCompleted, dateRange.FromStart, dateRange.ToEnd).
		Group(groupClause).
		Order("merchant_users.name ASC, week ASC").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	weekSet := make(map[string]struct{})
	for _, row := range rows {
		weekSet[row.Week] = struct{}{}
	}
	weeks := make([]string, 0, len(weekSet))
	for week := range weekSet {
		weeks = append(weeks, week)
	}
	sort.Strings(weeks)
	weekKeyMap := make(map[string]string, len(weeks))
	for index, week := range weeks {
		weekKeyMap[week] = fmt.Sprintf("week%d", index+1)
	}

	byDoctor := make(map[string]map[string]interface{})
	doctorOrder := make([]string, 0)
	for _, row := range rows {
		entry, exists := byDoctor[row.DoctorName]
		if !exists {
			entry = map[string]interface{}{"doctor_name": row.DoctorName}
			for _, week := range weeks {
				entry[weekKeyMap[week]] = 0
			}
			byDoctor[row.DoctorName] = entry
			doctorOrder = append(doctorOrder, row.DoctorName)
		}
		entry[weekKeyMap[row.Week]] = row.Count
	}

	result := make([]map[string]interface{}, 0, len(doctorOrder))
	for _, doctorName := range doctorOrder {
		result = append(result, byDoctor[doctorName])
	}
	return result, nil
}

func queryClinicAppointmentAttendance(db *gorm.DB, tenantID uint, dateRange *analyticsRange) ([]clinicAttendancePoint, error) {
	var rows []clinicAttendanceRow
	if err := db.Model(&models.ClinicAppointment{}).
		Select("DATE(scheduled_at) as date, COUNT(*) as confirmed, SUM(CASE WHEN status IN ('checked_in','in_progress','completed') THEN 1 ELSE 0 END) as checked_in").
		Where("tenant_id = ? AND status <> ? AND scheduled_at BETWEEN ? AND ?", tenantID, models.ClinicAppointmentStatusCancelled, dateRange.FromStart, dateRange.ToEnd).
		Group("DATE(scheduled_at)").
		Order("date ASC").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	result := make([]clinicAttendancePoint, 0, len(rows))
	for _, row := range rows {
		rate := 0.0
		if row.Confirmed > 0 {
			rate = float64(row.CheckedIn) / float64(row.Confirmed)
		}
		result = append(result, clinicAttendancePoint{
			Date:      row.Date,
			Confirmed: row.Confirmed,
			CheckedIn: row.CheckedIn,
			Rate:      rate,
		})
	}
	return result, nil
}
