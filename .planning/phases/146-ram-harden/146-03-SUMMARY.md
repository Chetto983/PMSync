---
phase: 146-ram-harden
plan: 03
subsystem: infra
tags: [bullmq, ioredis, redis, nestjs, queue, worker, feature-flags, memory-optimization]

# Dependency graph
requires:
  - phase: 146-01
    provides: "getSharedRedisConnection/getSharedWorkerConnection singletons with ref-counted cleanup; QUEUE_PRESETS aggressive retention (removeOnComplete: true, removeOnFail: { count: 20 })"
provides:
  - "All 8 inline-worker / queue-only services now consume shared BullMQ connections — producer via getSharedRedisConnection(), worker via getSharedWorkerConnection()"
  - "Module-level worker toggles — CRM_WORKERS_ENABLED (sla-timer, csat, stage-automation) and AI_WORKERS_ENABLED (email-embedding, contact-embedding) — per D-12"
  - "Queue/Worker connection SPLIT in abstract-calendar-webhook (previously a single connection did double duty — worked only because BullMQ internally duplicates for blocking client)"
  - "Phase-wide retention compliance: no more `removeOnFail: 1000` overrides in embedding services, no more hardcoded `removeOnComplete: 100 / removeOnFail: 50` in stage-automation"
  - "common/config barrel now re-exports the 3 worker-connection functions (getSharedWorkerConnection/releaseSharedWorkerConnection/forceCloseSharedWorkerConnection)"
affects:
  - 146-02 (BaseWorker refactor shares the same getSharedWorkerConnection)
  - 146-04 (queue service migration consumes getSharedRedisConnection)
  - 146-05 (QueueHealthService rework reads from the same shared connection)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level worker toggle (D-12) — env var CRM_WORKERS_ENABLED / AI_WORKERS_ENABLED checked at top of onModuleInit with early return, queue/worker fields left null"
    - "Nullable queue/worker fields with call-site null guards (scheduleForTicket, cancelForTicket, enqueueStageChange) so producer APIs no-op when the module toggle is off"
    - "Split Queue vs Worker connection in services that create both (7 of 8) — producer singleton for Queue, worker singleton for Worker (BullMQ blocking-client constraint)"
    - "Ref-counted release in onModuleDestroy gated by `if (this.queue) releaseSharedRedisConnection()` so early-return cases don't underflow the refcount"

key-files:
  created: []
  modified:
    - backend/src/common/config/index.ts
    - backend/src/common/services/scheduled-jobs.queue.ts
    - backend/src/modules/telegram/services/reminder-notify.queue.ts
    - backend/src/modules/crm/ticket/services/sla-timer.service.ts
    - backend/src/modules/crm/ticket/services/csat.service.ts
    - backend/src/modules/crm/automation/stage-automation.service.ts
    - backend/src/modules/calendar/services/abstract-calendar-webhook.service.ts
    - backend/src/modules/ai/services/email-embedding.queue.ts
    - backend/src/modules/ai/services/contact-embedding.queue.ts

key-decisions:
  - "Import Redis as `type` everywhere — no service instantiates Redis directly anymore, so the class import is strictly a type-level reference and doesn't pull in the ioredis runtime to the module graph"
  - "abstract-calendar-webhook: extracted `workerConnection` to a local `const` at the call site (not just the class field) so TypeScript can narrow Redis | null to Redis without `as` casts inside the Worker options literal"
  - "Embedding services: `this.queue` / `this.worker` double as the AI_WORKERS_ENABLED-was-false sentinel inside onModuleDestroy. Both are left unassigned when init bails early, so the release-ref guard naturally skips releases that never happened"
  - "Trimmed inline comments in email-embedding.queue.ts to keep the file at 497 lines (under CLAUDE.md's 500-line hard limit); lost no semantic information — the D-tags identify each decision"

patterns-established:
  - "D-12 module toggle: `const enabled = this.config.get<string>('<MODULE>_WORKERS_ENABLED') || 'true'; if (enabled.toLowerCase() === 'false') { logger.warn(...); return; }` at top of onModuleInit"
  - "Null-guarded producer APIs: every `this.queue.add()` / `this.queue.getJob()` call site is preceded by `if (!this.queue) { return <no-op>; }` so the module toggle degrades to silent no-op rather than NPE"

requirements-completed: []

# Metrics
duration: 20min
completed: 2026-04-18
---

# Phase 146 Plan 03: Inline-Worker Migration to Shared Redis Summary

**Migrated 8 inline-worker / queue-only services from per-instance `new Redis()` (or per-instance connection-options literals) to the Phase 146-01 shared connection singletons, added CRM/AI module toggles per D-12, and stripped the embedding-service `removeOnFail: 1000` override plus the stage-automation hardcoded retention values so the D-08/D-09 aggressive-retention mandate reaches every queue.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-18T17:45:21Z
- **Completed:** 2026-04-18T18:05:31Z
- **Tasks:** 2 / 2
- **Files modified:** 9 (8 target services + the common/config barrel)

## Accomplishments

- All 8 services use `getSharedRedisConnection()` for Queue connections — producer-side singleton (enableOfflineQueue: false) now covers every non-BaseWorker queue in the backend.
- 7 of 8 services (all except stage-automation, which is Queue-only) use `getSharedWorkerConnection()` for Worker connections — worker-side singleton (maxRetriesPerRequest: null, lazyConnect: false) now covers every inline Worker.
- `abstract-calendar-webhook.service.ts` correctly SPLITS the Queue and Worker connections onto the two distinct singletons. Before this plan, both the Queue and the Worker used `this.redisConnection` (a standalone producer instance) — it "worked" only because BullMQ internally calls `duplicate()` on the Worker connection, masking the missing `maxRetriesPerRequest: null`.
- `sla-timer.service.ts`, `csat.service.ts`, `stage-automation.service.ts` gated by `CRM_WORKERS_ENABLED` per D-12. The shared-connection refcount never increments when the toggle is off, so "HTTP-only" replicas incur zero BullMQ Redis connections for CRM.
- `email-embedding.queue.ts`, `contact-embedding.queue.ts` gated by `AI_WORKERS_ENABLED` per D-12. Same zero-refcount property for AI worker-less replicas.
- Every `onModuleDestroy()` replaces `.quit()` on a standalone Redis instance with guarded `releaseSharedRedisConnection()` / `releaseSharedWorkerConnection()` calls — the ref-count drives actual socket teardown, services no longer race to close a connection another service is using.
- Stripped `removeOnFail: 1000` overrides from both embedding services — D-09 mandates `{ count: 20 }` via the AI_EMBEDDING preset, and the DLQ service is the durable failure audit trail.
- Stripped hardcoded `removeOnComplete: 100` / `removeOnFail: 50` from `stage-automation.service.ts`; replaced with `true` / `{ count: 20 }` per D-08/D-09.
- `common/config/index.ts` now re-exports the 3 worker-connection functions from Phase 146-01 (`getSharedWorkerConnection`, `releaseSharedWorkerConnection`, `forceCloseSharedWorkerConnection`) so consumers that import from the barrel (like `abstract-calendar-webhook`) can reach them.
- `cd backend && npx tsc --noEmit` passes after both task commits.

## Task Commits

Each task committed atomically:

1. **Task 1: 6 inline-worker / queue-only services (scheduled-jobs, reminder-notify, sla-timer, csat, stage-automation, abstract-calendar-webhook)** — `145c8720` (refactor)
2. **Task 2: email-embedding + contact-embedding queues (AI_WORKERS_ENABLED + strip removeOnFail: 1000)** — `7569971b` (refactor)

## Files Created/Modified

- `backend/src/common/config/index.ts` — **modified.** Re-exports `getSharedWorkerConnection`, `releaseSharedWorkerConnection`, `forceCloseSharedWorkerConnection` from `./queue.config` (which re-exports from `./redis-connections`). Enables `abstract-calendar-webhook` to import from the barrel without reaching into `queue.config` directly.
- `backend/src/common/services/scheduled-jobs.queue.ts` — **modified.** onModuleInit uses `getSharedRedisConnection()`; onApplicationBootstrap uses `getSharedWorkerConnection()`; onModuleDestroy releases both. `redisConnection` and `workerConnection` fields now nullable. Existing `removeOnComplete: { count: 10 } / removeOnFail: { count: 50 }` queue-level overrides preserved (not in plan scope).
- `backend/src/modules/telegram/services/reminder-notify.queue.ts` — **modified.** Same pattern as scheduled-jobs (two-phase init with Queue in onModuleInit, Worker in onApplicationBootstrap). Existing `removeOnComplete: { count: 100 } / removeOnFail: { count: 200 }` overrides preserved (not in plan scope).
- `backend/src/modules/crm/ticket/services/sla-timer.service.ts` — **modified.** Added ConfigService injection for CRM_WORKERS_ENABLED check. Queue/Worker/both connections nullable. `scheduleForTicket` and `cancelForTicket` now handle the null-queue case (returns deadline without enqueueing in schedule; no-op in cancel). Unused `QUEUE_NAMES` import removed.
- `backend/src/modules/crm/ticket/services/csat.service.ts` — **modified.** Identical pattern to sla-timer: CRM_WORKERS_ENABLED gate, nullable fields, guarded scheduleForTicket / cancelForTicket. Added ConfigService injection.
- `backend/src/modules/crm/automation/stage-automation.service.ts` — **modified.** Queue-only service (no Worker). ConfigService injected for CRM_WORKERS_ENABLED. Retention fixed: `removeOnComplete: true` (was 100), `removeOnFail: { count: 20 }` (was 50). `enqueueStageChange` guards against null queue.
- `backend/src/modules/calendar/services/abstract-calendar-webhook.service.ts` — **modified.** CRITICAL SPLIT: Queue uses producer singleton, Worker uses worker singleton. Introduced `workerConnection` class field. Worker construction uses a local `const workerConnection` so TS can narrow from `Redis | null` to `Redis` at the Worker options literal. onModuleDestroy releases both refs.
- `backend/src/modules/ai/services/email-embedding.queue.ts` — **modified.** AI_WORKERS_ENABLED gate at top of onModuleInit. Producer + worker shared connections. Removed `removeOnFail: 1000` override (D-09). onModuleDestroy releases both refs guarded by `this.queue` / `this.worker` presence. File trimmed to 497 LOC to stay under CLAUDE.md's 500-line hard limit.
- `backend/src/modules/ai/services/contact-embedding.queue.ts` — **modified.** Identical pattern to email-embedding: AI_WORKERS_ENABLED gate, shared connections, dropped `removeOnFail: 1000`, guarded destroy releases.

## Decisions Made

- **Use `import type { Redis }` everywhere**: none of the 8 services instantiate `new Redis()` anymore — the class is strictly a type-level reference. `import type` keeps the class out of the module graph at runtime and makes tree-shakers happy.
- **Nullable queue fields with call-site guards rather than non-null assertions**: the plan expects `CRM_WORKERS_ENABLED=false` / `AI_WORKERS_ENABLED=false` to be real runtime states, not debug-only. Using `null` + guards is the honest shape; `queue!` would silently NPE when the toggle fires in production.
- **abstract-calendar-webhook: introduce a local `const` inside onModuleInit** rather than just assigning `this.workerConnection`. TS can't narrow `Redis | null` across the method boundary when you immediately pass the field into a literal — the local const keeps the narrow and avoids a non-null assertion at the Worker options site.
- **Preserve scheduled-jobs / reminder-notify retention overrides**: the plan's scope for retention fixes is limited to the embedding services (D-09) and stage-automation (D-08/D-09). scheduled-jobs (`{ count: 10 } / { count: 50 }`) and reminder-notify (`{ count: 100 } / { count: 200 }`) have their own tuning rationales (10 most-recent cron runs visible, exact-time Telegram reminders debuggable). Those stay as-is until a future retention-sweep plan explicitly targets them.
- **Use the config/ barrel from abstract-calendar-webhook**: the barrel already imports from queue.config; adding the three worker-connection re-exports there is lower blast-radius than changing abstract-calendar-webhook's import path to reach directly into queue.config or redis-connections.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] common/config barrel missing worker-connection re-exports**
- **Found during:** Task 1 (abstract-calendar-webhook TS compile)
- **Issue:** `abstract-calendar-webhook.service.ts` imports from `'../../../common/config'` (the barrel), not directly from `'../../../common/config/queue.config'`. The barrel was missing `getSharedWorkerConnection` / `releaseSharedWorkerConnection` / `forceCloseSharedWorkerConnection`, so the Task 1 edits failed type-check with TS2724 "no exported member named 'getSharedWorkerConnection'".
- **Fix:** Added the three worker-connection functions to `backend/src/common/config/index.ts`'s re-export block alongside the existing `getSharedRedisConnection` exports.
- **Files modified:** `backend/src/common/config/index.ts`
- **Verification:** `npx tsc --noEmit` passes after the addition.
- **Committed in:** 145c8720 (part of Task 1).

**2. [Rule 3 - Blocking] TypeScript narrowing failure on `this.workerConnection`**
- **Found during:** Task 1 (abstract-calendar-webhook type-check)
- **Issue:** After assigning `this.workerConnection = getSharedWorkerConnection()`, passing `this.workerConnection` as the Worker's `connection` option failed with `TS2322: Type 'Redis | null' is not assignable to type 'ConnectionOptions'`. TS narrows `this.<field>` assignments only within the same function statement, not across a call boundary into an object literal.
- **Fix:** Captured the shared connection in a local `const workerConnection` first, used that at the Worker options site, and ALSO stored it on `this.workerConnection` for onModuleDestroy. Equivalent runtime behaviour, narrower type.
- **Files modified:** `backend/src/modules/calendar/services/abstract-calendar-webhook.service.ts`
- **Verification:** `npx tsc --noEmit` passes after the local-const extraction.
- **Committed in:** 145c8720 (part of Task 1).

**3. [Rule 3 - Blocking] email-embedding.queue.ts exceeded 500-line hard limit**
- **Found during:** Task 2 (post-edit line count check)
- **Issue:** After adding the AI_WORKERS_ENABLED gate and connection-release guard to `onModuleDestroy`, the file grew from 488 to 513 lines, over the CLAUDE.md 500-line hard limit. contact-embedding.queue.ts was fine (443 lines after the same edits) because it started smaller.
- **Fix:** Compacted the three D-tag comments in onModuleInit into fewer lines (one D-12 line, one combined D-01/D-02/D-09 block, inline default-job-options spread) and compressed the destroy guards from multi-line `if` blocks to one-liners. No semantic loss — the D-tags identify each change site for the audit trail.
- **Files modified:** `backend/src/modules/ai/services/email-embedding.queue.ts`
- **Verification:** `wc -l` → 497 lines. `npx tsc --noEmit` still passes.
- **Committed in:** 7569971b (part of Task 2).

**4. [Rule 2 - Missing Critical] Null guards at every producer-API call site**
- **Found during:** Task 1 (sla-timer, csat, stage-automation) and implicitly in Task 2 (embeddings, but guarded via `this.queue` / `this.worker` sentinels rather than explicit null checks)
- **Issue:** The plan specified nullable queue/worker fields (via the CRM_WORKERS_ENABLED / AI_WORKERS_ENABLED early return), but did not explicitly list every `this.queue.add()` / `this.queue.getJob()` / `this.queue.remove()` call site that would NPE when the toggle is `false`. Leaving these unprotected would turn a "web-only replica" into a crash-on-first-ticket-resolve service.
- **Fix:** Added `if (!this.queue) { ... return; }` guards at `scheduleForTicket`, `cancelForTicket` in both sla-timer and csat, and `enqueueStageChange` in stage-automation. The guard returns a safe no-op (void) for cancel flows and a typed-null `{ slaPolicyId, slaDeadline }` / void for schedule flows so the caller's business logic is unaffected.
- **Files modified:** `backend/src/modules/crm/ticket/services/sla-timer.service.ts`, `backend/src/modules/crm/ticket/services/csat.service.ts`, `backend/src/modules/crm/automation/stage-automation.service.ts`
- **Verification:** `npx tsc --noEmit` passes — strict-null-checks would have caught any missed site.
- **Committed in:** 145c8720 (part of Task 1).

---

**Total deviations:** 4 auto-fixed (3 blocking per Rule 3, 1 missing critical per Rule 2)
**Impact on plan:** All four were necessary to ship the plan as specified. The barrel fix (#1) was implied by the plan's choice of import path in abstract-calendar-webhook; the narrowing fix (#2) is a TS idiosyncrasy; the line-count fix (#3) is a CLAUDE.md hard constraint; and the null-guards (#4) are the correctness requirement that makes the D-12 toggle actually safe rather than a crash vector. No scope creep.

## Issues Encountered

- **Worktree path confusion at start.** The executor spent ~3 minutes writing edits to `d:\MailAgent\backend\...` (the main repo's checkout, where a separate parallel agent was active on 146-04) instead of `D:\MailAgent\.claude\worktrees\agent-a6e10ef5\backend\...` (this executor's actual worktree). Writes to the main repo were either invisible to this worktree or got reverted by the concurrent 146-04 agent's commit. Once the correct worktree path was identified, all subsequent Edit/Write calls used the absolute worktree path and persisted cleanly.
- **No node_modules in worktree on startup.** Fresh worktree had no dependencies installed, so `npx tsc --noEmit` failed with hundreds of "cannot find module" errors until `npm install` populated `node_modules` and `npx prisma generate` emitted the Prisma client. Type-check is green after both.

## User Setup Required

None — all changes are internal backend refactoring. `CRM_WORKERS_ENABLED` and `AI_WORKERS_ENABLED` default to `"true"` when unset, so existing Railway deployments see no behavior change. Only operators wanting to split web-only replicas need to set the env vars to `false` on those replicas.

## Next Phase Readiness

- **Plan 04 (queue service migration, already partially landed on main as c5418811) unblocked for the remaining services**: calendar-sync-queue, contacts-sync-queue, email-sync base-queue/queue, and bulk-operations-queue can now follow the same producer-only pattern as stage-automation — all 3 new `releaseSharedRedisConnection` / worker functions are reachable from the barrel.
- **Plan 05 (QueueHealthService rework) unaffected** — QueueHealthService reads via `getSharedRedisConnection()` for its direct LLEN/ZCARD commands, which was already available from Phase 146-01.
- **Known follow-up (not a regression):** scheduled-jobs and reminder-notify still carry their own queue-level retention overrides (`{ count: 10–200 }`). They fall outside the D-08/D-09 mandate per the plan's scope boundary, but a future retention-harden plan should either explicitly bless them or collapse them onto the preset.

## Self-Check: PASSED

- `backend/src/common/services/scheduled-jobs.queue.ts` — contains `getSharedRedisConnection()`, `getSharedWorkerConnection()`, `releaseSharedRedisConnection()`, `releaseSharedWorkerConnection()`; no `new Redis(` outside type import ✔
- `backend/src/modules/telegram/services/reminder-notify.queue.ts` — same checklist ✔
- `backend/src/modules/crm/ticket/services/sla-timer.service.ts` — same + `CRM_WORKERS_ENABLED` gate ✔
- `backend/src/modules/crm/ticket/services/csat.service.ts` — same + `CRM_WORKERS_ENABLED` gate ✔
- `backend/src/modules/crm/automation/stage-automation.service.ts` — Queue-only: `getSharedRedisConnection()`, `releaseSharedRedisConnection()`, `CRM_WORKERS_ENABLED` gate, `removeOnComplete: true`, `removeOnFail: { count: 20 }`, no `getSharedWorkerConnection()` ✔
- `backend/src/modules/calendar/services/abstract-calendar-webhook.service.ts` — Queue + Worker SPLIT onto separate singletons ✔
- `backend/src/modules/ai/services/email-embedding.queue.ts` — `AI_WORKERS_ENABLED` gate; no `removeOnFail: 1000`; shared connections; 497 LOC < 500 ✔
- `backend/src/modules/ai/services/contact-embedding.queue.ts` — `AI_WORKERS_ENABLED` gate; no `removeOnFail: 1000`; shared connections ✔
- Commit `145c8720` (Task 1) in worktree git log ✔
- Commit `7569971b` (Task 2) in worktree git log ✔
- `cd backend && npx tsc --noEmit` exits 0 ✔
- grep -r "new Redis(" in the 8 target files returns only comments and type imports ✔
- grep -r ".quit()" in the 8 target files returns only comments ✔
- grep -r "removeOnFail: 1000" in the embedding services returns only comments ✔
- grep -r "removeOnComplete: 100" / "removeOnFail: 50" in stage-automation returns only comments ✔

---
*Phase: 146-ram-harden*
*Completed: 2026-04-18*
