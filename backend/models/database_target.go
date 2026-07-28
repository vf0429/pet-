package models

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

type DatabaseDriver string

const (
	DatabaseDriverPostgres DatabaseDriver = "postgres"
	DatabaseDriverSQLite   DatabaseDriver = "sqlite"
)

type DatabaseTargetStatus string

const (
	DatabaseTargetStatusActive   DatabaseTargetStatus = "active"
	DatabaseTargetStatusInactive DatabaseTargetStatus = "inactive"
)

var ErrInvalidDatabaseTarget = errors.New("invalid database target")

// DatabaseTarget is the control-plane registry entry that maps a logical
// database_key to a real DSN source.
type DatabaseTarget struct {
	ID          uint                 `gorm:"primaryKey" json:"id"`
	DatabaseKey string               `gorm:"size:128;not null;uniqueIndex" json:"database_key"`
	Driver      DatabaseDriver       `gorm:"size:16;not null" json:"driver"`
	DSNEnvVar   string               `gorm:"size:128;not null" json:"dsn_env_var"`
	Status      DatabaseTargetStatus `gorm:"size:16;not null;default:'active';index" json:"status"`
	CreatedAt   time.Time            `json:"created_at"`
	UpdatedAt   time.Time            `json:"updated_at"`
}

func (DatabaseTarget) TableName() string {
	return "database_targets"
}

func (t DatabaseTarget) IsActive() bool {
	return t.Status == DatabaseTargetStatusActive
}

func (t DatabaseTarget) Validate() error {
	if strings.TrimSpace(t.DatabaseKey) == "" {
		return fmt.Errorf("%w: database_key is required", ErrInvalidDatabaseTarget)
	}
	if !t.Driver.IsValid() {
		return fmt.Errorf("%w: unsupported driver %q", ErrInvalidDatabaseTarget, t.Driver)
	}
	if strings.TrimSpace(t.DSNEnvVar) == "" {
		return fmt.Errorf("%w: dsn_env_var is required", ErrInvalidDatabaseTarget)
	}
	if t.Status != DatabaseTargetStatusActive && t.Status != DatabaseTargetStatusInactive {
		return fmt.Errorf("%w: unsupported status %q", ErrInvalidDatabaseTarget, t.Status)
	}
	return nil
}

func (d DatabaseDriver) IsValid() bool {
	switch d {
	case DatabaseDriverPostgres, DatabaseDriverSQLite:
		return true
	default:
		return false
	}
}
