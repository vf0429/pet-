package migrations

import "gorm.io/gorm"

// RunAnalyticsIndexMigration ensures analytics-related indices exist.
func RunAnalyticsIndexMigration(db *gorm.DB) error {
	statements := []string{
		`CREATE INDEX IF NOT EXISTS idx_shop_orders_tenant_created ON shop_orders (tenant_id, created_at);`,
		`CREATE INDEX IF NOT EXISTS idx_shop_products_tenant_category ON shop_products (tenant_id, category);`,
		`CREATE INDEX IF NOT EXISTS idx_clinic_visits_tenant_created ON clinic_visits (tenant_id, created_at);`,
		`CREATE INDEX IF NOT EXISTS idx_clinic_diagnoses_tenant_visit ON clinic_diagnoses (tenant_id, visit_id);`,
		`CREATE INDEX IF NOT EXISTS idx_clinic_appointments_doctor_date ON clinic_appointments (tenant_id, doctor_id, scheduled_at);`,
	}

	for _, statement := range statements {
		if err := db.Exec(statement).Error; err != nil {
			return err
		}
	}

	return nil
}
