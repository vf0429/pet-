package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"pawrd-merchant-backend/middleware"
	"pawrd-merchant-backend/models"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ListOrdersQuery represents query parameters for GET /merchant/shop/orders
type ListOrdersQuery struct {
	Status       string `form:"status"`
	Search       string `form:"search"`
	DateFrom     string `form:"date_from"`
	DateTo       string `form:"date_to"`
	Page         int    `form:"page,default=1"`
	PerPage      int    `form:"per_page,default=20"`
	IncludeItems bool   `form:"include_items,default=false"`
}

// ListOrdersResponse represents the response for GET /merchant/shop/orders
type ListOrdersResponse struct {
	Orders  []OrderListItem  `json:"orders"`
	Total   int64            `json:"total"`
	Page    int              `json:"page"`
	PerPage int              `json:"per_page"`
	HasMore bool             `json:"has_more"`
	Filters OrderListFilters `json:"filters"`
}

// OrderListItem represents a single order in the list response
type OrderListItem struct {
	ID             uint                   `json:"id"`
	OrderNo        string                 `json:"order_no"`
	CustomerName   string                 `json:"customer_name"`
	CustomerPhone  string                 `json:"customer_phone"`
	PetName        string                 `json:"pet_name"`
	ItemsSummary   string                 `json:"items_summary"`
	TotalAmount    float64                `json:"total_amount"`
	Currency       string                 `json:"currency"`
	Status         models.ShopOrderStatus `json:"status"`
	TrackingNumber string                 `json:"tracking_number"`
	CancelReason   string                 `json:"cancel_reason"`
	PlacedAt       string                 `json:"placed_at"`
	UpdatedAt      string                 `json:"updated_at"`
}

// OrderListFilters represents the filters in the list response
type OrderListFilters struct {
	Status   string `json:"status"`
	Search   string `json:"search"`
	DateFrom string `json:"date_from"`
	DateTo   string `json:"date_to"`
}

// OrderDetailResponse represents the response for GET /merchant/shop/orders/:id
type OrderDetailResponse struct {
	ID               uint                   `json:"id"`
	OrderNo          string                 `json:"order_no"`
	CustomerName     string                 `json:"customer_name"`
	CustomerPhone    string                 `json:"customer_phone"`
	PetName          string                 `json:"pet_name"`
	Status           models.ShopOrderStatus `json:"status"`
	TrackingNumber   string                 `json:"tracking_number"`
	CancelReason     string                 `json:"cancel_reason"`
	SubtotalAmount   float64                `json:"subtotal_amount"`
	DeliveryFee      float64                `json:"delivery_fee"`
	TotalAmount      float64                `json:"total_amount"`
	Currency         string                 `json:"currency"`
	Notes            string                 `json:"notes"`
	PlacedAt         string                 `json:"placed_at"`
	UpdatedAt        string                 `json:"updated_at"`
	Items            []OrderItemResponse    `json:"items"`
	StatusTimeline   []StatusTimelineItem   `json:"status_timeline"`
	AvailableActions []string               `json:"available_actions"`
}

// OrderItemResponse represents an order item in the detail response
type OrderItemResponse struct {
	ID              uint    `json:"id"`
	ProductID       *uint   `json:"product_id,omitempty"`
	ProductName     string  `json:"product_name"`
	ProductImageURL string  `json:"product_image_url"`
	SKU             string  `json:"sku"`
	Quantity        int     `json:"quantity"`
	UnitPrice       float64 `json:"unit_price"`
	LineTotal       float64 `json:"line_total"`
}

// StatusTimelineItem represents a status change in the timeline
type StatusTimelineItem struct {
	FromStatus      string `json:"from_status"`
	ToStatus        string `json:"to_status"`
	ChangedByUserID *uint  `json:"changed_by_user_id,omitempty"`
	ChangedByName   string `json:"changed_by_name"`
	Reason          string `json:"reason"`
	ChangedAt       string `json:"changed_at"`
}

// UpdateOrderStatusRequest represents the request body for PATCH /merchant/shop/orders/:id/status
type UpdateOrderStatusRequest struct {
	TargetStatus   string `json:"target_status" binding:"required"`
	TrackingNumber string `json:"tracking_number"`
	CancelReason   string `json:"cancel_reason"`
	Note           string `json:"note"`
}

// UpdateOrderStatusResponse represents the response for PATCH /merchant/shop/orders/:id/status
type UpdateOrderStatusResponse struct {
	ID             uint                   `json:"id"`
	OrderNo        string                 `json:"order_no"`
	PreviousStatus models.ShopOrderStatus `json:"previous_status"`
	CurrentStatus  models.ShopOrderStatus `json:"current_status"`
	TrackingNumber string                 `json:"tracking_number"`
	CancelReason   string                 `json:"cancel_reason"`
	SyncQueue      *SyncQueueRef          `json:"sync_queue"`
	UpdatedAt      string                 `json:"updated_at"`
}

// SyncQueueRef represents a reference to the sync queue entry
type SyncQueueRef struct {
	ID         uint   `json:"id"`
	EntityType string `json:"entity_type"`
	EntityID   string `json:"entity_id"`
	Action     string `json:"action"`
	Status     string `json:"status"`
}

// ListShopOrders handles GET /merchant/shop/orders
func ListShopOrders(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		db = middleware.GetTenantDB(c, db)
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		var query ListOrdersQuery
		if err := c.ShouldBindQuery(&query); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 10002, "data": nil, "message": "invalid query params"})
			return
		}

		tenantID := authCtx.TenantID

		// Validate status if provided
		if query.Status != "" && !models.IsValidShopOrderStatus(query.Status) {
			c.JSON(http.StatusBadRequest, gin.H{"code": 10005, "data": nil, "message": "invalid order status"})
			return
		}

		// Validate date range
		if query.DateFrom != "" && query.DateTo != "" {
			dateFrom, err := time.Parse("2006-01-02", query.DateFrom)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 10008, "data": nil, "message": "date_from must be less than or equal to date_to"})
				return
			}
			dateTo, err := time.Parse("2006-01-02", query.DateTo)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 10008, "data": nil, "message": "date_from must be less than or equal to date_to"})
				return
			}
			if dateFrom.After(dateTo) {
				c.JSON(http.StatusBadRequest, gin.H{"code": 10008, "data": nil, "message": "date_from must be less than or equal to date_to"})
				return
			}
		}

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
		baseQuery := db.Model(&models.ShopOrder{}).Where("tenant_id = ?", tenantID)

		if query.Status != "" {
			baseQuery = baseQuery.Where("status = ?", query.Status)
		}

		if query.Search != "" {
			searchPattern := "%" + query.Search + "%"
			baseQuery = baseQuery.Where("order_no LIKE ? OR customer_name LIKE ?", searchPattern, searchPattern)
		}

		if query.DateFrom != "" {
			baseQuery = baseQuery.Where("created_at >= ?", query.DateFrom+"T00:00:00Z")
		}
		if query.DateTo != "" {
			baseQuery = baseQuery.Where("created_at <= ?", query.DateTo+"T23:59:59Z")
		}

		// Count total
		var total int64
		baseQuery.Count(&total)

		// Fetch orders
		offset := (query.Page - 1) * query.PerPage
		var orders []models.ShopOrder
		baseQuery.
			Order("created_at DESC").
			Offset(offset).
			Limit(query.PerPage).
			Find(&orders)

		// Build response items
		items := make([]OrderListItem, len(orders))
		for i, o := range orders {
			items[i] = OrderListItem{
				ID:             o.ID,
				OrderNo:        o.OrderNo,
				CustomerName:   o.CustomerName,
				CustomerPhone:  o.CustomerPhone,
				PetName:        o.PetName,
				ItemsSummary:   o.ItemsSummary,
				TotalAmount:    o.TotalAmount,
				Currency:       o.Currency,
				Status:         o.Status,
				TrackingNumber: o.TrackingNumber,
				CancelReason:   o.CancelReason,
				PlacedAt:       o.CreatedAt.Format(time.RFC3339),
				UpdatedAt:      o.UpdatedAt.Format(time.RFC3339),
			}
		}

		hasMore := int64(query.Page*query.PerPage) < total

		response := ListOrdersResponse{
			Orders:  items,
			Total:   total,
			Page:    query.Page,
			PerPage: query.PerPage,
			HasMore: hasMore,
			Filters: OrderListFilters{
				Status:   query.Status,
				Search:   query.Search,
				DateFrom: query.DateFrom,
				DateTo:   query.DateTo,
			},
		}

		c.JSON(http.StatusOK, gin.H{"code": 0, "data": response, "message": "ok"})
	}
}

// GetShopOrderDetail handles GET /merchant/shop/orders/:id
func GetShopOrderDetail(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		db = middleware.GetTenantDB(c, db)
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		tenantID := authCtx.TenantID

		idStr := c.Param("id")
		id, err := strconv.ParseUint(idStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 10001, "data": nil, "message": "invalid request"})
			return
		}

		// Fetch order with items and logs
		var order models.ShopOrder
		if err := db.Preload("Items").Preload("Logs").Preload("Logs.ChangedByUser").
			Where("id = ? AND tenant_id = ?", id, tenantID).
			First(&order).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"code": 30001, "data": nil, "message": "shop order not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		// Build items response
		items := make([]OrderItemResponse, len(order.Items))
		for i, item := range order.Items {
			items[i] = OrderItemResponse{
				ID:              item.ID,
				ProductID:       item.ProductID,
				ProductName:     item.ProductName,
				ProductImageURL: item.ProductImageURL,
				SKU:             item.SKU,
				Quantity:        item.Quantity,
				UnitPrice:       item.UnitPrice,
				LineTotal:       item.LineTotal,
			}
		}

		// Build status timeline
		timeline := make([]StatusTimelineItem, len(order.Logs))
		for i, log := range order.Logs {
			changedByName := ""
			if log.ChangedByUser != nil {
				changedByName = log.ChangedByUser.Name
			}
			timeline[i] = StatusTimelineItem{
				FromStatus:      log.FromStatus,
				ToStatus:        log.ToStatus,
				ChangedByUserID: log.ChangedByUserID,
				ChangedByName:   changedByName,
				Reason:          log.Reason,
				ChangedAt:       log.ChangedAt.Format(time.RFC3339),
			}
		}

		// Compute available actions
		availableActions := getAvailableActions(order.Status)

		response := OrderDetailResponse{
			ID:               order.ID,
			OrderNo:          order.OrderNo,
			CustomerName:     order.CustomerName,
			CustomerPhone:    order.CustomerPhone,
			PetName:          order.PetName,
			Status:           order.Status,
			TrackingNumber:   order.TrackingNumber,
			CancelReason:     order.CancelReason,
			SubtotalAmount:   order.SubtotalAmount,
			DeliveryFee:      order.DeliveryFee,
			TotalAmount:      order.TotalAmount,
			Currency:         order.Currency,
			Notes:            order.Notes,
			PlacedAt:         order.CreatedAt.Format(time.RFC3339),
			UpdatedAt:        order.UpdatedAt.Format(time.RFC3339),
			Items:            items,
			StatusTimeline:   timeline,
			AvailableActions: availableActions,
		}

		c.JSON(http.StatusOK, gin.H{"code": 0, "data": response, "message": "ok"})
	}
}

// UpdateShopOrderStatus handles PATCH /merchant/shop/orders/:id/status
func UpdateShopOrderStatus(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		db = middleware.GetTenantDB(c, db)
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		tenantID := authCtx.TenantID

		idStr := c.Param("id")
		id, err := strconv.ParseUint(idStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 10001, "data": nil, "message": "invalid request"})
			return
		}

		var req UpdateOrderStatusRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 10001, "data": nil, "message": "invalid request"})
			return
		}

		// Validate target_status
		targetStatus := models.ShopOrderStatus(req.TargetStatus)
		if !models.IsValidShopOrderStatus(string(targetStatus)) {
			c.JSON(http.StatusBadRequest, gin.H{"code": 10005, "data": nil, "message": "invalid order status"})
			return
		}

		// Cannot transition to 'paid' via merchant API
		if targetStatus == models.ShopOrderStatusPaid {
			c.JSON(http.StatusBadRequest, gin.H{"code": 10005, "data": nil, "message": "invalid order status"})
			return
		}

		// Conditional field validation
		if targetStatus == models.ShopOrderStatusShipped && strings.TrimSpace(req.TrackingNumber) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": 10006, "data": nil, "message": "tracking_number is required when status=shipped"})
			return
		}
		if targetStatus == models.ShopOrderStatusCancelled && strings.TrimSpace(req.CancelReason) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": 10007, "data": nil, "message": "cancel_reason is required when status=cancelled"})
			return
		}

		// Fetch order
		var order models.ShopOrder
		if err := db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&order).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"code": 30001, "data": nil, "message": "shop order not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		previousStatus := order.Status

		// Idempotent: same status
		if previousStatus == targetStatus {
			response := UpdateOrderStatusResponse{
				ID:             order.ID,
				OrderNo:        order.OrderNo,
				PreviousStatus: previousStatus,
				CurrentStatus:  targetStatus,
				TrackingNumber: order.TrackingNumber,
				CancelReason:   order.CancelReason,
				SyncQueue:      nil,
				UpdatedAt:      order.UpdatedAt.Format(time.RFC3339),
			}
			c.JSON(http.StatusOK, gin.H{"code": 0, "data": response, "message": "ok"})
			return
		}

		// Validate state transition
		sm := models.NewShopOrderStateMachine()
		if err := sm.ValidateTransition(previousStatus, targetStatus); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 10009, "data": nil, "message": "illegal order status transition"})
			return
		}

		// Build sync queue payload
		reason := sm.ReasonForTransition(targetStatus)
		payload := map[string]interface{}{
			"order_id":           order.ID,
			"order_no":           order.OrderNo,
			"from_status":        string(previousStatus),
			"to_status":          string(targetStatus),
			"tracking_number":    req.TrackingNumber,
			"cancel_reason":      req.CancelReason,
			"changed_at":         time.Now().UTC().Format(time.RFC3339),
			"changed_by_user_id": authCtx.UserID,
			"changed_by_role":    string(authCtx.Role),
		}
		payloadJSON, _ := json.Marshal(payload)

		// Execute in transaction
		var syncQueueEntry models.AppSyncQueue
		err = db.Transaction(func(tx *gorm.DB) error {
			// Update order
			updates := map[string]interface{}{
				"status":     targetStatus,
				"updated_at": time.Now(),
			}
			if targetStatus == models.ShopOrderStatusShipped {
				updates["tracking_number"] = req.TrackingNumber
			}
			if targetStatus == models.ShopOrderStatusCancelled {
				updates["cancel_reason"] = req.CancelReason
			}
			if req.Note != "" {
				updates["notes"] = req.Note
			}

			if err := tx.Model(&order).Updates(updates).Error; err != nil {
				return err
			}

			// Write status log
			logEntry := models.ShopOrderStatusLog{
				TenantID:        tenantID,
				OrderID:         order.ID,
				FromStatus:      string(previousStatus),
				ToStatus:        string(targetStatus),
				Reason:          reason,
				Note:            req.Note,
				TrackingNumber:  req.TrackingNumber,
				CancelReason:    req.CancelReason,
				ChangedByUserID: &authCtx.UserID,
				ChangedAt:       time.Now(),
			}
			if err := tx.Create(&logEntry).Error; err != nil {
				return err
			}

			// Write sync queue entry
			syncQueueEntry = models.AppSyncQueue{
				TenantID:   tenantID,
				EntityType: "order",
				EntityID:   fmt.Sprintf("%d", order.ID),
				Action:     "status_changed",
				Payload:    string(payloadJSON),
				Status:     models.AppSyncQueueStatusPending,
			}
			if err := tx.Create(&syncQueueEntry).Error; err != nil {
				return err
			}

			return nil
		})

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		// Reload order to get updated_at
		db.Where("id = ? AND tenant_id = ?", id, tenantID).First(&order)

		response := UpdateOrderStatusResponse{
			ID:             order.ID,
			OrderNo:        order.OrderNo,
			PreviousStatus: previousStatus,
			CurrentStatus:  targetStatus,
			TrackingNumber: order.TrackingNumber,
			CancelReason:   order.CancelReason,
			SyncQueue: &SyncQueueRef{
				ID:         syncQueueEntry.ID,
				EntityType: "order",
				EntityID:   fmt.Sprintf("%d", order.ID),
				Action:     "status_changed",
				Status:     string(syncQueueEntry.Status),
			},
			UpdatedAt: order.UpdatedAt.Format(time.RFC3339),
		}

		c.JSON(http.StatusOK, gin.H{"code": 0, "data": response, "message": "ok"})
	}
}

// getAvailableActions returns the list of available actions for a given order status
func getAvailableActions(status models.ShopOrderStatus) []string {
	sm := models.NewShopOrderStateMachine()
	var actions []string

	// preparing
	if sm.CanTransitionMerchant(status, models.ShopOrderStatusPreparing) {
		actions = append(actions, "prepare")
	}
	// shipped
	if sm.CanTransitionMerchant(status, models.ShopOrderStatusShipped) {
		actions = append(actions, "ship")
	}
	// completed
	if sm.CanTransitionMerchant(status, models.ShopOrderStatusCompleted) {
		actions = append(actions, "complete")
	}
	// cancelled
	if sm.CanTransitionMerchant(status, models.ShopOrderStatusCancelled) {
		actions = append(actions, "cancel")
	}

	return actions
}
