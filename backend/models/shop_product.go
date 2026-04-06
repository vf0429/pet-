package models

import "time"

// ShopProduct represents a product in the shop
type ShopProduct struct {
	ID                uint      `gorm:"primaryKey" json:"id"`
	TenantID          uint      `gorm:"not null;index:idx_shop_products_tenant_category,priority:1;index:idx_shop_products_tenant_active,priority:1;index:idx_shop_products_tenant_sku,priority:1" json:"tenant_id"`
	BusinessType      string    `gorm:"size:16;not null;default:'shop';index" json:"business_type"`
	SKU               string    `gorm:"size:64;not null;index:idx_shop_products_tenant_sku,priority:2,unique" json:"sku"`
	Name              string    `gorm:"size:255;not null;index" json:"name"`
	Category          string    `gorm:"size:64;not null;index:idx_shop_products_tenant_category,priority:2" json:"category"`
	Price             float64   `gorm:"type:decimal(10,2);not null;default:0" json:"price"`
	StockLevel        int       `gorm:"not null;default:0" json:"stock_level"`
	LowStockThreshold int       `gorm:"not null;default:0" json:"low_stock_threshold"`
	IsActive          bool      `gorm:"not null;default:true;index:idx_shop_products_tenant_active,priority:2" json:"is_active"`
	ImageURL          string    `gorm:"size:512" json:"image_url"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`

	Tenant Tenant `gorm:"foreignKey:TenantID"`
}

// TableName returns the table name for ShopProduct
func (ShopProduct) TableName() string {
	return "shop_products"
}

// IsLowStock returns true if stock level is at or below the low stock threshold
func (p *ShopProduct) IsLowStock() bool {
	return p.StockLevel <= p.LowStockThreshold
}
