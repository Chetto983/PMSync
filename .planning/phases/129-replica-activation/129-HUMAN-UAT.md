---
status: partial
phase: 129-replica-activation
source: [129-VERIFICATION.md]
started: 2026-03-31T14:05:00Z
updated: 2026-03-31T14:05:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Multi-Replica Railway Deployment
expected: Both replicas start healthy; BullMQ jobs processed exactly once; WebSocket connections distribute correctly
result: [pending]

### 2. SIGTERM Graceful Drain
expected: Clean shutdown within 25s; no timeout forcing; process exits 0
result: [pending]

### 3. Per-Replica Prometheus Labels
expected: Each replica's /metrics shows distinct RAILWAY_REPLICA_ID instance label
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
