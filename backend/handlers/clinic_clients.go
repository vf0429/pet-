package handlers

import (
	"net/http"
	"pawrd-merchant-backend/middleware"
	"pawrd-merchant-backend/models"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ClinicClientListItem is a single row in the clients list response.
type ClinicClientListItem struct {
	ID           uint   `json:"id"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name"`
	Phone        string `json:"phone"`
	Email        string `json:"email"`
	Active       bool   `json:"active"`
	PatientCount int64  `json:"patient_count"`
	CreatedAt    string `json:"created_at"`
}

// ListClinicClientsQuery holds query params for GET /clinic/clients.
type ListClinicClientsQuery struct {
	Q       string `form:"q"`
	Page    int    `form:"page,default=1"`
	PerPage int    `form:"per_page,default=20"`
}

// ListClinicClients handles GET /v1/merchant/clinic/clients
func ListClinicClients(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		db = middleware.GetTenantDB(c, db)
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		var query ListClinicClientsQuery
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

		base := db.Model(&models.ClinicClient{}).Where("tenant_id = ?", tenantID)
		if query.Q != "" {
			like := "%" + query.Q + "%"
			base = base.Where("first_name LIKE ? OR last_name LIKE ? OR phone LIKE ? OR email LIKE ?", like, like, like, like)
		}

		var total int64
		base.Count(&total)

		var clients []models.ClinicClient
		base.Order("last_name ASC, first_name ASC").
			Offset((query.Page - 1) * query.PerPage).
			Limit(query.PerPage).
			Find(&clients)

		items := make([]ClinicClientListItem, len(clients))
		for i, cl := range clients {
			var count int64
			db.Model(&models.ClinicPatient{}).
				Where("client_id = ? AND tenant_id = ?", cl.ID, tenantID).
				Count(&count)

			items[i] = ClinicClientListItem{
				ID:           cl.ID,
				FirstName:    cl.FirstName,
				LastName:     cl.LastName,
				Phone:        cl.Phone,
				Email:        cl.Email,
				Active:       cl.Active,
				PatientCount: count,
				CreatedAt:    cl.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"clients":  items,
				"total":    total,
				"page":     query.Page,
				"per_page": query.PerPage,
				"has_more": int64(query.Page*query.PerPage) < total,
			},
			"message": "ok",
		})
	}
}

// ClinicClientPatientItem is a patient summary nested inside client detail.
type ClinicClientPatientItem struct {
	ID          uint    `json:"id"`
	Name        string  `json:"name"`
	Species     string  `json:"species"`
	Breed       string  `json:"breed"`
	Gender      string  `json:"gender"`
	DateOfBirth *string `json:"date_of_birth"`
	IsDeceased  bool    `json:"is_deceased"`
}

// GetClinicClientDetail handles GET /v1/merchant/clinic/clients/:id
func GetClinicClientDetail(db *gorm.DB) gin.HandlerFunc {
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

		var client models.ClinicClient
		if err := db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&client).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"code": 30010, "data": nil, "message": "client not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		var patients []models.ClinicPatient
		db.Where("client_id = ? AND tenant_id = ?", client.ID, tenantID).
			Preload("Species").Preload("Breed").
			Find(&patients)

		patientItems := make([]ClinicClientPatientItem, len(patients))
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
			patientItems[i] = ClinicClientPatientItem{
				ID:          p.ID,
				Name:        p.Name,
				Species:     species,
				Breed:       breed,
				Gender:      p.Gender,
				DateOfBirth: dobStr,
				IsDeceased:  p.IsDeceased,
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"client": gin.H{
					"id":         client.ID,
					"first_name": client.FirstName,
					"last_name":  client.LastName,
					"phone":      client.Phone,
					"email":      client.Email,
					"address":    client.Address,
					"notes":      client.Notes,
					"active":     client.Active,
					"created_at": client.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
				},
				"patients": patientItems,
			},
			"message": "ok",
		})
	}
}
