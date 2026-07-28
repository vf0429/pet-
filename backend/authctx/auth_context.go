package authctx

import (
	"pawrd-merchant-backend/models"
)

// MerchantAuthContext represents the authentication context injected into requests
type MerchantAuthContext struct {
	SessionID             string
	UserID                uint
	TenantID              uint
	SubscriptionTier      models.SubscriptionTier
	TenancyMode           models.TenancyMode
	SchemaName            string
	DatabaseKey           string
	Role                  models.UserRole
	CanSwitch             bool
	ActiveBusinessType    models.BusinessType
	RequestedBusinessType models.BusinessType
}
