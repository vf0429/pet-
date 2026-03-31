package ezyvet

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"petwell-merchant-backend/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// isDrugProduct returns true if the ezyVet product type looks like a drug/medication.
func isDrugProduct(productType string) bool {
	t := strings.ToLower(productType)
	return strings.Contains(t, "drug") ||
		strings.Contains(t, "medication") ||
		strings.Contains(t, "medicine") ||
		strings.Contains(t, "pharmaceutical") ||
		strings.Contains(t, "vaccine") ||
		strings.Contains(t, "injection")
}

// MigratePharmacy migrates ezyVet Products (drug types) → PharmacyItem.
func MigratePharmacy(c *Client, db *gorm.DB, tenantID uint, dryRun bool) (imported, skipped int, err error) {
	log.Println("[migrate_pharmacy] fetching products...")
	raws, err := c.GetAll("/v1/product", nil)
	if err != nil {
		return 0, 0, fmt.Errorf("fetch products: %w", err)
	}

	defaultExpiry := time.Now().AddDate(1, 0, 0) // 1 year from now as placeholder

	for i, raw := range raws {
		inner, _ := UnwrapItem(raw, "product")
		var ez EzProduct
		if err := json.Unmarshal(inner, &ez); err != nil {
			continue
		}
		if ez.Active == 0 {
			skipped++
			continue
		}
		if !isDrugProduct(ez.Type) {
			skipped++
			continue
		}

		ezID := ez.ID
		stockLevel := int(ez.StockAvailable)
		if stockLevel < 0 {
			stockLevel = 0
		}

		if dryRun {
			log.Printf("[migrate_pharmacy] DRY RUN: would upsert PharmacyItem name=%s code=%s ezyvet_id=%d", ez.Name, ez.Code, ezID)
			imported++
			continue
		}

		item := models.PharmacyItem{
			TenantID:           tenantID,
			Name:               ez.Name,
			Specification:      ez.UnitOfMeasure,
			BatchNo:            "IMPORTED",
			ExpiresAt:          defaultExpiry,
			StockLevel:         stockLevel,
			LowStockThreshold:  0,
			StorageCondition:   "room_temp",
			IsPrescriptionOnly: true,
			ProductCode:        ez.Code,
			Barcode:            ez.Barcode,
			PricePerUnit:       ez.PricePerUnit,
			ProductType:        ez.Type,
			ExternalEzyvetID:   &ezID,
		}

		result := db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "external_ezyvet_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"name", "specification", "stock_level", "price_per_unit", "product_code", "barcode", "product_type"}),
		}).Create(&item)
		if result.Error != nil {
			log.Printf("[migrate_pharmacy] error upserting product %d: %v", ez.ID, result.Error)
			continue
		}
		imported++

		if (i+1)%100 == 0 {
			log.Printf("[migrate_pharmacy] %d/%d processed", i+1, len(raws))
		}
	}

	log.Printf("[migrate_pharmacy] done: imported=%d skipped=%d", imported, skipped)
	return imported, skipped, nil
}
