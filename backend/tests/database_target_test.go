package tests

import (
	"pawrd-merchant-backend/models"
	"testing"
)

func TestDatabaseTargetValidate(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		target  models.DatabaseTarget
		wantErr bool
	}{
		{
			name: "sqlite target valid",
			target: models.DatabaseTarget{
				DatabaseKey: "clinic-premium-001",
				Driver:      models.DatabaseDriverSQLite,
				DSNEnvVar:   "CLINIC_PREMIUM_001_DSN",
				Status:      models.DatabaseTargetStatusActive,
			},
		},
		{
			name: "postgres target valid",
			target: models.DatabaseTarget{
				DatabaseKey: "clinic-premium-002",
				Driver:      models.DatabaseDriverPostgres,
				DSNEnvVar:   "CLINIC_PREMIUM_002_DSN",
				Status:      models.DatabaseTargetStatusActive,
			},
		},
		{
			name: "missing env var invalid",
			target: models.DatabaseTarget{
				DatabaseKey: "clinic-premium-003",
				Driver:      models.DatabaseDriverSQLite,
				Status:      models.DatabaseTargetStatusActive,
			},
			wantErr: true,
		},
		{
			name: "unsupported driver invalid",
			target: models.DatabaseTarget{
				DatabaseKey: "clinic-premium-004",
				Driver:      models.DatabaseDriver("mysql"),
				DSNEnvVar:   "CLINIC_PREMIUM_004_DSN",
				Status:      models.DatabaseTargetStatusActive,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := tt.target.Validate()
			if (err != nil) != tt.wantErr {
				t.Fatalf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
