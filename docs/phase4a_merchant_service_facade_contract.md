# Phase 4A — Merchant Service Facade Contract Draft (Vaccination)

## 1. Contract Positioning

- This contract is the **only App-facing API surface** for Vaccination.
- Portal URL and Merchant internal API are explicitly excluded from App integration.

## 2. Base URLs and Auth

### 2.1 URL boundaries
- Portal URL: `http://localhost:3500` (local only, browser UI)
- Merchant internal API: `http://localhost:8080/merchant/*` (internal only)
- App-facing facade base:
  - local draft: `http://localhost:8080/app/v1`
  - product form: `${MERCHANT_PROJECT_URL}/app/v1`

### 2.2 Required client config
```json
{
  "merchant_project_url": "https://merchant.petwell.com/projects/testclinics-hk",
  "merchant_public_app_key": "pk_app_xxxxxxxxxxxx",
  "clinic_integration_id": "clinic_testclinics_hk"
}
```

### 2.3 Required headers
```http
X-Merchant-App-Key: pk_app_xxxxxxxxxxxx
Content-Type: application/json
Idempotency-Key: vacc_req_20260327_xxx   // create booking only
```

## 3. Standard response envelope

### Success
```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

### Error
```json
{
  "code": 40010,
  "message": "invalid request",
  "data": null
}
```

## 4. API Spec

## 4.1 Get vaccination availability

### HTTP
`GET /app/v1/vaccinations/availability`

### Query params
- `clinic_integration_id` string, required
- `vaccine_code` string, required
- `date` string (`YYYY-MM-DD`), required
- `timezone` string, optional, default resolved from project/binding

### Example request
`GET /app/v1/vaccinations/availability?clinic_integration_id=clinic_testclinics_hk&vaccine_code=rabies&date=2026-03-30`

### Response
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "clinic_integration_id": "clinic_testclinics_hk",
    "vaccine_code": "rabies",
    "date": "2026-03-30",
    "timezone": "Asia/Hong_Kong",
    "slots": [
      {
        "slot_id": "2026-03-30T11:00:00+08:00",
        "start_at": "2026-03-30T11:00:00+08:00",
        "end_at": "2026-03-30T11:30:00+08:00",
        "is_available": true
      },
      {
        "slot_id": "2026-03-30T11:30:00+08:00",
        "start_at": "2026-03-30T11:30:00+08:00",
        "end_at": "2026-03-30T12:00:00+08:00",
        "is_available": false
      }
    ]
  }
}
```

## 4.2 Create vaccination booking

### HTTP
`POST /app/v1/vaccinations/bookings`

### Request JSON
```json
{
  "clinic_integration_id": "clinic_testclinics_hk",
  "vaccine_code": "rabies",
  "scheduled_at": "2026-03-30T11:00:00+08:00",
  "pet": {
    "id": "pet_001",
    "name": "Mochi",
    "species": "dog",
    "breed": "Shiba Inu"
  },
  "owner": {
    "name": "Chris Wong",
    "phone": "+85291234567",
    "email": "chris@example.com"
  },
  "notes": "Need annual rabies booster"
}
```

### Response JSON
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "external_booking_id": "vbk_20260330_000001",
    "clinic_integration_id": "clinic_testclinics_hk",
    "status": "requested",
    "scheduled_at": "2026-03-30T11:00:00+08:00",
    "portal_visibility": {
      "visible": true,
      "internal_appointment_id": 321
    },
    "created_at": "2026-03-27T16:00:00Z"
  }
}
```

### Idempotency rule
- `Idempotency-Key` required.
- Same key + same normalized payload returns original success response.
- Same key + different payload returns conflict.

## 4.3 Get vaccination booking status

### HTTP
`GET /app/v1/vaccinations/bookings/:external_booking_id`

### Response JSON
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "external_booking_id": "vbk_20260330_000001",
    "clinic_integration_id": "clinic_testclinics_hk",
    "status": "confirmed",
    "scheduled_at": "2026-03-30T11:00:00+08:00",
    "vaccine_code": "rabies",
    "pet": {
      "id": "pet_001",
      "name": "Mochi"
    },
    "owner": {
      "name": "Chris Wong",
      "phone": "+85291234567"
    },
    "merchant_status": {
      "appointment_status": "confirmed",
      "internal_appointment_id": 321
    },
    "updated_at": "2026-03-28T09:20:00Z"
  }
}
```

## 4.4 Cancel vaccination booking

### HTTP
`POST /app/v1/vaccinations/bookings/:external_booking_id/cancel`

### Request JSON
```json
{
  "reason": "owner_requested"
}
```

### Response JSON
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "external_booking_id": "vbk_20260330_000001",
    "status": "cancelled_by_user",
    "updated_at": "2026-03-28T09:30:00Z"
  }
}
```

## 5. Error codes

| HTTP | code | meaning |
|---|---:|---|
| 400 | 40010 | invalid request |
| 400 | 40011 | missing clinic_integration_id |
| 400 | 40012 | invalid scheduled_at |
| 400 | 40013 | invalid vaccine_code |
| 401 | 40101 | missing app key |
| 401 | 40102 | invalid app key |
| 403 | 40301 | project disabled |
| 403 | 40302 | clinic binding disabled |
| 404 | 40401 | clinic integration not found |
| 404 | 40402 | booking not found |
| 409 | 40901 | idempotency conflict |
| 409 | 40902 | slot unavailable |
| 422 | 42201 | illegal booking status transition |
| 500 | 50000 | unexpected server error |

## 6. Backend handler draft

### Route tree
```text
/app/v1
  └─ /vaccinations
      ├─ GET    /availability
      ├─ POST   /bookings
      ├─ GET    /bookings/:external_booking_id
      └─ POST   /bookings/:external_booking_id/cancel
```

### Handler responsibilities
- `AvailabilityHandler`
  - auth project/key
  - resolve clinic binding
  - derive slots from clinic schedule and existing `clinic_appointments`
- `CreateVaccinationBookingHandler`
  - auth project/key
  - validate payload
  - apply idempotency
  - create facade booking row
  - create internal `clinic_appointments` row
- `GetVaccinationBookingHandler`
  - auth project/key
  - read facade booking + internal appointment
  - map internal status to app-safe status
- `CancelVaccinationBookingHandler`
  - auth project/key
  - validate state transition
  - cancel internal appointment
  - update facade status

## 7. State machine definition

### Status enum
```go
type VaccinationBookingStatus string

const (
	VaccinationBookingStatusRequested         VaccinationBookingStatus = "requested"
	VaccinationBookingStatusConfirmed         VaccinationBookingStatus = "confirmed"
	VaccinationBookingStatusCompleted         VaccinationBookingStatus = "completed"
	VaccinationBookingStatusCancelledByUser   VaccinationBookingStatus = "cancelled_by_user"
	VaccinationBookingStatusCancelledByClinic VaccinationBookingStatus = "cancelled_by_clinic"
)
```

### Legal transitions

| from | to |
|---|---|
| requested | confirmed, cancelled_by_user, cancelled_by_clinic |
| confirmed | completed, cancelled_by_user, cancelled_by_clinic |
| completed | none |
| cancelled_by_user | none |
| cancelled_by_clinic | none |

## 8. Frontend JSON types

```ts
export type VaccinationAvailabilityResponse = {
  clinic_integration_id: string
  vaccine_code: string
  date: string
  timezone: string
  slots: Array<{
    slot_id: string
    start_at: string
    end_at: string
    is_available: boolean
  }>
}

export type CreateVaccinationBookingRequest = {
  clinic_integration_id: string
  vaccine_code: string
  scheduled_at: string
  pet: {
    id: string
    name: string
    species?: string
    breed?: string
  }
  owner: {
    name: string
    phone: string
    email?: string
  }
  notes?: string
}

export type VaccinationBookingDetail = {
  external_booking_id: string
  clinic_integration_id: string
  status: 'requested' | 'confirmed' | 'completed' | 'cancelled_by_user' | 'cancelled_by_clinic'
  scheduled_at: string
  vaccine_code: string
  pet: {
    id: string
    name: string
  }
  owner: {
    name: string
    phone: string
  }
}
```

## 9. Key implementation note

- For the App, `Merchant Project URL` is the stable base URL to call.
- For Merchant engineers, facade handlers may live in the same deployable as `:8080` initially.
- But the path namespace and auth model must remain separated from `/merchant/*`.
