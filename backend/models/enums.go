package models

// ValidBusinessTypes returns all valid business types
func ValidBusinessTypes() []BusinessType {
	return []BusinessType{BusinessTypeShop, BusinessTypeClinic}
}

// IsValidBusinessType checks if a string is a valid business type
func IsValidBusinessType(bt string) bool {
	return bt == string(BusinessTypeShop) || bt == string(BusinessTypeClinic)
}

// ValidTenantTypes returns all valid tenant types
func ValidTenantTypes() []TenantType {
	return []TenantType{TenantTypeShop, TenantTypeClinic, TenantTypeBoth}
}

// ValidUserRoles returns all valid user roles
func ValidUserRoles() []UserRole {
	return []UserRole{UserRoleOwner, UserRoleManager, UserRoleStaff, UserRoleDoctor, UserRoleFrontdesk}
}
