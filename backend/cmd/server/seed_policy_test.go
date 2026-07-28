package main

import (
	"testing"

	"pawrd-merchant-backend/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestShouldSeedDemoData(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name          string
		databaseURL   string
		allowDemoSeed string
		want          bool
	}{
		{
			name:        "local sqlite defaults to demo seed",
			databaseURL: "",
			want:        true,
		},
		{
			name:        "hosted database disables demo seed by default",
			databaseURL: "postgres://prod.example",
			want:        false,
		},
		{
			name:          "hosted database can opt back into demo seed",
			databaseURL:   "postgres://prod.example",
			allowDemoSeed: "true",
			want:          true,
		},
		{
			name:          "explicit false does not override hosted default",
			databaseURL:   "postgres://prod.example",
			allowDemoSeed: "false",
			want:          false,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := shouldSeedDemoData(tc.databaseURL, tc.allowDemoSeed)
			if got != tc.want {
				t.Fatalf("shouldSeedDemoData(%q, %q) = %v, want %v", tc.databaseURL, tc.allowDemoSeed, got, tc.want)
			}
		})
	}
}

func TestEnsureExistingTenantRoutingConfigsBackfillsMissingRows(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}

	if err := db.AutoMigrate(&models.Tenant{}, &models.TenantRoutingConfig{}); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}

	tenants := []models.Tenant{
		{Name: "Tenant One", Type: models.TenantTypeBoth, Status: models.TenantStatusActive},
		{Name: "Tenant Two", Type: models.TenantTypeClinic, Status: models.TenantStatusActive},
	}
	for i := range tenants {
		if err := db.Create(&tenants[i]).Error; err != nil {
			t.Fatalf("create tenant %d: %v", i, err)
		}
	}

	existing := models.TenantRoutingConfig{
		TenantID:         tenants[0].ID,
		SubscriptionTier: models.SubscriptionTierOnboarding,
		TenancyMode:      models.TenancyModeSharedRLS,
		Status:           models.TenantRoutingStatusActive,
	}
	if err := db.Create(&existing).Error; err != nil {
		t.Fatalf("create existing routing config: %v", err)
	}

	ensureExistingTenantRoutingConfigs(db)

	var configs []models.TenantRoutingConfig
	if err := db.Order("tenant_id asc").Find(&configs).Error; err != nil {
		t.Fatalf("load routing configs: %v", err)
	}

	if len(configs) != 2 {
		t.Fatalf("expected 2 routing configs after backfill, got %d", len(configs))
	}

	if configs[0].TenantID != tenants[0].ID || configs[1].TenantID != tenants[1].ID {
		t.Fatalf("unexpected tenant ids in routing configs: %#v", configs)
	}

	for _, config := range configs {
		if err := config.Validate(); err != nil {
			t.Fatalf("invalid routing config after backfill for tenant %d: %v", config.TenantID, err)
		}
	}
}
