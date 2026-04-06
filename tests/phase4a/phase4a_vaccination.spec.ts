import { expect, test, type APIRequestContext } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

test.use({ baseURL: 'http://localhost:3000' })

const BACKEND_BASE_URL = 'http://localhost:8080'
const APP_KEY = 'pk_app_test_secret_key_dev'
const CLINIC_INTEGRATION_ID = 'clinic_happypaws_hk'
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Test123!'

const RUN_ID = String(Date.now())
const IDEM_KEY_1 = `test-idem-key-${RUN_ID}-001`
const IDEM_KEY_2 = `test-idem-key-${RUN_ID}-portal-sync-001`

type LoginResp = { session_id: string; expires_at: string }

let externalBookingId = ''
let syncBookingId = ''
let syncAppointmentId = 0

function tomorrowDate() {
  const now = new Date()
  const target = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  return target.toISOString().slice(0, 10)
}

function tomorrowAt(hour: number, minute = 0) {
  const now = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return `${year}-${month}-${day}T${hh}:${mm}:00+08:00`
}

async function merchantLogin(request: APIRequestContext) {
  const res = await request.post(`${BACKEND_BASE_URL}/v1/merchant/auth/login`, {
    data: { email: 'owner@happypaws.com', password: TEST_PASSWORD },
  })
  expect(res.ok()).toBeTruthy()
  return res.json() as Promise<LoginResp>
}

test('TC-4A-01 missing App Key returns 40101', async ({ request }) => {
  const res = await request.get(`${BACKEND_BASE_URL}/app/v1/vaccinations/availability`)
  expect(res.status()).toBe(401)
  const body = await res.json()
  expect(body.code).toBe(40101)
})

test('TC-4A-02 invalid App Key returns 40102', async ({ request }) => {
  const res = await request.get(`${BACKEND_BASE_URL}/app/v1/vaccinations/availability`, {
    headers: { 'X-Merchant-App-Key': 'pk_app_wrong' },
  })
  expect(res.status()).toBe(401)
  const body = await res.json()
  expect(body.code).toBe(40102)
})

test('TC-4A-03 get availability', async ({ request }) => {
  const res = await request.get(`${BACKEND_BASE_URL}/app/v1/vaccinations/availability`, {
    headers: { 'X-Merchant-App-Key': APP_KEY },
    params: {
      clinic_integration_id: CLINIC_INTEGRATION_ID,
      vaccine_code: 'rabies',
      date: tomorrowDate(),
    },
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.code).toBe(0)
  expect(Array.isArray(body.data.slots)).toBeTruthy()
  for (const slot of body.data.slots) {
    expect(slot).toHaveProperty('slot_id')
    expect(slot).toHaveProperty('start_at')
    expect(slot).toHaveProperty('end_at')
    expect(slot).toHaveProperty('is_available')
  }
})

test('TC-4A-04 create vaccination booking', async ({ request }) => {
  const res = await request.post(`${BACKEND_BASE_URL}/app/v1/vaccinations/bookings`, {
    headers: {
      'X-Merchant-App-Key': APP_KEY,
      'Idempotency-Key': IDEM_KEY_1,
    },
    data: {
      clinic_integration_id: CLINIC_INTEGRATION_ID,
      vaccine_code: 'rabies',
      scheduled_at: tomorrowAt(9),
      pet: { id: 'pet_test_001', name: 'TestDog' },
      owner: { name: 'Test Owner', phone: '+85291234567' },
    },
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.code).toBe(0)
  expect(body.data.external_booking_id).toBeTruthy()
  expect(body.data.status).toBe('requested')
  externalBookingId = body.data.external_booking_id
})

test('TC-4A-05 same Idempotency-Key returns same booking', async ({ request }) => {
  const res = await request.post(`${BACKEND_BASE_URL}/app/v1/vaccinations/bookings`, {
    headers: {
      'X-Merchant-App-Key': APP_KEY,
      'Idempotency-Key': IDEM_KEY_1,
    },
    data: {
      clinic_integration_id: CLINIC_INTEGRATION_ID,
      vaccine_code: 'rabies',
      scheduled_at: tomorrowAt(9),
      pet: { id: 'pet_test_001', name: 'TestDog' },
      owner: { name: 'Test Owner', phone: '+85291234567' },
    },
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.code).toBe(0)
  expect(body.data.external_booking_id).toBe(externalBookingId)
})

test('TC-4A-06 get booking status', async ({ request }) => {
  const res = await request.get(`${BACKEND_BASE_URL}/app/v1/vaccinations/bookings/${externalBookingId}`, {
    headers: { 'X-Merchant-App-Key': APP_KEY },
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.code).toBe(0)
  expect(body.data.status).toBe('requested')
})

test('TC-4A-07 cancel booking', async ({ request }) => {
  const res = await request.post(`${BACKEND_BASE_URL}/app/v1/vaccinations/bookings/${externalBookingId}/cancel`, {
    headers: { 'X-Merchant-App-Key': APP_KEY },
    data: { reason: 'owner_requested' },
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.code).toBe(0)
  expect(body.data.status).toBe('cancelled_by_user')
})

test('TC-4A-08 portal status sync updates facade status', async ({ request }) => {
  const createRes = await request.post(`${BACKEND_BASE_URL}/app/v1/vaccinations/bookings`, {
    headers: {
      'X-Merchant-App-Key': APP_KEY,
      'Idempotency-Key': IDEM_KEY_2,
    },
    data: {
      clinic_integration_id: CLINIC_INTEGRATION_ID,
      vaccine_code: 'rabies',
      scheduled_at: tomorrowAt(10),
      pet: { id: 'pet_test_002', name: 'PortalDog' },
      owner: { name: 'Portal Owner', phone: '+85295555555' },
    },
  })
  const createBody = await createRes.json()
  expect(createBody.code).toBe(0)
  syncBookingId = createBody.data.external_booking_id
  syncAppointmentId = createBody.data.portal_visibility.internal_appointment_id

  const login = await merchantLogin(request)

  const listRes = await request.get(`${BACKEND_BASE_URL}/v1/merchant/clinic/appointments`, {
    headers: {
      'X-Session-ID': login.session_id,
      'X-Business-Type': 'clinic',
    },
    params: { date: tomorrowDate() },
  })
  expect(listRes.ok()).toBeTruthy()
  const listBody = await listRes.json()
  const appointment = listBody.data.appointments.find((item: { id: number }) => item.id === syncAppointmentId)
  expect(appointment).toBeTruthy()

  const patchRes = await request.patch(`${BACKEND_BASE_URL}/v1/merchant/clinic/appointments/${syncAppointmentId}/status`, {
    headers: {
      'X-Session-ID': login.session_id,
      'X-Business-Type': 'clinic',
    },
    data: { status: 'confirmed' },
  })
  expect(patchRes.ok()).toBeTruthy()

  const getRes = await request.get(`${BACKEND_BASE_URL}/app/v1/vaccinations/bookings/${syncBookingId}`, {
    headers: { 'X-Merchant-App-Key': APP_KEY },
  })
  expect(getRes.ok()).toBeTruthy()
  const getBody = await getRes.json()
  expect(getBody.data.status).toBe('confirmed')
})

test('TC-4A-09 illegal transition is rejected', async ({ request }) => {
  const res = await request.post(`${BACKEND_BASE_URL}/app/v1/vaccinations/bookings/${externalBookingId}/cancel`, {
    headers: { 'X-Merchant-App-Key': APP_KEY },
    data: { reason: 'owner_requested' },
  })
  expect(res.status()).toBe(422)
  const body = await res.json()
  expect(body.code).toBe(42201)
})
