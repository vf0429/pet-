package models

// TenantStateMachine defines valid state transitions for Tenant
type TenantStateMachine struct{}

// NewTenantStateMachine creates a new TenantStateMachine
func NewTenantStateMachine() *TenantStateMachine {
	return &TenantStateMachine{}
}

// CanTransition checks if a transition from one status to another is valid
func (sm *TenantStateMachine) CanTransition(from, to TenantStatus) bool {
	// All transitions are allowed: active <-> suspended
	switch from {
	case TenantStatusActive, TenantStatusSuspended:
		return to == TenantStatusActive || to == TenantStatusSuspended
	default:
		return false
	}
}

// ValidateTransition validates and returns error if invalid
func (sm *TenantStateMachine) ValidateTransition(from, to TenantStatus) error {
	if !sm.CanTransition(from, to) {
		return ErrInvalidStateTransition
	}
	return nil
}

// UserBusinessStateMachine defines valid state transitions for user business access
type UserBusinessStateMachine struct{}

// NewUserBusinessStateMachine creates a new UserBusinessStateMachine
func NewUserBusinessStateMachine() *UserBusinessStateMachine {
	return &UserBusinessStateMachine{}
}

// UserBusinessState represents the combined state of user business access
type UserBusinessState string

const (
	UserBusinessStateShopLocked             UserBusinessState = "shop_locked"
	UserBusinessStateClinicLocked           UserBusinessState = "clinic_locked"
	UserBusinessStateSwitchableShopActive   UserBusinessState = "switchable_shop_active"
	UserBusinessStateSwitchableClinicActive UserBusinessState = "switchable_clinic_active"
)

// GetState determines the current business state based on user and tenant attributes
func (sm *UserBusinessStateMachine) GetState(canSwitch bool, activeBusinessType BusinessType) UserBusinessState {
	if canSwitch {
		if activeBusinessType == BusinessTypeShop {
			return UserBusinessStateSwitchableShopActive
		}
		return UserBusinessStateSwitchableClinicActive
	}
	if activeBusinessType == BusinessTypeShop {
		return UserBusinessStateShopLocked
	}
	return UserBusinessStateClinicLocked
}

// CanTransition checks if a transition from one state to another is valid
func (sm *UserBusinessStateMachine) CanTransition(from, to UserBusinessState) bool {
	// State transition matrix:
	// shop_locked -> shop_locked (allowed), clinic_locked (not allowed), switchable_* (not allowed)
	// clinic_locked -> clinic_locked (allowed), shop_locked (not allowed), switchable_* (not allowed)
	// switchable_shop_active <-> switchable_clinic_active (both allowed)
	// switchable_* cannot go back to locked states

	switch from {
	case UserBusinessStateShopLocked:
		return to == UserBusinessStateShopLocked
	case UserBusinessStateClinicLocked:
		return to == UserBusinessStateClinicLocked
	case UserBusinessStateSwitchableShopActive:
		return to == UserBusinessStateSwitchableShopActive || to == UserBusinessStateSwitchableClinicActive
	case UserBusinessStateSwitchableClinicActive:
		return to == UserBusinessStateSwitchableClinicActive || to == UserBusinessStateSwitchableShopActive
	default:
		return false
	}
}

// ValidateSwitch validates if a user can switch to the target business type
func (sm *UserBusinessStateMachine) ValidateSwitch(canSwitch bool, target BusinessType, tenantType TenantType) error {
	if !canSwitch {
		return ErrSwitchNotAllowed
	}

	if tenantType != TenantTypeBoth {
		return ErrBusinessScopeForbidden
	}

	if target != BusinessTypeShop && target != BusinessTypeClinic {
		return ErrInvalidBusinessType
	}

	return nil
}

// SessionStateMachine defines valid state transitions for Session
type SessionStateMachine struct{}

// NewSessionStateMachine creates a new SessionStateMachine
func NewSessionStateMachine() *SessionStateMachine {
	return &SessionStateMachine{}
}

// CanTransition checks if a transition from one state to another is valid
func (sm *SessionStateMachine) CanTransition(from, to SessionStatus) bool {
	switch from {
	case SessionStatusMissing:
		return to == SessionStatusMissing || to == SessionStatusValid
	case SessionStatusValid:
		return to == SessionStatusValid || to == SessionStatusExpired || to == SessionStatusRevoked
	case SessionStatusExpired:
		return to == SessionStatusExpired
	case SessionStatusRevoked:
		return to == SessionStatusRevoked
	default:
		return false
	}
}
