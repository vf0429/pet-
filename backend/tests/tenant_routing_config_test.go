package tests

import (
	"pawrd-merchant-backend/models"
	"testing"
)

func TestTenantRoutingConfigValidate(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		config  models.TenantRoutingConfig
		wantErr bool
	}{
		{
			name: "onboarding shared rls valid",
			config: models.TenantRoutingConfig{
				TenantID:         1,
				SubscriptionTier: models.SubscriptionTierOnboarding,
				TenancyMode:      models.TenancyModeSharedRLS,
				Status:           models.TenantRoutingStatusActive,
			},
		},
		{
			name: "standard requires schema",
			config: models.TenantRoutingConfig{
				TenantID:         1,
				SubscriptionTier: models.SubscriptionTierStandard,
				TenancyMode:      models.TenancyModeSharedSchema,
				Status:           models.TenantRoutingStatusActive,
			},
			wantErr: true,
		},
		{
			name: "standard with schema valid",
			config: models.TenantRoutingConfig{
				TenantID:         1,
				SubscriptionTier: models.SubscriptionTierStandard,
				TenancyMode:      models.TenancyModeSharedSchema,
				SchemaName:       "clinic_abc123",
				Status:           models.TenantRoutingStatusActive,
			},
		},
		{
			name: "premium requires database key",
			config: models.TenantRoutingConfig{
				TenantID:         1,
				SubscriptionTier: models.SubscriptionTierPremium,
				TenancyMode:      models.TenancyModeDedicatedDB,
				Status:           models.TenantRoutingStatusActive,
			},
			wantErr: true,
		},
		{
			name: "premium with database key valid",
			config: models.TenantRoutingConfig{
				TenantID:         1,
				SubscriptionTier: models.SubscriptionTierPremium,
				TenancyMode:      models.TenancyModeDedicatedDB,
				DatabaseKey:      "clinic-prod-hk-001",
				Status:           models.TenantRoutingStatusActive,
			},
		},
		{
			name: "onboarding cannot claim schema mode",
			config: models.TenantRoutingConfig{
				TenantID:         1,
				SubscriptionTier: models.SubscriptionTierOnboarding,
				TenancyMode:      models.TenancyModeSharedSchema,
				Status:           models.TenantRoutingStatusActive,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := tt.config.Validate()
			if (err != nil) != tt.wantErr {
				t.Fatalf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
