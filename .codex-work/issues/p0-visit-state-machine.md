## Problem
The visit state machine currently forces the sequence `in_progress -> diagnosed -> treated -> prescription_done -> closed`. This makes several real clinic flows impossible to complete correctly.

Examples:
- Vaccination-only visits may need to close directly from `in_progress`
- Diagnosis-only visits may need to close directly from `diagnosed`
- Treatment-complete visits with no prescription may need to close directly from `treated`

## Current impact
Clinic staff cannot complete these simpler visit flows without fabricating extra steps. The workflow becomes inconsistent with real operations and creates unnecessary friction in the visit-closing flow.

## Expected behavior
The state machine should preserve the existing standard path, but also allow these direct-close paths:
- `in_progress -> closed`
- `diagnosed -> closed`
- `treated -> closed`

## Code references
- `backend/models/visit_state_machine.go`
- planning reference: `task_plan.md` FIX-1 [P0]

## Notes
This is a workflow-blocking issue because it prevents some valid visit types from reaching a correct terminal state.
