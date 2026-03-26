package models

import "errors"

// Visit state machine errors
var (
	ErrInvalidVisitStatus           = errors.New("invalid visit status")
	ErrIllegalVisitStatusTransition = errors.New("illegal visit status transition")
)

// ClinicVisitStateMachine defines valid state transitions for clinic visits
type ClinicVisitStateMachine struct{}

// NewClinicVisitStateMachine creates a new ClinicVisitStateMachine
func NewClinicVisitStateMachine() *ClinicVisitStateMachine {
	return &ClinicVisitStateMachine{}
}

// CanTransition checks if a visit status transition is valid.
//
//	in_progress       -> diagnosed
//	diagnosed         -> treated
//	treated           -> prescription_done
//	prescription_done -> closed
//	closed            -> (terminal, no transitions)
func (sm *ClinicVisitStateMachine) CanTransition(from, to ClinicVisitStatus) bool {
	switch from {
	case ClinicVisitStatusInProgress:
		return to == ClinicVisitStatusDiagnosed
	case ClinicVisitStatusDiagnosed:
		return to == ClinicVisitStatusTreated
	case ClinicVisitStatusTreated:
		return to == ClinicVisitStatusPrescriptionDone
	case ClinicVisitStatusPrescriptionDone:
		return to == ClinicVisitStatusClosed
	case ClinicVisitStatusClosed:
		return false
	default:
		return false
	}
}

// ValidateTransition validates a visit status transition
func (sm *ClinicVisitStateMachine) ValidateTransition(from, to ClinicVisitStatus) error {
	if !IsValidClinicVisitStatus(string(from)) {
		return ErrInvalidVisitStatus
	}
	if !IsValidClinicVisitStatus(string(to)) {
		return ErrInvalidVisitStatus
	}
	if !sm.CanTransition(from, to) {
		return ErrIllegalVisitStatusTransition
	}
	return nil
}
