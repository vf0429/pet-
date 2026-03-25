/**
 * API Client for PetWell Merchant Portal
 * Base path: /merchant
 * All protected endpoints require X-Session-ID and X-Business-Type headers
 */

const API_BASE_PATH = '/merchant'

// Types
export type BusinessType = 'shop' | 'clinic'
export type UserRole = 'owner' | 'manager' | 'staff' | 'doctor' | 'frontdesk'
export type TenantType = 'shop' | 'clinic' | 'both'
export type TenantStatus = 'active' | 'suspended'
export type LoginStatus =
  | 'idle'
  | 'submitting'
  | 'success'
  | 'error_invalid_credentials'
  | 'error_account_suspended'
  | 'error_network'

// DTOs from backend (snake_case)
export interface LoginRequestDTO {
  email: string
  password: string
}

export interface UserDTO {
  id: number
  name: string
  email: string
  role: UserRole
  can_switch: boolean
  active_business_type: BusinessType
}

export interface TenantDTO {
  id: number
  name: string
  type: TenantType
  status: TenantStatus
}

export interface LoginResponseDTO {
  session_id: string
  expires_at: string
  user: UserDTO
  tenant: TenantDTO
}

export interface MeResponseDTO {
  session_id: string
  expires_at: string
  user: UserDTO
  tenant: TenantDTO
}

export interface SwitchBusinessRequestDTO {
  business_type: BusinessType
}

export interface SwitchBusinessResponseDTO {
  active_business_type: BusinessType
}

export interface ApiErrorDTO {
  error: string
  message: string
  request_id?: string
}

// Internal error handling
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public requestId?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Helper to check if object is ApiErrorDTO
function isApiErrorDTO(obj: unknown): obj is ApiErrorDTO {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'error' in obj &&
    'message' in obj
  )
}

// Get session ID from cookie (client-side)
export function getSessionIdFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/session_id=([^;]+)/)
  return match ? match[1] : null
}

// Set session cookie (client-side)
export function setSessionCookie(sessionId: string, expiresAt: string): void {
  if (typeof document === 'undefined') return
  const expires = new Date(expiresAt)
  document.cookie = `session_id=${sessionId}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`
}

// Clear session cookie
export function clearSessionCookie(): void {
  if (typeof document === 'undefined') return
  document.cookie = 'session_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
}

// Generic fetch wrapper with error handling
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_PATH}${endpoint}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  // Add session ID from cookie if available
  const sessionId = getSessionIdFromCookie()
  if (sessionId) {
    headers['X-Session-ID'] = sessionId
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  const data = await response.json()

  if (!response.ok) {
    if (isApiErrorDTO(data)) {
      throw new ApiError(data.error, data.message, data.request_id)
    }
    throw new ApiError('internal_error', 'Unexpected server error')
  }

  return data as T
}

// API functions
export async function login(
  email: string,
  password: string
): Promise<LoginResponseDTO> {
  const response = await apiFetch<LoginResponseDTO>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return response
}

export async function getMe(
  businessType: BusinessType
): Promise<MeResponseDTO> {
  const response = await apiFetch<MeResponseDTO>('/me', {
    method: 'GET',
    headers: {
      'X-Business-Type': businessType,
    },
  })
  return response
}

export async function switchBusiness(
  businessType: BusinessType
): Promise<SwitchBusinessResponseDTO> {
  const response = await apiFetch<SwitchBusinessResponseDTO>('/me/switch', {
    method: 'PATCH',
    headers: {
      'X-Business-Type': businessType,
    },
    body: JSON.stringify({ business_type: businessType }),
  })
  return response
}

// Helper to convert snake_case DTO to camelCase
export function toUserVM(dto: UserDTO): {
  id: number
  name: string
  email: string
  role: UserRole
  canSwitch: boolean
  activeBusinessType: BusinessType
} {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    role: dto.role,
    canSwitch: dto.can_switch,
    activeBusinessType: dto.active_business_type,
  }
}

export function toTenantVM(dto: TenantDTO): {
  id: number
  name: string
  type: TenantType
  status: TenantStatus
} {
  return {
    id: dto.id,
    name: dto.name,
    type: dto.type,
    status: dto.status,
  }
}
