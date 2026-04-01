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
// Standard full flow:
//
//	in_progress -> diagnosed -> treated -> prescription_done -> closed
//
// Early-close shortcuts (for simple visits, vaccinations, etc.):
//
//	in_progress       -> closed              (e.g. vaccination / trivial check)
//	diagnosed         -> closed              (skip treatment + prescription)
//	treated           -> closed              (skip prescription)
//	prescription_done -> closed
//	closed            -> (terminal, no transitions)
func (sm *ClinicVisitStateMachine) CanTransition(from, to ClinicVisitStatus) bool {
	switch from {
	case ClinicVisitStatusInProgress:
		return to == ClinicVisitStatusDiagnosed ||
			to == ClinicVisitStatusClosed
	case ClinicVisitStatusDiagnosed:
		return to == ClinicVisitStatusTreated ||
			to == ClinicVisitStatusClosed
	case ClinicVisitStatusTreated:
		return to == ClinicVisitStatusPrescriptionDone ||
			to == ClinicVisitStatusClosed
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
