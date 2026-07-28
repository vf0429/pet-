package handlers

import (
	"net/http"
	"pawrd-merchant-backend/middleware"
	"pawrd-merchant-backend/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type shopAnalyticsResponse struct {
	Period            analyticsPeriodResponse      `json:"period"`
	Summary           shopAnalyticsSummary         `json:"summary"`
	DailyRevenue      []shopDailyRevenuePoint      `json:"daily_revenue"`
	CategoryBreakdown []shopCategoryBreakdownPoint `json:"category_breakdown"`
	TopProducts       []shopTopProductPoint        `json:"top_products"`
}

type analyticsPeriodResponse struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type shopAnalyticsSummary struct {
	TotalRevenue       float64 `json:"total_revenue"`
	TotalOrders        int64   `json:"total_orders"`
	AvgOrderValue      float64 `json:"avg_order_value"`
	RepeatPurchaseRate float64 `json:"repeat_purchase_rate"`
}

type shopDailyRevenuePoint struct {
	Date    string  `json:"date"`
	Revenue float64 `json:"revenue"`
	Orders  int64   `json:"orders"`
}

type shopCategoryBreakdownPoint struct {
	Category string  `json:"category"`
	Revenue  float64 `json:"revenue"`
	Pct      float64 `json:"pct"`
}

type shopTopProductPoint struct {
	Name    string  `json:"name"`
	Sales   int64   `json:"sales"`
	Revenue float64 `json:"revenue"`
}

type shopSummaryRow struct {
	TotalOrders   int64   `gorm:"column:total_orders"`
	TotalRevenue  float64 `gorm:"column:total_revenue"`
	AvgOrderValue float64 `gorm:"column:avg_order_value"`
}

type phoneCountRow struct {
	CustomerPhone string `gorm:"column:customer_phone"`
	Cnt           int64  `gorm:"column:cnt"`
}

type shopCategoryRow struct {
	Category string  `gorm:"column:category"`
	Revenue  float64 `gorm:"column:revenue"`
}

type shopTopProductRow struct {
	Name    string  `gorm:"column:name"`
	Sales   int64   `gorm:"column:sales"`
	Revenue float64 `gorm:"column:revenue"`
}

// GetShopAnalytics handles GET /merchant/analytics/shop.
func GetShopAnalytics(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		db = middleware.GetTenantDB(c, db)
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

		var summaryRow shopSummaryRow
		if err := db.Model(&models.ShopOrder{}).
			Select("COUNT(*) as total_orders, COALESCE(SUM(total_amount), 0) as total_revenue, COALESCE(SUM(total_amount) / NULLIF(COUNT(*), 0), 0) as avg_order_value").
			Where("tenant_id = ? AND status <> ? AND created_at BETWEEN ? AND ?", tenantID, models.ShopOrderStatusCancelled, dateRange.FromStart, dateRange.ToEnd).
			Scan(&summaryRow).Error; err != nil {
			analyticsError(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		repeatRate, err := calculateShopRepeatPurchaseRate(db, tenantID, dateRange)
		if err != nil {
			analyticsError(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		var dailyRevenue []shopDailyRevenuePoint
		if err := db.Model(&models.ShopOrder{}).
			Select("DATE(created_at) as date, COUNT(*) as orders, COALESCE(SUM(total_amount), 0) as revenue").
			Where("tenant_id = ? AND status <> ? AND created_at BETWEEN ? AND ?", tenantID, models.ShopOrderStatusCancelled, dateRange.FromStart, dateRange.ToEnd).
			Group("DATE(created_at)").
			Order("date ASC").
			Scan(&dailyRevenue).Error; err != nil {
			analyticsError(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		var categoryRows []shopCategoryRow
		if err := db.Table("shop_orders").
			Select("COALESCE(shop_products.category, 'uncategorized') as category, COALESCE(SUM(shop_order_items.line_total), 0) as revenue").
			Joins("JOIN shop_order_items ON shop_order_items.order_id = shop_orders.id AND shop_order_items.tenant_id = shop_orders.tenant_id").
			Joins("LEFT JOIN shop_products ON shop_products.id = shop_order_items.product_id AND shop_products.tenant_id = shop_orders.tenant_id").
			Where("shop_orders.tenant_id = ? AND shop_orders.status <> ? AND shop_orders.created_at BETWEEN ? AND ?", tenantID, models.ShopOrderStatusCancelled, dateRange.FromStart, dateRange.ToEnd).
			Group("COALESCE(shop_products.category, 'uncategorized')").
			Order("revenue DESC").
			Scan(&categoryRows).Error; err != nil {
			analyticsError(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		categoryBreakdown := make([]shopCategoryBreakdownPoint, 0, len(categoryRows))
		for _, row := range categoryRows {
			pct := 0.0
			if summaryRow.TotalRevenue > 0 {
				pct = row.Revenue / summaryRow.TotalRevenue * 100
			}
			categoryBreakdown = append(categoryBreakdown, shopCategoryBreakdownPoint{
				Category: row.Category,
				Revenue:  row.Revenue,
				Pct:      pct,
			})
		}

		var topProductRows []shopTopProductRow
		if err := db.Table("shop_orders").
			Select("COALESCE(shop_products.name, shop_order_items.product_name) as name, COALESCE(SUM(shop_order_items.quantity), 0) as sales, COALESCE(SUM(shop_order_items.line_total), 0) as revenue").
			Joins("JOIN shop_order_items ON shop_order_items.order_id = shop_orders.id AND shop_order_items.tenant_id = shop_orders.tenant_id").
			Joins("LEFT JOIN shop_products ON shop_products.id = shop_order_items.product_id AND shop_products.tenant_id = shop_orders.tenant_id").
			Where("shop_orders.tenant_id = ? AND shop_orders.status <> ? AND shop_orders.created_at BETWEEN ? AND ?", tenantID, models.ShopOrderStatusCancelled, dateRange.FromStart, dateRange.ToEnd).
			Group("COALESCE(shop_products.name, shop_order_items.product_name)").
			Order("sales DESC, revenue DESC").
			Limit(10).
			Scan(&topProductRows).Error; err != nil {
			analyticsError(c, http.StatusInternalServerError, 50000, "unexpected server error")
			return
		}

		topProducts := make([]shopTopProductPoint, 0, len(topProductRows))
		for _, row := range topProductRows {
			topProducts = append(topProducts, shopTopProductPoint(row))
		}

		analyticsOK(c, shopAnalyticsResponse{
			Period: analyticsPeriodResponse{
				From: dateRange.FromDate,
				To:   dateRange.ToDate,
			},
			Summary: shopAnalyticsSummary{
				TotalRevenue:       summaryRow.TotalRevenue,
				TotalOrders:        summaryRow.TotalOrders,
				AvgOrderValue:      summaryRow.AvgOrderValue,
				RepeatPurchaseRate: repeatRate,
			},
			DailyRevenue:      dailyRevenue,
			CategoryBreakdown: categoryBreakdown,
			TopProducts:       topProducts,
		})
	}
}

func calculateShopRepeatPurchaseRate(db *gorm.DB, tenantID uint, dateRange *analyticsRange) (float64, error) {
	var totalBuyers int64
	if err := db.Model(&models.ShopOrder{}).
		Distinct("customer_phone").
		Where("tenant_id = ? AND status = ? AND customer_phone <> '' AND created_at BETWEEN ? AND ?", tenantID, models.ShopOrderStatusCompleted, dateRange.FromStart, dateRange.ToEnd).
		Count(&totalBuyers).Error; err != nil {
		return 0, err
	}
	if totalBuyers == 0 {
		return 0, nil
	}

	var grouped []phoneCountRow
	if err := db.Model(&models.ShopOrder{}).
		Select("customer_phone, COUNT(*) as cnt").
		Where("tenant_id = ? AND status = ? AND customer_phone <> '' AND created_at BETWEEN ? AND ?", tenantID, models.ShopOrderStatusCompleted, dateRange.FromStart, dateRange.ToEnd).
		Group("customer_phone").
		Having("COUNT(*) > 1").
		Scan(&grouped).Error; err != nil {
		return 0, err
	}

	repeatBuyers := int64(len(grouped))
	return float64(repeatBuyers) / float64(totalBuyers), nil
}
