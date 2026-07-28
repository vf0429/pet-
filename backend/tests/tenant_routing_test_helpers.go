package tests

import (
	"pawrd-merchant-backend/models"
	"testing"

	"gorm.io/gorm"
)

func mustCreateTenantRoutingConfig(t *testing.T, db *gorm.DB, tenantID uint, tier models.SubscriptionTier, mode models.TenancyMode, schemaName, databaseKey string) *models.TenantRoutingConfig {
	t.Helper()

	config := &models.TenantRoutingConfig{
		TenantID:         tenantID,
		SubscriptionTier: tier,
		TenancyMode:      mode,
		SchemaName:       schemaName,
		DatabaseKey:      databaseKey,
		Status:           models.TenantRoutingStatusActive,
	}
	if err := config.Validate(); err != nil {
		t.Fatalf("invalid tenant routing config: %v", err)
	}
	if err := db.Create(config).Error; err != nil {
		t.Fatalf("failed to create tenant routing config: %v", err)
	}
	return config
}
