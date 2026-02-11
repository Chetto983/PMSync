---
phase: 16-data-rights-legal-documents
plan: 01
subsystem: database, api, compliance
tags: [prisma, nestjs, guard, gdpr, legal, tos, privacy-policy]

# Dependency graph
requires:
  - phase: 15-gdpr-core-compliance
    provides: "ComplianceModule, ConsentService, ConsentGuard patterns"
provides:
  - "LegalAcceptance Prisma model for ToS/PP version tracking"
  - "DataExportRequest Prisma model for GDPR data export lifecycle"
  - "LegalAcceptanceService with accept, hasAcceptedCurrentVersions, getStatus"
  - "LegalAcceptanceGuard with SkipLegalCheck decorator"
  - "LegalController REST API (GET /status, POST /accept)"
affects: [16-02, 16-03, 16-04]

# Tech tracking
tech-stack:
  added: []
  patterns: ["SkipLegalCheck decorator for guard bypass", "Version-pinned legal document acceptance"]

key-files:
  created:
    - "backend/src/modules/compliance/legal.constants.ts"
    - "backend/src/modules/compliance/dto/legal-acceptance.dto.ts"
    - "backend/src/modules/compliance/services/legal-acceptance.service.ts"
    - "backend/src/modules/compliance/guards/legal-acceptance.guard.ts"
    - "backend/src/modules/compliance/controllers/legal.controller.ts"
    - "backend/src/modules/compliance/decorators/skip-legal-check.decorator.ts"
  modified:
    - "backend/prisma/schema.prisma"
    - "backend/src/modules/compliance/compliance.module.ts"

key-decisions:
  - "Version-pinned acceptance: guard checks CURRENT version only, not any historical acceptance"
  - "SkipLegalCheck decorator for guard bypass on legal endpoints and auth routes"
  - "Legal endpoints exclude LegalAcceptanceGuard so users can accept before being blocked"

patterns-established:
  - "SkipLegalCheck: SetMetadata decorator to exempt routes from legal acceptance guard"
  - "CURRENT_VERSIONS map: DocumentType -> version string for centralized version management"

# Metrics
duration: 5min
completed: 2026-02-11
---

# Phase 16 Plan 01: Legal Acceptance Backend Summary

**LegalAcceptance and DataExportRequest Prisma models with NestJS service, guard, and REST API for ToS/PP version-tracked acceptance**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-11T14:14:05Z
- **Completed:** 2026-02-11T14:19:27Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- LegalAcceptance Prisma model with userId, documentType, documentVersion, IP, userAgent and composite indexes
- DataExportRequest Prisma model with status lifecycle (PENDING -> PROCESSING -> READY/EXPIRED/FAILED)
- LegalAcceptanceService enforcing current-version-only acceptance with version mismatch validation
- LegalAcceptanceGuard blocking routes when ToS/PP not accepted, with SkipLegalCheck bypass decorator
- LegalController with GET /compliance/legal/status and POST /compliance/legal/accept endpoints
- Full ComplianceModule wiring with providers and exports

## Task Commits

Each task was committed atomically:

1. **Task 1: Add LegalAcceptance and DataExportRequest Prisma models** - `ac8c379e` (feat)
2. **Task 2: Implement legal acceptance service, guard, controller, and module wiring** - `45b3db89` (feat)

## Files Created/Modified
- `backend/prisma/schema.prisma` - Added LegalAcceptance and DataExportRequest models with reverse relations on User/Tenant
- `backend/src/modules/compliance/legal.constants.ts` - CURRENT_TOS_VERSION, CURRENT_PP_VERSION, DocumentType, LEGAL_DOCUMENTS, CURRENT_VERSIONS
- `backend/src/modules/compliance/dto/legal-acceptance.dto.ts` - AcceptLegalDocumentDto with class-validator, LegalStatusDto
- `backend/src/modules/compliance/services/legal-acceptance.service.ts` - accept(), hasAcceptedCurrentVersions(), getStatus()
- `backend/src/modules/compliance/guards/legal-acceptance.guard.ts` - CanActivate guard using Reflector for SkipLegalCheck
- `backend/src/modules/compliance/controllers/legal.controller.ts` - GET /status and POST /accept with Swagger decorators
- `backend/src/modules/compliance/decorators/skip-legal-check.decorator.ts` - SetMetadata decorator for guard bypass
- `backend/src/modules/compliance/compliance.module.ts` - Wired LegalAcceptanceService, LegalAcceptanceGuard, LegalController

## Decisions Made
- **Version-pinned acceptance:** Guard checks CURRENT version only, not any historical acceptance. When versions bump, users must re-accept.
- **SkipLegalCheck decorator:** Same SetMetadata pattern as RequiresConsent but inverted (opt-out vs opt-in). Applied via Reflector.getAllAndOverride.
- **Legal endpoints exclude guard:** Users must check status and accept documents without being blocked by the very guard they need to satisfy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added SkipLegalCheck decorator**
- **Found during:** Task 2 (guard implementation)
- **Issue:** Plan mentioned @SkipLegalCheck decorator but did not list it as a separate file to create
- **Fix:** Created `decorators/skip-legal-check.decorator.ts` following RequiresConsent pattern
- **Files modified:** `backend/src/modules/compliance/decorators/skip-legal-check.decorator.ts`
- **Verification:** Guard correctly reads the metadata and skips check when decorator present
- **Committed in:** `45b3db89` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for guard functionality. The decorator was described in the plan text but not listed as an explicit artifact. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Legal acceptance backend fully operational for Phase 16-02 (data export service) and 16-03 (frontend UI)
- DataExportRequest model ready for export request implementation
- LegalAcceptanceGuard available for global or per-route application

## Self-Check: PASSED

- All 8 files verified present on disk
- Commit `ac8c379e` (Task 1) verified in git log
- Commit `45b3db89` (Task 2) verified in git log
- Prisma validate: passed
- TypeScript type-check: passed

---
*Phase: 16-data-rights-legal-documents*
*Completed: 2026-02-11*
