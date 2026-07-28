package models

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

type SubscriptionTier string

const (
	SubscriptionTierOnboarding SubscriptionTier = "onboarding"
	SubscriptionTierStandard   SubscriptionTier = "standard"
	SubscriptionTierPremium    SubscriptionTier = "premium"
)

type TenancyMode string

const (
	TenancyModeSharedRLS    TenancyMode = "shared_rls"
	TenancyModeSharedSchema TenancyMode = "shared_schema"
	TenancyModeDedicatedDB  TenancyMode = "dedicated_database"
)

type TenantRoutingStatus string

const (
	TenantRoutingStatusActive   TenantRoutingStatus = "active"
	TenantRoutingStatusInactive TenantRoutingStatus = "inactive"
)

var ErrInvalidTenantRoutingConfig = errors.New("invalid tenant routing config")

// TenantRoutingConfig is the first control-plane slice for tier-aware tenancy routing.
type TenantRoutingConfig struct {
	ID               uint                `gorm:"primaryKey" json:"id"`
	TenantID         uint                `gorm:"not null;uniqueIndex" json:"tenant_id"`
	SubscriptionTier SubscriptionTier    `gorm:"size:24;not null;index" json:"subscription_tier"`
	TenancyMode      TenancyMode         `gorm:"size:32;not null;index" json:"tenancy_mode"`
	SchemaName       string              `gorm:"size:128" json:"schema_name"`
	DatabaseKey      string              `gorm:"size:128" json:"database_key"`
	Status           TenantRoutingStatus `gorm:"size:16;not null;default:'active';index" json:"status"`
	CreatedAt        time.Time           `json:"created_at"`
	UpdatedAt        time.Time           `json:"updated_at"`

	Tenant Tenant `gorm:"foreignKey:TenantID" json:"-"`
}

func (TenantRoutingConfig) TableName() string {
	return "tenant_routing_configs"
}

func (c TenantRoutingConfig) IsActive() bool {
	return c.Status == TenantRoutingStatusActive
}

func (c TenantRoutingConfig) Validate() error {
	if c.TenantID == 0 {
		return fmt.Errorf("%w: tenant_id is required", ErrInvalidTenantRoutingConfig)
	}
	if !c.SubscriptionTier.IsValid() {
		return fmt.Errorf("%w: unsupported subscription_tier %q", ErrInvalidTenantRoutingConfig, c.SubscriptionTier)
	}
	if !c.TenancyMode.IsValid() {
		return fmt.Errorf("%w: unsupported tenancy_mode %q", ErrInvalidTenantRoutingConfig, c.TenancyMode)
	}
	if c.Status != TenantRoutingStatusActive && c.Status != TenantRoutingStatusInactive {
		return fmt.Errorf("%w: unsupported status %q", ErrInvalidTenantRoutingConfig, c.Status)
	}

	schemaName := strings.TrimSpace(c.SchemaName)
	databaseKey := strings.TrimSpace(c.DatabaseKey)

	switch c.SubscriptionTier {
	case SubscriptionTierOnboarding:
		if c.TenancyMode != TenancyModeSharedRLS {
			return fmt.Errorf("%w: onboarding tier must use shared_rls", ErrInvalidTenantRoutingConfig)
		}
		if schemaName != "" || databaseKey != "" {
			return fmt.Errorf("%w: onboarding tier must not set schema_name or database_key", ErrInvalidTenantRoutingConfig)
		}
	case SubscriptionTierStandard:
		if c.TenancyMode != TenancyModeSharedSchema {
			return fmt.Errorf("%w: standard tier must use shared_schema", ErrInvalidTenantRoutingConfig)
		}
		if schemaName == "" {
			return fmt.Errorf("%w: standard tier requires schema_name", ErrInvalidTenantRoutingConfig)
		}
		if databaseKey != "" {
			return fmt.Errorf("%w: standard tier must not set database_key", ErrInvalidTenantRoutingConfig)
		}
	case SubscriptionTierPremium:
		if c.TenancyMode != TenancyModeDedicatedDB {
			return fmt.Errorf("%w: premium tier must use dedicated_database", ErrInvalidTenantRoutingConfig)
		}
		if databaseKey == "" {
			return fmt.Errorf("%w: premium tier requires database_key", ErrInvalidTenantRoutingConfig)
		}
	}

	return nil
}

func (t SubscriptionTier) IsValid() bool {
	switch t {
	case SubscriptionTierOnboarding, SubscriptionTierStandard, SubscriptionTierPremium:
		return true
	default:
		return false
	}
}

func (m TenancyMode) IsValid() bool {
	switch m {
	case TenancyModeSharedRLS, TenancyModeSharedSchema, TenancyModeDedicatedDB:
		return true
	default:
		return false
	}
}
