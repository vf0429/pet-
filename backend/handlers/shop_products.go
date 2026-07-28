package handlers

import (
	"net/http"
	"pawrd-merchant-backend/middleware"
	"pawrd-merchant-backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ListProductsQuery represents query parameters for GET /merchant/shop/products
type ListProductsQuery struct {
	Search       string `form:"search"`
	Category     string `form:"category"`
	IsActive     *bool  `form:"is_active"`
	LowStockOnly bool   `form:"low_stock_only,default=false"`
	Page         int    `form:"page,default=1"`
	PerPage      int    `form:"per_page,default=20"`
}

// ProductListItem represents a product in the list response
type ProductListItem struct {
	ID                uint    `json:"id"`
	SKU               string  `json:"sku"`
	Name              string  `json:"name"`
	Category          string  `json:"category"`
	Price             float64 `json:"price"`
	StockLevel        int     `json:"stock_level"`
	LowStockThreshold int     `json:"low_stock_threshold"`
	IsLowStock        bool    `json:"is_low_stock"`
	IsActive          bool    `json:"is_active"`
	ImageURL          string  `json:"image_url"`
	CreatedAt         string  `json:"created_at"`
	UpdatedAt         string  `json:"updated_at"`
}

// ListProductsResponse represents the response for GET /merchant/shop/products
type ListProductsResponse struct {
	Products   []ProductListItem `json:"products"`
	Total      int64             `json:"total"`
	Page       int               `json:"page"`
	PerPage    int               `json:"per_page"`
	Categories []string          `json:"categories"`
}

// ListShopProducts handles GET /merchant/shop/products
func ListShopProducts(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		db = middleware.GetTenantDB(c, db)
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		var query ListProductsQuery
		if err := c.ShouldBindQuery(&query); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 10002, "data": nil, "message": "invalid query params"})
			return
		}

		tenantID := authCtx.TenantID

		// Default pagination
		if query.Page < 1 {
			query.Page = 1
		}
		if query.PerPage < 1 {
			query.PerPage = 20
		}
		if query.PerPage > 100 {
			query.PerPage = 100
		}

		// Build query
		baseQuery := db.Model(&models.ShopProduct{}).Where("tenant_id = ?", tenantID)

		if query.Search != "" {
			searchPattern := "%" + query.Search + "%"
			baseQuery = baseQuery.Where("sku LIKE ? OR name LIKE ?", searchPattern, searchPattern)
		}

		if query.Category != "" {
			baseQuery = baseQuery.Where("category = ?", query.Category)
		}

		if query.IsActive != nil {
			baseQuery = baseQuery.Where("is_active = ?", *query.IsActive)
		}

		if query.LowStockOnly {
			baseQuery = baseQuery.Where("stock_level <= low_stock_threshold")
		}

		// Count total
		var total int64
		baseQuery.Count(&total)

		// Fetch products
		offset := (query.Page - 1) * query.PerPage
		var products []models.ShopProduct
		baseQuery.
			Order("created_at DESC").
			Offset(offset).
			Limit(query.PerPage).
			Find(&products)

		// Build response items
		items := make([]ProductListItem, len(products))
		for i, p := range products {
			items[i] = ProductListItem{
				ID:                p.ID,
				SKU:               p.SKU,
				Name:              p.Name,
				Category:          p.Category,
				Price:             p.Price,
				StockLevel:        p.StockLevel,
				LowStockThreshold: p.LowStockThreshold,
				IsLowStock:        p.IsLowStock(),
				IsActive:          p.IsActive,
				ImageURL:          p.ImageURL,
				CreatedAt:         p.CreatedAt.Format("2006-01-02T15:04:05Z"),
				UpdatedAt:         p.UpdatedAt.Format("2006-01-02T15:04:05Z"),
			}
		}

		// Fetch all categories for this tenant
		var categories []string
		db.Model(&models.ShopProduct{}).
			Where("tenant_id = ?", tenantID).
			Distinct("category").
			Pluck("category", &categories)

		response := ListProductsResponse{
			Products:   items,
			Total:      total,
			Page:       query.Page,
			PerPage:    query.PerPage,
			Categories: categories,
		}

		c.JSON(http.StatusOK, gin.H{"code": 0, "data": response, "message": "ok"})
	}
}
