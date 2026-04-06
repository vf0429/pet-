package handlers

import (
	"math"
	"net/http"
	"petwell-merchant-backend/middleware"
	"petwell-merchant-backend/models"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// PharmacyItemResponse represents a single pharmacy item in the list
type PharmacyItemResponse struct {
	ID                 uint   `json:"id"`
	Name               string `json:"name"`
	Specification      string `json:"specification"`
	BatchNo            string `json:"batch_no"`
	ExpiresAt          string `json:"expires_at"`
	StockLevel         int    `json:"stock_level"`
	LowStockThreshold  int    `json:"low_stock_threshold"`
	IsLowStock         bool   `json:"is_low_stock"`
	StorageCondition   string `json:"storage_condition"`
	IsPrescriptionOnly bool   `json:"is_prescription_only"`
	IsExpiringSoon     bool   `json:"is_expiring_soon"`
	IsExpired          bool   `json:"is_expired"`
	DaysUntilExpiry    int    `json:"days_until_expiry"`
	CreatedAt          string `json:"created_at"`
}

// ListPharmacyQuery represents query parameters for GET /merchant/clinic/pharmacy
type ListPharmacyQuery struct {
	Search             string `form:"search"`
	IsPrescriptionOnly *bool  `form:"is_prescription_only"`
	ExpiryFilter       string `form:"expiry_filter"`
	Page               int    `form:"page,default=1"`
	PerPage            int    `form:"per_page,default=20"`
}

// ListPharmacyItems handles GET /merchant/clinic/pharmacy
func ListPharmacyItems(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		var query ListPharmacyQuery
		if err := c.ShouldBindQuery(&query); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40005, "data": nil, "message": "invalid query params"})
			return
		}

		tenantID := authCtx.TenantID
		now := time.Now()
		expiryThreshold := now.Add(30 * 24 * time.Hour)

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

		baseQuery := db.Model(&models.PharmacyItem{}).Where("tenant_id = ?", tenantID)

		if query.Search != "" {
			baseQuery = baseQuery.Where("name LIKE ?", "%"+query.Search+"%")
		}
		if query.IsPrescriptionOnly != nil {
			baseQuery = baseQuery.Where("is_prescription_only = ?", *query.IsPrescriptionOnly)
		}
		if query.ExpiryFilter == "expiring_soon" {
			baseQuery = baseQuery.Where("expires_at > ? AND expires_at <= ?", now, expiryThreshold)
		} else if query.ExpiryFilter == "expired" {
			baseQuery = baseQuery.Where("expires_at <= ?", now)
		} else if query.ExpiryFilter != "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40005, "data": nil, "message": "invalid query params"})
			return
		}

		var total int64
		baseQuery.Count(&total)

		offset := (query.Page - 1) * query.PerPage
		var items []models.PharmacyItem
		baseQuery.Order("expires_at ASC").
			Offset(offset).
			Limit(query.PerPage).
			Find(&items)

		today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

		respItems := make([]PharmacyItemResponse, len(items))
		for i, item := range items {
			itemExpiry := time.Date(item.ExpiresAt.Year(), item.ExpiresAt.Month(), item.ExpiresAt.Day(), 0, 0, 0, 0, time.UTC)
			daysUntil := int(math.Round(itemExpiry.Sub(today).Hours() / 24))
			isExpired := itemExpiry.Before(today) || itemExpiry.Equal(today)
			isExpiringSoon := !isExpired && daysUntil <= 30
			isLowStock := item.StockLevel <= item.LowStockThreshold

			respItems[i] = PharmacyItemResponse{
				ID:                 item.ID,
				Name:               item.Name,
				Specification:      item.Specification,
				BatchNo:            item.BatchNo,
				ExpiresAt:          item.ExpiresAt.Format(time.RFC3339),
				StockLevel:         item.StockLevel,
				LowStockThreshold:  item.LowStockThreshold,
				IsLowStock:         isLowStock,
				StorageCondition:   item.StorageCondition,
				IsPrescriptionOnly: item.IsPrescriptionOnly,
				IsExpiringSoon:     isExpiringSoon,
				IsExpired:          isExpired,
				DaysUntilExpiry:    daysUntil,
				CreatedAt:          item.CreatedAt.Format(time.RFC3339),
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"items":    respItems,
				"total":    total,
				"page":     query.Page,
				"per_page": query.PerPage,
			},
			"message": "ok",
		})
	}
}

// DispenseRequest represents the request body for PATCH /merchant/clinic/pharmacy/:id/dispense
type DispenseRequest struct {
	Quantity       int    `json:"quantity" binding:"required"`
	PrescriptionID *uint  `json:"prescription_id"`
	Note           string `json:"note"`
}

// DispensePharmacyItem handles PATCH /merchant/clinic/pharmacy/:id/dispense
func DispensePharmacyItem(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		tenantID := authCtx.TenantID

		// Only doctor or owner can dispense
		if authCtx.Role != models.UserRoleDoctor && authCtx.Role != models.UserRoleOwner {
			c.JSON(http.StatusForbidden, gin.H{"code": 20005, "data": nil, "message": "only doctor or owner can perform this action"})
			return
		}

		idStr := c.Param("id")
		id, err := strconv.ParseUint(idStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40010, "data": nil, "message": "invalid request"})
			return
		}

		var req DispenseRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40010, "data": nil, "message": "invalid request"})
			return
		}

		if req.Quantity <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40010, "data": nil, "message": "invalid request"})
			return
		}

		// Fetch pharmacy item
		var item models.PharmacyItem
		if err := db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&item).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"code": 30004, "data": nil, "message": "pharmacy item not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		// Prescription-only check
		if item.IsPrescriptionOnly && req.PrescriptionID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40007, "data": nil, "message": "prescription_id is required for prescription-only drugs"})
			return
		}

		// Stock check
		if item.StockLevel < req.Quantity {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40008, "data": nil, "message": "insufficient stock for dispense"})
			return
		}

		previousStock := item.StockLevel
		newStock := item.StockLevel - req.Quantity
		now := time.Now()

		// Update stock in transaction
		txErr := db.Transaction(func(tx *gorm.DB) error {
			return tx.Model(&item).Updates(map[string]interface{}{
				"stock_level": newStock,
				"updated_at":  now,
			}).Error
		})

		if txErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"id":                 item.ID,
				"name":               item.Name,
				"previous_stock":     previousStock,
				"dispensed_quantity": req.Quantity,
				"current_stock":      newStock,
				"prescription_id":    req.PrescriptionID,
				"dispensed_at":       now.Format(time.RFC3339),
			},
			"message": "ok",
		})
	}
}
