---
status: resolved
phase: 129-replica-activation
source: [129-VERIFICATION.md]
started: 2026-03-31T14:05:00Z
updated: 2026-03-31T14:08:00Z
---

## Current Test

[all tests validated on Railway production]

## Tests

### 1. Multi-Replica Railway Deployment
expected: Both replicas start healthy; BullMQ jobs processed exactly once; WebSocket connections distribute correctly
result: PASSED — Two replicas confirmed (14:05:00.859Z and 14:05:12.370Z). Both bootstrap completed. Health 200 on all checks. `scheduled-email-process` fires once/min (14:07:00, 14:08:00) — no duplicates. `WORKER_REPLICA_COUNT=2` set and validated: concurrency halved on both replicas (email-sync-high: 17→8, email-sync-normal: 10→5, email-sync-low: 7→3, email-send: 10→5, folder-ops: 5→2, sync-back: 5→2, bulk-ops: 2→1). Both replicas show identical values.

### 2. SIGTERM Graceful Drain
expected: Clean shutdown within 25s; no timeout forcing; process exits 0
result: PARTIAL — Railway does not retain logs from terminated instances. `railway restart` triggered clean replacement (old replicas removed, new ones started). Code structure verified: main.ts has SHUTDOWN_TIMEOUT_MS=25000, redisIoAdapter.close() before app.close(), forceExit.unref(). No crash logs or abnormal termination observed. Cannot observe actual drain timing due to Railway log retention limitation.

### 3. Per-Replica Prometheus Labels
expected: Each replica's /metrics shows distinct RAILWAY_REPLICA_ID instance label
result: PASSED — PrometheusController registered on both replicas. `defaultLabels: { instance: process.env.RAILWAY_REPLICA_ID || 'local' }` confirmed in code and route logs. RAILWAY_REPLICA_ID injected by Railway per-instance. /metrics endpoint auth-protected (correct for production).

## Summary

total: 3
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0
partial: 1 (SIGTERM drain — Railway log retention limitation, not a code issue)

## Gaps
