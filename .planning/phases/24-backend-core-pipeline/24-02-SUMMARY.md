---
phase: 24-backend-core-pipeline
plan: 02
subsystem: api
tags: [ai-sdk-v6, nestjs, pii, hitl, audit, rate-limiting, circuit-breaker, gdpr]

# Dependency graph
requires:
  - phase: 24-backend-core-pipeline
    plan: 01
    provides: AiChatService skeleton, AiChatModule, ConversationService, POST /ai/chat
provides:
  - PII tokenization/detokenization wired into chat pipeline
  - Audit logging on every chat request and tool execution
  - Per-user rate limiting (30 req/min) via RedisRateLimiterService
  - Circuit breaker for Mistral provider via getAiCircuitBreaker
  - ConsentGuard + QuotaGuard on POST /ai/chat
  - HitlService with ActionQueue lifecycle (create, approve, reject, expire)
  - HitlController with POST /ai/chat/approve and GET /ai/chat/pending-actions
  - Tool schemas (sendEmailSchema, searchEmailsSchema) for Phase 25 implementation
  - createToolSet() closure-based tool factory with PII resolution
  - needs-approval stream chunk with ActionQueue details
affects: [24-03-PLAN, 25-frontend-chat, 27-assistant-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [closure-based-pii-resolution, fire-and-forget-audit, data-needs-approval-chunk]

key-files:
  created:
    - backend/src/modules/ai-chat/services/hitl.service.ts
    - backend/src/modules/ai-chat/controllers/hitl.controller.ts
    - backend/src/modules/ai-chat/dto/hitl.dto.ts
    - backend/src/modules/ai-chat/tools/index.ts
  modified:
    - backend/src/modules/ai-chat/services/ai-chat.service.ts
    - backend/src/modules/ai-chat/controllers/ai-chat.controller.ts
    - backend/src/modules/ai-chat/ai-chat.module.ts

key-decisions:
  - "CircuitBreaker uses isAllowed() not shouldAllowRequest() -- actual API differs from plan interface"
  - "PII uses details (not matches) property from PiiDetectionResult for storeMapping"
  - "Tool schemas use inputSchema (AI SDK v6 type), not parameters (runtime alias)"
  - "needs-approval chunk emitted as data-needs-approval via type assertion on writer"
  - "HITL expiry @Cron at module level (ScheduleModule already in AppModule)"
  - "PiiDetectionService/PiiResolutionService registered directly in AiChatModule (not in AiModule exports)"

patterns-established:
  - "createToolSet() closure for PII resolution -- tools receive resolved args without parameter threading"
  - "fire-and-forget audit/usage logging via .catch() -- never blocks chat pipeline"
  - "data-needs-approval chunk type for HITL stream events"

requirements-completed: [AI-05, AI-06, AI-08]

# Metrics
duration: 13min
completed: 2026-03-02
---

# Phase 24 Plan 02: Cross-Cutting Concerns Summary

**GDPR-compliant chat pipeline with PII tokenization, audit logging, rate limiting, circuit breaker, and HITL approval via ActionQueue**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-02T08:35:32Z
- **Completed:** 2026-03-02T08:48:32Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- PII tokenization on user messages before LLM and detokenization on tool args before execution
- Audit logging on every chat request (logAudit) and every tool call (logToolExecution)
- Per-user rate limiting at 30 req/min with HTTP 429 response including retryAfterSeconds
- Circuit breaker wrapping Mistral chat-stream with HTTP 503 when open
- ConsentGuard blocks unconsented users with HTTP 403
- QuotaGuard enforces subscription AI quota limits
- HitlService manages full ActionQueue lifecycle with @Cron expiry every 5 minutes
- HitlController exposes POST /ai/chat/approve and GET /ai/chat/pending-actions
- Stub send_email tool with needsApproval creates ActionQueue entries via onStepFinish
- Stream emits data-needs-approval chunk with actionId, actionType, payload, confidence, reasoning, expiresAt

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire PII, audit, rate limiting, circuit breaker into AiChatService** - `e5db91ea` (feat)
2. **Task 2: Create HitlService, HitlController, and stub tools** - `22dc7478` (feat)

## Files Created/Modified
- `backend/src/modules/ai-chat/services/ai-chat.service.ts` - Added PII, audit, rate limiting, circuit breaker, usage tracking, HITL, createToolSet
- `backend/src/modules/ai-chat/controllers/ai-chat.controller.ts` - Added ConsentGuard, QuotaGuard, RequiresConsent, RequiresQuota decorators
- `backend/src/modules/ai-chat/ai-chat.module.ts` - Added ComplianceModule, SubscriptionModule, AuditModule imports; PII/HITL/RateLimiter providers
- `backend/src/modules/ai-chat/services/hitl.service.ts` - ActionQueue CRUD: create, approve, reject, expire, markExecuted, markFailed
- `backend/src/modules/ai-chat/controllers/hitl.controller.ts` - POST /ai/chat/approve and GET /ai/chat/pending-actions endpoints
- `backend/src/modules/ai-chat/dto/hitl.dto.ts` - ApproveActionDto with decision enum and optional modifiedPayload
- `backend/src/modules/ai-chat/tools/index.ts` - sendEmailSchema and searchEmailsSchema (Zod, no getToolSet export)

## Decisions Made
- **isAllowed() not shouldAllowRequest():** The CircuitBreaker class has `isAllowed()` method, not `shouldAllowRequest()` as specified in the plan interface. Used the actual API.
- **PiiDetectionResult.details not .matches:** The `detect()` return type uses `details` property for PII matches, not `matches`. Matched to actual interface.
- **inputSchema not parameters:** AI SDK v6 Tool type uses `inputSchema: FlexibleSchema<INPUT>`, not `parameters`. Runtime accepts both but TypeScript requires `inputSchema`.
- **Direct provider registration:** PiiDetectionService and PiiResolutionService are not exported from any module. Registered them directly in AiChatModule providers.
- **UsageTrackingService.trackUsage() signature:** Actual signature is `trackUsage(tenantId, featureType, count)` not `trackUsage({tenantId, userId, feature, units})`. Adapted to match.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] CircuitBreaker API: isAllowed() not shouldAllowRequest()**
- **Found during:** Task 1 (circuit breaker wiring)
- **Issue:** Plan specified `circuitBreaker.shouldAllowRequest()` but actual CircuitBreaker class has `isAllowed()` and `execute()` methods
- **Fix:** Used `circuitBreaker.isAllowed()` for manual check, `circuitBreaker.reset()` on success
- **Files modified:** backend/src/modules/ai-chat/services/ai-chat.service.ts
- **Committed in:** e5db91ea (Task 1 commit)

**2. [Rule 3 - Blocking] PiiDetectionResult property name: details not matches**
- **Found during:** Task 1 (PII wiring)
- **Issue:** Plan used `piiResult.matches` but actual PiiDetectionResult has `details` property
- **Fix:** Changed to `piiResult.details` for storeMapping call
- **Files modified:** backend/src/modules/ai-chat/services/ai-chat.service.ts
- **Committed in:** e5db91ea (Task 1 commit)

**3. [Rule 3 - Blocking] Tool type: inputSchema not parameters**
- **Found during:** Task 1 (tool creation)
- **Issue:** Plan used `parameters` but AI SDK v6 TypeScript types require `inputSchema`
- **Fix:** Changed tool definitions to use `inputSchema: sendEmailSchema` instead of `parameters`
- **Files modified:** backend/src/modules/ai-chat/services/ai-chat.service.ts
- **Committed in:** e5db91ea (Task 1 commit)

**4. [Rule 3 - Blocking] TypedToolCall property: input not args**
- **Found during:** Task 1 (tool call audit logging)
- **Issue:** Plan used `tc.args` but AI SDK v6 TypedToolCall has `input` property
- **Fix:** Changed to `tc.input` in audit logging and HITL action creation
- **Files modified:** backend/src/modules/ai-chat/services/ai-chat.service.ts
- **Committed in:** e5db91ea (Task 1 commit)

**5. [Rule 3 - Blocking] AuditService.logAudit() signature: positional args not object**
- **Found during:** Task 1 (audit wiring)
- **Issue:** Plan used `logAudit({tenantId, userId, action, entity, ...})` but actual AuditService uses positional parameters
- **Fix:** Changed to `logAudit(tenantId, userId, action, entity, entityId, changes)`
- **Files modified:** backend/src/modules/ai-chat/services/ai-chat.service.ts
- **Committed in:** e5db91ea (Task 1 commit)

**6. [Rule 3 - Blocking] UsageTrackingService.trackUsage() signature mismatch**
- **Found during:** Task 1 (usage tracking)
- **Issue:** Plan used `trackUsage({tenantId, userId, feature, units})` but actual signature is `trackUsage(tenantId, featureType, count)`
- **Fix:** Changed to `trackUsage(tenantId, 'ai-calls', 1)`
- **Files modified:** backend/src/modules/ai-chat/services/ai-chat.service.ts
- **Committed in:** e5db91ea (Task 1 commit)

---

**Total deviations:** 6 auto-fixed (6 blocking -- API signature mismatches between plan and actual code)
**Impact on plan:** All auto-fixes were necessary to match actual codebase APIs. No scope creep. Functionally identical to plan intent.

## Issues Encountered
None beyond the API signature mismatches documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full chat pipeline with all cross-cutting concerns wired, ready for Plan 03 (integration tests)
- HITL approval flow is backend-complete: tool emits needs-approval, ActionQueue stores entry, REST endpoint resolves
- Tool implementations are stubs (return `{ stub: true }`) -- Phase 25 adds real email/search execution
- Frontend HITL UI (inline approval) deferred to Phase 27

## Self-Check: PASSED

All 4 created files verified present. All 3 modified files verified. Both task commits verified in git log.

---
*Phase: 24-backend-core-pipeline*
*Completed: 2026-03-02*
