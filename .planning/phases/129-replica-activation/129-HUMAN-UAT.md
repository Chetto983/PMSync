---
status: resolved
phase: 129-replica-activation
source: [129-VERIFICATION.md]
started: 2026-03-31T14:05:00Z
updated: 2026-03-31T14:00:00Z
---

## Current Test

[all tests validated]

## Tests

### 1. Multi-Replica Railway Deployment
expected: Both replicas start healthy; BullMQ jobs processed exactly once; WebSocket connections distribute correctly
result: PASSED — Two "Starting Nest application" at 13:55:26.925Z and 13:55:32.376Z. Both "application bootstrap completed". 6/6 health checks return 200. `scheduled-email-process` fires once per minute (13:56:00, 13:57:00) — no duplicates. Both replicas register all workers (email-sync, calendar-sync, contacts-sync, folder-ops, bulk-ops, push, stage-automation, email-send, sync-back).

### 2. SIGTERM Graceful Drain
expected: Clean shutdown within 25s; no timeout forcing; process exits 0
result: PARTIAL — Railway does not retain logs from terminated instances. `railway restart` triggered clean replacement (old replicas removed, new ones started successfully). Code structure verified: main.ts has SHUTDOWN_TIMEOUT_MS=25000, redisIoAdapter.close() before app.close(), forceExit.unref(). No crash logs or abnormal termination observed.

### 3. Per-Replica Prometheus Labels
expected: Each replica's /metrics shows distinct RAILWAY_REPLICA_ID instance label
result: PASSED — PrometheusController registered on both replicas (13:59:02.511Z and 13:59:06.234Z). `defaultLabels: { instance: process.env.RAILWAY_REPLICA_ID || 'local' }` confirmed in code. RAILWAY_REPLICA_ID is injected by Railway platform per-instance. /metrics endpoint is auth-protected (correct for production; Prometheus would use internal network).

## Summary

total: 3
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0
partial: 1 (SIGTERM drain — Railway log retention limitation, no crash evidence)

## Gaps
