---
phase: 20-mount-gdpr-guards
plan: 01
subsystem: compliance
tags: [nestjs, guards, gdpr, consent, legal-acceptance, app-guard]

# Dependency graph
requires:
  - phase: 15-consent-guard
    provides: ConsentGuard, ConsentEnforcementService, @RequiresConsent decorator
  - phase: 16-legal-acceptance
    provides: LegalAcceptanceGuard, LegalAcceptanceService, @SkipLegalCheck decorator
provides:
  - Global GDPR guard enforcement via APP_GUARD
  - ai_email_processing consent feature gating all AI chat/analysis endpoints
  - @SkipLegalCheck on all compliance controllers
affects: [ai-endpoints, voltagent, compliance, frontend-consent-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [APP_GUARD registration for cross-cutting guards, umbrella consent features]

key-files:
  created:
    - backend/src/modules/compliance/__tests__/gdpr-guards-integration.spec.ts
  modified:
    - backend/src/modules/compliance/guards/legal-acceptance.guard.ts
    - backend/src/app.module.ts
    - backend/src/modules/compliance/controllers/legal.controller.ts
    - backend/src/modules/compliance/controllers/consent.controller.ts
    - backend/src/modules/compliance/controllers/data-export.controller.ts
    - backend/src/modules/compliance/controllers/data-deletion.controller.ts
    - backend/src/modules/compliance/controllers/gdpr.controller.ts
    - backend/src/modules/compliance/consent.constants.ts
    - backend/src/modules/ai/voltagent/voltagent.controller.ts
    - backend/src/modules/ai/controllers/ai.controller.ts
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/components/dashboard/consent/ConsentSettings.tsx
    - backend/src/modules/compliance/__tests__/consent.service.spec.ts

key-decisions:
  - "LegalAcceptanceGuard skips unauthenticated routes (return true when request.user absent)"
  - "Guard ordering: ThrottlerGuard -> LegalAcceptanceGuard -> ConsentGuard"
  - "@SkipLegalCheck on all 5 compliance controllers (legal, consent, data-export, data-deletion, gdpr)"
  - "ai_email_processing umbrella consent covers all VoltAgent chat + AiController AI handlers"

patterns-established:
  - "APP_GUARD registration: import guard class directly in app.module.ts providers with useClass"
  - "Umbrella consent features: single consent feature covering multiple related endpoints"

requirements-completed: [CONS-02, LEGAL-01, LEGAL-02]

# Metrics
duration: 9min
completed: 2026-02-26
---

# Phase 20 Plan 01: Wire GDPR Guards into Runtime Enforcement Summary

**Global APP_GUARD registration for LegalAcceptanceGuard and ConsentGuard with ai_email_processing consent gating on 10 AI endpoints**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-26T14:42:06Z
- **Completed:** 2026-02-26T14:51:14Z
- **Tasks:** 5
- **Files modified:** 14

## Accomplishments
- LegalAcceptanceGuard and ConsentGuard registered as global APP_GUARD in app.module.ts
- Unauthenticated routes (health, webhooks, auth) correctly bypassed via early return
- All 5 compliance controllers exempt from legal check via @SkipLegalCheck
- 10 AI endpoints (2 VoltAgent + 8 AiController) gated by ai_email_processing consent
- 10 integration tests covering guard behavior, metadata bypass, and ordering

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix LegalAcceptanceGuard for unauthenticated routes** - `d2c86521` (fix)
2. **Tasks 2-3: Register APP_GUARD + @SkipLegalCheck on controllers** - `b8746e0c` (feat)
3. **Task 4: ai_email_processing consent + @RequiresConsent on AI endpoints** - `f8706928` (feat)
4. **Task 5: Integration tests** - `b797343a` (test)
5. **Deviation fix: consent.service.spec.ts feature count** - `5e63c9c4` (fix)
6. **Deviation fix: frontend AI_FEATURES array** - `ef0d8f0d` (fix)

## Files Created/Modified
- `backend/src/modules/compliance/guards/legal-acceptance.guard.ts` - Added unauthenticated route skip
- `backend/src/app.module.ts` - Registered LegalAcceptanceGuard + ConsentGuard as APP_GUARD
- `backend/src/modules/compliance/controllers/*.ts` - Added @SkipLegalCheck on 5 controllers
- `backend/src/modules/compliance/consent.constants.ts` - Added ai_email_processing feature + type
- `backend/src/modules/ai/voltagent/voltagent.controller.ts` - @RequiresConsent on chat + stream
- `backend/src/modules/ai/controllers/ai.controller.ts` - @RequiresConsent on 8 AI handlers
- `frontend/locales/en.ts` - EN translation for ai_email_processing
- `frontend/locales/it.ts` - IT translation for ai_email_processing
- `frontend/components/dashboard/consent/ConsentSettings.tsx` - Added to AI_FEATURES array
- `backend/src/modules/compliance/__tests__/gdpr-guards-integration.spec.ts` - 10 integration tests
- `backend/src/modules/compliance/__tests__/consent.service.spec.ts` - Fixed feature count assertions

## Decisions Made
- LegalAcceptanceGuard returns true when `request.user` is absent (unauthenticated routes have no identity to check)
- Guard ordering: ThrottlerGuard -> LegalAcceptanceGuard -> ConsentGuard (rate limit before business logic)
- @SkipLegalCheck at class level on all 5 compliance controllers (GDPR rights must be accessible)
- ai_email_processing is an umbrella consent covering all AI chat and analysis endpoints
- @RequiresConsent applied per-handler on AiController (not class-level) since not all endpoints process content

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed consent.service.spec.ts hardcoded feature count**
- **Found during:** Post-task verification (all compliance tests)
- **Issue:** Tests asserted `toHaveLength(6)` but adding ai_email_processing made it 7
- **Fix:** Replaced hardcoded 6 with `CONSENT_FEATURES.length` for resilience
- **Files modified:** `backend/src/modules/compliance/__tests__/consent.service.spec.ts`
- **Verification:** All 25 compliance tests pass
- **Committed in:** `5e63c9c4`

**2. [Rule 2 - Missing Critical] Added ai_email_processing to frontend AI_FEATURES array**
- **Found during:** Post-task code audit
- **Issue:** ConsentSettings.tsx filters features by hardcoded AI_FEATURES array; missing feature means users cannot grant consent through the UI
- **Fix:** Added 'ai_email_processing' to the AI_FEATURES array
- **Files modified:** `frontend/components/dashboard/consent/ConsentSettings.tsx`
- **Verification:** Feature now visible in consent panel
- **Committed in:** `ef0d8f0d`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes necessary for correctness. Without #1, existing tests break. Without #2, users cannot grant consent for AI features. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All GDPR guards are now active in runtime
- Compliance endpoints remain accessible before legal acceptance
- AI endpoints properly gated by consent
- Frontend consent UI shows the new ai_email_processing feature
- E2E tests may need test user setup with legal acceptance (documented as risk in plan)

## Self-Check: PASSED

- 15/15 files found
- 6/6 commits found

---
*Phase: 20-mount-gdpr-guards*
*Completed: 2026-02-26*
