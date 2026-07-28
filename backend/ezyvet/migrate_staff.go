package ezyvet

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"pawrd-merchant-backend/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// MigrateStaff migrates ezyVet contacts with is_vet=1 or is_staff=1 → MerchantUser.
func MigrateStaff(c *Client, db *gorm.DB, tenantID uint, dryRun bool) (imported, skipped int, err error) {
	log.Println("[migrate_staff] fetching contacts...")
	raws, err := c.GetAll("/v1/contact", nil)
	if err != nil {
		return 0, 0, fmt.Errorf("fetch contacts: %w", err)
	}

	// Default bcrypt hash for "ChangeMe123!" — staff must reset password
	defaultHash, _ := bcrypt.GenerateFromPassword([]byte("ChangeMe123!"), bcrypt.DefaultCost)

	for i, raw := range raws {
		inner, _ := UnwrapItem(raw, "contact")
		var ez EzContact
		if err := json.Unmarshal(inner, &ez); err != nil {
			continue
		}

		if ez.IsVet == 0 && ez.IsStaff == 0 {
			continue
		}
		if ez.Active == 0 {
			skipped++
			continue
		}

		_, email, cdErr := c.ContactDetailsFor(ez.ID)
		if cdErr != nil {
			log.Printf("[migrate_staff] warn: contact %d contactdetail error: %v", ez.ID, cdErr)
		}
		if email == "" {
			log.Printf("[migrate_staff] skip contact %d (%s %s): no email", ez.ID, ez.FirstName, ez.LastName)
			skipped++
			continue
		}

		role := models.UserRoleStaff
		if ez.IsVet == 1 {
			role = models.UserRoleDoctor
		}
		name := strings.TrimSpace(ez.FirstName + " " + ez.LastName)
		if name == "" {
			name = email
		}

		ezID := ez.ID
		if dryRun {
			log.Printf("[migrate_staff] DRY RUN: would upsert MerchantUser email=%s role=%s ezyvet_id=%d", email, role, ezID)
			imported++
			continue
		}

		user := models.MerchantUser{
			TenantID:                tenantID,
			Email:                   email,
			PasswordHash:            string(defaultHash),
			Name:                    name,
			Role:                    role,
			ActiveBusinessType:      models.BusinessTypeClinic,
			CanSwitch:               false,
			Status:                  models.UserStatusActive,
			ExternalEzyvetContactID: &ezID,
		}
		result := db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "email"}},
			DoUpdates: clause.AssignmentColumns([]string{"name", "role", "external_ezyvet_contact_id"}),
		}).Create(&user)
		if result.Error != nil {
			log.Printf("[migrate_staff] error upserting %s: %v", email, result.Error)
			continue
		}
		imported++

		if (i+1)%20 == 0 {
			log.Printf("[migrate_staff] %d/%d processed", i+1, len(raws))
		}
	}

	log.Printf("[migrate_staff] done: imported=%d skipped=%d", imported, skipped)
	return imported, skipped, nil
}
