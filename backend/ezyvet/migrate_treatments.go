package ezyvet

import (
	"encoding/json"
	"fmt"
	"log"

	"pawrd-merchant-backend/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// MigrateTreatments migrates ezyVet InvoiceLines → ClinicTreatment.
func MigrateTreatments(c *Client, db *gorm.DB, tenantID uint, dryRun bool) (imported, skipped int, err error) {
	log.Println("[migrate_treatments] fetching invoices...")

	// First fetch all invoices to build invoice_id → consult_id map
	invoiceRaws, err := c.GetAll("/v1/invoice", nil)
	if err != nil {
		return 0, 0, fmt.Errorf("fetch invoices: %w", err)
	}

	invoiceConsultMap := make(map[int64]int64) // invoice_id → consult_id
	for _, raw := range invoiceRaws {
		inner, _ := UnwrapItem(raw, "invoice")
		var inv EzInvoice
		if json.Unmarshal(inner, &inv) == nil && inv.Active == 1 {
			invoiceConsultMap[inv.ID] = inv.ConsultID
		}
	}
	log.Printf("[migrate_treatments] %d invoices indexed", len(invoiceConsultMap))

	// Default performer
	var defaultPerformer models.MerchantUser
	db.Where("tenant_id = ? AND role = ? AND status = ?", tenantID, models.UserRoleDoctor, models.UserStatusActive).First(&defaultPerformer)

	// Fetch all invoice lines
	log.Println("[migrate_treatments] fetching invoice lines...")
	lineRaws, err := c.GetAll("/v1/invoiceline", nil)
	if err != nil {
		return 0, 0, fmt.Errorf("fetch invoicelines: %w", err)
	}

	for i, raw := range lineRaws {
		inner, _ := UnwrapItem(raw, "invoiceline")
		var line EzInvoiceLine
		if err := json.Unmarshal(inner, &line); err != nil {
			continue
		}
		if line.Active == 0 {
			skipped++
			continue
		}

		// Resolve consult_id from invoice
		consultID, ok := invoiceConsultMap[line.InvoiceID]
		if !ok || consultID == 0 {
			skipped++
			continue
		}

		// Resolve visit
		var visit models.ClinicVisit
		db.Where("external_ezyvet_id = ? AND tenant_id = ?", consultID, tenantID).First(&visit)
		if visit.ID == 0 {
			skipped++
			continue
		}

		// Resolve product info
		name := "Treatment"
		productCode := ""
		var pharma models.PharmacyItem
		db.Where("external_ezyvet_id = ? AND tenant_id = ?", line.ProductID, tenantID).First(&pharma)
		if pharma.ID > 0 {
			name = pharma.Name
			productCode = pharma.ProductCode
		}

		fee := line.Price * line.Quantity
		ezID := line.ID

		if dryRun {
			log.Printf("[migrate_treatments] DRY RUN: would upsert ClinicTreatment name=%s fee=%.2f ezyvet_id=%d", name, fee, ezID)
			imported++
			continue
		}

		treatment := models.ClinicTreatment{
			TenantID:         tenantID,
			VisitID:          visit.ID,
			Name:             name,
			PerformedByID:    defaultPerformer.ID,
			Fee:              fee,
			Currency:         "HKD",
			ProductCode:      productCode,
			UnitPrice:        line.Price,
			Quantity:         line.Quantity,
			ExternalEzyvetID: &ezID,
		}

		result := db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "external_ezyvet_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"name", "fee", "unit_price", "quantity", "product_code"}),
		}).Create(&treatment)
		if result.Error != nil {
			log.Printf("[migrate_treatments] error upserting line %d: %v", line.ID, result.Error)
			continue
		}
		imported++

		if (i+1)%100 == 0 {
			log.Printf("[migrate_treatments] %d/%d lines processed", i+1, len(lineRaws))
		}
	}

	log.Printf("[migrate_treatments] done: imported=%d skipped=%d", imported, skipped)
	return imported, skipped, nil
}
