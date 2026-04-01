# Findings

## Initial repo scan
- Monorepo with `frontend/` (Next.js/TypeScript) and `backend/` (Go).
- User request targets UI bilingual system, so frontend is primary scope.
- Existing root-level planning files already exist for prior work; this task uses isolated `.codex-work/` notes.
- Frontend contains app router pages, shared components, Zustand stores, and likely hard-coded UI strings.
## Frontend i18n entry points
- `frontend/app/layout.tsx` hardcodes `<html lang="zh-CN">`; needs locale-aware language tag and Traditional Chinese instead of Simplified.
- `frontend/app/merchant/layout.tsx` is a good client-side place to provide an i18n context/provider for authenticated area.
- `frontend/components/Sidebar.tsx` and `TopBar.tsx` contain shared chrome strings and business labels; converting these first gives wide coverage.
- There is currently no i18n dependency in `frontend/package.json`; custom lightweight dictionary/provider is likely lowest-risk.
## Scope estimate
- Frontend has ~24 files with Chinese literals; shared components and page files account for most user-facing text.
- Several pages already mix English and Chinese, so final solution needs both: a locale provider + per-file text replacement.
- `lib/api.ts` and `store/analytics.ts` emit user-visible messages outside React components, so they need pure translation helpers rather than hooks.
- Date/number formatting is hardcoded to `zh-HK` / `en-HK` in multiple pages; locale-aware format helpers will reduce drift.
## Implementation progress
- Added `frontend/lib/i18n.tsx` with locale persistence, formatting helpers, and `pick(...)` translation API.
- Wrapped the app in `I18nProvider` and added a language toggle in `TopBar`.
- Began migrating shared shell + analytics pages/components to bilingual strings using English + Traditional Chinese only.
- Some large CRUD pages remain partially migrated; lint/build validation is needed to catch syntax drift from bulk replacements.
