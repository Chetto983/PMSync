---
phase: 33-api-contract-standardization
plan: 02
subsystem: frontend
tags: [axios, interceptor, api-client, tanstack-query, error-handling, envelope-unwrap, mui]

# Dependency graph
requires:
  - phase: 33-api-contract-standardization
    provides: ResponseEnvelopeInterceptor wrapping responses in { data, meta }, ApiExceptionFilter error shape, setGlobalPrefix('api/v1')
provides:
  - apiClient baseURL includes /api/v1 prefix
  - Envelope unwrap interceptor auto-unwraps { data, meta } -> data transparently
  - Structured error logging in browser console with { code, requestId, endpoint }
  - getApiErrorMessage supports new { error: { code, message, details } } shape
  - Dashboard widgets show muted error cards with retry button and collapsible technical details
  - All silent catch-and-return-empty patterns removed from dashboard/follow-up queries
affects: [33-03-PLAN, all-frontend-consumers]

# Tech tracking
tech-stack:
  added: []
  patterns: [envelope-unwrap-interceptor, api-error-card-with-retry, error-propagation-to-tanstack-query]

key-files:
  created: []
  modified:
    - frontend/lib/api-client.ts
    - frontend/lib/api/ai.ts
    - frontend/lib/api/ai.test.ts
    - frontend/lib/api/billing.ts
    - frontend/lib/api/crm.ts
    - frontend/lib/api/analytics.ts
    - frontend/hooks/queries/use-dashboard.ts
    - frontend/hooks/queries/use-follow-ups.ts
    - frontend/components/dashboard/widgets/BaseWidget.tsx
    - frontend/components/dashboard/widgets/BriefingWidget.tsx
    - frontend/components/dashboard/widgets/DeadlinesWidget.tsx
    - frontend/components/dashboard/widgets/TodayEventsWidget.tsx
    - frontend/components/dashboard/widgets/PriorityInboxWidget.tsx
    - frontend/components/dashboard/widgets/UnreadEmailsWidget.tsx
    - frontend/components/dashboard/widgets/FollowUpWidget.tsx
    - frontend/components/dashboard/widgets/TrendChartsWidget.tsx
    - frontend/components/dashboard/widgets/AiTriageWidget.tsx
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts

key-decisions:
  - "Envelope unwrap interceptor registered as FIRST response interceptor (before 401/403 handler) so all downstream code sees unwrapped data"
  - "rawError prop added to BaseWidget for backward-compatible enhanced error display -- existing error string prop preserved"
  - "Fallback cascades preserved (deadlines AI->calendar, staleContacts AI->contacts) but final empty-return catches removed"
  - "dashboardPreferencesOptions catch narrowed to 404-only -- all other errors propagate to TanStack Query"
  - "getCsrfToken switched from raw axios to apiClient since auth routes are under global /api/v1 prefix"
  - "Translation keys added for retry/showDetails instead of hardcoded strings"

patterns-established:
  - "API response envelope auto-unwrap: response interceptor checks for { data, meta } shape and extracts data"
  - "Error propagation: queryFn throws on failure -> TanStack Query error state -> BaseWidget ApiErrorCard"
  - "ApiErrorCard pattern: muted card + retry button + collapsible technical details (error code + requestId)"

requirements-completed: [API-03, PERF-04]

# Metrics
duration: 29min
completed: 2026-03-03
---

# Phase 33 Plan 02: Frontend API Contract Adaptation Summary

**apiClient envelope unwrap interceptor, /api/v1/ prefix cleanup across 48+ paths, silent fallback elimination from 12 dashboard queries, and muted ApiErrorCard with retry + collapsible details in BaseWidget**

## Performance

- **Duration:** 29 min
- **Started:** 2026-03-03T17:59:08Z
- **Completed:** 2026-03-03T18:28:27Z
- **Tasks:** 2
- **Files modified:** 20

## Accomplishments
- apiClient baseURL now includes `/api/v1` prefix, eliminating prefix duplication across 48+ API call sites
- Envelope unwrap interceptor transparently unwraps `{ data, meta }` responses so all existing `.data` access patterns continue working
- Structured error logging in browser console outputs `{ code, requestId, endpoint }` for every API error
- BaseWidget error display upgraded from plain Alert to muted ApiErrorCard with retry button (using existing onRefresh) and collapsible technical details panel showing error code and requestId
- All 11 catch-and-return-empty blocks removed from use-dashboard.ts (plus 1 from use-follow-ups.ts) -- errors now propagate to TanStack Query for explicit UI error states
- emailTrendsOptions no longer generates fake mock chart data on API failure
- getApiErrorMessage updated to handle both new envelope `{ error: { code, message, details } }` and legacy `{ message }` shapes

## Task Commits

Each task was committed atomically:

1. **Task 1: Update apiClient baseURL, add envelope unwrap interceptor, strip /api/v1/ from API paths** - `1995a645` (feat)
2. **Task 2: Eliminate silent API fallbacks and upgrade BaseWidget error display to ApiErrorCard** - `43739ab4` (feat -- changes included in parallel 33-03 agent's metadata commit due to concurrent execution)

## Files Created/Modified
- `frontend/lib/api-client.ts` - baseURL with /api/v1, envelope unwrap interceptor, structured error logging, updated getCsrfToken and getApiErrorMessage
- `frontend/lib/api/ai.ts` - Stripped /api/v1/ prefix from 18+ API paths
- `frontend/lib/api/ai.test.ts` - Updated 11 test expectations to match new paths
- `frontend/lib/api/billing.ts` - Stripped /api/v1/ from 15 API paths
- `frontend/lib/api/crm.ts` - Stripped /api/v1/ from 2 API paths
- `frontend/lib/api/analytics.ts` - Stripped /api/v1/ from 2 API paths
- `frontend/hooks/queries/use-dashboard.ts` - Removed 11 catch-and-return-empty blocks, narrowed dashboardPreferences to 404-only, removed mock data generation
- `frontend/hooks/queries/use-follow-ups.ts` - Removed catch-and-return-empty from pendingFollowUpsOptions
- `frontend/components/dashboard/widgets/BaseWidget.tsx` - ApiErrorCard with retry button, collapsible details, rawError prop
- `frontend/components/dashboard/widgets/BriefingWidget.tsx` - Added rawError={error}
- `frontend/components/dashboard/widgets/DeadlinesWidget.tsx` - Added rawError={error}
- `frontend/components/dashboard/widgets/TodayEventsWidget.tsx` - Added rawError={error}
- `frontend/components/dashboard/widgets/PriorityInboxWidget.tsx` - Added rawError={error}
- `frontend/components/dashboard/widgets/UnreadEmailsWidget.tsx` - Added rawError={error}
- `frontend/components/dashboard/widgets/FollowUpWidget.tsx` - Added rawError={error}
- `frontend/components/dashboard/widgets/TrendChartsWidget.tsx` - Added rawError={error}
- `frontend/components/dashboard/widgets/AiTriageWidget.tsx` - Added rawError={error}
- `frontend/locales/en.ts` - Added retry and showDetails translation keys
- `frontend/locales/it.ts` - Added retry and showDetails translation keys
- `frontend/locales/index.ts` - Added retry and showDetails type definitions

## Decisions Made
- **Envelope unwrap interceptor positioning:** Registered as first response interceptor (before 401/403 handler) so the 401/403 handler sees unwrapped data. The error handler in the unwrap interceptor logs structured error info but does not catch -- it re-throws for the 401/403 interceptor to handle.
- **rawError prop design:** Added optional `rawError?: unknown` alongside existing `error?: string` for backward compatibility. BaseWidget extracts Axios error details internally via useMemo.
- **Fallback cascades preserved:** deadlinesOptions (AI -> calendar) and staleContactsOptions (CRM -> contacts API) still have graceful degradation chains, but the FINAL catch that returned empty was removed so TanStack Query sees the error if both cascades fail.
- **getCsrfToken migration:** Switched from raw `axios.get(apiBaseURL + path)` to `apiClient.get(path)` since auth routes are under the global `/api/v1` prefix. The `axios` import stays because it's still used for `axios.isAxiosError`.
- **Translation keys added properly:** Added `retry` and `showDetails` to en.ts, it.ts, and index.ts type definitions instead of using inline hardcoded strings or type casts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Translation keys missing for ApiErrorCard**
- **Found during:** Task 2 (BaseWidget error card implementation)
- **Issue:** TypeScript compilation failed because `t.dashboard.widgets.common.retry` and `t.dashboard.widgets.common.showDetails` didn't exist in the translation type definitions
- **Fix:** Added `retry` and `showDetails` translation keys to en.ts, it.ts, and locales/index.ts type definitions
- **Files modified:** frontend/locales/en.ts, frontend/locales/it.ts, frontend/locales/index.ts
- **Verification:** TypeScript compiles without errors
- **Committed in:** 43739ab4 (Task 2 commit)

**2. [Rule 3 - Blocking] Backtick-quoted API paths also needed stripping**
- **Found during:** Task 1 (API path cleanup)
- **Issue:** The replace_all for single-quoted `'/api/v1/` paths missed backtick-quoted paths like `` `/api/v1/ai/actions/${executionId}/approve` `` in ai.ts
- **Fix:** Ran additional replace_all for backtick-quoted paths
- **Files modified:** frontend/lib/api/ai.ts
- **Verification:** grep confirms no remaining /api/v1/ in apiClient calls
- **Committed in:** 1995a645 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
- Task 2 commit was absorbed into the parallel 33-03 agent's metadata commit (43739ab4) due to concurrent execution on the same branch. The changes are correctly committed but the commit message reflects 33-03, not 33-02. This is a cosmetic issue -- all code changes are present and verified.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Frontend fully adapted to new API contract -- all API calls go through /api/v1 prefix
- Response envelope auto-unwrapped transparently -- no call site changes needed
- Error states explicit in UI with retry capability -- no silent failures
- Phase 34 (Auth Security Hardening) can proceed -- apiClient is ready for cookie auth migration

---
*Phase: 33-api-contract-standardization*
*Completed: 2026-03-03*
