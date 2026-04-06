package handlers

import (
	"net/http"
	"petwell-merchant-backend/middleware"
	"petwell-merchant-backend/models"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// FollowupListItem represents a single followup in the list response
type FollowupListItem struct {
	ID            uint   `json:"id"`
	VisitID       uint   `json:"visit_id"`
	PetName       string `json:"pet_name"`
	PetOwnerName  string `json:"pet_owner_name"`
	LastVisitDate string `json:"last_visit_date"`
	Reason        string `json:"reason"`
	DoctorID      uint   `json:"doctor_id"`
	DoctorName    string `json:"doctor_name"`
	DueAt         string `json:"due_at"`
	Status        string `json:"status"`
	IsOverdue     bool   `json:"is_overdue"`
	ResultNote    string `json:"result_note"`
	CreatedAt     string `json:"created_at"`
}

// ListFollowupsQuery represents query parameters for GET /merchant/clinic/followups
type ListFollowupsQuery struct {
	Status   string `form:"status"`
	DoctorID *uint  `form:"doctor_id"`
	Page     int    `form:"page,default=1"`
	PerPage  int    `form:"per_page,default=20"`
}

// ListClinicFollowups handles GET /merchant/clinic/followups
func ListClinicFollowups(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		var query ListFollowupsQuery
		if err := c.ShouldBindQuery(&query); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40005, "data": nil, "message": "invalid query params"})
			return
		}

		tenantID := authCtx.TenantID
		now := time.Now()

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

		baseQuery := db.Model(&models.ClinicFollowup{}).Where("tenant_id = ?", tenantID)

		// Handle virtual "overdue" status
		isOverdueFilter := false
		if query.Status == "overdue" {
			isOverdueFilter = true
			baseQuery = baseQuery.Where("status = ? AND due_at < ?", models.ClinicFollowupStatusPending, now)
		} else if query.Status != "" {
			// Validate real status
			validStatuses := []string{"pending", "done", "skipped"}
			valid := false
			for _, s := range validStatuses {
				if query.Status == s {
					valid = true
					break
				}
			}
			if !valid {
				c.JSON(http.StatusBadRequest, gin.H{"code": 40005, "data": nil, "message": "invalid query params"})
				return
			}
			baseQuery = baseQuery.Where("status = ?", query.Status)
		}

		if query.DoctorID != nil {
			baseQuery = baseQuery.Where("doctor_id = ?", *query.DoctorID)
		}

		var total int64
		baseQuery.Count(&total)

		offset := (query.Page - 1) * query.PerPage
		var followups []models.ClinicFollowup
		baseQuery.Preload("Doctor").Preload("Visit").
			Order("due_at ASC").
			Offset(offset).
			Limit(query.PerPage).
			Find(&followups)

		items := make([]FollowupListItem, len(followups))
		for i, f := range followups {
			isOverdue := f.Status == models.ClinicFollowupStatusPending && f.DueAt.Before(now)
			if isOverdueFilter {
				isOverdue = true
			}

			lastVisitDate := f.Visit.CreatedAt.Format("2006-01-02")

			// pet_owner_name: fetch from appointment
			var petOwnerName string
			if f.Visit.AppointmentID > 0 {
				var appt models.ClinicAppointment
				if err := db.Where("id = ? AND tenant_id = ?", f.Visit.AppointmentID, tenantID).First(&appt).Error; err == nil {
					petOwnerName = appt.PetOwnerName
				}
			}

			items[i] = FollowupListItem{
				ID:            f.ID,
				VisitID:       f.VisitID,
				PetName:       f.PetName,
				PetOwnerName:  petOwnerName,
				LastVisitDate: lastVisitDate,
				Reason:        f.Reason,
				DoctorID:      f.DoctorID,
				DoctorName:    f.Doctor.Name,
				DueAt:         f.DueAt.Format(time.RFC3339),
				Status:        string(f.Status),
				IsOverdue:     isOverdue,
				ResultNote:    f.ResultNote,
				CreatedAt:     f.CreatedAt.Format(time.RFC3339),
			}
		}

		hasMore := int64(query.Page*query.PerPage) < total

		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"followups": items,
				"total":     total,
				"page":      query.Page,
				"per_page":  query.PerPage,
				"has_more":  hasMore,
			},
			"message": "ok",
		})
	}
}

// CreateFollowupRequest represents the request body for POST /merchant/clinic/followups
type CreateFollowupRequest struct {
	VisitID  uint   `json:"visit_id" binding:"required"`
	Reason   string `json:"reason" binding:"required"`
	DoctorID uint   `json:"doctor_id" binding:"required"`
	DueAt    string `json:"due_at" binding:"required"`
}

// CreateClinicFollowup handles POST /merchant/clinic/followups
func CreateClinicFollowup(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		tenantID := authCtx.TenantID

		var req CreateFollowupRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40010, "data": nil, "message": "invalid request"})
			return
		}

		// Verify visit exists and belongs to tenant
		var visit models.ClinicVisit
		if err := db.Where("id = ? AND tenant_id = ?", req.VisitID, tenantID).First(&visit).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"code": 30002, "data": nil, "message": "clinic visit not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		// Parse due_at
		dueAt, err := time.Parse("2006-01-02", req.DueAt)
		if err != nil {
			dueAt, err = time.Parse(time.RFC3339, req.DueAt)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 40010, "data": nil, "message": "invalid request"})
				return
			}
		}

		now := time.Now()
		followup := models.ClinicFollowup{
			VisitID:   req.VisitID,
			TenantID:  tenantID,
			PetName:   visit.PetName,
			Reason:    req.Reason,
			DoctorID:  req.DoctorID,
			DueAt:     dueAt,
			Status:    models.ClinicFollowupStatusPending,
			CreatedAt: now,
			UpdatedAt: now,
		}

		if err := db.Create(&followup).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"id":         followup.ID,
				"visit_id":   followup.VisitID,
				"status":     string(followup.Status),
				"due_at":     followup.DueAt.Format(time.RFC3339),
				"created_at": followup.CreatedAt.Format(time.RFC3339),
			},
			"message": "ok",
		})
	}
}

// UpdateFollowupStatusRequest represents the request body for PATCH /merchant/clinic/followups/:id/status
type UpdateFollowupStatusRequest struct {
	TargetStatus string `json:"target_status" binding:"required"`
	ResultNote   string `json:"result_note"`
}

// UpdateClinicFollowupStatus handles PATCH /merchant/clinic/followups/:id/status
func UpdateClinicFollowupStatus(db *gorm.DB) gin.HandlerFunc {
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

		var req UpdateFollowupStatusRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40010, "data": nil, "message": "invalid request"})
			return
		}

		// Only done or skipped are valid targets
		targetStatus := models.ClinicFollowupStatus(req.TargetStatus)
		if targetStatus != models.ClinicFollowupStatusDone && targetStatus != models.ClinicFollowupStatusSkipped {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40010, "data": nil, "message": "invalid request"})
			return
		}

		// Fetch followup
		var followup models.ClinicFollowup
		if err := db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&followup).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"code": 30003, "data": nil, "message": "clinic followup not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		// Only pending can be transitioned
		if followup.Status != models.ClinicFollowupStatusPending {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40010, "data": nil, "message": "invalid request"})
			return
		}

		previousStatus := followup.Status
		now := time.Now()

		updates := map[string]interface{}{
			"status":      targetStatus,
			"result_note": req.ResultNote,
			"updated_at":  now,
		}

		if err := db.Model(&followup).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"id":              followup.ID,
				"previous_status": string(previousStatus),
				"current_status":  string(targetStatus),
				"result_note":     req.ResultNote,
				"updated_at":      now.Format(time.RFC3339),
			},
			"message": "ok",
		})
	}
}
