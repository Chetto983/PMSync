---
phase: 33-api-contract-standardization
plan: 01
subsystem: api
tags: [nestjs, interceptor, exception-filter, api-versioning, global-prefix, correlation-id]

# Dependency graph
requires:
  - phase: 32-architecture-decoupling
    provides: Clean module boundaries, ToolRegistryModule, reduced forwardRef edges
provides:
  - ResponseEnvelopeInterceptor wrapping all responses in { data, meta } shape
  - ApiExceptionFilter mapping all exceptions to { error: { code, message, details }, meta }
  - setGlobalPrefix('api/v1') with health/webhook exclusions
  - @SkipEnvelope decorator for streaming endpoints
  - CorrelationInterceptor globally registered
  - 7 controllers cleaned of manual api/v1/ prefix duplicates
affects: [33-02-PLAN, 33-03-PLAN, frontend-api-clients]

# Tech tracking
tech-stack:
  added: []
  patterns: [response-envelope, unified-error-shape, api-versioning-global-prefix]

key-files:
  created:
    - backend/src/common/decorators/skip-envelope.decorator.ts
    - backend/src/common/interceptors/response-envelope.interceptor.ts
    - backend/src/common/interceptors/response-envelope.interceptor.spec.ts
    - backend/src/common/filters/api-exception.filter.ts
    - backend/src/common/filters/api-exception.filter.spec.ts
  modified:
    - backend/src/main.ts
    - backend/src/app.module.ts
    - backend/src/modules/ai/controllers/ai.controller.ts
    - backend/src/modules/ai/controllers/ai-health.controller.ts
    - backend/src/modules/ai/controllers/knowledge-base.controller.ts
    - backend/src/modules/ai-chat/controllers/ai-chat.controller.ts
    - backend/src/modules/ai-chat/controllers/hitl.controller.ts
    - backend/src/modules/subscription/controllers/subscription.controller.ts
    - backend/src/modules/subscription/controllers/autumn.controller.ts

key-decisions:
  - "ApiExceptionFilter duck-types PrismaClientKnownRequestError via constructor name check to avoid hard import coupling in tests"
  - "ThrottlerExceptionFilter absorbed into ApiExceptionFilter -- single unified filter instead of three separate ones"
  - "ResponseEnvelopeInterceptor registered as APP_INTERCEPTOR in app.module.ts (first position = outermost) while CorrelationInterceptor registered in main.ts via useGlobalInterceptors"
  - "webhooks excluded from global prefix via wildcard pattern for forward-compatibility"

patterns-established:
  - "Response envelope: { data, meta: { requestId, timestamp } } for all non-streaming responses"
  - "Error envelope: { error: { code, message, details }, meta: { requestId } } for all errors"
  - "@SkipEnvelope() decorator opt-out for SSE/streaming endpoints"
  - "No statusCode field in response bodies -- HTTP status conveyed via status line only"

requirements-completed: [API-01, API-02, API-03, API-04]

# Metrics
duration: 9min
completed: 2026-03-03
---

# Phase 33 Plan 01: API Contract Infrastructure Summary

**ResponseEnvelopeInterceptor + ApiExceptionFilter + setGlobalPrefix('api/v1') with 7 controller prefix cleanups and 14 unit tests**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-03T17:47:38Z
- **Completed:** 2026-03-03T17:56:12Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- ResponseEnvelopeInterceptor wraps all non-streaming responses in `{ data, meta: { requestId, timestamp } }`
- ApiExceptionFilter provides unified error shape `{ error: { code, message, details }, meta: { requestId } }` handling ThrottlerException, HttpException (including ValidationPipe arrays), PrismaClientKnownRequestError (P2002/P2025), generic Error, and unknown throws
- `setGlobalPrefix('api/v1')` applied globally with health and webhook route exclusions
- 7 controllers cleaned of manual `api/v1/` prefix duplicates (ai, ai-health, knowledge-base, ai-chat, hitl, subscription, autumn)
- @SkipEnvelope decorator applied to AI chat streaming endpoint
- ThrottlerExceptionFilter consolidated into ApiExceptionFilter (3 filters -> 1)
- CorrelationInterceptor registered globally in main.ts

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for interceptor and filter** - `a6795b86` (test)
2. **Task 1 (GREEN): Implement ResponseEnvelopeInterceptor and ApiExceptionFilter** - `b7fb17c1` (feat)
3. **Task 2: Wire global prefix, interceptors, filters, clean controller prefixes** - `7da78d47` (feat)

_TDD approach: RED (failing tests) -> GREEN (passing implementation) for Task 1_

## Files Created/Modified
- `backend/src/common/decorators/skip-envelope.decorator.ts` - @SkipEnvelope decorator and SKIP_ENVELOPE_KEY constant
- `backend/src/common/interceptors/response-envelope.interceptor.ts` - Wraps responses in { data, meta } envelope
- `backend/src/common/interceptors/response-envelope.interceptor.spec.ts` - 6 unit tests for envelope interceptor
- `backend/src/common/filters/api-exception.filter.ts` - Unified exception-to-error-shape mapping
- `backend/src/common/filters/api-exception.filter.spec.ts` - 8 unit tests for exception filter
- `backend/src/main.ts` - setGlobalPrefix, ApiExceptionFilter, CorrelationInterceptor registration
- `backend/src/app.module.ts` - ResponseEnvelopeInterceptor as first APP_INTERCEPTOR, ThrottlerExceptionFilter removed
- `backend/src/modules/ai/controllers/ai.controller.ts` - Prefix cleaned to 'ai'
- `backend/src/modules/ai/controllers/ai-health.controller.ts` - Prefix cleaned to 'ai'
- `backend/src/modules/ai/controllers/knowledge-base.controller.ts` - Prefix cleaned to 'ai/knowledge-base'
- `backend/src/modules/ai-chat/controllers/ai-chat.controller.ts` - Prefix cleaned to 'ai', @SkipEnvelope on streaming
- `backend/src/modules/ai-chat/controllers/hitl.controller.ts` - Prefix cleaned to 'ai/chat'
- `backend/src/modules/subscription/controllers/subscription.controller.ts` - Prefix cleaned to 'subscription'
- `backend/src/modules/subscription/controllers/autumn.controller.ts` - Prefix cleaned to 'autumn'

## Decisions Made
- **Duck-typed PrismaClientKnownRequestError:** Used constructor name check instead of hard import from `@prisma/client/runtime/library` -- avoids coupling issues in test environments while correctly identifying Prisma errors at runtime
- **Absorbed ThrottlerExceptionFilter:** The dedicated filter is no longer needed as ApiExceptionFilter handles ThrottlerException as its first check (before general HttpException)
- **Interceptor registration split:** ResponseEnvelopeInterceptor via APP_INTERCEPTOR in app.module.ts (needs Reflector DI), CorrelationInterceptor via useGlobalInterceptors in main.ts (no DI needed, simpler)
- **Webhook exclusion pattern:** Used `webhooks/(.*)` wildcard for forward-compatible webhook route exclusion

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Jest `--testPathPattern` flag renamed to `--testPathPatterns` in current Jest version -- trivial flag adjustment

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Response envelope and error shapes are live -- frontend API clients in Plan 33-02 can now adapt to the new response structure
- OpenAPI linting in Plan 33-03 can validate the standardized shapes
- All routes now resolve under `api/v1/` prefix consistently

---
*Phase: 33-api-contract-standardization*
*Completed: 2026-03-03*
