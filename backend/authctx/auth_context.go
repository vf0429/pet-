package authctx

import (
	"petwell-merchant-backend/models"
)

// MerchantAuthContext represents the authentication context injected into requests
type MerchantAuthContext struct {
	SessionID             string
	UserID                uint
	TenantID              uint
	Role                  models.UserRole
	CanSwitch             bool
	ActiveBusinessType    models.BusinessType
	RequestedBusinessType models.BusinessType
}
