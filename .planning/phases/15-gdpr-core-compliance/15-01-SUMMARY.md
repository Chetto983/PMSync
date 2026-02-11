---
phase: 15-gdpr-core-compliance
plan: 01
subsystem: api
tags: [gdpr, consent, prisma, nestjs, guard, decorator]

requires:
  - phase: 14-database-encryption
    provides: "Encrypted field infrastructure for sensitive data"
provides:
  - "UserConsent Prisma model with append-only versioned records"
  - "ConsentService with dual-write to UserPreferences"
  - "ConsentEnforcementService for fast consent checks"
  - "ConsentGuard + @RequiresConsent decorator for endpoint protection"
  - "ConsentController with GET/POST /compliance/consent API"
  - "CONSENT_FEATURES constant with 6 granular features"
affects: [15-02, 15-03, 15-04, ai-module, voltagent]

tech-stack:
  added: []
  patterns: [append-only consent records, dual-write consent-to-preferences, reflector-based guard with decorator]

key-files:
  created:
    - backend/src/modules/compliance/consent.constants.ts
    - backend/src/modules/compliance/dto/consent.dto.ts
    - backend/src/modules/compliance/services/consent.service.ts
    - backend/src/modules/compliance/services/consent-enforcement.service.ts
    - backend/src/modules/compliance/guards/consent.guard.ts
    - backend/src/modules/compliance/decorators/requires-consent.decorator.ts
    - backend/src/modules/compliance/controllers/consent.controller.ts
  modified:
    - backend/prisma/schema.prisma
    - backend/src/modules/compliance/compliance.module.ts

key-decisions:
  - "Dual-write pattern: consent records are immutable append-only, with sync to UserPreferences for fast runtime checks"
  - "Default deny: hasConsent returns false when no consent record exists"
  - "Feature validation: updateConsent rejects unknown feature IDs with BadRequestException"

patterns-established:
  - "Append-only consent: never update/delete UserConsent records, always create new ones"
  - "Reflector-based consent guard: same pattern as FeatureFlagGuard for consistency"
  - "FEATURE_TO_PREF_MAP for consent-to-preferences sync mapping"

duration: 8min
completed: 2026-02-11
---

# Phase 15 Plan 01: Consent Management Backend Summary

**GDPR consent management with append-only versioned records, dual-write to UserPreferences, enforcement guard, and REST API under /compliance/consent**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-11T13:09:00Z
- **Completed:** 2026-02-11T13:17:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- UserConsent Prisma model with indexed append-only versioned records and Tenant/User relations
- ConsentService with getCurrentConsents, updateConsent (dual-write), and getConsentHistory
- ConsentGuard + @RequiresConsent decorator for blocking unconsented API access
- ConsentController with GET/POST endpoints and Swagger documentation
- 6 consent features defined: 4 AI features + 2 data features, with FEATURE_TO_PREF_MAP

## Task Commits

Each task was committed atomically:

1. **Task 1: UserConsent Prisma model and consent constants** - `3b76c0d6` (feat)
2. **Task 2: Consent services, guard, decorator, controller, and module wiring** - `e7497ae7` (feat)

## Files Created/Modified

- `backend/prisma/schema.prisma` - Added UserConsent model with indexes and User/Tenant relations
- `backend/src/modules/compliance/consent.constants.ts` - CONSENT_FEATURES, FEATURE_TO_PREF_MAP, CURRENT_CONSENT_VERSION
- `backend/src/modules/compliance/dto/consent.dto.ts` - UpdateConsentDto, ConsentStateDto, ConsentHistoryDto
- `backend/src/modules/compliance/services/consent.service.ts` - Consent CRUD with dual-write to UserPreferences
- `backend/src/modules/compliance/services/consent-enforcement.service.ts` - Fast hasConsent check
- `backend/src/modules/compliance/guards/consent.guard.ts` - Reflector-based guard blocking unconsented requests
- `backend/src/modules/compliance/decorators/requires-consent.decorator.ts` - @RequiresConsent metadata decorator
- `backend/src/modules/compliance/controllers/consent.controller.ts` - REST API for consent management
- `backend/src/modules/compliance/compliance.module.ts` - Updated with all new providers, controllers, and exports

## Decisions Made

- **Dual-write pattern**: Consent records are immutable (append-only in UserConsent table), with sync to UserPreferences boolean columns for fast runtime checks by existing AI services
- **Default deny**: `hasConsent()` returns `false` when no consent record exists, forcing explicit opt-in
- **Feature validation**: `updateConsent()` rejects unknown feature IDs with BadRequestException to prevent typos
- **Graceful UserPreferences sync**: If UserPreferences record doesn't exist yet (new user), sync logs a warning but doesn't fail the consent update

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. The UserConsent table will be created on the next `prisma migrate dev` or `prisma migrate deploy`.

## Next Phase Readiness

- Consent management API is ready for frontend integration (Plan 15-02)
- ConsentGuard + @RequiresConsent can be applied to any AI endpoint to enforce consent
- ConsentEnforcementService exported from ComplianceModule for use by other modules

## Self-Check: PASSED

- All 9 files verified present on disk
- Commit `3b76c0d6` (Task 1) verified in git log
- Commit `e7497ae7` (Task 2) verified in git log
- `npx prisma validate` passed
- `npx prisma generate` succeeded (Prisma Client v7.3.0)
- `npx tsc --noEmit` passed (pre-commit hook)

---
*Phase: 15-gdpr-core-compliance*
*Completed: 2026-02-11*
