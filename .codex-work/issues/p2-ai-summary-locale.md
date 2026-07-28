## Problem
The auto-generated visit summary draft is currently hardcoded in Chinese before being saved.

In `buildAiSummaryDraft`, section labels and fallback text use fixed Chinese strings such as:
- `主訴`
- `診斷`
- `處置`
- `用藥`
- `補充醫囑`

The same helper is used by `handleAdvanceStatus` and `handleDirectClose` when a visit is being closed and the AI summary is still empty.

## Current impact
If an English-locale clinic user closes a visit without manually editing the summary first, the system may save a Chinese summary into a customer-visible record.

This creates a visible language mismatch in the merchant workflow and in any downstream summary shown to the pet owner.

## Expected behavior
The auto-generated draft should be produced through the existing i18n layer so the saved content matches the active locale.

## Code references
- `frontend/app/merchant/clinic/visits/[id]/page.tsx:54-97`
- `frontend/app/merchant/clinic/visits/[id]/page.tsx:195-216`
- `frontend/app/merchant/clinic/visits/[id]/page.tsx:223-243`

## Notes
This is a P2 user-facing localization regression. Even if full bilingual consistency is deferred, the generated summary should not save in the wrong language for the current locale.
