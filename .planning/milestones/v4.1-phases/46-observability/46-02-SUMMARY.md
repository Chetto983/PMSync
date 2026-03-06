---
phase: 46-observability
plan: 02
subsystem: infra
tags: [prometheus, bullmq, ai-metrics, prom-client, queue-depth, token-counting]

requires:
  - phase: 46-01
    provides: "Global MetricsModule with bullmq_queue_depth gauge and ai_tokens/cost/requests counter providers"
provides:
  - "QueueMetricsCollector polling BullMQ queue depths every 15s into Prometheus gauge"
  - "AI token/cost/request counters incrementing on every LLM call via AiRunLedgerService"
affects: [46-03]

tech-stack:
  added: []
  patterns: ["@Optional() metric injection for test-safe counter access", "Scheduled gauge collector with setInterval + OnModuleDestroy cleanup"]

key-files:
  created:
    - backend/src/common/metrics/queue-metrics.collector.ts
  modified:
    - backend/src/common/metrics/metrics.module.ts
    - backend/src/modules/ai/services/ai-run-ledger.service.ts

key-decisions:
  - "@Optional() QueueHealthService in collector to avoid circular module deps -- available at runtime via HealthModule in AppModule"
  - "@Optional() @InjectMetric in AiRunLedgerService so existing tests pass without MetricsModule"
  - "Counters fire before DB write so metrics are captured even if Prisma fails"

patterns-established:
  - "@Optional() @InjectMetric pattern: safe metric injection that degrades gracefully in test/isolated contexts"

requirements-completed: [OBS-03, OBS-04]

duration: 3min
completed: 2026-03-06
---

# Phase 46 Plan 02: Queue Depth + AI Metrics Summary

**BullMQ queue depth gauge collector every 15s and AI token/cost/request counters wired into AiRunLedgerService**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-06T10:17:44Z
- **Completed:** 2026-03-06T10:20:38Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- QueueMetricsCollector polls all BullMQ queues every 15s via QueueHealthService, setting bullmq_queue_depth gauge with queue/state labels
- AI token counters (prompt + completion), cost counter (USD), and request counter (model/run_type/status) increment on every recordRun() call
- All 6 existing ai-run-ledger tests pass unchanged thanks to @Optional() injection pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Create QueueMetricsCollector and register in MetricsModule** - `839f46b3` (feat)
2. **Task 2: Add AI metric counters to AiRunLedgerService** - `93e17dfd` (feat)

## Files Created/Modified
- `backend/src/common/metrics/queue-metrics.collector.ts` - Scheduled collector updating bullmq_queue_depth gauge from QueueHealthService
- `backend/src/common/metrics/metrics.module.ts` - Added QueueMetricsCollector to providers
- `backend/src/modules/ai/services/ai-run-ledger.service.ts` - Added @Optional() @InjectMetric for 3 AI counters, incrementing in recordRun()

## Decisions Made
- @Optional() QueueHealthService injection avoids circular module dependency (HealthModule -> MetricsModule) while being available at runtime
- @Optional() @InjectMetric for AI counters preserves backward compatibility with all existing unit tests
- Counter increments placed before Prisma DB write so metrics are captured even if DB call fails

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed providers array syntax in metrics.module.ts**
- **Found during:** Task 1
- **Issue:** Initial edit placed QueueMetricsCollector after the closing bracket of providers array
- **Fix:** Moved provider inside the array before closing bracket
- **Files modified:** backend/src/common/metrics/metrics.module.ts
- **Verification:** tsc --noEmit passed cleanly
- **Committed in:** 839f46b3

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial edit placement fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All HTTP, queue, and AI metrics now flow to /metrics endpoint for Plan 03 integration tests
- Full observability triangle complete: HTTP latency + queue depths + AI costs

---
*Phase: 46-observability*
*Completed: 2026-03-06*
