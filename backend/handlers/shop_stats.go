package handlers

import (
	"net/http"
	"petwell-merchant-backend/middleware"
	"petwell-merchant-backend/models"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ShopStatsResponse represents the response for GET /merchant/shop/stats
type ShopStatsResponse struct {
	TodayOrders          float64 `json:"today_orders"`
	TodayOrdersDeltaPct  float64 `json:"today_orders_delta_pct"`
	TodayRevenue         float64 `json:"today_revenue"`
	TodayRevenueDeltaPct float64 `json:"today_revenue_delta_pct"`
	PendingShipmentCount int64   `json:"pending_shipment_count"`
	LowStockCount        int64   `json:"low_stock_count"`
	RecentOrdersLimit    int     `json:"recent_orders_limit"`
	Currency             string  `json:"currency"`
}

// GetShopStats handles GET /merchant/shop/stats
func GetShopStats(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		tenantID := authCtx.TenantID

		// Calculate date boundaries
		now := time.Now()
		todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		todayEnd := todayStart.Add(24 * time.Hour)
		yesterdayStart := todayStart.Add(-24 * time.Hour)
		yesterdayEnd := todayStart

		// today's orders count
		var todayOrders int64
		db.Model(&models.ShopOrder{}).
			Where("tenant_id = ? AND created_at >= ? AND created_at < ?", tenantID, todayStart, todayEnd).
			Count(&todayOrders)

		// yesterday's orders count
		var yesterdayOrders int64
		db.Model(&models.ShopOrder{}).
			Where("tenant_id = ? AND created_at >= ? AND created_at < ?", tenantID, yesterdayStart, yesterdayEnd).
			Count(&yesterdayOrders)

		// today_orders_delta_pct
		var todayOrdersDeltaPct float64
		if yesterdayOrders > 0 {
			todayOrdersDeltaPct = float64(todayOrders-yesterdayOrders) / float64(yesterdayOrders) * 100
		} else if todayOrders > 0 {
			todayOrdersDeltaPct = 100
		}

		// today's revenue (paid and subsequent statuses)
		var todayRevenue float64
		db.Model(&models.ShopOrder{}).
			Where("tenant_id = ? AND created_at >= ? AND created_at < ? AND status IN ?", tenantID, todayStart, todayEnd,
				[]models.ShopOrderStatus{models.ShopOrderStatusPaid, models.ShopOrderStatusPreparing, models.ShopOrderStatusShipped, models.ShopOrderStatusCompleted}).
			Select("COALESCE(SUM(total_amount), 0)").
			Scan(&todayRevenue)

		// yesterday's revenue
		var yesterdayRevenue float64
		db.Model(&models.ShopOrder{}).
			Where("tenant_id = ? AND created_at >= ? AND created_at < ? AND status IN ?", tenantID, yesterdayStart, yesterdayEnd,
				[]models.ShopOrderStatus{models.ShopOrderStatusPaid, models.ShopOrderStatusPreparing, models.ShopOrderStatusShipped, models.ShopOrderStatusCompleted}).
			Select("COALESCE(SUM(total_amount), 0)").
			Scan(&yesterdayRevenue)

		// today_revenue_delta_pct
		var todayRevenueDeltaPct float64
		if yesterdayRevenue > 0 {
			todayRevenueDeltaPct = (todayRevenue - yesterdayRevenue) / yesterdayRevenue * 100
		} else if todayRevenue > 0 {
			todayRevenueDeltaPct = 100
		}

		// pending_shipment_count: paid + preparing
		var pendingShipmentCount int64
		db.Model(&models.ShopOrder{}).
			Where("tenant_id = ? AND status IN ?", tenantID,
				[]models.ShopOrderStatus{models.ShopOrderStatusPaid, models.ShopOrderStatusPreparing}).
			Count(&pendingShipmentCount)

		// low_stock_count: stock_level <= low_stock_threshold
		var lowStockCount int64
		db.Model(&models.ShopProduct{}).
			Where("tenant_id = ? AND stock_level <= low_stock_threshold", tenantID).
			Count(&lowStockCount)

		response := ShopStatsResponse{
			TodayOrders:          float64(todayOrders),
			TodayOrdersDeltaPct:  todayOrdersDeltaPct,
			TodayRevenue:         todayRevenue,
			TodayRevenueDeltaPct: todayRevenueDeltaPct,
			PendingShipmentCount: pendingShipmentCount,
			LowStockCount:        lowStockCount,
			RecentOrdersLimit:    10,
			Currency:             "HKD",
		}

		c.JSON(http.StatusOK, gin.H{"code": 0, "data": response, "message": "ok"})
	}
}
