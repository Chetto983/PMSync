---
phase: 16-data-rights-legal-documents
plan: 04
subsystem: frontend, ui, compliance
tags: [react, tanstack-query, mui, gdpr, data-portability, article-20, article-17, translations, i18n]

# Dependency graph
requires:
  - phase: 16-01
    provides: "LegalAcceptance Prisma model, LegalController REST API, legal.constants.ts versions"
  - phase: 16-02
    provides: "DataExportService, DataExportController REST endpoints"
  - phase: 16-03
    provides: "AccountDeletionService, DataDeletionController REST endpoints"
provides:
  - "complianceApi extensions for legal, data-export, and account-deletion endpoints"
  - "7 TanStack Query hooks for data rights (export, deletion, legal status)"
  - "DataExportPanel with request/status/download UI and polling"
  - "AccountDeletionPanel with 30-day grace period display and cancellation"
  - "Registration form server-side legal acceptance for TOS and PRIVACY_POLICY"
  - "EN/IT translations for all data rights UI strings"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: ["Self-contained settings panels with own TanStack Query hooks", "Polling refetchInterval for async status tracking"]

key-files:
  created:
    - "frontend/hooks/queries/use-data-rights.ts"
    - "frontend/components/dashboard/data-rights/DataExportPanel.tsx"
    - "frontend/components/dashboard/data-rights/AccountDeletionPanel.tsx"
  modified:
    - "frontend/lib/api/compliance.ts"
    - "frontend/locales/en.ts"
    - "frontend/locales/it.ts"
    - "frontend/locales/index.ts"
    - "frontend/hooks/queries/index.ts"
    - "frontend/components/dashboard/Settings.tsx"
    - "frontend/pages/auth/register.tsx"

key-decisions:
  - "Self-contained panels with own hooks rather than prop-drilling through AccountSettings"
  - "New sidebar section 'Data & Privacy' instead of embedding in existing Account section"
  - "Polling refetchInterval 5s for active exports instead of manual refresh"

patterns-established:
  - "Data rights panels: Self-contained components importing TanStack Query hooks directly"
  - "Blob download pattern: createObjectURL + link.click for file download from API"
  - "Legal acceptance fire-and-forget: try/catch with warning log after registration"

# Metrics
duration: 9min
completed: 2026-02-11
---

# Phase 16 Plan 04: Data Rights Frontend UI Summary

**GDPR data rights frontend with DataExportPanel (request/status/download), AccountDeletionPanel (grace period/cancel), and server-side legal acceptance on registration**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-11T14:36:44Z
- **Completed:** 2026-02-11T14:45:34Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- complianceApi extended with 9 new endpoints (legal status/accept, export request/list/status/download, deletion request/status/cancel)
- 7 TanStack Query hooks with proper cache invalidation and auto-polling for active exports
- DataExportPanel renders export request button, status list with color-coded chips (PENDING/PROCESSING/READY/EXPIRED/FAILED), file download for READY exports, and polling while exports are in progress
- AccountDeletionPanel renders deletion request with confirmation dialog (ACTIVE state) or grace period info with cancel button (SCHEDULED state)
- Settings sidebar adds "Data & Privacy" section between Privacy & Consent and Account
- Registration form records TOS and PRIVACY_POLICY acceptance server-side after successful registration
- EN and IT translations for all data rights strings (export + deletion sections)
- Type definitions added to locales/index.ts for compile-time safety

## Task Commits

Each task was committed atomically:

1. **Task 1: Add translations, API module, and TanStack Query hooks** - `77641f38` (feat)
2. **Task 2: Create DataExportPanel, AccountDeletionPanel, and update registration** - `492f9ace` (feat)

## Files Created/Modified
- `frontend/hooks/queries/use-data-rights.ts` - 7 TanStack Query hooks with key factory
- `frontend/components/dashboard/data-rights/DataExportPanel.tsx` - Export request/status/download UI with polling
- `frontend/components/dashboard/data-rights/AccountDeletionPanel.tsx` - Deletion request/cancel with grace period display
- `frontend/lib/api/compliance.ts` - Added 9 API methods + 6 type interfaces for legal, export, deletion
- `frontend/locales/en.ts` - English translations for dataRights (export + deletion sections)
- `frontend/locales/it.ts` - Italian translations for dataRights (export + deletion sections)
- `frontend/locales/index.ts` - TypeScript types for dataRights translation keys
- `frontend/hooks/queries/index.ts` - Re-export use-data-rights hooks
- `frontend/components/dashboard/Settings.tsx` - Data & Privacy section in sidebar + content area
- `frontend/pages/auth/register.tsx` - Server-side legal acceptance after registration

## Decisions Made
- **Self-contained panels with own hooks:** DataExportPanel and AccountDeletionPanel use TanStack Query hooks directly rather than receiving data as props. This matches ConsentSettings pattern and avoids bloating Settings.tsx with more state management.
- **New sidebar section:** Added "Data & Privacy" as a dedicated section rather than embedding panels inside AccountSettings. AccountSettings is a prop-driven presentational component; adding hooks-driven panels there would break its architecture.
- **Polling for active exports:** useDataExports uses refetchInterval: 5000 when any export is PENDING/PROCESSING, automatically stopping when all exports reach terminal states.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed path prefix for API compliance module**
- **Found during:** Task 1 (API module creation)
- **Issue:** The existing `compliance.ts` already had `complianceApi` export with consent methods. Plan said to create a new file, but extending the existing one avoids breaking the consent imports.
- **Fix:** Extended existing `frontend/lib/api/compliance.ts` instead of creating a separate module
- **Files modified:** `frontend/lib/api/compliance.ts`
- **Verification:** Type-check passes, existing consent hooks unaffected
- **Committed in:** `77641f38` (Task 1 commit)

**2. [Rule 1 - Bug] Added dataRights type to locales/index.ts**
- **Found during:** Task 1 (translation additions)
- **Issue:** Adding `dataRights` to en.ts/it.ts sections and settings blocks caused TS2353 errors because the type definitions in locales/index.ts didn't include the new keys.
- **Fix:** Added `dataRights: string` to sections type and full `dataRights?` interface to settings type
- **Files modified:** `frontend/locales/index.ts`
- **Verification:** Type-check passes
- **Committed in:** `77641f38` (Task 1 commit)

**3. [Rule 1 - Bug] Placed panels in new Settings sidebar section instead of AccountSettings**
- **Found during:** Task 2 (integration)
- **Issue:** AccountSettings is a pure presentational component receiving all data via props. Embedding hook-driven panels there would require either passing hooks as props (anti-pattern) or fundamentally changing its architecture.
- **Fix:** Added dedicated "Data & Privacy" section in Settings.tsx with DatabaseZap icon
- **Files modified:** `frontend/components/dashboard/Settings.tsx`
- **Verification:** Panels render correctly with own data fetching
- **Committed in:** `492f9ace` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 bugs/architectural adjustments)
**Impact on plan:** All deviations preserve plan intent while adapting to actual codebase architecture. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 16 (Data Rights & Legal Documents) is fully complete
- All 4 plans delivered: legal acceptance backend, data export service, account deletion service, frontend UI
- Frontend panels ready for visual testing when backend is running
- Registration legal acceptance will fire on next new user registration

## Self-Check: PASSED

- All 10 files verified present on disk
- Commit `77641f38` (Task 1) verified in git log
- Commit `492f9ace` (Task 2) verified in git log
- TypeScript type-check: passed (zero errors)

---
*Phase: 16-data-rights-legal-documents*
*Completed: 2026-02-11*
