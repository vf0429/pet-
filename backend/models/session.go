package models

import "time"

// SessionStatus represents the logical status of a session
type SessionStatus string

const (
	SessionStatusValid   SessionStatus = "valid"
	SessionStatusExpired SessionStatus = "expired"
	SessionStatusRevoked SessionStatus = "revoked"
	SessionStatusMissing SessionStatus = "missing"
)

// MerchantSession represents a user session in the merchant system
type MerchantSession struct {
	ID        string     `gorm:"primaryKey;size:36" json:"id"` // UUID v4
	UserID    uint       `gorm:"not null;index" json:"user_id"`
	TenantID  uint       `gorm:"not null;index" json:"tenant_id"`
	ExpiresAt time.Time  `gorm:"not null;index" json:"expires_at"`
	RevokedAt *time.Time `gorm:"index" json:"revoked_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`

	User   MerchantUser `gorm:"foreignKey:UserID"`
	Tenant Tenant       `gorm:"foreignKey:TenantID"`
}

// TableName returns the table name for MerchantSession
func (MerchantSession) TableName() string {
	return "merchant_sessions"
}

// GetStatus returns the logical status of the session
func (s *MerchantSession) GetStatus() SessionStatus {
	now := time.Now()
	if s.RevokedAt != nil {
		return SessionStatusRevoked
	}
	if now.After(s.ExpiresAt) {
		return SessionStatusExpired
	}
	return SessionStatusValid
}

// IsValid checks if the session is valid
func (s *MerchantSession) IsValid() bool {
	return s.GetStatus() == SessionStatusValid
}
