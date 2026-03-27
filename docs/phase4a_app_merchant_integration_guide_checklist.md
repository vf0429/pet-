# Phase 4A — App↔Merchant Integration Guide Outline & Checklist

## 1. URL Boundary Definitions

| Surface | Example | Who uses it | Rule |
|---|---|---|---|
| Portal URL | `http://localhost:3500` | Merchant staff in browser | Human UI only; never App contract |
| Merchant internal API | `http://localhost:8080/merchant/*` | Portal frontend / internal services | Session-based internal surface; never consumer App contract |
| App-facing facade URL | `${MERCHANT_PROJECT_URL}/app/v1/*` | PetWell App | Only official App integration surface |

## 2. Suggested Structure for App↔Merchant Integration Guide

1. **Purpose / scope**
   - Why App↔Merchant integration exists
   - Which features are covered now vs later
2. **Boundary model**
   - Portal URL vs internal API vs facade URL
   - Allowed callers for each surface
3. **Current inventory**
   - Known legacy direct links
   - Already facade-compliant functions
   - Unknown / pending audit areas
4. **Standard integration contract**
   - `Merchant Project URL`
   - `Merchant Public/App Key`
   - `clinic_integration_id` / business binding identifiers
5. **Auth & tenancy rules**
   - App key auth only
   - No merchant staff credential reuse
   - Every read/write resolves tenant through binding/project
6. **Identifier rules**
   - External IDs vs internal DB IDs
   - Idempotency keys
   - Stable project-scoped identifiers only
7. **Write-path / visibility mapping**
   - How facade writes land in Merchant DB
   - How Portal becomes able to see the result
8. **State-machine rules**
   - App-facing statuses
   - Internal status mapping
   - Illegal transition handling
9. **Local development rules**
   - Local URLs are topology hints only
   - Rewrite paths are for Portal convenience only
10. **Migration rules**
   - How to replace old direct links
   - Deprecation checklist
11. **QA / verification strategy**
   - Contract validation
   - tenancy isolation
   - Portal visibility
   - screenshot / trace expectations

## 3. Current Inventory Snapshot

- **Known legacy direct-link:** Vaccination (`VaccineBookingView.swift`)
  - direct base URL `http://localhost:8090`
  - direct `POST /api/merchant/auth/login`
  - direct `GET/POST /api/merchant/appointments`
  - hardcoded credential + `X-Session-ID`
- **Current Merchant browser topology:** Portal `3500` rewrites `/api/merchant/*` to backend `8080/merchant/*`
- **Current audit result for other App functions:** no additional Swift direct Merchant calls found in current grep scope; future functions still require pre-integration audit.

## 4. Vaccination Validation Points

### 4.1 Legacy path validation points
- App currently logs into Merchant using merchant staff credentials.
- App currently stores `session_id` client-side and sends `X-Session-ID`.
- App currently calls legacy bridge `8090` instead of project-based facade.
- App payload still contains unstable/test placeholders:
  - `doctor_id = "testclinics_frontdesk"`
  - `pet_id = petName`
  - status hardcoded as `booked`

### 4.2 Target path validation points
- App bootstrap only needs:
  - `merchant_project_url`
  - `merchant_public_app_key`
  - `clinic_integration_id`
- App calls only `${MERCHANT_PROJECT_URL}/app/v1/vaccinations/*`.
- Facade auth rejects missing/invalid app key.
- Facade resolves `clinic_integration_id -> tenant_id` without merchant session.
- Create booking writes:
  - facade mapping row (`external_booking_id`, idempotency, raw request)
  - internal `clinic_appointments` row for Portal visibility
- Portal can read the booking via existing clinic appointment list/matrix surfaces.
- Booking status response maps internal appointment status into app-safe status enum.
- Cancel flow enforces legal transitions only.

## 5. Old Flow vs Target Flow Verification Matrix

| Topic | Old flow to verify | Target flow to verify |
|---|---|---|
| Entry URL | `8090/api/merchant/*` hardcoded in App | only `${MERCHANT_PROJECT_URL}/app/v1/*` |
| Auth | merchant email/password + `X-Session-ID` | `X-Merchant-App-Key` |
| API surface | internal/legacy merchant endpoints | facade namespace only |
| Tenant resolution | implicit via logged-in merchant session | explicit via project + binding |
| Identifiers | test placeholders / unstable values | `clinic_integration_id`, `external_booking_id`, stable pet ID |
| Persistence | ad hoc appointment creation | facade row + `clinic_appointments` landing |
| Portal visibility | indirect / test-only expectation | explicit visibility in Portal clinic views |
| Status model | merchant-only status semantics | app-safe enum with mapping |
| Illegal transitions | not contractually isolated for App | return `42201` / reject illegal transition |
| Idempotency | absent | required `Idempotency-Key` |

## 6. Future Functions Integration Checklist

### 6.1 Before design
- [ ] Confirm this feature truly needs Merchant integration.
- [ ] Audit current App code to ensure there is no hidden direct Portal/internal API call.
- [ ] Classify the feature as clinic/shop/other and define the target business binding.

### 6.2 Boundary check
- [ ] Explicitly document Portal URL.
- [ ] Explicitly document Merchant internal API.
- [ ] Explicitly document App-facing facade URL.
- [ ] Verify no App spec or SDK example references `3500`, rewrite paths, or `/merchant/*`.

### 6.3 Auth / tenancy
- [ ] Use `Merchant Project URL + Merchant Public/App Key` only.
- [ ] Do not reuse merchant staff credentials.
- [ ] Do not require `X-Session-ID` or `X-Business-Type` in App contracts.
- [ ] Resolve tenant/business scope through project + binding metadata.
- [ ] Add explicit multi-tenant isolation rules and negative cases.

### 6.4 Data contract
- [ ] Define app-safe external identifiers.
- [ ] Avoid exposing unstable internal DB primary keys as the main contract ID.
- [ ] Define idempotency behavior for every write endpoint.
- [ ] Define success/error envelope and error codes.

### 6.5 Persistence / visibility
- [ ] Document which Merchant table(s) the facade writes into.
- [ ] Document which Portal page/list will surface the new data.
- [ ] Document reconciliation or backfill needs if legacy data coexists.

### 6.6 State machine
- [ ] Define app-facing status enum.
- [ ] Define mapping from internal merchant status.
- [ ] Define legal transitions.
- [ ] Define explicit rejection for illegal transitions.

### 6.7 QA / rollout
- [ ] Add contract tests for facade endpoints.
- [ ] Add multi-tenant isolation validation.
- [ ] Add status-machine validation.
- [ ] Add Portal visibility validation.
- [ ] Add screenshots for key surfaces if/when E2E exists.
- [ ] Define migration / deprecation plan for any legacy direct-link code.
