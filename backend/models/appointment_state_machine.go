package models

import "errors"

// Appointment state machine errors
var (
	ErrInvalidAppointmentStatus           = errors.New("invalid appointment status")
	ErrIllegalAppointmentStatusTransition = errors.New("illegal appointment status transition")
	ErrMissingAppointmentCancelReason     = errors.New("cancel_reason is required when status=cancelled")
)

// ClinicAppointmentStateMachine defines valid state transitions for clinic appointments
type ClinicAppointmentStateMachine struct{}

// NewClinicAppointmentStateMachine creates a new ClinicAppointmentStateMachine
func NewClinicAppointmentStateMachine() *ClinicAppointmentStateMachine {
	return &ClinicAppointmentStateMachine{}
}

// CanTransition checks if a merchant-initiated transition is valid.
// Implements the merchant-side PATCH transition matrix.
//
//	pending    -> confirmed | cancelled
//	confirmed  -> checked_in | cancelled
//	checked_in -> in_progress | cancelled
//	in_progress -> completed | cancelled
//	completed  -> (terminal, no transitions)
//	cancelled  -> (terminal, no transitions)
func (sm *ClinicAppointmentStateMachine) CanTransition(from, to ClinicAppointmentStatus) bool {
	switch from {
	case ClinicAppointmentStatusPending:
		return to == ClinicAppointmentStatusConfirmed || to == ClinicAppointmentStatusCancelled
	case ClinicAppointmentStatusConfirmed:
		return to == ClinicAppointmentStatusCheckedIn || to == ClinicAppointmentStatusCancelled
	case ClinicAppointmentStatusCheckedIn:
		return to == ClinicAppointmentStatusInProgress || to == ClinicAppointmentStatusCancelled
	case ClinicAppointmentStatusInProgress:
		return to == ClinicAppointmentStatusCompleted || to == ClinicAppointmentStatusCancelled
	case ClinicAppointmentStatusCompleted:
		return false
	case ClinicAppointmentStatusCancelled:
		return false
	default:
		return false
	}
}

// ValidateTransition validates a merchant-initiated appointment status transition
func (sm *ClinicAppointmentStateMachine) ValidateTransition(from, to ClinicAppointmentStatus) error {
	if !IsValidClinicAppointmentStatus(string(from)) {
		return ErrInvalidAppointmentStatus
	}
	if !IsValidClinicAppointmentStatus(string(to)) {
		return ErrInvalidAppointmentStatus
	}
	if !sm.CanTransition(from, to) {
		return ErrIllegalAppointmentStatusTransition
	}
	return nil
}
