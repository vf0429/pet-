# Phase 4A — Vaccination Revised Integration Plan

## 1. Decision Summary

- Scope is **Vaccination only**.
- The old App flow in `VaccineBookingView.swift` is rejected as the target design.
- The new integration model is fixed as:
  - `Merchant Project URL`
  - `Merchant Public/App Key`
  - `App -> Merchant Service Facade -> Merchant internal services/database -> Merchant Portal`
- The App must no longer:
  - log into Merchant with merchant staff credentials
  - store or send `X-Session-ID`
  - call Portal local ports directly

## 2. Current-State Audit

### 2.1 App old Vaccination path
Source: `apps/PetWell/Views/Medical/VaccineBookingView.swift`

- Hardcoded base URL: `http://localhost:8090`
- Direct calls:
  - `POST /api/merchant/auth/login`
  - `GET /api/merchant/appointments`
  - `POST /api/merchant/appointments`
- Auth model:
  - hardcoded clinic email/password
  - merchant session cached in `UserDefaults`
  - uses `X-Session-ID`

### 2.2 Merchant current local topology
Sources: `dev.sh`, `frontend/next.config.js`

- Portal Web URL: `http://localhost:3500`
- Merchant backend/internal API: `http://localhost:8080`
- Portal rewrite only:
  - `/api/merchant/*` -> `http://localhost:8080/merchant/*`

### 2.3 Boundary conclusion

| Surface | Example | Intended consumer | Decision |
|---|---|---|---|
| Portal URL | `http://localhost:3500` | merchant staff in browser | human UI only |
| Merchant internal API | `http://localhost:8080/merchant/*` | Portal frontend / internal services | not App contract |
| App-facing facade URL | `${MERCHANT_PROJECT_URL}/app/v1/*` | PetWell App | official Vaccination contract |

## 3. Why direct App -> Portal/internal API is rejected

1. `3500` is a web entry, not a stable product API surface.
2. `8080/merchant/*` is session-oriented merchant staff API, not consumer-app API.
3. `X-Session-ID` and merchant credentials create security, tenancy, and audit risks.
4. App should bind to a clinic/project identity, not impersonate merchant operators.
5. Future rollout requires stable project-level configuration, similar to Supabase.

## 4. Target Architecture

```text
PetWell App
  └─ uses Merchant Project URL + Merchant Public/App Key
      └─ Merchant Service Facade (public app-facing surface)
          ├─ Project/App-Key auth
          ├─ Clinic integration binding resolution
          ├─ Vaccination availability adapter
          ├─ Vaccination booking write adapter
          └─ Booking status read adapter
              └─ Merchant internal services / DB
                  ├─ clinic_appointments
                  ├─ merchant_users
                  ├─ tenants
                  └─ future vaccination mapping tables

Merchant Portal
  └─ reads same merchant data via internal API / DB
```

## 5. Product Boundary Definition

### 5.1 Portal URL
- Used by merchant operators only.
- Example local URL: `http://localhost:3500`.
- May call rewrite paths for browser convenience.
- Must never be embedded as App config.

### 5.2 Merchant internal API
- Used by Portal frontend and internal backend modules.
- Example local URL: `http://localhost:8080/merchant/*`.
- Current auth depends on merchant login + `X-Session-ID` + `X-Business-Type`.
- Must remain non-public to consumer App.

### 5.3 App-facing facade URL
- External contract for PetWell App.
- Recommended base path:
  - `Merchant Project URL = https://merchant.petwell.com/projects/{project_code}`
  - facade path under it: `/app/v1/...`
- App stores only:
  - `merchant_project_url`
  - `merchant_public_app_key`
  - optional `clinic_integration_id`

## 6. Revised Rollout Plan

### Stage 1 — Contract freeze
- Freeze App-facing Vaccination facade contract.
- Freeze project/key model.
- Freeze clinic binding identifiers.

### Stage 2 — Facade skeleton
- Add public facade routes under `/app/v1/vaccinations/*`.
- Add project + app-key auth middleware.
- Resolve `clinic_integration_id -> tenant_id`.

### Stage 3 — Merchant landing model
- Create facade-side booking tables / mappings.
- Write booking into Merchant `clinic_appointments`.
- Keep Portal visibility via existing appointment list/stat surfaces.

### Stage 4 — App migration
- Replace old `MerchantClinicSyncService` usage.
- Remove hardcoded clinic credentials.
- Remove session caching and `X-Session-ID` dependency.

### Stage 5 — compatibility cleanup
- Retire old local `8090` bridge once App migration completes.
- Keep internal merchant session APIs unchanged for Portal.

## 7. Merchant Service Facade responsibilities

### In scope for first release
- validate `Merchant Public/App Key`
- resolve target clinic project
- return availability
- create vaccination booking with idempotency
- return booking status
- map App-safe statuses from internal merchant appointment statuses

### Out of scope for first release
- merchant operator login/session
- generic shop/order/inventory facade
- full medical-record sync redesign

## 8. Merchant persistence + Portal visibility

### 8.1 Landing strategy
Facade-created Vaccination bookings should land in current Merchant clinic data so Portal can see them without parallel UI work.

### 8.2 Write path
- Resolve `tenant_id` from `clinic_integration_id`
- Resolve default booking assignee (`doctor_id` or frontdesk routing rule)
- Create `clinic_appointments` row
- Create facade mapping row linking external booking ID to internal appointment ID

### 8.3 Portal visibility path
- Portal clinic schedule/list already reads `clinic_appointments`
- Therefore, once facade writes the appointment row, Portal can display it through existing list/matrix views
- Merchant-side statuses continue to be updated by staff using existing clinic workflows

### 8.4 Required bridging
- Current `clinic_appointments` has no external booking identity field
- Current schema has no project/key/binding model
- Therefore new facade-support tables are required

## 9. Database Design (Go GORM structs)

```go
package models

import "time"

type MerchantProjectStatus string

const (
	MerchantProjectStatusActive  MerchantProjectStatus = "active"
	MerchantProjectStatusPaused  MerchantProjectStatus = "paused"
	MerchantProjectStatusRevoked MerchantProjectStatus = "revoked"
)

type MerchantProject struct {
	ID          uint                 `gorm:"primaryKey" json:"id"`
	ProjectCode string               `gorm:"size:64;not null;uniqueIndex" json:"project_code"`
	TenantID    uint                 `gorm:"not null;index" json:"tenant_id"`
	Name        string               `gorm:"size:128;not null" json:"name"`
	BaseURL     string               `gorm:"size:255;not null" json:"base_url"`
	Status      MerchantProjectStatus `gorm:"size:16;not null;default:'active';index" json:"status"`
	CreatedAt   time.Time            `json:"created_at"`
	UpdatedAt   time.Time            `json:"updated_at"`
}

type MerchantAppKeyStatus string

const (
	MerchantAppKeyStatusActive  MerchantAppKeyStatus = "active"
	MerchantAppKeyStatusRevoked MerchantAppKeyStatus = "revoked"
)

type MerchantAppKey struct {
	ID           uint                 `gorm:"primaryKey" json:"id"`
	ProjectID    uint                 `gorm:"not null;index" json:"project_id"`
	KeyPrefix    string               `gorm:"size:24;not null;index" json:"key_prefix"`
	KeyHash      string               `gorm:"size:255;not null" json:"-"`
	Environment  string               `gorm:"size:16;not null;default:'prod'" json:"environment"`
	Status       MerchantAppKeyStatus `gorm:"size:16;not null;default:'active';index" json:"status"`
	LastUsedAt   *time.Time           `json:"last_used_at"`
	ExpiresAt    *time.Time           `json:"expires_at"`
	CreatedAt    time.Time            `json:"created_at"`
	UpdatedAt    time.Time            `json:"updated_at"`
}

type ClinicIntegrationBindingStatus string

const (
	ClinicIntegrationBindingStatusActive   ClinicIntegrationBindingStatus = "active"
	ClinicIntegrationBindingStatusDisabled ClinicIntegrationBindingStatus = "disabled"
)

type ClinicIntegrationBinding struct {
	ID                  uint                         `gorm:"primaryKey" json:"id"`
	ProjectID           uint                         `gorm:"not null;index" json:"project_id"`
	TenantID            uint                         `gorm:"not null;index" json:"tenant_id"`
	ClinicIntegrationID string                       `gorm:"size:64;not null;uniqueIndex" json:"clinic_integration_id"`
	BusinessType        string                       `gorm:"size:16;not null;default:'clinic'" json:"business_type"`
	DefaultDoctorID     *uint                        `json:"default_doctor_id"`
	Timezone            string                       `gorm:"size:64;not null;default:'Asia/Hong_Kong'" json:"timezone"`
	Status              ClinicIntegrationBindingStatus `gorm:"size:16;not null;default:'active';index" json:"status"`
	CreatedAt           time.Time                    `json:"created_at"`
	UpdatedAt           time.Time                    `json:"updated_at"`
}

type VaccinationBookingStatus string

const (
	VaccinationBookingStatusRequested          VaccinationBookingStatus = "requested"
	VaccinationBookingStatusConfirmed          VaccinationBookingStatus = "confirmed"
	VaccinationBookingStatusCompleted          VaccinationBookingStatus = "completed"
	VaccinationBookingStatusCancelledByUser    VaccinationBookingStatus = "cancelled_by_user"
	VaccinationBookingStatusCancelledByClinic  VaccinationBookingStatus = "cancelled_by_clinic"
)

type VaccinationBookingFacade struct {
	ID                 uint                    `gorm:"primaryKey" json:"id"`
	ProjectID          uint                    `gorm:"not null;index" json:"project_id"`
	TenantID           uint                    `gorm:"not null;index" json:"tenant_id"`
	ClinicIntegrationID string                 `gorm:"size:64;not null;index" json:"clinic_integration_id"`
	ExternalBookingID  string                  `gorm:"size:64;not null;uniqueIndex" json:"external_booking_id"`
	IdempotencyKey     string                  `gorm:"size:128;not null;uniqueIndex" json:"idempotency_key"`
	InternalAppointmentID *uint                `gorm:"index" json:"internal_appointment_id"`
	PetID              string                  `gorm:"size:64;not null;index" json:"pet_id"`
	PetName            string                  `gorm:"size:128;not null" json:"pet_name"`
	OwnerName          string                  `gorm:"size:128;not null" json:"owner_name"`
	OwnerPhone         string                  `gorm:"size:32;not null" json:"owner_phone"`
	OwnerEmail         string                  `gorm:"size:255" json:"owner_email"`
	VaccineCode        string                  `gorm:"size:64;not null;index" json:"vaccine_code"`
	ScheduledAt        time.Time               `gorm:"not null;index" json:"scheduled_at"`
	Status             VaccinationBookingStatus `gorm:"size:32;not null;index" json:"status"`
	RawRequestJSON     string                  `gorm:"type:text;not null" json:"-"`
	CreatedAt          time.Time               `json:"created_at"`
	UpdatedAt          time.Time               `json:"updated_at"`
}
```

## 10. State Machine

### 10.1 App-facing booking status enum
- `requested`
- `confirmed`
- `completed`
- `cancelled_by_user`
- `cancelled_by_clinic`

### 10.2 Legal transition matrix

| From \ To | requested | confirmed | completed | cancelled_by_user | cancelled_by_clinic |
|---|---:|---:|---:|---:|---:|
| requested | - | Y | - | Y | Y |
| confirmed | - | - | Y | Y | Y |
| completed | - | - | - | - | - |
| cancelled_by_user | - | - | - | - | - |
| cancelled_by_clinic | - | - | - | - | - |

### 10.3 Internal merchant mapping

| App-facing status | Merchant `clinic_appointments.status` |
|---|---|
| requested | `pending` |
| confirmed | `confirmed` / `checked_in` / `in_progress` |
| completed | `completed` |
| cancelled_by_user | `cancelled` with source=`user` |
| cancelled_by_clinic | `cancelled` with source=`clinic` |

## 11. Frontend / App component tree

### 11.1 Routes
- `Medical/VaccineListView`
- `Medical/VaccineDetailView`
- `Medical/VaccineBookingView`
- `Medical/VaccineBookingStatusView`

### 11.2 Components
```text
VaccineBookingView
  ├─ MerchantProjectBootstrap
  ├─ VaccineAvailabilityDateStrip
  ├─ VaccineSlotGrid
  ├─ PetSelector
  ├─ OwnerContactSection
  ├─ BookingNotesEditor
  └─ BookingSubmitBar

VaccineBookingStatusView
  ├─ BookingStatusSummaryCard
  ├─ BookingClinicInfoCard
  ├─ BookingTimeline
  └─ BookingActions
```

### 11.3 Zustand store draft
```ts
type MerchantProjectConfigStore = {
  projectURL: string
  publicAppKey: string
  clinicIntegrationID: string
  projectStatus: 'idle' | 'loading' | 'ready' | 'error'
  error?: string
}

type VaccinationBookingStore = {
  selectedDate?: string
  selectedSlot?: string
  availabilityByDate: Record<string, Array<{
    slot_id: string
    start_at: string
    end_at: string
    is_available: boolean
  }>>
  draftBooking?: {
    petId: string
    vaccineCode: string
    notes?: string
  }
  currentBooking?: {
    externalBookingId: string
    status: 'requested' | 'confirmed' | 'completed' | 'cancelled_by_user' | 'cancelled_by_clinic'
  }
  submitState: 'idle' | 'submitting' | 'success' | 'error'
  error?: string
}
```

## 12. JSON field mapping

| App-facing JSON | Merchant facade model | Merchant internal field |
|---|---|---|
| `clinic_integration_id` | `ClinicIntegrationBinding.ClinicIntegrationID` | resolves `tenant_id` |
| `pet.id` | `VaccinationBookingFacade.PetID` | not present in `clinic_appointments`, stored in facade table |
| `pet.name` | `VaccinationBookingFacade.PetName` | `clinic_appointments.pet_name` |
| `owner.name` | `VaccinationBookingFacade.OwnerName` | `clinic_appointments.pet_owner_name` |
| `owner.phone` | `VaccinationBookingFacade.OwnerPhone` | `clinic_appointments.pet_owner_phone` |
| `owner.email` | `VaccinationBookingFacade.OwnerEmail` | encoded into facade/raw notes |
| `vaccine_code` | `VaccinationBookingFacade.VaccineCode` | `clinic_appointments.visit_type = 'vaccination'`; detailed code stored in facade/raw notes |
| `scheduled_at` | `VaccinationBookingFacade.ScheduledAt` | `clinic_appointments.scheduled_at` |
| `notes` | request payload | `clinic_appointments.notes` |
| `external_booking_id` | `VaccinationBookingFacade.ExternalBookingID` | maps to `clinic_appointments.id` via facade table |
| `status` | `VaccinationBookingFacade.Status` | derived from `clinic_appointments.status` |

## 13. Key blockers

1. No existing `Merchant Project` / `App Key` schema in current repo.
2. No existing `clinic_integration_id` binding model.
3. No existing public App-facing facade routes.
4. Current `clinic_appointments` schema lacks first-class external booking identity.
5. App still contains hardcoded merchant credentials and old local bridge logic.

## 14. Recommended next step

1. Freeze this doc as the Vaccination architecture baseline.
2. Implement schema + middleware for `Merchant Project URL + Merchant Public/App Key`.
3. Build only 3 facade APIs first: availability, create booking, get booking.
4. Migrate `VaccineBookingView` to the facade after backend skeleton is stable.

## Implementation Status
- Step 1 (Schema): ✅ Completed
- Step 2 (Auth + Routes): ✅ Completed
- Step 3 (Business Logic): ✅ Completed
- Step 4 (Sync + Tests): ✅ Completed
- Phase 4A 整体状态: ✅ DONE
