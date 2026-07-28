package middleware

import (
	"errors"
	"pawrd-merchant-backend/models"

	"gorm.io/gorm"
)

func loadTenantRoutingConfig(db *gorm.DB, tenantID uint) (*models.TenantRoutingConfig, string) {
	var routingConfig models.TenantRoutingConfig
	if err := db.Where("tenant_id = ?", tenantID).First(&routingConfig).Error; err != nil {
		return nil, "unavailable"
	}
	if !routingConfig.IsActive() {
		return nil, "unavailable"
	}
	if err := routingConfig.Validate(); err != nil {
		if errors.Is(err, models.ErrInvalidTenantRoutingConfig) {
			return nil, "invalid"
		}
		return nil, "unavailable"
	}
	return &routingConfig, ""
}
