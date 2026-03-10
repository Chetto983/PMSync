---
phase: 59-safety
plan: 02
subsystem: api
tags: [nestjs, throttler, rate-limiting, security, rbac]

requires:
  - phase: 52-session-validation
    provides: BetterAuthGuard global guard chain with Throttler
provides:
  - All controllers under global @Throttle baseline (no @SkipThrottle gaps)
  - AI health endpoint split into public probe and admin-only detailed
  - Heavy POST endpoints with explicit 20 req/min throttle
  - Health endpoints with 30 req/min throttle
affects: [59-safety, api-security]

tech-stack:
  added: []
  patterns:
    - "No @SkipThrottle anywhere -- all endpoints under global throttle baseline"
    - "Public health probes return minimal info; detailed diagnostics require admin role"
    - "Heavy write endpoints (sync, import, extract) get explicit @Throttle(20/min)"

key-files:
  created: []
  modified:
    - backend/src/modules/calendar/controllers/calendar.controller.ts
    - backend/src/modules/contacts/controllers/contacts.controller.ts
    - backend/src/modules/providers/controllers/providers.controller.ts
    - backend/src/modules/health/controllers/health.controller.ts
    - backend/src/modules/ai/controllers/ai-health.controller.ts

key-decisions:
  - "GET endpoints use global default 100 req/min -- no explicit @Throttle needed"
  - "Heavy POST endpoints (sync, extract, import) get @Throttle 20 req/min baseline"
  - "Health endpoints get @Throttle 30 req/min"
  - "Webhook IP validation deferred to future phase (requires provider-specific IP allowlist research)"
  - "AI health probe returns only { status } -- no circuit breaker details exposed publicly"

patterns-established:
  - "Rate limit pattern: QuotaGuard handles FREE vs PRO tier; @Throttle sets global baseline"
  - "Health endpoint pattern: public probe (status only) + admin detailed (diagnostics)"

requirements-completed: [SAF-04, SAF-05]

duration: 11min
completed: 2026-03-10
---

# Phase 59 Plan 02: Rate Limit Gap Closure Summary

**Removed 31 @SkipThrottle decorators across 4 controllers, split AI health into public probe + admin detailed endpoint**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-10T06:51:11Z
- **Completed:** 2026-03-10T07:02:17Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Eliminated all @SkipThrottle() decorators from production code (31 occurrences across calendar, contacts, providers, health controllers)
- Heavy POST endpoints (sync, extract, import) now have explicit @Throttle({ default: { limit: 20, ttl: 60000 } }) baseline
- Health endpoints rate-limited to 30 req/min instead of unlimited
- AI health endpoint split: GET /ai/health returns only `{ status: "ok" }` (public), GET /ai/health/detailed requires @Roles('admin') for circuit breaker info

## Task Commits

1. **Task 1: Remove @SkipThrottle and add explicit rate limits** - `7b7e9efd` (fix)
2. **Task 2: Split AI health endpoint** - `6c83942b` (absorbed into concurrent 59-01 commit)

## Files Created/Modified
- `backend/src/modules/calendar/controllers/calendar.controller.ts` - Removed 8 @SkipThrottle, added @Throttle on sync POST
- `backend/src/modules/contacts/controllers/contacts.controller.ts` - Removed 9 @SkipThrottle, added @Throttle on 4 heavy POST endpoints
- `backend/src/modules/providers/controllers/providers.controller.ts` - Removed 13 @SkipThrottle from test/read endpoints
- `backend/src/modules/health/controllers/health.controller.ts` - Replaced class-level @SkipThrottle with @Throttle(30/min)
- `backend/src/modules/ai/controllers/ai-health.controller.ts` - Split into public probe + admin detailed, added @Throttle(30/min)

## Decisions Made
- GET endpoints rely on global default (100 req/min) -- adding per-route @Throttle would be redundant since QuotaGuard already differentiates by subscription tier
- Webhook controllers that never had @SkipThrottle were left unchanged (out of scope -- they weren't bypassing throttling)
- Webhook IP validation (Google Pub/Sub, Microsoft Graph) explicitly deferred -- requires provider-specific IP allowlist research, documented as future work
- AI health public probe returns `"ok"` instead of `"healthy"` to distinguish from the detailed endpoint's response format

## Deviations from Plan

None - plan executed exactly as written.

## Deferred Items

- **Webhook IP validation**: CONTEXT.md mentions researching webhook IP validation for Google Pub/Sub and Microsoft Graph. Deferred to a future phase -- requires provider-specific IP allowlist research and is in the discretion zone per the plan.

## Issues Encountered
- Task 2 commit was absorbed into a concurrent plan execution's commit (6c83942b from 59-01). The file changes are correct and verified. No work was lost.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All controllers now under global throttle baseline
- QuotaGuard continues to enforce FREE vs PRO differentiation
- Ready for remaining 59-safety plans

---
*Phase: 59-safety*
*Completed: 2026-03-10*
