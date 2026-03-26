package models

import "errors"

// Order state machine errors
var (
	ErrInvalidOrderStatus           = errors.New("invalid order status")
	ErrIllegalOrderStatusTransition = errors.New("illegal order status transition")
	ErrMissingTrackingNumber        = errors.New("tracking_number is required when status=shipped")
	ErrMissingCancelReason          = errors.New("cancel_reason is required when status=cancelled")
)

// ShopOrderStateMachine defines valid state transitions for shop orders
type ShopOrderStateMachine struct{}

// NewShopOrderStateMachine creates a new ShopOrderStateMachine
func NewShopOrderStateMachine() *ShopOrderStateMachine {
	return &ShopOrderStateMachine{}
}

// CanTransitionMerchant checks if a merchant-initiated transition is valid.
// This implements the "商家端 PATCH 接口可执行流转矩阵".
// target_status allowed: preparing, shipped, completed, cancelled (NOT paid).
func (sm *ShopOrderStateMachine) CanTransitionMerchant(from, to ShopOrderStatus) bool {
	switch from {
	case ShopOrderStatusPending:
		// pending -> cancelled only
		return to == ShopOrderStatusCancelled
	case ShopOrderStatusPaid:
		// paid -> preparing, cancelled
		return to == ShopOrderStatusPreparing || to == ShopOrderStatusCancelled
	case ShopOrderStatusPreparing:
		// preparing -> shipped, cancelled
		return to == ShopOrderStatusShipped || to == ShopOrderStatusCancelled
	case ShopOrderStatusShipped:
		// shipped -> completed only
		return to == ShopOrderStatusCompleted
	case ShopOrderStatusCompleted:
		// completed is terminal
		return false
	case ShopOrderStatusCancelled:
		// cancelled is terminal
		return false
	default:
		return false
	}
}

// ValidateTransition validates a merchant-initiated status transition
func (sm *ShopOrderStateMachine) ValidateTransition(from, to ShopOrderStatus) error {
	if !IsValidShopOrderStatus(string(from)) {
		return ErrInvalidOrderStatus
	}
	if !IsValidShopOrderStatus(string(to)) {
		return ErrInvalidOrderStatus
	}
	if !sm.CanTransitionMerchant(from, to) {
		return ErrIllegalOrderStatusTransition
	}
	return nil
}

// ReasonForTransition returns the reason string for a given transition
func (sm *ShopOrderStateMachine) ReasonForTransition(to ShopOrderStatus) string {
	switch to {
	case ShopOrderStatusPreparing:
		return "merchant_confirmed"
	case ShopOrderStatusShipped:
		return "merchant_shipped"
	case ShopOrderStatusCompleted:
		return "merchant_completed"
	case ShopOrderStatusCancelled:
		return "merchant_cancelled"
	default:
		return "unknown"
	}
}
