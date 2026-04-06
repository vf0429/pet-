# OpenCode Handoff — Vaccination ↔ Merchant Replan

## Mission
Freeze the current Phase 3 branch as the starting point, then use OpenCode to plan the new Vaccination integration between the PetWell consumer app and the rebuilt Merchant system.

## What changed
This is no longer the old “Phase 4 realtime sync / queue / toast” implementation task.
The immediate focus is now:
- understand the current Vaccination direct-link path from the app
- replace the product direction of “App directly connects to Merchant Portal/port”
- define a new App-facing integration model based on:
  - **Merchant Project URL**
  - **Merchant Public/App Key**
  - **Merchant Service Facade**

## Ground truth
- Merchant Portal local web URL: `http://localhost:3500`
- Merchant backend/internal API local URL: `http://localhost:8080`
- Old app Vaccination bridge still points to `http://localhost:8090` in `VaccineBookingView.swift`
- Portal 3500 is for merchant users, not the final App API design surface

## Scope
### In scope
- Vaccination only
- architecture / contract / handoff docs
- merchant facade design
- clinic binding / identifier design
- future App↔Merchant integration documentation

### Out of scope
- full implementation of the facade
- broad migration of all merchant features
- treating local ports as long-term product API definitions

## Required outputs
1. **Vaccination revised integration plan**
2. **Merchant service facade contract draft**
3. **Merchant persistence + Portal visibility mapping note**
4. **App↔Merchant integration guide for future functions**

## Non-negotiable constraints
- Use **Planning with Files** from the start
- Read and update `task_plan.md`, `findings.md`, `progress.md`
- Do not continue the “App directly logs into Merchant / uses X-Session-ID” model
- Do not use `localhost:3500` as the App contract surface
- Explicitly distinguish:
  - Portal URL
  - Merchant internal/backend URL
  - App-facing facade URL

## Suggested team split
- PM: audit current flow + produce revised plan
- Backend: design facade endpoints + clinic mapping + landing model
- Frontend/App-facing: define project URL/key config model
- QA/Docs: write reusable integration guide for future features
