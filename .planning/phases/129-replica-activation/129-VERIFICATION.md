---
phase: 129-replica-activation
verified: 2026-03-31T14:00:00Z
status: human_needed
score: 4/4 must-haves verified
re_verification: false
human_verification:
  - test: "Deploy to Railway and confirm both replicas start, process WebSocket traffic, and handle BullMQ jobs without duplicate processing"
    expected: "Railway dashboard shows numReplicas=2 both healthy; BullMQ job logs show each job processed exactly once; WebSocket connections distribute across replicas"
    why_human: "Requires live Railway deployment. numReplicas=2 is set in railway.toml but actual multi-replica runtime behavior (job deduplication, WS routing) cannot be verified statically."
  - test: "Send SIGTERM to a running replica and observe clean drain"
    expected: "HTTP connections finish in-flight requests; WebSocket clients receive disconnect; BullMQ workers finish in-progress jobs; process exits 0 within 25s"
    why_human: "Shutdown sequence (adapter.close -> app.close -> process.exit(0)) is structurally correct in main.ts but timing behavior requires a running process."
  - test: "Scrape /metrics endpoint on each replica and verify instance label differs"
    expected: "Replica A shows instance='<uuid-A>', Replica B shows instance='<uuid-B>' in every metric line"
    why_human: "RAILWAY_REPLICA_ID is injected by Railway at runtime. Cannot verify actual label values without a live deployment."
---

# Phase 129: Replica Activation Verification Report

**Phase Goal:** Production runs on 2+ Railway replicas with tuned workers and per-replica observability
**Verified:** 2026-03-31T14:00:00Z
**Status:** human_needed — all automated checks pass; 3 runtime behaviors require live deployment validation
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | BullMQ worker concurrency is tuned per-instance so N replicas do not exceed safe total concurrency | VERIFIED | `scaleForReplicas()` applied to all 9 workers with concurrency > 1 (12 call sites); `getWorkerOptions()` auto-scales preset concurrency; `WORKER_REPLICA_COUNT` env var controls division |
| 2 | SIGTERM triggers graceful shutdown: HTTP drains, WebSocket disconnects cleanly, BullMQ workers stop | VERIFIED (structure) | `main.ts` lines 662-695: `SHUTDOWN_TIMEOUT_MS=25s`, `redisIoAdapter.close()` before `app.close()`, `forceExit.unref()` safety net, `clearTimeout` in both success and error paths |
| 3 | Prometheus metrics include RAILWAY_REPLICA_ID label enabling per-replica Grafana dashboards | VERIFIED | `metrics.module.ts` line 24-26: `defaultLabels: { instance: process.env.RAILWAY_REPLICA_ID \|\| 'local' }` in `PrometheusModule.register()` |
| 4 | Railway deployment at numReplicas=2 operates correctly | VERIFIED (config) | `railway.toml` line 6: `numReplicas = 2`; runtime correctness requires human verification |

**Score:** 4/4 truths verified (3 of 4 have runtime aspects requiring human confirmation)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/common/config/queue.config.ts` | `getReplicaCount()` and `scaleForReplicas()` helpers | VERIFIED | Lines 26-42: both functions exported, correct math (`Math.max(1, Math.floor(base / replicas))`); `getWorkerOptions()` line 388 wraps preset concurrency with `scaleForReplicas()` |
| `backend/src/common/config/__tests__/queue-config-scaling.test.ts` | 14 unit tests for scaleForReplicas | VERIFIED | 14 test cases covering: unset env (1), valid value (2, 3), invalid (0, abc, -1), edge cases (scaleForReplicas(0), scaleForReplicas(1), floor rounding) |
| `backend/src/main.ts` | Graceful shutdown with SHUTDOWN_TIMEOUT_MS and adapter close | VERIFIED | Lines 662-695: all required elements present and correctly ordered |
| `backend/src/common/metrics/metrics.module.ts` | Per-replica Prometheus labels | VERIFIED | `defaultLabels` with `RAILWAY_REPLICA_ID` present; falls back to `'local'` in dev |
| `backend/src/prisma/prisma.service.ts` | No duplicate signal handlers; implements OnModuleDestroy | VERIFIED | `enableShutdownHooks` method absent (grep: NOT_FOUND); `onModuleDestroy` at line 42-45 disconnects Prisma cleanly |
| `backend/railway.toml` | numReplicas = 2 | VERIFIED | Line 6: `numReplicas = 2`; `sleepApplication = false`, health check configured |
| `backend/src/__tests__/graceful-shutdown.test.ts` | Behavioral tests for PERF-03 | VERIFIED | 7 tests: timeout parsing, `redisIoAdapter.close()` ordering, `forceExit.unref()`, double `clearTimeout`, PrismaService structure |
| `backend/src/common/metrics/__tests__/metrics-replica-label.test.ts` | Behavioral tests for PERF-04 | VERIFIED | 7 tests: source code contains `defaultLabels`/`RAILWAY_REPLICA_ID`/fallback; env evaluation; prom-client Registry label injection; railway.toml `numReplicas = 2` |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `sync.worker.ts` | `queue.config.ts` | `import { scaleForReplicas }` | WIRED | Line 29: `import { QUEUE_NAMES, scaleForReplicas } from '../../../common/config'`; lines 47-49: three `scaleForReplicas()` calls |
| `email-send.worker.ts` | `queue.config.ts` | `import { scaleForReplicas }` | WIRED | Line 28 import; line 56: `scaleForReplicas(10)` |
| `folder-operations.worker.ts` | `queue.config.ts` | `import { scaleForReplicas }` | WIRED | Line 16 import; line 63: `scaleForReplicas(5)` |
| `sync-back.worker.ts` | `queue.config.ts` | `import { scaleForReplicas }` | WIRED | Line 30 import; line 57: `scaleForReplicas(5)` |
| `bulk-operations.worker.ts` | `queue.config.ts` | `import { scaleForReplicas }` | WIRED | Line 30 import; line 58: `scaleForReplicas(2)` |
| `push-dispatch.worker.ts` | `queue.config.ts` | `import { scaleForReplicas }` | WIRED | Line 15 import; line 36: `scaleForReplicas(5)` |
| `stage-automation.worker.ts` | `queue.config.ts` | `import { scaleForReplicas }` | WIRED | Line 15 import; line 41: `scaleForReplicas(3)` |
| `sla-timer.service.ts` | `queue.config.ts` | `import { scaleForReplicas }` | WIRED | Line 13 import; line 62: `scaleForReplicas(5)` |
| `provider-event-handler.service.ts` | `queue.config.ts` | `import { scaleForReplicas }` | WIRED | Line 17 import; line 66: `scaleForReplicas(2)` |
| `main.ts` | `redis-io.adapter.ts` | `redisIoAdapter.close()` in gracefulShutdown | WIRED | `redisIoAdapter` declared at line 635, used at line 678 inside gracefulShutdown; ordering verified: adapter.close() precedes app.close() |
| `metrics.module.ts` | `RAILWAY_REPLICA_ID` env var | `defaultLabels` in PrometheusModule.register() | WIRED | Line 25: `instance: process.env.RAILWAY_REPLICA_ID \|\| 'local'` |

---

## Data-Flow Trace (Level 4)

Not applicable. Phase 129 modifies infrastructure configuration, worker scheduling, and observability plumbing — no components rendering dynamic user-visible data.

---

## Behavioral Spot-Checks

Tests cannot be executed (no `node_modules` in the working tree). The SUMMARY explicitly notes this limitation. Both Plan 01 and Plan 02 summaries confirm tests were verified by code inspection only.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| scaleForReplicas unit tests | `cd backend && npx vitest run src/common/config/__tests__/queue-config-scaling.test.ts -x` | SKIP — no node_modules | ? SKIP |
| Graceful shutdown tests | `cd backend && npx vitest run src/__tests__/graceful-shutdown.test.ts -x` | SKIP — no node_modules | ? SKIP |
| Metrics replica label tests | `cd backend && npx vitest run src/common/metrics/__tests__/metrics-replica-label.test.ts -x` | SKIP — no node_modules | ? SKIP |
| TypeScript type check | `cd backend && npx tsc --noEmit` | SKIP — no node_modules | ? SKIP |

The test code itself is substantive and structurally sound (reviewed in full). Tests should be run in CI before production deployment.

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SCAL-03 | 129-01-PLAN.md | BullMQ worker concurrency tuned for N-replica deployment (per-instance limits, no duplicate job processing) | SATISFIED | `scaleForReplicas()` in queue.config.ts; applied to 9 workers (12 call sites); `getWorkerOptions()` auto-scales presets |
| PERF-03 | 129-02-PLAN.md | Graceful shutdown verified — HTTP drain, WebSocket disconnect, BullMQ worker stop on SIGTERM | SATISFIED (structure) | main.ts: timeout safety net, adapter.close() before app.close(), PrismaService OnModuleDestroy; runtime behavior flagged for human verification |
| PERF-04 | 129-02-PLAN.md | Prometheus metrics include per-replica instance labels for Grafana differentiation | SATISFIED | metrics.module.ts: `defaultLabels: { instance: RAILWAY_REPLICA_ID \|\| 'local' }`; all metrics tagged automatically via prom-client defaultLabels |

All three requirement IDs from PLAN frontmatter are accounted for. REQUIREMENTS.md confirms all three are marked Complete for Phase 129.

No orphaned requirements found.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/__tests__/graceful-shutdown.test.ts` | 28-35 | Test documents that `parseInt('abc')` returns NaN and main.ts does not guard against it | Info | `SHUTDOWN_TIMEOUT_MS=abc` in Railway env would cause `setTimeout(NaN)` — effectively no timeout. Not a blocker (unlikely in practice); env var should be validated or guarded with `\|\| 25000` after parseInt. |

No blockers. No stubs. No orphaned artifacts.

**Note on the NaN timeout issue:** `main.ts` line 663-665 does `parseInt(process.env.SHUTDOWN_TIMEOUT_MS ?? '25000', 10)` — if the env is set to a non-numeric string, `parseInt` returns NaN and `setTimeout(callback, NaN)` fires immediately (treated as 0ms). The plan's test documents this but does not fix it. This is a minor latent bug, not a blocker for the phase goal.

---

## Human Verification Required

### 1. Multi-Replica Railway Deployment

**Test:** Deploy to Railway with the current `railway.toml` (`numReplicas=2`). Observe Railway dashboard.
**Expected:** Both replicas start healthy; `/health/live` returns 200 on both; BullMQ job logs show each job processed exactly once (no duplicate processing); WebSocket connections route to one or other replica without errors.
**Why human:** `numReplicas=2` is statically correct in railway.toml but actual multi-replica concurrency behavior (BullMQ distributed locking, WS sticky sessions) requires a live Railway environment to validate.

### 2. SIGTERM Graceful Drain

**Test:** On a running replica, send SIGTERM (`kill -TERM <pid>` or Railway deploy trigger). Watch application logs for the shutdown sequence.
**Expected:** Log line "Received SIGTERM, starting graceful shutdown..."; then "Application closed gracefully" within 25 seconds; process exits 0. No "Shutdown timeout exceeded, forcing exit" in logs. No Prisma disconnect errors.
**Why human:** The shutdown sequence is structurally correct but timing depends on active connections and in-flight BullMQ jobs. Cannot verify without a running process.

### 3. Per-Replica Prometheus Labels

**Test:** Scrape `/metrics` on each running Railway replica (e.g., via Grafana or `curl`). Filter for any metric line.
**Expected:** Each metric line includes `instance="<railway-replica-uuid>"` where the UUID differs between replicas. In local dev, `instance="local"` appears on all metrics.
**Why human:** `RAILWAY_REPLICA_ID` is injected by the Railway platform at runtime. Cannot verify the actual label values or replica differentiation without a live deployment.

---

## Gaps Summary

No gaps found. All four must-have truths are verified at the structural/static level:

- `scaleForReplicas()` exists, is mathematically correct, and is applied to all 9 target workers plus the `getWorkerOptions()` preset path.
- The graceful shutdown in `main.ts` has the correct structure: timeout with `unref()`, adapter close before app close, `clearTimeout` in both paths, `PrismaService.enableShutdownHooks` removed.
- Prometheus `defaultLabels` with `RAILWAY_REPLICA_ID` is present in `metrics.module.ts`.
- `railway.toml` has `numReplicas = 2`.

The phase is blocked only by the absence of a live Railway deployment to confirm runtime behavior. This is expected for an infrastructure phase.

One minor latent bug: `parseInt(SHUTDOWN_TIMEOUT_MS)` without NaN guard. Not a blocker.

---

_Verified: 2026-03-31T14:00:00Z_
_Verifier: Claude (gsd-verifier)_
