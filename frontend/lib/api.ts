/**
 * API Client for PetWell Merchant Portal
 * Base path: /v1/merchant
 * All protected endpoints require X-Session-ID and X-Business-Type headers
 */

import { getPreferredLocale, translate } from '@/lib/i18n'

const API_BASE_PATH = '/api/v1/merchant'

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

export interface ApiEnvelopeErrorDTO {
  code: number
  message: string
  data?: unknown
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

function isApiEnvelopeErrorDTO(obj: unknown): obj is ApiEnvelopeErrorDTO {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'code' in obj &&
    typeof (obj as { code?: unknown }).code === 'number' &&
    'message' in obj &&
    typeof (obj as { message?: unknown }).message === 'string'
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
    if (isApiEnvelopeErrorDTO(data)) {
      throw new ApiError(String(data.code), data.message)
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

// ============================================
// Phase 2: Shop API Types and Functions
// ============================================

// Envelope wrapper for Phase 2 APIs
export interface ApiEnvelopeDTO<T> {
  code: number
  data: T
  message: string
}

// Shop Order Status
export type ShopOrderStatus =
  | 'pending'
  | 'paid'
  | 'preparing'
  | 'shipped'
  | 'completed'
  | 'cancelled'

// Shop Order Status for PATCH action (商家可操作的状态)
export type ShopOrderStatusAction = 'preparing' | 'shipped' | 'completed' | 'cancelled'

// ----- DTOs -----

// Shop Stats
export interface ShopStatsDTO {
  today_orders: number
  today_orders_delta_pct: number
  today_revenue: number
  today_revenue_delta_pct: number
  pending_shipment_count: number
  low_stock_count: number
  recent_orders_limit: number
  currency: string
}

// Shop Order Item
export interface ShopOrderItemDTO {
  id: number
  product_id: number | null
  product_name: string
  product_image_url: string
  sku: string
  quantity: number
  unit_price: number
  line_total: number
}

// Shop Order Status Timeline
export interface ShopOrderStatusLogDTO {
  from_status: ShopOrderStatus
  to_status: ShopOrderStatus
  changed_by_user_id: number | null
  changed_by_name: string
  reason: string
  changed_at: string
}

// Shop Order (list item)
export interface ShopOrderDTO {
  id: number
  order_no: string
  customer_name: string
  customer_phone: string
  pet_name: string
  items_summary: string
  subtotal_amount?: number
  delivery_fee?: number
  total_amount: number
  currency: string
  status: ShopOrderStatus
  tracking_number: string
  cancel_reason: string
  placed_at: string
  updated_at: string
}

// Shop Order Detail (full)
export interface ShopOrderDetailDTO extends ShopOrderDTO {
  subtotal_amount: number
  delivery_fee: number
  total_amount: number
  notes: string
  items: ShopOrderItemDTO[]
  status_timeline: ShopOrderStatusLogDTO[]
  available_actions: ShopOrderStatusAction[]
}

// Shop Product
export interface ShopProductDTO {
  id: number
  sku: string
  name: string
  category: string
  price: number
  stock_level: number
  low_stock_threshold: number
  is_low_stock: boolean
  is_active: boolean
  image_url: string
  created_at: string
  updated_at: string
}

// Inventory Alert
export interface InventoryAlertDTO {
  id: number
  sku: string
  name: string
  category: string
  stock_level: number
  low_stock_threshold: number
  shortage_count: number
  image_url: string
}

// ----- API Response Wrappers -----

export interface ShopStatsResponseDTO extends ApiEnvelopeDTO<ShopStatsDTO> {}

export interface ShopOrdersResponseDTO extends ApiEnvelopeDTO<{
  orders: ShopOrderDTO[]
  total: number
  page: number
  per_page: number
  has_more: boolean
  filters: {
    status: string
    search: string
    date_from: string
    date_to: string
  }
}> {}

export interface ShopOrderDetailResponseDTO extends ApiEnvelopeDTO<ShopOrderDetailDTO> {}

export interface UpdateOrderStatusRequestDTO {
  target_status: ShopOrderStatusAction
  tracking_number?: string
  cancel_reason?: string
  note?: string
}

export interface UpdateOrderStatusResponseDTO extends ApiEnvelopeDTO<{
  id: number
  order_no: string
  previous_status: ShopOrderStatus
  current_status: ShopOrderStatus
  tracking_number: string
  cancel_reason: string
  sync_queue: {
    id: number
    entity_type: string
    entity_id: string
    action: string
    status: string
  } | null
  updated_at: string
}> {}

export interface ShopProductsResponseDTO extends ApiEnvelopeDTO<{
  products: ShopProductDTO[]
  total: number
  page: number
  per_page: number
  categories: string[]
}> {}

export interface InventoryAlertsResponseDTO extends ApiEnvelopeDTO<{
  alerts: InventoryAlertDTO[]
  total: number
}> {}

// ----- VM Types (camelCase for frontend use) -----

export interface ShopStatsVM {
  todayOrders: number
  todayOrdersDeltaPct: number
  todayRevenue: number
  todayRevenueDeltaPct: number
  pendingShipmentCount: number
  lowStockCount: number
  recentOrdersLimit: number
  currency: string
}

export interface ShopOrderItemVM {
  id: number
  productId: number | null
  productName: string
  productImageUrl: string
  sku: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface ShopOrderStatusLogVM {
  fromStatus: ShopOrderStatus
  toStatus: ShopOrderStatus
  changedByUserId: number | null
  changedByName: string
  reason: string
  changedAt: string
}

export interface ShopOrderVM {
  id: number
  orderNo: string
  customerName: string
  customerPhone: string
  petName: string
  itemsSummary: string
  subtotalAmount: number
  deliveryFee: number
  totalAmount: number
  currency: string
  status: ShopOrderStatus
  trackingNumber: string
  cancelReason: string
  placedAt: string
  updatedAt: string
  notes?: string
  items?: ShopOrderItemVM[]
  statusTimeline?: ShopOrderStatusLogVM[]
  availableActions?: ShopOrderStatusAction[]
}

export interface ShopProductVM {
  id: number
  sku: string
  name: string
  category: string
  price: number
  stockLevel: number
  lowStockThreshold: number
  isLowStock: boolean
  isActive: boolean
  imageUrl: string
  createdAt: string
  updatedAt: string
}

export interface InventoryAlertVM {
  id: number
  sku: string
  name: string
  category: string
  stockLevel: number
  lowStockThreshold: number
  shortageCount: number
  imageUrl: string
}

export interface ShopOrdersFiltersVM {
  status: string
  search: string
  dateFrom: string
  dateTo: string
}

export interface ShopOrdersResponseVM {
  orders: ShopOrderVM[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
  filters: ShopOrdersFiltersVM
}

// ----- DTO to VM converters -----

export function toShopStatsVM(dto: ShopStatsDTO): ShopStatsVM {
  return {
    todayOrders: dto.today_orders,
    todayOrdersDeltaPct: dto.today_orders_delta_pct,
    todayRevenue: dto.today_revenue,
    todayRevenueDeltaPct: dto.today_revenue_delta_pct,
    pendingShipmentCount: dto.pending_shipment_count,
    lowStockCount: dto.low_stock_count,
    recentOrdersLimit: dto.recent_orders_limit,
    currency: dto.currency,
  }
}

export function toShopOrderItemVM(dto: ShopOrderItemDTO): ShopOrderItemVM {
  return {
    id: dto.id,
    productId: dto.product_id,
    productName: dto.product_name,
    productImageUrl: dto.product_image_url,
    sku: dto.sku,
    quantity: dto.quantity,
    unitPrice: dto.unit_price,
    lineTotal: dto.line_total,
  }
}

export function toShopOrderStatusLogVM(dto: ShopOrderStatusLogDTO): ShopOrderStatusLogVM {
  return {
    fromStatus: dto.from_status,
    toStatus: dto.to_status,
    changedByUserId: dto.changed_by_user_id,
    changedByName: dto.changed_by_name,
    reason: dto.reason,
    changedAt: dto.changed_at,
  }
}

export function toShopOrderVM(dto: ShopOrderDTO): ShopOrderVM {
  return {
    id: dto.id,
    orderNo: dto.order_no,
    customerName: dto.customer_name,
    customerPhone: dto.customer_phone,
    petName: dto.pet_name,
    itemsSummary: dto.items_summary,
    subtotalAmount: dto.subtotal_amount ?? 0,
    deliveryFee: dto.delivery_fee ?? 0,
    totalAmount: dto.total_amount,
    currency: dto.currency,
    status: dto.status,
    trackingNumber: dto.tracking_number,
    cancelReason: dto.cancel_reason,
    placedAt: dto.placed_at,
    updatedAt: dto.updated_at,
  }
}

export function toShopOrderDetailVM(dto: ShopOrderDetailDTO): ShopOrderVM {
  return {
    ...toShopOrderVM(dto),
    notes: dto.notes,
    items: dto.items.map(toShopOrderItemVM),
    statusTimeline: dto.status_timeline.map(toShopOrderStatusLogVM),
    availableActions: dto.available_actions,
  }
}

export function toShopProductVM(dto: ShopProductDTO): ShopProductVM {
  return {
    id: dto.id,
    sku: dto.sku,
    name: dto.name,
    category: dto.category,
    price: dto.price,
    stockLevel: dto.stock_level,
    lowStockThreshold: dto.low_stock_threshold,
    isLowStock: dto.is_low_stock,
    isActive: dto.is_active,
    imageUrl: dto.image_url,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}

export function toInventoryAlertVM(dto: InventoryAlertDTO): InventoryAlertVM {
  return {
    id: dto.id,
    sku: dto.sku,
    name: dto.name,
    category: dto.category,
    stockLevel: dto.stock_level,
    lowStockThreshold: dto.low_stock_threshold,
    shortageCount: dto.shortage_count,
    imageUrl: dto.image_url,
  }
}

export function toShopOrdersResponseVM(dto: ShopOrdersResponseDTO['data']): ShopOrdersResponseVM {
  return {
    orders: dto.orders.map(toShopOrderVM),
    total: dto.total,
    page: dto.page,
    perPage: dto.per_page,
    hasMore: dto.has_more,
    filters: {
      status: dto.filters.status,
      search: dto.filters.search,
      dateFrom: dto.filters.date_from,
      dateTo: dto.filters.date_to,
    },
  }
}

// ----- Shop API Functions -----

export async function getShopStats(): Promise<ShopStatsVM> {
  const response = await apiFetch<ShopStatsResponseDTO>('/shop/stats', {
    method: 'GET',
    headers: {
      'X-Business-Type': 'shop',
    },
  })
  return toShopStatsVM(response.data)
}

export interface GetShopOrdersParams {
  status?: ShopOrderStatus
  search?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  perPage?: number
}

export async function getShopOrders(params: GetShopOrdersParams = {}): Promise<ShopOrdersResponseVM> {
  const searchParams = new URLSearchParams()
  if (params.status) searchParams.set('status', params.status)
  if (params.search) searchParams.set('search', params.search)
  if (params.dateFrom) searchParams.set('date_from', params.dateFrom)
  if (params.dateTo) searchParams.set('date_to', params.dateTo)
  if (params.page) searchParams.set('page', String(params.page))
  if (params.perPage) searchParams.set('per_page', String(params.perPage))

  const query = searchParams.toString()
  const endpoint = `/shop/orders${query ? `?${query}` : ''}`

  const response = await apiFetch<ShopOrdersResponseDTO>(endpoint, {
    method: 'GET',
    headers: {
      'X-Business-Type': 'shop',
    },
  })
  return toShopOrdersResponseVM(response.data)
}

export async function getShopOrderDetail(id: number): Promise<ShopOrderVM> {
  const response = await apiFetch<ShopOrderDetailResponseDTO>(`/shop/orders/${id}`, {
    method: 'GET',
    headers: {
      'X-Business-Type': 'shop',
    },
  })
  return toShopOrderDetailVM(response.data)
}

export interface UpdateOrderStatusParams {
  targetStatus: ShopOrderStatusAction
  trackingNumber?: string
  cancelReason?: string
  note?: string
}

export async function updateOrderStatus(
  id: number,
  params: UpdateOrderStatusParams
): Promise<UpdateOrderStatusResponseDTO['data']> {
  const body: UpdateOrderStatusRequestDTO = {
    target_status: params.targetStatus,
  }
  if (params.trackingNumber) body.tracking_number = params.trackingNumber
  if (params.cancelReason) body.cancel_reason = params.cancelReason
  if (params.note) body.note = params.note

  const response = await apiFetch<UpdateOrderStatusResponseDTO>(`/shop/orders/${id}/status`, {
    method: 'PATCH',
    headers: {
      'X-Business-Type': 'shop',
    },
    body: JSON.stringify(body),
  })
  return response.data
}

export interface GetShopProductsParams {
  search?: string
  category?: string
  isActive?: boolean
  lowStockOnly?: boolean
  page?: number
  perPage?: number
}

export async function getShopProducts(params: GetShopProductsParams = {}): Promise<ShopProductsResponseDTO['data']> {
  const searchParams = new URLSearchParams()
  if (params.search) searchParams.set('search', params.search)
  if (params.category) searchParams.set('category', params.category)
  if (params.isActive !== undefined) searchParams.set('is_active', String(params.isActive))
  if (params.lowStockOnly) searchParams.set('low_stock_only', 'true')
  if (params.page) searchParams.set('page', String(params.page))
  if (params.perPage) searchParams.set('per_page', String(params.perPage))

  const query = searchParams.toString()
  const endpoint = `/shop/products${query ? `?${query}` : ''}`

  const response = await apiFetch<ShopProductsResponseDTO>(endpoint, {
    method: 'GET',
    headers: {
      'X-Business-Type': 'shop',
    },
  })
  return response.data
}

export async function getInventoryAlerts(limit: number = 20): Promise<InventoryAlertVM[]> {
  const response = await apiFetch<InventoryAlertsResponseDTO>(
    `/shop/inventory/alerts?limit=${limit}`,
    {
      method: 'GET',
      headers: {
        'X-Business-Type': 'shop',
      },
    }
  )
  return response.data.alerts.map(toInventoryAlertVM)
}

// ============================================
// Phase 3: Clinic API Types and Functions
// ============================================

// ----- Clinic Enums -----

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type VisitStatus =
  | 'in_progress'
  | 'diagnosed'
  | 'treated'
  | 'prescription_done'
  | 'closed'

export type FollowupStatus = 'pending' | 'done' | 'skipped'

export type VisitType =
  | 'vaccine'
  | 'checkup'
  | 'surgery'
  | 'emergency'
  | 'dental'
  | 'followup'

export type StorageCondition = 'refrigerated' | 'room_temp' | 'light_protected'

// ----- Clinic DTOs -----

export interface ClinicSyncStatusDTO {
  pending_count: number
  failed_count: number
  last_synced_at: string | null
}

export interface TodayAppointmentDTO {
  id: number
  scheduled_at: string
  pet_name: string
  pet_owner_name: string
  visit_type: VisitType
  doctor_id: number
  doctor_name: string
  status: AppointmentStatus
}

export interface ClinicStatsDTO {
  today_appointments: number
  today_appointments_delta: number
  in_progress_visits: number
  pending_followups_overdue: number
  new_patients_this_month: number
  today_appointment_list: TodayAppointmentDTO[]
  sync_status: ClinicSyncStatusDTO
}

export interface ClinicAppointmentDTO {
  id: number
  pet_name: string
  pet_owner_name: string
  pet_owner_phone: string
  visit_type: VisitType
  doctor_id: number
  doctor_name: string
  scheduled_at: string
  status: AppointmentStatus
  cancel_reason: string
  notes: string
  created_at: string
  updated_at: string
}

export interface MatrixSlotDTO {
  time: string
  appointment_id: number | null
  pet_name: string | null
  visit_type: VisitType | null
  status: AppointmentStatus | 'available'
  duration_minutes: number
}

export interface MatrixDoctorDTO {
  doctor_id: number
  doctor_name: string
  slots: MatrixSlotDTO[]
}

export interface ClinicAppointmentsListResponseDTO extends ApiEnvelopeDTO<{
  view: 'list'
  appointments: ClinicAppointmentDTO[]
  total: number
  page: number
  per_page: number
  has_more: boolean
  filters: {
    status: string
    date: string
    doctor_id: number | null
  }
}> {}

export interface ClinicAppointmentsMatrixResponseDTO extends ApiEnvelopeDTO<{
  view: 'matrix'
  date: string
  time_slots: string[]
  doctors: MatrixDoctorDTO[]
}> {}

export interface UpdateAppointmentStatusRequestDTO {
  target_status: AppointmentStatus
  cancel_reason?: string
  note?: string
}

export interface UpdateAppointmentStatusResponseDTO extends ApiEnvelopeDTO<{
  id: number
  previous_status: AppointmentStatus
  current_status: AppointmentStatus
  cancel_reason: string
  visit_id: number | null
  sync_queue: {
    id: number
    entity_type: string
    entity_id: string
    action: string
    status: string
  } | null
  updated_at: string
}> {}

export interface DiagnosisDTO {
  id: number
  name: string
  is_primary: boolean
  notes: string
}

export interface PrescriptionDTO {
  id: number
  drug_name: string
  dosage: string
  frequency: string
  duration_days: number
  notes: string
}

export interface TreatmentDTO {
  id: number
  name: string
  performed_by_id: number
  performed_by_name: string
  fee: number
  currency: string
  notes: string
}

export interface VisitFollowupDTO {
  id: number
  reason: string
  doctor_id: number
  doctor_name: string
  due_at: string
  status: FollowupStatus
  result_note: string
}

export interface VisitFileDTO {
  id: number
  file_name: string
  file_url: string
  file_size: number
  file_type: string
  uploaded_at: string
}

export interface ClinicVisitDTO {
  id: number
  tenant_id: number
  appointment_id: number
  pet_name: string
  pet_breed: string
  pet_age: string
  pet_weight: number
  pet_medical_history: string
  chief_complaint: string
  temperature: number | null
  heart_rate: number | null
  respiratory_rate: number | null
  status: VisitStatus
  pushed_at: string | null
  created_at: string
  updated_at: string
  diagnoses: DiagnosisDTO[]
  prescriptions: PrescriptionDTO[]
  treatments: TreatmentDTO[]
  followups: VisitFollowupDTO[]
  files: VisitFileDTO[]
  general_medication_notes: string
  treatment_total_fee: number
  currency: string
}

export interface ClinicFollowupDTO {
  id: number
  visit_id: number
  pet_name: string
  pet_owner_name: string
  last_visit_date: string
  reason: string
  doctor_id: number
  doctor_name: string
  due_at: string
  status: FollowupStatus
  is_overdue: boolean
  result_note: string
  created_at: string
}

export interface PharmacyItemDTO {
  id: number
  name: string
  specification: string
  batch_no: string
  expires_at: string
  stock_level: number
  low_stock_threshold: number
  is_low_stock: boolean
  storage_condition: StorageCondition
  is_prescription_only: boolean
  is_expiring_soon: boolean
  is_expired: boolean
  days_until_expiry: number
  created_at: string
}

// ----- Clinic VM Types (camelCase) -----

export interface ClinicSyncStatusVM {
  pendingCount: number
  failedCount: number
  lastSyncedAt: string | null
}

export interface TodayAppointmentVM {
  id: number
  scheduledAt: string
  petName: string
  petOwnerName: string
  visitType: VisitType
  doctorId: number
  doctorName: string
  status: AppointmentStatus
}

export interface ClinicStatsVM {
  todayAppointments: number
  todayAppointmentsDelta: number
  inProgressVisits: number
  pendingFollowupsOverdue: number
  newPatientsThisMonth: number
  todayAppointmentList: TodayAppointmentVM[]
  syncStatus: ClinicSyncStatusVM
}

export interface ClinicAppointmentVM {
  id: number
  petName: string
  petOwnerName: string
  petOwnerPhone: string
  visitType: VisitType
  doctorId: number
  doctorName: string
  scheduledAt: string
  status: AppointmentStatus
  cancelReason: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface MatrixSlotVM {
  time: string
  appointmentId: number | null
  petName: string | null
  visitType: VisitType | null
  status: AppointmentStatus | 'available'
  durationMinutes: number
}

export interface MatrixDoctorVM {
  doctorId: number
  doctorName: string
  slots: MatrixSlotVM[]
}

export interface ClinicAppointmentsMatrixVM {
  view: 'matrix'
  date: string
  timeSlots: string[]
  doctors: MatrixDoctorVM[]
}

export interface DiagnosisVM {
  id: number
  name: string
  isPrimary: boolean
  notes: string
}

export interface PrescriptionVM {
  id: number
  drugName: string
  dosage: string
  frequency: string
  durationDays: number
  notes: string
}

export interface TreatmentVM {
  id: number
  name: string
  performedById: number
  performedByName: string
  fee: number
  currency: string
  notes: string
}

export interface VisitFollowupVM {
  id: number
  reason: string
  doctorId: number
  doctorName: string
  dueAt: string
  status: FollowupStatus
  resultNote: string
}

export interface VisitFileVM {
  id: number
  fileName: string
  fileUrl: string
  fileSize: number
  fileType: string
  uploadedAt: string
}

export interface ClinicVisitVM {
  id: number
  tenantId: number
  appointmentId: number
  petName: string
  petBreed: string
  petAge: string
  petWeight: number
  petMedicalHistory: string
  chiefComplaint: string
  temperature: number | null
  heartRate: number | null
  respiratoryRate: number | null
  status: VisitStatus
  pushedAt: string | null
  createdAt: string
  updatedAt: string
  diagnoses: DiagnosisVM[]
  prescriptions: PrescriptionVM[]
  treatments: TreatmentVM[]
  followups: VisitFollowupVM[]
  files: VisitFileVM[]
  generalMedicationNotes: string
  treatmentTotalFee: number
  currency: string
}

export interface ClinicFollowupVM {
  id: number
  visitId: number
  petName: string
  petOwnerName: string
  lastVisitDate: string
  reason: string
  doctorId: number
  doctorName: string
  dueAt: string
  status: FollowupStatus
  isOverdue: boolean
  resultNote: string
  createdAt: string
}

export interface PharmacyItemVM {
  id: number
  name: string
  specification: string
  batchNo: string
  expiresAt: string
  stockLevel: number
  lowStockThreshold: number
  isLowStock: boolean
  storageCondition: StorageCondition
  isPrescriptionOnly: boolean
  isExpiringSoon: boolean
  isExpired: boolean
  daysUntilExpiry: number
  createdAt: string
}

// ----- Clinic DTO to VM Converters -----

export function toClinicSyncStatusVM(dto: ClinicSyncStatusDTO): ClinicSyncStatusVM {
  return {
    pendingCount: dto.pending_count,
    failedCount: dto.failed_count,
    lastSyncedAt: dto.last_synced_at,
  }
}

export function toTodayAppointmentVM(dto: TodayAppointmentDTO): TodayAppointmentVM {
  return {
    id: dto.id,
    scheduledAt: dto.scheduled_at,
    petName: dto.pet_name,
    petOwnerName: dto.pet_owner_name,
    visitType: dto.visit_type,
    doctorId: dto.doctor_id,
    doctorName: dto.doctor_name,
    status: dto.status,
  }
}

export function toClinicStatsVM(dto: ClinicStatsDTO): ClinicStatsVM {
  return {
    todayAppointments: dto.today_appointments,
    todayAppointmentsDelta: dto.today_appointments_delta,
    inProgressVisits: dto.in_progress_visits,
    pendingFollowupsOverdue: dto.pending_followups_overdue,
    newPatientsThisMonth: dto.new_patients_this_month,
    todayAppointmentList: dto.today_appointment_list.map(toTodayAppointmentVM),
    syncStatus: toClinicSyncStatusVM(dto.sync_status),
  }
}

export function toClinicAppointmentVM(dto: ClinicAppointmentDTO): ClinicAppointmentVM {
  return {
    id: dto.id,
    petName: dto.pet_name,
    petOwnerName: dto.pet_owner_name,
    petOwnerPhone: dto.pet_owner_phone,
    visitType: dto.visit_type,
    doctorId: dto.doctor_id,
    doctorName: dto.doctor_name,
    scheduledAt: dto.scheduled_at,
    status: dto.status,
    cancelReason: dto.cancel_reason,
    notes: dto.notes,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}

export function toMatrixSlotVM(dto: MatrixSlotDTO): MatrixSlotVM {
  return {
    time: dto.time,
    appointmentId: dto.appointment_id,
    petName: dto.pet_name,
    visitType: dto.visit_type,
    status: dto.status,
    durationMinutes: dto.duration_minutes,
  }
}

export function toMatrixDoctorVM(dto: MatrixDoctorDTO): MatrixDoctorVM {
  return {
    doctorId: dto.doctor_id,
    doctorName: dto.doctor_name,
    slots: dto.slots.map(toMatrixSlotVM),
  }
}

export function toDiagnosisVM(dto: DiagnosisDTO): DiagnosisVM {
  return {
    id: dto.id,
    name: dto.name,
    isPrimary: dto.is_primary,
    notes: dto.notes,
  }
}

export function toPrescriptionVM(dto: PrescriptionDTO): PrescriptionVM {
  return {
    id: dto.id,
    drugName: dto.drug_name,
    dosage: dto.dosage,
    frequency: dto.frequency,
    durationDays: dto.duration_days,
    notes: dto.notes,
  }
}

export function toTreatmentVM(dto: TreatmentDTO): TreatmentVM {
  return {
    id: dto.id,
    name: dto.name,
    performedById: dto.performed_by_id,
    performedByName: dto.performed_by_name,
    fee: dto.fee,
    currency: dto.currency,
    notes: dto.notes,
  }
}

export function toVisitFollowupVM(dto: VisitFollowupDTO): VisitFollowupVM {
  return {
    id: dto.id,
    reason: dto.reason,
    doctorId: dto.doctor_id,
    doctorName: dto.doctor_name,
    dueAt: dto.due_at,
    status: dto.status,
    resultNote: dto.result_note,
  }
}

export function toVisitFileVM(dto: VisitFileDTO): VisitFileVM {
  return {
    id: dto.id,
    fileName: dto.file_name,
    fileUrl: dto.file_url,
    fileSize: dto.file_size,
    fileType: dto.file_type,
    uploadedAt: dto.uploaded_at,
  }
}

export function toClinicVisitVM(dto: ClinicVisitDTO): ClinicVisitVM {
  return {
    id: dto.id,
    tenantId: dto.tenant_id,
    appointmentId: dto.appointment_id,
    petName: dto.pet_name,
    petBreed: dto.pet_breed,
    petAge: dto.pet_age,
    petWeight: dto.pet_weight,
    petMedicalHistory: dto.pet_medical_history,
    chiefComplaint: dto.chief_complaint,
    temperature: dto.temperature,
    heartRate: dto.heart_rate,
    respiratoryRate: dto.respiratory_rate,
    status: dto.status,
    pushedAt: dto.pushed_at,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    diagnoses: dto.diagnoses.map(toDiagnosisVM),
    prescriptions: dto.prescriptions.map(toPrescriptionVM),
    treatments: dto.treatments.map(toTreatmentVM),
    followups: dto.followups.map(toVisitFollowupVM),
    files: dto.files.map(toVisitFileVM),
    generalMedicationNotes: dto.general_medication_notes,
    treatmentTotalFee: dto.treatment_total_fee,
    currency: dto.currency,
  }
}

export function toClinicFollowupVM(dto: ClinicFollowupDTO): ClinicFollowupVM {
  return {
    id: dto.id,
    visitId: dto.visit_id,
    petName: dto.pet_name,
    petOwnerName: dto.pet_owner_name,
    lastVisitDate: dto.last_visit_date,
    reason: dto.reason,
    doctorId: dto.doctor_id,
    doctorName: dto.doctor_name,
    dueAt: dto.due_at,
    status: dto.status,
    isOverdue: dto.is_overdue,
    resultNote: dto.result_note,
    createdAt: dto.created_at,
  }
}

export function toPharmacyItemVM(dto: PharmacyItemDTO): PharmacyItemVM {
  return {
    id: dto.id,
    name: dto.name,
    specification: dto.specification,
    batchNo: dto.batch_no,
    expiresAt: dto.expires_at,
    stockLevel: dto.stock_level,
    lowStockThreshold: dto.low_stock_threshold,
    isLowStock: dto.is_low_stock,
    storageCondition: dto.storage_condition,
    isPrescriptionOnly: dto.is_prescription_only,
    isExpiringSoon: dto.is_expiring_soon,
    isExpired: dto.is_expired,
    daysUntilExpiry: dto.days_until_expiry,
    createdAt: dto.created_at,
  }
}

// ----- Clinic API Functions -----

export async function getClinicStats(): Promise<ClinicStatsVM> {
  const response = await apiFetch<ApiEnvelopeDTO<ClinicStatsDTO>>('/clinic/stats', {
    method: 'GET',
    headers: { 'X-Business-Type': 'clinic' },
  })
  return toClinicStatsVM(response.data)
}

export interface GetClinicAppointmentsParams {
  view?: 'list' | 'matrix'
  status?: AppointmentStatus
  date?: string
  doctorId?: number
  page?: number
  perPage?: number
}

export async function getClinicAppointments(
  params: GetClinicAppointmentsParams = {}
): Promise<ClinicAppointmentsListResponseDTO['data'] | ClinicAppointmentsMatrixResponseDTO['data']> {
  const searchParams = new URLSearchParams()
  if (params.view) searchParams.set('view', params.view)
  if (params.status) searchParams.set('status', params.status)
  if (params.date) searchParams.set('date', params.date)
  if (params.doctorId) searchParams.set('doctor_id', String(params.doctorId))
  if (params.page) searchParams.set('page', String(params.page))
  if (params.perPage) searchParams.set('per_page', String(params.perPage))

  const query = searchParams.toString()
  const endpoint = `/clinic/appointments${query ? `?${query}` : ''}`

  const response = await apiFetch<ClinicAppointmentsListResponseDTO | ClinicAppointmentsMatrixResponseDTO>(endpoint, {
    method: 'GET',
    headers: { 'X-Business-Type': 'clinic' },
  })
  return response.data
}

export interface UpdateAppointmentStatusParams {
  targetStatus: AppointmentStatus
  cancelReason?: string
  note?: string
}

export async function updateAppointmentStatus(
  id: number,
  params: UpdateAppointmentStatusParams
): Promise<UpdateAppointmentStatusResponseDTO['data']> {
  const body: UpdateAppointmentStatusRequestDTO = {
    target_status: params.targetStatus,
  }
  if (params.cancelReason) body.cancel_reason = params.cancelReason
  if (params.note) body.note = params.note

  const response = await apiFetch<UpdateAppointmentStatusResponseDTO>(
    `/clinic/appointments/${id}/status`,
    {
      method: 'PATCH',
      headers: { 'X-Business-Type': 'clinic' },
      body: JSON.stringify(body),
    }
  )
  return response.data
}

export async function getClinicVisit(id: number): Promise<ClinicVisitVM> {
  const response = await apiFetch<ApiEnvelopeDTO<ClinicVisitDTO>>(`/clinic/visits/${id}`, {
    method: 'GET',
    headers: { 'X-Business-Type': 'clinic' },
  })
  return toClinicVisitVM(response.data)
}

export interface UpdateClinicVisitParams {
  chiefComplaint?: string
  temperature?: number | null
  heartRate?: number | null
  respiratoryRate?: number | null
  targetStatus?: VisitStatus
  diagnoses?: Array<{
    id: number | null
    name: string
    isPrimary: boolean
    notes: string
  }>
  prescriptions?: Array<{
    id: number | null
    drugName: string
    dosage: string
    frequency: string
    durationDays: number
    notes: string
  }>
  treatments?: Array<{
    id: number | null
    name: string
    performedById: number
    fee: number
    notes: string
  }>
  followups?: Array<{
    id: number | null
    reason: string
    doctorId: number
    dueAt: string
  }>
  generalMedicationNotes?: string
}

export async function updateClinicVisit(
  id: number,
  data: UpdateClinicVisitParams
): Promise<{ id: number; status: VisitStatus; updatedAt: string }> {
  const body: Record<string, unknown> = {}
  if (data.chiefComplaint !== undefined) body.chief_complaint = data.chiefComplaint
  if (data.temperature !== undefined) body.temperature = data.temperature
  if (data.heartRate !== undefined) body.heart_rate = data.heartRate
  if (data.respiratoryRate !== undefined) body.respiratory_rate = data.respiratoryRate
  if (data.targetStatus !== undefined) body.target_status = data.targetStatus
  if (data.generalMedicationNotes !== undefined) body.general_medication_notes = data.generalMedicationNotes
  if (data.diagnoses !== undefined) {
    body.diagnoses = data.diagnoses.map((d) => ({
      id: d.id,
      name: d.name,
      is_primary: d.isPrimary,
      notes: d.notes,
    }))
  }
  if (data.prescriptions !== undefined) {
    body.prescriptions = data.prescriptions.map((p) => ({
      id: p.id,
      drug_name: p.drugName,
      dosage: p.dosage,
      frequency: p.frequency,
      duration_days: p.durationDays,
      notes: p.notes,
    }))
  }
  if (data.treatments !== undefined) {
    body.treatments = data.treatments.map((t) => ({
      id: t.id,
      name: t.name,
      performed_by_id: t.performedById,
      fee: t.fee,
      notes: t.notes,
    }))
  }
  if (data.followups !== undefined) {
    body.followups = data.followups.map((f) => ({
      id: f.id,
      reason: f.reason,
      doctor_id: f.doctorId,
      due_at: f.dueAt,
    }))
  }

  const response = await apiFetch<ApiEnvelopeDTO<{ id: number; status: VisitStatus; updated_at: string }>>(
    `/clinic/visits/${id}`,
    {
      method: 'PATCH',
      headers: { 'X-Business-Type': 'clinic' },
      body: JSON.stringify(body),
    }
  )
  return {
    id: response.data.id,
    status: response.data.status,
    updatedAt: response.data.updated_at,
  }
}

export async function pushVisitToApp(id: number): Promise<{
  visitId: number
  pushedAt: string
  syncQueue: { id: number; entityType: string; entityId: string; action: string; status: string }
}> {
  const response = await apiFetch<ApiEnvelopeDTO<{
    visit_id: number
    pushed_at: string
    sync_queue: { id: number; entity_type: string; entity_id: string; action: string; status: string }
  }>>(`/clinic/visits/${id}/push-to-app`, {
    method: 'POST',
    headers: { 'X-Business-Type': 'clinic' },
  })
  return {
    visitId: response.data.visit_id,
    pushedAt: response.data.pushed_at,
    syncQueue: {
      id: response.data.sync_queue.id,
      entityType: response.data.sync_queue.entity_type,
      entityId: response.data.sync_queue.entity_id,
      action: response.data.sync_queue.action,
      status: response.data.sync_queue.status,
    },
  }
}

export interface GetClinicFollowupsParams {
  status?: FollowupStatus | 'overdue'
  doctorId?: number
  page?: number
  perPage?: number
}

export async function getClinicFollowups(
  params: GetClinicFollowupsParams = {}
): Promise<{ followups: ClinicFollowupVM[]; total: number; page: number; perPage: number; hasMore: boolean }> {
  const searchParams = new URLSearchParams()
  if (params.status) searchParams.set('status', params.status)
  if (params.doctorId) searchParams.set('doctor_id', String(params.doctorId))
  if (params.page) searchParams.set('page', String(params.page))
  if (params.perPage) searchParams.set('per_page', String(params.perPage))

  const query = searchParams.toString()
  const endpoint = `/clinic/followups${query ? `?${query}` : ''}`

  const response = await apiFetch<ApiEnvelopeDTO<{
    followups: ClinicFollowupDTO[]
    total: number
    page: number
    per_page: number
    has_more: boolean
  }>>(endpoint, {
    method: 'GET',
    headers: { 'X-Business-Type': 'clinic' },
  })
  return {
    followups: response.data.followups.map(toClinicFollowupVM),
    total: response.data.total,
    page: response.data.page,
    perPage: response.data.per_page,
    hasMore: response.data.has_more,
  }
}

export async function updateFollowupStatus(
  id: number,
  targetStatus: 'done' | 'skipped',
  resultNote?: string
): Promise<{ id: number; previousStatus: FollowupStatus; currentStatus: FollowupStatus; resultNote: string; updatedAt: string }> {
  const response = await apiFetch<ApiEnvelopeDTO<{
    id: number
    previous_status: FollowupStatus
    current_status: FollowupStatus
    result_note: string
    updated_at: string
  }>>(`/clinic/followups/${id}/status`, {
    method: 'PATCH',
    headers: { 'X-Business-Type': 'clinic' },
    body: JSON.stringify({ target_status: targetStatus, result_note: resultNote }),
  })
  return {
    id: response.data.id,
    previousStatus: response.data.previous_status,
    currentStatus: response.data.current_status,
    resultNote: response.data.result_note,
    updatedAt: response.data.updated_at,
  }
}

export interface GetClinicPharmacyParams {
  search?: string
  isPrescriptionOnly?: boolean
  expiryFilter?: 'expiring_soon' | 'expired'
  page?: number
  perPage?: number
}

export async function getClinicPharmacy(
  params: GetClinicPharmacyParams = {}
): Promise<{ items: PharmacyItemVM[]; total: number; page: number; perPage: number }> {
  const searchParams = new URLSearchParams()
  if (params.search) searchParams.set('search', params.search)
  if (params.isPrescriptionOnly !== undefined) searchParams.set('is_prescription_only', String(params.isPrescriptionOnly))
  if (params.expiryFilter) searchParams.set('expiry_filter', params.expiryFilter)
  if (params.page) searchParams.set('page', String(params.page))
  if (params.perPage) searchParams.set('per_page', String(params.perPage))

  const query = searchParams.toString()
  const endpoint = `/clinic/pharmacy${query ? `?${query}` : ''}`

  const response = await apiFetch<ApiEnvelopeDTO<{
    items: PharmacyItemDTO[]
    total: number
    page: number
    per_page: number
  }>>(endpoint, {
    method: 'GET',
    headers: { 'X-Business-Type': 'clinic' },
  })
  return {
    items: response.data.items.map(toPharmacyItemVM),
    total: response.data.total,
    page: response.data.page,
    perPage: response.data.per_page,
  }
}

export async function dispensePharmacyItem(
  id: number,
  quantity: number,
  prescriptionId?: number,
  note?: string
): Promise<{
  id: number
  name: string
  previousStock: number
  dispensedQuantity: number
  currentStock: number
  prescriptionId: number | null
  dispensedAt: string
}> {
  const body: Record<string, unknown> = { quantity }
  if (prescriptionId !== undefined) body.prescription_id = prescriptionId
  if (note) body.note = note

  const response = await apiFetch<ApiEnvelopeDTO<{
    id: number
    name: string
    previous_stock: number
    dispensed_quantity: number
    current_stock: number
    prescription_id: number | null
    dispensed_at: string
  }>>(`/clinic/pharmacy/${id}/dispense`, {
    method: 'PATCH',
    headers: { 'X-Business-Type': 'clinic' },
    body: JSON.stringify(body),
  })
  return {
    id: response.data.id,
    name: response.data.name,
    previousStock: response.data.previous_stock,
    dispensedQuantity: response.data.dispensed_quantity,
    currentStock: response.data.current_stock,
    prescriptionId: response.data.prescription_id,
    dispensedAt: response.data.dispensed_at,
  }
}

export async function uploadVisitFile(visitId: number, file: File): Promise<VisitFileVM> {
  const formData = new FormData()
  formData.append('file', file)

  const sessionId = getSessionIdFromCookie()
  const headers: Record<string, string> = {
    'X-Business-Type': 'clinic',
  }
  if (sessionId) headers['X-Session-ID'] = sessionId

  const url = `${API_BASE_PATH}/clinic/visits/${visitId}/files`
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  })

  const data = await response.json()

  if (!response.ok) {
    if (isApiErrorDTO(data)) {
      throw new ApiError(data.error, data.message, data.request_id)
    }
    throw new ApiError('internal_error', 'Unexpected server error')
  }

  const envelope = data as ApiEnvelopeDTO<VisitFileDTO>
  return toVisitFileVM(envelope.data)
}

// ============================================
// Phase 3: Insurance API Types and Functions
// ============================================

// ----- Insurance Enums -----

export type InsuranceClaimStatus = 'draft' | 'submitted' | 'processing' | 'approved' | 'rejected'

// ----- Insurance DTOs -----

export interface PolicyDTO {
  policy_no: string
  provider_name: string
  plan_name: string
  effective_at: string
  expires_at: string
}

export interface CoverageItemDTO {
  item_code: string
  item_name: string
  coverage_pct: number
  annual_limit: number
  remaining_limit: number
  is_covered: boolean
}

export interface InsuranceCoveragePreviewDTO {
  visit_id: number
  pet_name: string
  pet_owner_name: string
  policy: PolicyDTO
  coverage_items: CoverageItemDTO[]
}

export interface InsuranceClaimDTO {
  id: number
  visit_id: number
  submitted_at: string
  pet_name: string
  policy_no: string
  provider_name: string
  plan_name: string
  claim_amount: number
  approved_amount: number
  currency: string
  status: InsuranceClaimStatus
}

export interface InsuranceClaimFileDTO {
  id: number
  claim_id: number
  file_name: string
  file_url: string
  file_size: number
  file_type: string
  uploaded_at: string
}

// ----- Insurance VM Types (camelCase) -----

export interface PolicyVM {
  policyNo: string
  providerName: string
  planName: string
  effectiveAt: string
  expiresAt: string
}

export interface CoverageItemVM {
  itemCode: string
  itemName: string
  coveragePct: number
  annualLimit: number
  remainingLimit: number
  isCovered: boolean
}

export interface InsuranceCoveragePreviewVM {
  visitId: number
  petName: string
  petOwnerName: string
  policy: PolicyVM
  coverageItems: CoverageItemVM[]
}

export interface InsuranceClaimVM {
  id: number
  visitId: number
  submittedAt: string
  petName: string
  policyNo: string
  providerName: string
  planName: string
  claimAmount: number
  approvedAmount: number
  currency: string
  status: InsuranceClaimStatus
}

export interface InsuranceClaimFileVM {
  id: number
  claimId: number
  fileName: string
  fileUrl: string
  fileSize: number
  fileType: string
  uploadedAt: string
}

// ----- Insurance DTO to VM Converters -----

export function toPolicyVM(dto: PolicyDTO): PolicyVM {
  return {
    policyNo: dto.policy_no,
    providerName: dto.provider_name,
    planName: dto.plan_name,
    effectiveAt: dto.effective_at,
    expiresAt: dto.expires_at,
  }
}

export function toCoverageItemVM(dto: CoverageItemDTO): CoverageItemVM {
  return {
    itemCode: dto.item_code,
    itemName: dto.item_name,
    coveragePct: dto.coverage_pct,
    annualLimit: dto.annual_limit,
    remainingLimit: dto.remaining_limit,
    isCovered: dto.is_covered,
  }
}

export function toInsuranceCoveragePreviewVM(dto: InsuranceCoveragePreviewDTO): InsuranceCoveragePreviewVM {
  return {
    visitId: dto.visit_id,
    petName: dto.pet_name,
    petOwnerName: dto.pet_owner_name,
    policy: toPolicyVM(dto.policy),
    coverageItems: dto.coverage_items.map(toCoverageItemVM),
  }
}

export function toInsuranceClaimVM(dto: InsuranceClaimDTO): InsuranceClaimVM {
  return {
    id: dto.id,
    visitId: dto.visit_id,
    submittedAt: dto.submitted_at,
    petName: dto.pet_name,
    policyNo: dto.policy_no,
    providerName: dto.provider_name,
    planName: dto.plan_name,
    claimAmount: dto.claim_amount,
    approvedAmount: dto.approved_amount,
    currency: dto.currency,
    status: dto.status,
  }
}

export function toInsuranceClaimFileVM(dto: InsuranceClaimFileDTO): InsuranceClaimFileVM {
  return {
    id: dto.id,
    claimId: dto.claim_id,
    fileName: dto.file_name,
    fileUrl: dto.file_url,
    fileSize: dto.file_size,
    fileType: dto.file_type,
    uploadedAt: dto.uploaded_at,
  }
}

// ----- Insurance API Functions -----

export interface GetInsuranceCoveragePreviewParams {
  visitId: number
}

export async function getInsuranceCoveragePreview(
  visitId: number
): Promise<InsuranceCoveragePreviewVM> {
  const response = await apiFetch<ApiEnvelopeDTO<InsuranceCoveragePreviewDTO>>(
    `/clinic/insurance/coverage-preview?visit_id=${visitId}`,
    {
      method: 'GET',
      headers: { 'X-Business-Type': 'clinic' },
    }
  )
  return toInsuranceCoveragePreviewVM(response.data)
}

export interface GetInsuranceClaimsParams {
  status?: InsuranceClaimStatus
  page?: number
  perPage?: number
}

export async function getInsuranceClaims(
  params: GetInsuranceClaimsParams = {}
): Promise<{
  claims: InsuranceClaimVM[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
}> {
  const searchParams = new URLSearchParams()
  if (params.status) searchParams.set('status', params.status)
  if (params.page) searchParams.set('page', String(params.page))
  if (params.perPage) searchParams.set('per_page', String(params.perPage))

  const query = searchParams.toString()
  const endpoint = `/clinic/insurance/claims${query ? `?${query}` : ''}`

  const response = await apiFetch<ApiEnvelopeDTO<{
    claims: InsuranceClaimDTO[]
    total: number
    page: number
    per_page: number
    has_more: boolean
  }>>(endpoint, {
    method: 'GET',
    headers: { 'X-Business-Type': 'clinic' },
  })

  return {
    claims: response.data.claims.map(toInsuranceClaimVM),
    total: response.data.total,
    page: response.data.page,
    perPage: response.data.per_page,
    hasMore: response.data.has_more,
  }
}

export interface CreateInsuranceClaimParams {
  visitId: number
  policyNo: string
  providerName: string
  planName: string
  claimAmount: number
  currency: string
  diagnosisSummary: string
  expenseItems: Array<{
    itemName: string
    amount: number
    isCovered: boolean
  }>
  notes?: string
}

export interface CreateInsuranceClaimResponseDTO extends ApiEnvelopeDTO<{
  id: number
  visit_id: number
  status: InsuranceClaimStatus
  claim_amount: number
  currency: string
  submitted_at: string
}> {}

export async function createInsuranceClaim(
  params: CreateInsuranceClaimParams
): Promise<{
  id: number
  visitId: number
  status: InsuranceClaimStatus
  claimAmount: number
  currency: string
  submittedAt: string
}> {
  const body = {
    visit_id: params.visitId,
    policy_no: params.policyNo,
    provider_name: params.providerName,
    plan_name: params.planName,
    claim_amount: params.claimAmount,
    currency: params.currency,
    diagnosis_summary: params.diagnosisSummary,
    expense_items: params.expenseItems.map((item) => ({
      item_name: item.itemName,
      amount: item.amount,
      is_covered: item.isCovered,
    })),
    notes: params.notes,
  }

  const response = await apiFetch<CreateInsuranceClaimResponseDTO>(
    '/clinic/insurance/claims',
    {
      method: 'POST',
      headers: { 'X-Business-Type': 'clinic' },
      body: JSON.stringify(body),
    }
  )

  return {
    id: response.data.id,
    visitId: response.data.visit_id,
    status: response.data.status,
    claimAmount: response.data.claim_amount,
    currency: response.data.currency,
    submittedAt: response.data.submitted_at,
  }
}

export async function uploadInsuranceClaimFile(
  claimId: number,
  file: File
): Promise<InsuranceClaimFileVM> {
  const formData = new FormData()
  formData.append('file', file)

  const sessionId = getSessionIdFromCookie()
  const headers: Record<string, string> = {
    'X-Business-Type': 'clinic',
  }
  if (sessionId) headers['X-Session-ID'] = sessionId

  const url = `${API_BASE_PATH}/clinic/insurance/claims/${claimId}/files`
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  })

  const data = await response.json()

  if (!response.ok) {
    if (isApiErrorDTO(data)) {
      throw new ApiError(data.error, data.message, data.request_id)
    }
    throw new ApiError('internal_error', 'Unexpected server error')
  }

  const envelope = data as ApiEnvelopeDTO<InsuranceClaimFileDTO>
  return toInsuranceClaimFileVM(envelope.data)
}

// ============================================
// Phase 4B: Realtime / Sync API Types and Functions
// ============================================

export interface SyncChannelVM {
  pendingCount: number
  failedCount: number
  deadLetterCount: number
  lastSyncedAt: string | null
}

export interface MerchantSyncStatusVM {
  orders: SyncChannelVM
  appointments: SyncChannelVM
  medicalRecords: SyncChannelVM
  push: {
    consumerStatus: 'healthy' | 'degraded' | 'offline'
    notificationsSentToday: number
    lastSuccessAt: string | null
  }
  apiKey?: {
    masked: string
  } | null
  generatedAt: string
}

export type ToastVariant =
  | 'new_order'
  | 'new_appointment'
  | 'sync_failed'
  | 'followup_overdue'
  | 'medical_record_pushed'
  | 'generic'

export interface PendingTaskVM {
  id: string
  title: string
  message: string
  summary: string
  level: 'info' | 'warning' | 'error'
  dedupeKey: string
  createdAt: string
  toastVariant: ToastVariant
  actionLabel?: string
  actionHref?: string
}

interface MerchantSyncStatusDTO {
  orders?: {
    pending_count?: number
    failed_count?: number
    dead_letter_count?: number
    last_synced_at?: string | null
  }
  appointments?: {
    pending_count?: number
    failed_count?: number
    dead_letter_count?: number
    last_synced_at?: string | null
  }
  medical_records?: {
    pending_count?: number
    failed_count?: number
    dead_letter_count?: number
    last_synced_at?: string | null
  }
  push?: {
    consumer_status?: 'healthy' | 'degraded' | 'offline'
    notifications_sent_today?: number
    last_success_at?: string | null
  }
  api_key?: {
    masked?: string
  } | null
  generated_at?: string
}

/**
 * Backend minimal PendingTask DTO (snake_case).
 * Backend returns: type, entity_id, payload, created_at
 * This is the raw shape used by GET /pending-tasks.
 */
interface PendingTaskBackendDTO {
  type: string
  entity_id: string
  payload: string   // JSON string
  created_at: string
}

function toSyncChannelVM(dto?: {
  pending_count?: number
  failed_count?: number
  dead_letter_count?: number
  last_synced_at?: string | null
}): SyncChannelVM {
  return {
    pendingCount: dto?.pending_count ?? 0,
    failedCount: dto?.failed_count ?? 0,
    deadLetterCount: dto?.dead_letter_count ?? 0,
    lastSyncedAt: dto?.last_synced_at ?? null,
  }
}

/**
 * Derive rich PendingTaskVM fields from backend minimal DTO.
 * type + payload are the two sources of truth; all other fields are derived.
 */
function toPendingTaskVM(dto: PendingTaskBackendDTO): PendingTaskVM {
  const type = dto.type
  const entityId = dto.entity_id
  const createdAt = dto.created_at

  // Parse payload JSON if present
  let payloadObj: Record<string, unknown> = {}
  if (dto.payload) {
    try {
      payloadObj = JSON.parse(dto.payload) as Record<string, unknown>
    } catch {
      // use empty object on parse failure
    }
  }

  // Derive dedupeKey from type + entity_id (stable, unique per task)
  const dedupeKey = `${type}:${entityId}`

  // Derive toastVariant from type
  const toastVariant: ToastVariant = (() => {
    switch (type) {
      case 'new_order':         return 'new_order'
      case 'new_appointment':    return 'new_appointment'
      case 'sync_failed':        return 'sync_failed'
      case 'followup_overdue':   return 'followup_overdue'
      case 'medical_record_pushed': return 'medical_record_pushed'
      default:                  return 'generic'
    }
  })()

  // Derive level from type or payload
  const level: 'info' | 'warning' | 'error' = (() => {
    if (type === 'sync_failed') return 'error'
    if (type === 'followup_overdue') return 'warning'
    if (type === 'medical_record_pushed') return 'info'
    if (type === 'new_order' || type === 'new_appointment') return 'info'
    return 'info'
  })()

  // Derive title and summary from type + payload fields
  const locale = getPreferredLocale()

  const title = (() => {
    switch (type) {
      case 'new_order':
        return translate(locale, 'New order', '新訂單')
      case 'new_appointment':
        return translate(locale, 'New appointment', '新預約')
      case 'sync_failed':
        return translate(locale, 'Sync failed', '同步失敗')
      case 'followup_overdue':
        return translate(locale, 'Follow-up needed', '待回訪')
      case 'medical_record_pushed':
        return translate(locale, 'Medical record sent', '病歷已推送')
      default:
        return translate(locale, 'New notification', '新通知')
    }
  })()

  const summary = (() => {
    switch (type) {
      case 'new_order': {
        const orderNo = (payloadObj.order_no as string) ?? (payloadObj.orderNo as string) ?? entityId
        return translate(locale, 'Order {orderNo} created', '訂單 {orderNo} 已建立', { orderNo })
      }
      case 'new_appointment': {
        const petName = (payloadObj.pet_name as string) ?? (payloadObj.petName as string) ?? ''
        return translate(locale, 'Appointment {petName} created', '預約 {petName} 已建立', { petName })
      }
      case 'sync_failed': {
        const errMsg = (payloadObj.error as string) ?? (payloadObj.message as string) ?? ''
        return errMsg ? translate(locale, 'Sync failed: {errMsg}', '同步失敗：{errMsg}', { errMsg }) : translate(locale, 'Sync task failed. Please check your network.', '同步任務失敗，請檢查網路。')
      }
      case 'followup_overdue': {
        const petName = (payloadObj.pet_name as string) ?? (payloadObj.petName as string) ?? ''
        return translate(locale, 'Follow-up overdue for {petName}', '寵物 {petName} 回訪逾期', { petName })
      }
      case 'medical_record_pushed': {
        const petName = (payloadObj.pet_name as string) ?? (payloadObj.petName as string) ?? ''
        return translate(locale, 'Medical record for {petName} has been pushed to the app', '寵物 {petName} 的病歷已推送至 App', { petName })
      }
      default:
        return (payloadObj.message as string) ?? (payloadObj.summary as string) ?? translate(locale, 'You have a new task to process', '你有新的待處理任務')
    }
  })()

  const message = summary // message and summary are the same for our toast UI

  return {
    id: dedupeKey, // use dedupeKey as id for deduping in store
    title,
    message,
    summary,
    level,
    dedupeKey,
    createdAt,
    toastVariant,
    actionLabel: undefined,
    actionHref: undefined,
  }
}

export async function getMerchantSyncStatus(
  businessType: BusinessType
): Promise<MerchantSyncStatusVM> {
  const response = await apiFetch<ApiEnvelopeDTO<MerchantSyncStatusDTO>>('/sync/status', {
    method: 'GET',
    headers: { 'X-Business-Type': businessType },
  })

  return {
    orders: toSyncChannelVM(response.data.orders),
    appointments: toSyncChannelVM(response.data.appointments),
    medicalRecords: toSyncChannelVM(response.data.medical_records),
    push: {
      consumerStatus: response.data.push?.consumer_status ?? 'healthy',
      notificationsSentToday: response.data.push?.notifications_sent_today ?? 0,
      lastSuccessAt: response.data.push?.last_success_at ?? null,
    },
    apiKey: response.data.api_key?.masked ? { masked: response.data.api_key.masked } : null,
    generatedAt: response.data.generated_at ?? new Date().toISOString(),
  }
}

export async function getMerchantPendingTasks(params: {
  cursor?: string | null
  businessType: BusinessType
}): Promise<{ tasks: PendingTaskVM[]; cursor: string | null }> {
  const searchParams = new URLSearchParams()
  if (params.cursor) searchParams.set('cursor', params.cursor)
  const query = searchParams.toString()
  const endpoint = `/pending-tasks${query ? `?${query}` : ''}`

  const response = await apiFetch<ApiEnvelopeDTO<{ tasks?: PendingTaskBackendDTO[]; cursor?: string | null }>>(endpoint, {
    method: 'GET',
    headers: { 'X-Business-Type': params.businessType },
  })

  return {
    tasks: (response.data.tasks ?? []).map(toPendingTaskVM),
    cursor: response.data.cursor ?? null,
  }
}

// ============================================
// Phase 5: Analytics API Types and Functions
// ============================================

export type AnalyticsPeriod = '7d' | '30d' | 'custom'

export interface AnalyticsPeriodDTO {
  from: string
  to: string
}

export interface ShopAnalyticsSummaryDTO {
  total_revenue: number
  total_orders: number
  avg_order_value: number
  repeat_purchase_rate: number
}

export interface ShopDailyRevenueDTO {
  date: string
  revenue: number
  orders: number
}

export interface ShopCategoryBreakdownDTO {
  category: string
  revenue: number
  pct: number
}

export interface ShopTopProductDTO {
  name: string
  sales: number
  revenue: number
}

export interface ShopAnalyticsDTO {
  period: AnalyticsPeriodDTO
  summary: ShopAnalyticsSummaryDTO
  daily_revenue: ShopDailyRevenueDTO[]
  category_breakdown: ShopCategoryBreakdownDTO[]
  top_products: ShopTopProductDTO[]
}

export interface ClinicAnalyticsSummaryDTO {
  total_visits: number
  avg_visit_duration_min: number | null
  revisit_rate_30d: number
  prescription_rate: number
}

export interface ClinicDailyVisitDTO {
  date: string
  visits: number
}

export interface ClinicDiagnosisBreakdownDTO {
  name: string
  count: number
  pct: number
}

export interface ClinicDoctorWorkloadDTO {
  doctor_name: string
  [week: string]: number | string
}

export interface ClinicAppointmentAttendanceDTO {
  date: string
  confirmed: number
  checked_in: number
  rate: number
}

export interface ClinicAnalyticsDTO {
  period: AnalyticsPeriodDTO
  summary: ClinicAnalyticsSummaryDTO
  daily_visits: ClinicDailyVisitDTO[]
  diagnosis_breakdown: ClinicDiagnosisBreakdownDTO[]
  doctor_workload: ClinicDoctorWorkloadDTO[]
  appointment_attendance: ClinicAppointmentAttendanceDTO[]
}

export interface ShopAnalyticsSummaryVM {
  totalRevenue: number
  totalOrders: number
  avgOrderValue: number
  repeatPurchaseRate: number
}

export interface ShopDailyRevenueVM {
  date: string
  revenue: number
  orders: number
}

export interface ShopCategoryBreakdownVM {
  category: string
  revenue: number
  pct: number
}

export interface ShopTopProductVM {
  name: string
  sales: number
  revenue: number
}

export interface ShopAnalyticsVM {
  period: AnalyticsPeriodDTO
  summary: ShopAnalyticsSummaryVM
  dailyRevenue: ShopDailyRevenueVM[]
  categoryBreakdown: ShopCategoryBreakdownVM[]
  topProducts: ShopTopProductVM[]
}

export interface ClinicAnalyticsSummaryVM {
  totalVisits: number
  avgVisitDurationMin: number | null
  revisitRate30d: number
  prescriptionRate: number
}

export interface ClinicDailyVisitVM {
  date: string
  visits: number
}

export interface ClinicDiagnosisBreakdownVM {
  name: string
  count: number
  pct: number
}

export interface ClinicDoctorWorkloadVM {
  doctorName: string
  [week: string]: number | string
}

export interface ClinicAppointmentAttendanceVM {
  date: string
  confirmed: number
  checkedIn: number
  rate: number
}

export interface ClinicAnalyticsVM {
  period: AnalyticsPeriodDTO
  summary: ClinicAnalyticsSummaryVM
  dailyVisits: ClinicDailyVisitVM[]
  diagnosisBreakdown: ClinicDiagnosisBreakdownVM[]
  doctorWorkload: ClinicDoctorWorkloadVM[]
  appointmentAttendance: ClinicAppointmentAttendanceVM[]
}

export interface GetAnalyticsParams {
  period?: AnalyticsPeriod
  dateFrom?: string
  dateTo?: string
}

function unwrapAnalyticsResponse<T>(response: T | ApiEnvelopeDTO<T>): T {
  if (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    'message' in response &&
    'data' in response
  ) {
    return (response as ApiEnvelopeDTO<T>).data
  }

  return response as T
}

function buildAnalyticsQuery(params: GetAnalyticsParams = {}): string {
  const searchParams = new URLSearchParams()

  if (params.period) searchParams.set('period', params.period)
  if (params.dateFrom) searchParams.set('date_from', params.dateFrom)
  if (params.dateTo) searchParams.set('date_to', params.dateTo)

  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

export function toShopAnalyticsVM(dto: ShopAnalyticsDTO): ShopAnalyticsVM {
  return {
    period: dto.period,
    summary: {
      totalRevenue: dto.summary.total_revenue,
      totalOrders: dto.summary.total_orders,
      avgOrderValue: dto.summary.avg_order_value,
      repeatPurchaseRate: dto.summary.repeat_purchase_rate,
    },
    dailyRevenue: dto.daily_revenue,
    categoryBreakdown: dto.category_breakdown,
    topProducts: dto.top_products,
  }
}

export function toClinicAnalyticsVM(dto: ClinicAnalyticsDTO): ClinicAnalyticsVM {
  return {
    period: dto.period,
    summary: {
      totalVisits: dto.summary.total_visits,
      avgVisitDurationMin: dto.summary.avg_visit_duration_min,
      revisitRate30d: dto.summary.revisit_rate_30d,
      prescriptionRate: dto.summary.prescription_rate,
    },
    dailyVisits: dto.daily_visits,
    diagnosisBreakdown: dto.diagnosis_breakdown,
    doctorWorkload: dto.doctor_workload.map((item) => {
      const { doctor_name, ...weeks } = item
      return {
        doctorName: doctor_name,
        ...weeks,
      }
    }),
    appointmentAttendance: dto.appointment_attendance.map((item) => ({
      date: item.date,
      confirmed: item.confirmed,
      checkedIn: item.checked_in,
      rate: item.rate,
    })),
  }
}

export async function getShopAnalytics(
  params: GetAnalyticsParams = {}
): Promise<ShopAnalyticsVM> {
  const response = await apiFetch<ShopAnalyticsDTO | ApiEnvelopeDTO<ShopAnalyticsDTO>>(
    `/analytics/shop${buildAnalyticsQuery(params)}`,
    {
      method: 'GET',
      headers: {
        'X-Business-Type': 'shop',
      },
    }
  )

  return toShopAnalyticsVM(unwrapAnalyticsResponse(response))
}

export async function getClinicAnalytics(
  params: GetAnalyticsParams = {}
): Promise<ClinicAnalyticsVM> {
  const response = await apiFetch<ClinicAnalyticsDTO | ApiEnvelopeDTO<ClinicAnalyticsDTO>>(
    `/analytics/clinic${buildAnalyticsQuery(params)}`,
    {
      method: 'GET',
      headers: {
        'X-Business-Type': 'clinic',
      },
    }
  )

  return toClinicAnalyticsVM(unwrapAnalyticsResponse(response))
}

// ─────────────────────────────────────────────────────────────────────────────
// Clinic Clients
// ─────────────────────────────────────────────────────────────────────────────

export interface ClinicClientDTO {
  id: number
  first_name: string
  last_name: string
  phone: string
  email: string
  active: boolean
  patient_count: number
  created_at: string
}

export interface ClinicClientDetailDTO {
  id: number
  first_name: string
  last_name: string
  phone: string
  email: string
  address: string
  notes: string
  active: boolean
  created_at: string
}

export interface ClinicClientPatientDTO {
  id: number
  name: string
  species: string
  breed: string
  gender: string
  date_of_birth: string | null
  is_deceased: boolean
}

export interface ClinicClientVM {
  id: number
  fullName: string
  phone: string
  email: string
  active: boolean
  patientCount: number
  createdAt: string
}

export interface ClinicClientDetailVM {
  id: number
  fullName: string
  firstName: string
  lastName: string
  phone: string
  email: string
  address: string
  notes: string
  active: boolean
  createdAt: string
  patients: ClinicClientPatientVM[]
}

export interface ClinicClientPatientVM {
  id: number
  name: string
  species: string
  breed: string
  gender: string
  dateOfBirth: string | null
  isDeceased: boolean
}

function toClinicClientVM(d: ClinicClientDTO): ClinicClientVM {
  return {
    id: d.id,
    fullName: `${d.first_name} ${d.last_name}`.trim(),
    phone: d.phone,
    email: d.email,
    active: d.active,
    patientCount: d.patient_count,
    createdAt: d.created_at,
  }
}

function toClinicClientPatientVM(d: ClinicClientPatientDTO): ClinicClientPatientVM {
  return {
    id: d.id,
    name: d.name,
    species: d.species,
    breed: d.breed,
    gender: d.gender,
    dateOfBirth: d.date_of_birth,
    isDeceased: d.is_deceased,
  }
}

export interface ListClinicClientsParams {
  q?: string
  page?: number
  per_page?: number
}

export interface ListClinicClientsResult {
  clients: ClinicClientVM[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
}

export async function listClinicClients(
  params: ListClinicClientsParams = {}
): Promise<ListClinicClientsResult> {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.page) qs.set('page', String(params.page))
  if (params.per_page) qs.set('per_page', String(params.per_page))
  const query = qs.toString() ? `?${qs.toString()}` : ''

  const response = await apiFetch<ApiEnvelopeDTO<{
    clients: ClinicClientDTO[]
    total: number
    page: number
    per_page: number
    has_more: boolean
  }>>(`/clinic/clients${query}`, {
    method: 'GET',
    headers: { 'X-Business-Type': 'clinic' },
  })

  const data = response.data
  return {
    clients: data.clients.map(toClinicClientVM),
    total: data.total,
    page: data.page,
    perPage: data.per_page,
    hasMore: data.has_more,
  }
}

export async function getClinicClientDetail(id: number): Promise<ClinicClientDetailVM> {
  const response = await apiFetch<ApiEnvelopeDTO<{
    client: ClinicClientDetailDTO
    patients: ClinicClientPatientDTO[]
  }>>(`/clinic/clients/${id}`, {
    method: 'GET',
    headers: { 'X-Business-Type': 'clinic' },
  })

  const { client, patients } = response.data
  return {
    id: client.id,
    fullName: `${client.first_name} ${client.last_name}`.trim(),
    firstName: client.first_name,
    lastName: client.last_name,
    phone: client.phone,
    email: client.email,
    address: client.address,
    notes: client.notes,
    active: client.active,
    createdAt: client.created_at,
    patients: patients.map(toClinicClientPatientVM),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Clinic Patients
// ─────────────────────────────────────────────────────────────────────────────

export interface ClinicPatientListDTO {
  id: number
  name: string
  species: string
  breed: string
  gender: string
  date_of_birth: string | null
  weight: number
  weight_unit: string
  is_deceased: boolean
  microchip: string
  owner_name: string
  owner_phone: string
  last_visit_at: string | null
  pending_reminders_count: number
}

export interface ClinicPatientDetailDTO {
  id: number
  name: string
  species: string
  breed: string
  gender: string
  date_of_birth: string | null
  weight: number
  weight_unit: string
  is_deceased: boolean
  microchip: string
  notes: string
  notes_important: string
}

export interface ClinicPatientOwnerDTO {
  id: number
  first_name: string
  last_name: string
  phone: string
  email: string
}

export interface ClinicPatientVisitSummaryDTO {
  id: number
  consult_date: string
  chief_complaint: string
  status: string
}

export interface ClinicPatientReminderSummaryDTO {
  id: number
  name: string
  category: string
  due_at: string | null
  last_fulfilled_at: string | null
}

export interface ClinicPatientListVM {
  id: number
  name: string
  species: string
  breed: string
  gender: string
  dateOfBirth: string | null
  weight: number
  weightUnit: string
  isDeceased: boolean
  microchip: string
  ownerName: string
  ownerPhone: string
  lastVisitAt: string | null
  pendingRemindersCount: number
}

export interface ClinicPatientDetailVM {
  id: number
  name: string
  species: string
  breed: string
  gender: string
  dateOfBirth: string | null
  weight: number
  weightUnit: string
  isDeceased: boolean
  microchip: string
  notes: string
  notesImportant: string
  owner: {
    id: number
    fullName: string
    phone: string
    email: string
  }
  recentVisits: {
    id: number
    consultDate: string
    chiefComplaint: string
    status: string
  }[]
  reminders: {
    id: number
    name: string
    category: string
    dueAt: string | null
    lastFulfilledAt: string | null
  }[]
}

function toClinicPatientListVM(d: ClinicPatientListDTO): ClinicPatientListVM {
  return {
    id: d.id,
    name: d.name,
    species: d.species,
    breed: d.breed,
    gender: d.gender,
    dateOfBirth: d.date_of_birth,
    weight: d.weight,
    weightUnit: d.weight_unit,
    isDeceased: d.is_deceased,
    microchip: d.microchip,
    ownerName: d.owner_name,
    ownerPhone: d.owner_phone,
    lastVisitAt: d.last_visit_at,
    pendingRemindersCount: d.pending_reminders_count,
  }
}

export interface ListClinicPatientsParams {
  q?: string
  client_id?: number
  page?: number
  per_page?: number
}

export interface ListClinicPatientsResult {
  patients: ClinicPatientListVM[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
}

export async function listClinicPatients(
  params: ListClinicPatientsParams = {}
): Promise<ListClinicPatientsResult> {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.client_id) qs.set('client_id', String(params.client_id))
  if (params.page) qs.set('page', String(params.page))
  if (params.per_page) qs.set('per_page', String(params.per_page))
  const query = qs.toString() ? `?${qs.toString()}` : ''

  const response = await apiFetch<ApiEnvelopeDTO<{
    patients: ClinicPatientListDTO[]
    total: number
    page: number
    per_page: number
    has_more: boolean
  }>>(`/clinic/patients${query}`, {
    method: 'GET',
    headers: { 'X-Business-Type': 'clinic' },
  })

  const data = response.data
  return {
    patients: data.patients.map(toClinicPatientListVM),
    total: data.total,
    page: data.page,
    perPage: data.per_page,
    hasMore: data.has_more,
  }
}

export async function getClinicPatientDetail(id: number): Promise<ClinicPatientDetailVM> {
  const response = await apiFetch<ApiEnvelopeDTO<{
    patient: ClinicPatientDetailDTO
    owner: ClinicPatientOwnerDTO
    recent_visits: ClinicPatientVisitSummaryDTO[]
    reminders: ClinicPatientReminderSummaryDTO[]
  }>>(`/clinic/patients/${id}`, {
    method: 'GET',
    headers: { 'X-Business-Type': 'clinic' },
  })

  const { patient, owner, recent_visits, reminders } = response.data
  return {
    id: patient.id,
    name: patient.name,
    species: patient.species,
    breed: patient.breed,
    gender: patient.gender,
    dateOfBirth: patient.date_of_birth,
    weight: patient.weight,
    weightUnit: patient.weight_unit,
    isDeceased: patient.is_deceased,
    microchip: patient.microchip,
    notes: patient.notes,
    notesImportant: patient.notes_important,
    owner: {
      id: owner.id,
      fullName: `${owner.first_name} ${owner.last_name}`.trim(),
      phone: owner.phone,
      email: owner.email,
    },
    recentVisits: recent_visits.map((v) => ({
      id: v.id,
      consultDate: v.consult_date,
      chiefComplaint: v.chief_complaint,
      status: v.status,
    })),
    reminders: reminders.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      dueAt: r.due_at,
      lastFulfilledAt: r.last_fulfilled_at,
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Clinic Health Reminders
// ─────────────────────────────────────────────────────────────────────────────

export type ReminderStatus = 'overdue' | 'upcoming' | 'fulfilled' | ''

export interface HealthReminderDTO {
  id: number
  patient_id: number
  patient_name: string
  owner_name: string
  category: string
  name: string
  importance: string
  due_at: string | null
  last_fulfilled_at: string | null
  days_until_due: number | null
}

export interface HealthReminderVM {
  id: number
  patientId: number
  patientName: string
  ownerName: string
  category: string
  name: string
  importance: string
  dueAt: string | null
  lastFulfilledAt: string | null
  daysUntilDue: number | null
}

export interface ReminderTabCounts {
  overdue: number
  upcoming: number
  fulfilled: number
}

export interface ListRemindersResult {
  reminders: HealthReminderVM[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
  counts: ReminderTabCounts
}

function toHealthReminderVM(d: HealthReminderDTO): HealthReminderVM {
  return {
    id: d.id,
    patientId: d.patient_id,
    patientName: d.patient_name,
    ownerName: d.owner_name,
    category: d.category,
    name: d.name,
    importance: d.importance,
    dueAt: d.due_at,
    lastFulfilledAt: d.last_fulfilled_at,
    daysUntilDue: d.days_until_due,
  }
}

export interface ListRemindersParams {
  status?: ReminderStatus
  page?: number
  per_page?: number
}

export async function listClinicReminders(
  params: ListRemindersParams = {}
): Promise<ListRemindersResult> {
  const qs = new URLSearchParams()
  if (params.status) qs.set('status', params.status)
  if (params.page) qs.set('page', String(params.page))
  if (params.per_page) qs.set('per_page', String(params.per_page))
  const query = qs.toString() ? `?${qs.toString()}` : ''

  const response = await apiFetch<ApiEnvelopeDTO<{
    reminders: HealthReminderDTO[]
    total: number
    page: number
    per_page: number
    has_more: boolean
    counts: ReminderTabCounts
  }>>(`/clinic/reminders${query}`, {
    method: 'GET',
    headers: { 'X-Business-Type': 'clinic' },
  })

  const data = response.data
  return {
    reminders: data.reminders.map(toHealthReminderVM),
    total: data.total,
    page: data.page,
    perPage: data.per_page,
    hasMore: data.has_more,
    counts: data.counts,
  }
}

export async function fulfillClinicReminder(
  id: number,
  fulfilledAt?: string
): Promise<{ id: number; lastFulfilledAt: string }> {
  const body = fulfilledAt ? { fulfilled_at: fulfilledAt } : {}
  const response = await apiFetch<ApiEnvelopeDTO<{
    id: number
    last_fulfilled_at: string
    updated_at: string
  }>>(`/clinic/reminders/${id}`, {
    method: 'PATCH',
    headers: { 'X-Business-Type': 'clinic' },
    body: JSON.stringify(body),
  })

  return {
    id: response.data.id,
    lastFulfilledAt: response.data.last_fulfilled_at,
  }
}
