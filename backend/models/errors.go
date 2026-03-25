package models

import "errors"

// Common errors for state machine validations
var (
	ErrInvalidStateTransition = errors.New("invalid state transition")
	ErrSwitchNotAllowed       = errors.New("switch not allowed for this account")
	ErrBusinessScopeForbidden = errors.New("business scope is not available for current tenant or user")
	ErrInvalidBusinessType    = errors.New("invalid business type")
	ErrSessionExpired         = errors.New("session is expired")
	ErrSessionRevoked         = errors.New("session has been revoked")
	ErrAccountSuspended       = errors.New("tenant account is suspended")
	ErrInvalidCredentials     = errors.New("email or password is incorrect")
	ErrInvalidRequest         = errors.New("invalid request")
)
