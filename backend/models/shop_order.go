package models

import "time"

// ShopOrderStatus represents the status of a shop order
type ShopOrderStatus string

const (
	ShopOrderStatusPending   ShopOrderStatus = "pending"
	ShopOrderStatusPaid      ShopOrderStatus = "paid"
	ShopOrderStatusPreparing ShopOrderStatus = "preparing"
	ShopOrderStatusShipped   ShopOrderStatus = "shipped"
	ShopOrderStatusCompleted ShopOrderStatus = "completed"
	ShopOrderStatusCancelled ShopOrderStatus = "cancelled"
)

// ValidShopOrderStatuses returns all valid order statuses
func ValidShopOrderStatuses() []ShopOrderStatus {
	return []ShopOrderStatus{
		ShopOrderStatusPending,
		ShopOrderStatusPaid,
		ShopOrderStatusPreparing,
		ShopOrderStatusShipped,
		ShopOrderStatusCompleted,
		ShopOrderStatusCancelled,
	}
}

// IsValidShopOrderStatus checks if a string is a valid order status
func IsValidShopOrderStatus(s string) bool {
	for _, status := range ValidShopOrderStatuses() {
		if string(status) == s {
			return true
		}
	}
	return false
}

// ShopOrder represents a shop order in the system
type ShopOrder struct {
	ID             uint            `gorm:"primaryKey" json:"id"`
	TenantID       uint            `gorm:"not null;index:idx_shop_orders_tenant_status,priority:1;index:idx_shop_orders_tenant_created,priority:1;index:idx_shop_orders_tenant_order_no,priority:1" json:"tenant_id"`
	BusinessType   string          `gorm:"size:16;not null;default:'shop';index" json:"business_type"`
	OrderNo        string          `gorm:"size:32;not null;index:idx_shop_orders_tenant_order_no,priority:2,unique" json:"order_no"`
	CustomerName   string          `gorm:"size:128;not null;index" json:"customer_name"`
	CustomerPhone  string          `gorm:"size:32;not null" json:"customer_phone"`
	PetName        string          `gorm:"size:128;not null;index" json:"pet_name"`
	ItemsSummary   string          `gorm:"type:text;not null" json:"items_summary"`
	SubtotalAmount float64         `gorm:"type:decimal(10,2);not null;default:0" json:"subtotal_amount"`
	DeliveryFee    float64         `gorm:"type:decimal(10,2);not null;default:0" json:"delivery_fee"`
	TotalAmount    float64         `gorm:"type:decimal(10,2);not null;default:0" json:"total_amount"`
	Currency       string          `gorm:"size:8;not null;default:'HKD'" json:"currency"`
	Status         ShopOrderStatus `gorm:"size:24;not null;index:idx_shop_orders_tenant_status,priority:2" json:"status"`
	CancelReason   string          `gorm:"size:255" json:"cancel_reason"`
	TrackingNumber string          `gorm:"size:64;index" json:"tracking_number"`
	Notes          string          `gorm:"size:255" json:"notes"`
	CreatedAt      time.Time       `gorm:"index:idx_shop_orders_tenant_created,priority:2" json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`

	Tenant Tenant               `gorm:"foreignKey:TenantID"`
	Items  []ShopOrderItem      `gorm:"foreignKey:OrderID"`
	Logs   []ShopOrderStatusLog `gorm:"foreignKey:OrderID"`
}

// TableName returns the table name for ShopOrder
func (ShopOrder) TableName() string {
	return "shop_orders"
}

// ShopOrderItem represents an item in a shop order
type ShopOrderItem struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	TenantID        uint      `gorm:"not null;index:idx_shop_order_items_tenant_order,priority:1" json:"tenant_id"`
	OrderID         uint      `gorm:"not null;index:idx_shop_order_items_tenant_order,priority:2" json:"order_id"`
	ProductID       *uint     `gorm:"index" json:"product_id,omitempty"`
	SKU             string    `gorm:"size:64;not null" json:"sku"`
	ProductName     string    `gorm:"size:255;not null" json:"product_name"`
	ProductImageURL string    `gorm:"size:512" json:"product_image_url"`
	Quantity        int       `gorm:"not null;default:1" json:"quantity"`
	UnitPrice       float64   `gorm:"type:decimal(10,2);not null;default:0" json:"unit_price"`
	LineTotal       float64   `gorm:"type:decimal(10,2);not null;default:0" json:"line_total"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`

	Order   ShopOrder    `gorm:"foreignKey:OrderID"`
	Product *ShopProduct `gorm:"foreignKey:ProductID"`
}

// TableName returns the table name for ShopOrderItem
func (ShopOrderItem) TableName() string {
	return "shop_order_items"
}

// ShopOrderStatusLog represents a status change log for a shop order
type ShopOrderStatusLog struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	TenantID        uint      `gorm:"not null;index:idx_shop_order_logs_tenant_order,priority:1" json:"tenant_id"`
	OrderID         uint      `gorm:"not null;index:idx_shop_order_logs_tenant_order,priority:2" json:"order_id"`
	FromStatus      string    `gorm:"size:24;not null" json:"from_status"`
	ToStatus        string    `gorm:"size:24;not null;index" json:"to_status"`
	Reason          string    `gorm:"size:64;not null" json:"reason"`
	Note            string    `gorm:"size:255" json:"note"`
	TrackingNumber  string    `gorm:"size:64" json:"tracking_number"`
	CancelReason    string    `gorm:"size:255" json:"cancel_reason"`
	ChangedByUserID *uint     `gorm:"index" json:"changed_by_user_id,omitempty"`
	ChangedAt       time.Time `gorm:"not null;index" json:"changed_at"`
	CreatedAt       time.Time `json:"created_at"`

	Order         ShopOrder     `gorm:"foreignKey:OrderID"`
	ChangedByUser *MerchantUser `gorm:"foreignKey:ChangedByUserID"`
}

// TableName returns the table name for ShopOrderStatusLog
func (ShopOrderStatusLog) TableName() string {
	return "shop_order_status_logs"
}
