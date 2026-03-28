export const FACADE_BASE = '/api/app/v1'

export type VaccinationSlot = {
  slot_id: string
  start_at: string
  end_at: string
  is_available: boolean
}

export type VaccinationAvailabilityResponse = {
  clinic_integration_id: string
  vaccine_code: string
  date: string
  timezone: string
  slots: VaccinationSlot[]
}

export type CreateVaccinationBookingRequest = {
  clinic_integration_id: string
  vaccine_code: string
  scheduled_at: string
  pet: { id: string; name: string; species?: string; breed?: string }
  owner: { name: string; phone: string; email?: string }
  notes?: string
}

export type VaccinationBookingStatus =
  | 'requested'
  | 'confirmed'
  | 'completed'
  | 'cancelled_by_user'
  | 'cancelled_by_clinic'

export type VaccinationBookingDetail = {
  external_booking_id: string
  clinic_integration_id: string
  status: VaccinationBookingStatus
  scheduled_at: string
  vaccine_code: string
  pet: { id: string; name: string }
  owner: { name: string; phone: string }
  merchant_status?: {
    appointment_status: string
    internal_appointment_id: number
  }
  updated_at: string
}

export type FacadeResponse<T> = {
  code: number
  message: string
  data: T | null
}


const DEV_APP_KEY = 'pk_app_test_secret_key_dev'
const DEV_CLINIC_INTEGRATION_ID = 'clinic_happypaws_hk'

async function facadeFetch<T>(
  path: string,
  options: RequestInit = {},
  idempotencyKey?: string
): Promise<FacadeResponse<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Merchant-App-Key': DEV_APP_KEY,
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    ...((options.headers as Record<string, string>) || {}),
  }
  const res = await fetch(`${FACADE_BASE}${path}`, { ...options, headers })
  return res.json()
}

export async function getVaccinationAvailability(
  vaccineCode: string,
  date: string
): Promise<FacadeResponse<VaccinationAvailabilityResponse>> {
  const params = new URLSearchParams({
    clinic_integration_id: DEV_CLINIC_INTEGRATION_ID,
    vaccine_code: vaccineCode,
    date,
  })
  return facadeFetch(`/vaccinations/availability?${params}`)
}

export async function createVaccinationBooking(
  req: CreateVaccinationBookingRequest,
  idempotencyKey: string
): Promise<FacadeResponse<VaccinationBookingDetail>> {
  return facadeFetch('/vaccinations/bookings', {
    method: 'POST',
    body: JSON.stringify(req),
  }, idempotencyKey)
}

export async function getVaccinationBooking(
  externalBookingId: string
): Promise<FacadeResponse<VaccinationBookingDetail>> {
  return facadeFetch(`/vaccinations/bookings/${externalBookingId}`)
}

export async function cancelVaccinationBooking(
  externalBookingId: string,
  reason: string
): Promise<FacadeResponse<{ external_booking_id: string; status: string; updated_at: string }>> {
  return facadeFetch(`/vaccinations/bookings/${externalBookingId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}
