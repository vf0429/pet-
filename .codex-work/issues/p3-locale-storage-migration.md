## Problem
The locale storage key was renamed from `petwell-merchant-locale` to `pawrd-merchant-locale` without a migration fallback.

## Current impact
Returning users who previously selected a language preference under the old key will silently lose that preference after deployment.

Instead of restoring their saved choice, the app will fall back to browser language until the user switches language again.

## Expected behavior
If the rebrand requires the new key name, the locale loader should still read the previous key as a fallback for a migration period, and optionally rewrite it into the new key once loaded.

## Code references
- `frontend/lib/i18n.tsx:15`
- `frontend/lib/i18n.tsx:30-35`

## Notes
This is a P3 regression because it does not fully block usage, but it does degrade returning-user experience and silently resets an existing preference.
