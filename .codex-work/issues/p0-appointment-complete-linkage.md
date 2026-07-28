## Problem
Closing a clinic visit does not automatically mark the linked appointment as `completed`.

## Current impact
This breaks the operational loop between visit records and appointment records:
- the visit can already be closed
- but the linked appointment may still remain in `in_progress`

That leaves the system in an inconsistent state and makes downstream reporting, filtering, and staff workflows unreliable.

## Expected behavior
When a visit is closed, the linked `ClinicAppointment` should also be transitioned from `in_progress` to `completed` inside the same transactional update.

## Code references
- `backend/handlers/clinic_visits.go`
- planning reference: `task_plan.md` FIX-2 [P0]

## Notes
This is a P0 because it breaks the visit-to-appointment closure loop and leaves core business data inconsistent after case closure.
