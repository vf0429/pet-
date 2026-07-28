package handlers

import (
	"net/http"
	"pawrd-merchant-backend/middleware"
	"pawrd-merchant-backend/models"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// InventoryAlertItem represents a low stock alert item
type InventoryAlertItem struct {
	ID                uint   `json:"id"`
	SKU               string `json:"sku"`
	Name              string `json:"name"`
	Category          string `json:"category"`
	StockLevel        int    `json:"stock_level"`
	LowStockThreshold int    `json:"low_stock_threshold"`
	ShortageCount     int    `json:"shortage_count"`
	ImageURL          string `json:"image_url"`
}

// ListInventoryAlertsResponse represents the response for GET /merchant/shop/inventory/alerts
type ListInventoryAlertsResponse struct {
	Alerts []InventoryAlertItem `json:"alerts"`
	Total  int64                `json:"total"`
}

// ListInventoryAlerts handles GET /merchant/shop/inventory/alerts
func ListInventoryAlerts(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		db = middleware.GetTenantDB(c, db)
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		tenantID := authCtx.TenantID

		// Parse limit parameter
		limit := 20
		if l := c.Query("limit"); l != "" {
			parsed, err := strconv.Atoi(l)
			if err != nil || parsed <= 0 {
				c.JSON(http.StatusBadRequest, gin.H{"code": 10002, "data": nil, "message": "invalid query params"})
				return
			}
			limit = parsed
			if limit > 100 {
				limit = 100
			}
		}

		// Fetch low stock products
		var products []models.ShopProduct
		db.Model(&models.ShopProduct{}).
			Where("tenant_id = ? AND stock_level <= low_stock_threshold", tenantID).
			Order("stock_level ASC").
			Limit(limit).
			Find(&products)

		// Build alerts
		alerts := make([]InventoryAlertItem, len(products))
		for i, p := range products {
			shortage := p.LowStockThreshold - p.StockLevel
			if shortage < 0 {
				shortage = 0
			}
			alerts[i] = InventoryAlertItem{
				ID:                p.ID,
				SKU:               p.SKU,
				Name:              p.Name,
				Category:          p.Category,
				StockLevel:        p.StockLevel,
				LowStockThreshold: p.LowStockThreshold,
				ShortageCount:     shortage,
				ImageURL:          p.ImageURL,
			}
		}

		// Count total low stock products
		var total int64
		db.Model(&models.ShopProduct{}).
			Where("tenant_id = ? AND stock_level <= low_stock_threshold", tenantID).
			Count(&total)

		response := ListInventoryAlertsResponse{
			Alerts: alerts,
			Total:  total,
		}

		c.JSON(http.StatusOK, gin.H{"code": 0, "data": response, "message": "ok"})
	}
}
