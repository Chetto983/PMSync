---
phase: 146-ram-harden
plan: 02
subsystem: infra
tags: [bullmq, ioredis, redis, nestjs, base-worker, feature-flags, memory-optimization]

# Dependency graph
requires:
  - getSharedWorkerConnection() / releaseSharedWorkerConnection() from Plan 01 (redis-connections.ts)
  - QUEUE_PRESETS retention profile from Plan 01 (removeOnComplete: true, removeOnFail: { count: 20 })
provides:
  - BaseWorker consumes the shared worker Redis singleton (1 base + N duplicates instead of 7 + 7)
  - BaseWorker passes QUEUE_PRESETS retention values through to BullMQ without coercion (D-10 fix)
  - Three-level worker feature-flag hierarchy: WORKERS_ENABLED → module toggle → per-worker envToggle
  - Module-level env vars (EMAIL_WORKERS_ENABLED / CONTACTS_WORKERS_ENABLED / CALENDAR_WORKERS_ENABLED) wired on all 7 BaseWorker subclasses
  - Common config barrel re-exports worker-connection helpers so subclasses can import via '../config'
affects:
  - 146-03 (inline worker migration — can mirror the same singleton pattern)
  - 146-04 (queue service migration — unaffected)
  - 146-05 (QueueHealthService rework — unaffected)
  - Ops: WORKERS_ENABLED=false now disables every BullMQ consumer, enabling web-only Railway replicas

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BullMQ shared-connection-with-duplicate pattern on BaseWorker: 1 singleton + BullMQ-internal .duplicate() per worker"
    - "Three-level feature-flag hierarchy (global → module → per-worker) with abstract getModuleToggle() hook"
    - "KeepJobs type normalization helper to bridge BaseWorkerConfig ergonomic types with BullMQ's strict WorkerOptions"

key-files:
  created: []
  modified:
    - backend/src/common/workers/base.worker.ts
    - backend/src/common/config/index.ts
    - backend/src/modules/email-sync/workers/sync.worker.ts
    - backend/src/modules/email-sync/workers/sync-back.worker.ts
    - backend/src/modules/email-sync/workers/folder-operations.worker.ts
    - backend/src/modules/email-sync/workers/email-send.worker.ts
    - backend/src/modules/email-sync/workers/bulk-operations.worker.ts
    - backend/src/modules/contacts/workers/contacts-sync.worker.ts
    - backend/src/modules/calendar/workers/calendar-sync.worker.ts

key-decisions:
  - "D-10 normalization happens in BaseWorker.startWorker() via a local normalizeKeepJobs() helper rather than widening BaseWorkerConfig with a BullMQ type import. Keeps the public config surface stable while satisfying BullMQ's strict KeepJobs (object-only) requirement for WorkerOptions."
  - "true → { count: 0 }: BullMQ's WorkerOptions.removeOnComplete does NOT accept boolean true; the closest immediate-removal equivalent is { count: 0 }. Matches the D-08 intent (immediate removal) while compiling cleanly."
  - "Added missing re-exports of getSharedWorkerConnection / releaseSharedWorkerConnection / forceCloseSharedWorkerConnection to the common/config barrel (unblocking Rule 3 issue discovered during type-check)."

patterns-established:
  - "Module toggle via abstract getModuleToggle() override — subclasses opt into module-level shutdown by returning the env var name"
  - "Feature-flag hierarchy short-circuits: Level 1 (global) beats Level 2 (module) beats Level 3 (per-worker); any false wins"

requirements-completed: []

# Metrics
duration: ~9min
completed: 2026-04-18
---

# Phase 146 Plan 02: BaseWorker Shared Connection + Feature Flag Hierarchy Summary

**Swapped BaseWorker's standalone `new Redis()` for the shared worker singleton (D-02), fixed the hardcoded retention override so QUEUE_PRESETS values actually reach BullMQ (D-10), and built a three-level worker feature-flag hierarchy (`WORKERS_ENABLED` → module toggle → per-worker env) wired on all 7 BaseWorker subclasses.**

## Performance

- **Duration:** ~9 min (first commit 19:50:54Z, final commit 19:52:27Z, + SUMMARY time)
- **Tasks:** 2 / 2
- **Files modified:** 9 (BaseWorker + config barrel + 7 subclasses)
- **Commits:** 2 atomic (`da5d5a7b`, `64ed4cb0`) + this SUMMARY commit

## Accomplishments

- **BaseWorker Redis consolidation (D-02):** `onModuleInit` now calls `getSharedWorkerConnection()` from `../config` instead of building a per-worker `new Redis(redisOptions)`. BullMQ still internally calls `.duplicate()` per `Worker`, so we get **1 base + 7 duplicates** instead of **7 bases + 7 duplicates** for BaseWorker subclasses. `onModuleDestroy` calls `releaseSharedWorkerConnection()` which decrements the ref count — the singleton only closes the ioredis client when the last ref drops, so individual workers can shut down independently.
- **Error handling ownership:** The per-worker `this.redisConnection.on('error', ...)` handler was removed from BaseWorker — the singleton in `redis-connections.ts` already owns it. Removing avoids multiple listeners firing per error.
- **D-10 retention passthrough fixed:** Replaced `config.removeOnComplete === true ? 100 : (config.removeOnComplete || 100)` (which coerced the new Plan 01 preset `true` into `{ count: 100 }`) with a `normalizeKeepJobs()` helper that accepts `true | number | object | undefined` and emits BullMQ's strict `KeepJobs` shape:
  - `true` → `{ count: 0 }` (immediate removal, matches D-08 intent)
  - `N` → `{ count: N }`
  - object → passthrough
  - `false` / `undefined` → caller-supplied fallback (`{ count: 0 }` for complete, `{ count: 20 }` for fail — matches D-08/D-09)
  This is the key fix that makes Plan 01's aggressive QUEUE_PRESETS values actually take effect on BaseWorker subclasses.
- **Three-level worker feature-flag hierarchy (D-11/D-12/D-13) in `isEnabled()`:**
  1. `WORKERS_ENABLED` (global master toggle — kills every BullMQ consumer, enabling web-only Railway replicas)
  2. Module-level toggle (via `getModuleToggle()` override — `EMAIL_WORKERS_ENABLED`, `CONTACTS_WORKERS_ENABLED`, `CALENDAR_WORKERS_ENABLED`)
  3. Per-worker `envToggle` (existing behavior preserved)
  Any level being `'false'` disables the worker. New abstract hook `getModuleToggle(): string | null` defaults to `null` (no module toggle), overridden in each subclass.
- **Module-toggle wiring on all 7 BaseWorker subclasses:**
  - sync / sync-back / folder-operations / email-send / bulk-operations → `EMAIL_WORKERS_ENABLED`
  - contacts-sync → `CONTACTS_WORKERS_ENABLED`
  - calendar-sync → `CALENDAR_WORKERS_ENABLED`
- **Disabled-state log message updated** to reference all three toggles so ops know where to look.
- **Common config barrel updated** to re-export `getSharedWorkerConnection` / `releaseSharedWorkerConnection` / `forceCloseSharedWorkerConnection` — was missing from `common/config/index.ts`, discovered when BaseWorker's import failed type-check.

## Task Commits

1. **Task 1 (`da5d5a7b`): `refactor(146-02)` — BaseWorker uses shared connection, retention passthrough, 3-level flags.**
   - `base.worker.ts`: swapped `new Redis()` for `getSharedWorkerConnection()`, `.quit()` for `releaseSharedWorkerConnection()`, added `normalizeKeepJobs()` helper, replaced hardcoded retention coercion with passthrough, rewrote `isEnabled()` as three-level hierarchy, added `getModuleToggle()` virtual method.
   - `common/config/index.ts`: added the three missing worker-connection re-exports.
2. **Task 2 (`64ed4cb0`): `feat(146-02)` — wire module-level worker toggles across all 7 BaseWorker subclasses.**
   - Added `getModuleToggle()` override to sync, sync-back, folder-operations, email-send, bulk-operations (→ `EMAIL_WORKERS_ENABLED`), contacts-sync (→ `CONTACTS_WORKERS_ENABLED`), calendar-sync (→ `CALENDAR_WORKERS_ENABLED`). Each override is 3 lines; no other changes.

## Files Created/Modified

- `backend/src/common/workers/base.worker.ts` — **modified.** +52 lines net (helper + imports + 3-level `isEnabled` + getModuleToggle stub + passthrough fix). Redis connection lifecycle now fully delegated to the singleton; worker-specific error handler removed because singleton owns that concern.
- `backend/src/common/config/index.ts` — **modified.** +3 lines. Added `getSharedWorkerConnection`, `releaseSharedWorkerConnection`, `forceCloseSharedWorkerConnection` re-exports from `./queue.config` (which itself re-exports from `./redis-connections` per Plan 01).
- `backend/src/modules/email-sync/workers/sync.worker.ts` — **modified.** +5 lines (doc + override).
- `backend/src/modules/email-sync/workers/sync-back.worker.ts` — **modified.** +5 lines.
- `backend/src/modules/email-sync/workers/folder-operations.worker.ts` — **modified.** +5 lines.
- `backend/src/modules/email-sync/workers/email-send.worker.ts` — **modified.** +5 lines.
- `backend/src/modules/email-sync/workers/bulk-operations.worker.ts` — **modified.** +5 lines.
- `backend/src/modules/contacts/workers/contacts-sync.worker.ts` — **modified.** +5 lines.
- `backend/src/modules/calendar/workers/calendar-sync.worker.ts` — **modified.** +5 lines.

## Decisions Made

- **`normalizeKeepJobs()` helper over widening `BaseWorkerConfig`:** Keeping `BaseWorkerConfig.removeOnComplete: number | boolean` preserves the ergonomic API that 2 subclasses (contacts-sync, calendar-sync) already rely on (`removeOnComplete: 100`). BullMQ's `WorkerOptions.removeOnComplete: KeepJobs` is strictly `{ count } | { age, count?, limit? }` — no boolean, no number. The helper bridges the gap locally; no BullMQ types leak into the public config surface.
- **`true` normalized to `{ count: 0 }` instead of `{ count: 1 }`:** `{ count: 0 }` = keep zero completed jobs = immediate removal. This is the closest semantic match to BullMQ's deprecated `true` on `JobsOptions` and matches D-08's intent of "no completed jobs retained in Redis."
- **Module toggle wiring pattern (abstract-with-null-default):** Subclasses opt in by overriding `getModuleToggle()`. Not overriding means no module toggle applies — future workers that don't belong to a logical module (none today, but future ones might) stay at the two-level hierarchy. Cleaner than hardcoding a dictionary of worker-name → module-name in BaseWorker.
- **Common config barrel fix added as Rule 3 (blocking issue):** BaseWorker's new import from `../config` would have been unresolvable without re-exporting the three worker-connection helpers. Bundled into the Task 1 commit since it's part of the same D-02 change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Added missing re-exports to `common/config/index.ts`**
- **Found during:** Task 1 type-check
- **Issue:** Plan 01 re-exported `getSharedWorkerConnection` / `releaseSharedWorkerConnection` from `queue.config.ts` but did not propagate them through the `common/config` barrel (`index.ts`). BaseWorker's new `import { getSharedWorkerConnection } from '../config'` failed `tsc` with `TS2724: '"../config"' has no exported member named 'getSharedWorkerConnection'`.
- **Fix:** Added the three new exports (`getSharedWorkerConnection`, `releaseSharedWorkerConnection`, `forceCloseSharedWorkerConnection`) to `backend/src/common/config/index.ts` in the same `export { ... } from './queue.config'` block.
- **Files modified:** `backend/src/common/config/index.ts`
- **Commit:** `da5d5a7b` (bundled with Task 1)

**2. [Rule 1 — Bug] Plan-specified `removeOnComplete: config.removeOnComplete ?? true` fails BullMQ's type check**
- **Found during:** Task 1 type-check
- **Issue:** The plan's literal code (`removeOnComplete: config.removeOnComplete ?? true`) doesn't compile. BullMQ's `WorkerOptions.removeOnComplete` is typed as `KeepJobs | undefined` where `KeepJobs = { count } | { age, count?, limit? }` — neither `boolean` nor raw `number` is assignable. Also, two subclasses (contacts-sync, calendar-sync) pass `removeOnComplete: 100` (plain number) which triggers the same TS2322 error.
- **Fix:** Introduced `normalizeKeepJobs()` helper in `base.worker.ts` that maps the ergonomic `number | boolean | KeepJobsOption | undefined` input to BullMQ's strict `KeepJobs`. Preserves the plan's intent (passthrough, aggressive defaults) while satisfying the compiler. `true` maps to `{ count: 0 }` (immediate removal, equivalent to D-08 intent), numbers to `{ count: N }`, objects unchanged, falsy/undefined to the per-site default.
- **Files modified:** `backend/src/common/workers/base.worker.ts`
- **Commit:** `da5d5a7b` (bundled with Task 1)
- **Net effect:** Identical runtime semantics to the plan's code for the production path (`QUEUE_PRESETS.X.removeOnComplete === true` → `{ count: 0 }`, which is what BullMQ interprets as "remove immediately"). No subclass changes required.

## Authentication Gates

None.

## Issues Encountered

- **Worktree missing `node_modules`:** Fresh git worktree had no `backend/node_modules`, so initial `tsc --noEmit` reported "Cannot find module '@nestjs/common'" for every source file. Resolved by creating a Windows junction (`mklink /J`) from `.claude/worktrees/agent-ac6c5304/backend/node_modules` to `D:\MailAgent\backend\node_modules`. Persistent for this worktree only; does not affect commits.
- **Pre-existing TS error in `src/common/auth/better-auth.instance.ts`:** `TS2742` about non-portable type reference through the `@simplewebauthn/server` junction path. Unrelated to this plan (file untouched since `c7b62c57`), surfaced only because the junction exposes a non-canonical path. Logged for the record; not a regression.
- **Test-file noise:** `src/test/**` and `src/__tests__/**` report many missing-module errors (vitest, msw, @ai-sdk/mistral). Pre-existing, unrelated to this plan — filtered out when validating type-safety of production code.

## User Setup Required

**Optional ops knobs — nothing required for default behavior.**

To use the new feature-flag hierarchy on Railway (or any env):

| Env var | Effect | Notes |
|---------|--------|-------|
| `WORKERS_ENABLED=false` | Global kill switch — disables every BullMQ consumer | Enables web-only replicas (HTTP handlers stay up, no queue processing) |
| `EMAIL_WORKERS_ENABLED=false` | Disables all 5 email workers (sync, sync-back, folder-ops, send, bulk) | Calendar + contacts still run |
| `CONTACTS_WORKERS_ENABLED=false` | Disables contacts sync worker | Other modules unaffected |
| `CALENDAR_WORKERS_ENABLED=false` | Disables calendar sync worker | Other modules unaffected |
| `EMAIL_SYNC_WORKERS_ENABLED=false` / `CALENDAR_SYNC_WORKERS_ENABLED=false` / etc. | Per-worker overrides (existing behavior) | Unchanged |

All three levels default to `'true'` when unset — no existing deployment behavior changes.

## Next Phase Readiness

- **Plan 03 (inline worker migration) unblocked:** Can consume `getSharedWorkerConnection()` from the same barrel BaseWorker now uses. The singleton will count refs from both BaseWorker subclasses and inline workers without double-closing.
- **Plan 04 (queue service migration) unblocked:** Unrelated to this plan's changes; producer singleton (`getSharedRedisConnection`) is what Plan 04 needs and Plan 01 already provided it.
- **Plan 05 (QueueHealthService rework) unblocked:** Unrelated to this plan's changes.
- **Ops enablement:** `WORKERS_ENABLED=false` can ship immediately on a Railway replica to validate web-only behavior before Plans 03/04/05 land.

## Self-Check: PASSED

- `backend/src/common/workers/base.worker.ts` contains `getSharedWorkerConnection` import from `../config` — ✔ (line 5-8)
- `onModuleInit` contains `this.redisConnection = getSharedWorkerConnection()` — ✔ (line 266)
- `onModuleInit` does NOT contain `new Redis(redisOptions)` — ✔ (grep confirms only legacy doc comment removed)
- `onModuleDestroy` contains `releaseSharedWorkerConnection()` — ✔ (line 515)
- `onModuleDestroy` does NOT contain `this.redisConnection.quit()` — ✔
- `startWorker` does NOT contain `config.removeOnComplete === true ? 100` — ✔
- `startWorker` uses `normalizeKeepJobs(config.removeOnComplete, { count: 0 })` — ✔ (line 383)
- `isEnabled()` checks `WORKERS_ENABLED` and module toggle — ✔ (lines 204-211)
- `protected getModuleToggle(): string | null` method present on BaseWorker — ✔ (line 223)
- All 7 subclasses override `getModuleToggle()` (grep `getModuleToggle(): string \| null` returns 7 matches in backend/src/modules) — ✔
- Module-toggle mapping verified: 5 email workers → `EMAIL_WORKERS_ENABLED`, contacts → `CONTACTS_WORKERS_ENABLED`, calendar → `CALENDAR_WORKERS_ENABLED` — ✔
- `common/config/index.ts` re-exports the three new functions — ✔
- Commit `da5d5a7b` (Task 1) present in git log — ✔
- Commit `64ed4cb0` (Task 2) present in git log — ✔
- `cd backend && npx tsc --noEmit` clean aside from pre-existing `better-auth.instance.ts` junction artifact and test-file noise — ✔

---
*Phase: 146-ram-harden*
*Completed: 2026-04-18*
