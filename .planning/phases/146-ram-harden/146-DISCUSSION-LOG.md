# Phase 146: RAM Harden — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 146-ram-harden
**Areas discussed:** Connection consolidation scope, QueueHealthService rework, Job retention targets, Worker toggle granularity

---

## Connection Consolidation Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Migrate all to getSharedRedisConnection() | All queue services use the existing shared BullMQ connection singleton. Simplest, biggest connection drop (~12 connections eliminated). | |
| Two pools: enqueue vs worker | Enqueue-only services share one connection. Workers keep dedicated connections. Adds one pool boundary but clearer separation. | |
| You decide | Claude picks the best approach based on BullMQ requirements and current codebase patterns. | |
| Other (research) | User requested online research of 2026 best practices before deciding. | initial |

**User's initial choice:** Research best practices first
**Research performed:** BullMQ docs (connections guide, reusing connections, going to production), general Redis memory optimization articles
**Research finding:** BullMQ docs explicitly support sharing: Queue instances share safely, Workers share but internally duplicate, QueueEvents cannot share.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, full consolidation | Migrate all 12 queue services + refactor BaseWorker to share a single base connection. Target ~15 total connections. | ✓ |
| Conservative: queues only | Only consolidate queue-enqueue services. Leave BaseWorker per-worker connections. | |
| You decide | Claude picks based on risk/reward. | |

**User's choice:** Yes, full consolidation
**Notes:** Decision informed by BullMQ official documentation confirming connection sharing is safe.

---

## QueueHealthService Rework

| Option | Description | Selected |
|--------|-------------|----------|
| Replace with direct Redis commands | Drop all Queue objects. Use raw Redis commands (LLEN, ZCARD on BullMQ key patterns). Much lighter but couples to BullMQ's internal key schema. | ✓ |
| Lazy-init on demand | Don't create Queue objects at startup. Create on-demand when health endpoint is called, cache briefly, then close. | |
| Keep but reduce scope | Only monitor 5-10 critical queues instead of all 30+. Simple change, still uses Queue objects. | |
| You decide | Claude picks based on memory savings vs monitoring needs. | |

**User's choice:** Replace with direct Redis commands
**Notes:** None

---

## Job Retention Targets

| Option | Description | Selected |
|--------|-------------|----------|
| Aggressive: minimal retention | removeOnComplete: true everywhere. removeOnFail: { count: 20 }. DLQ already captures failures. Saves the most Redis memory. | ✓ |
| Moderate: small buffers | removeOnComplete: { count: 10 } everywhere. removeOnFail: { count: 50 }. Small debugging window. | |
| Keep current but fix AI_EMBEDDING | Only fix AI_EMBEDDING's removeOnFail: 1000 and BaseWorker's override that ignores presets. | |

**User's choice:** Aggressive: minimal retention
**Notes:** None

---

## Worker Toggle Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Module-level toggles | Add per-module env vars (CALENDAR_WORKERS_ENABLED, etc.). One env var disables all workers in a module. | |
| Global master toggle only | WORKERS_ENABLED=false to disable ALL background workers. Useful for web-only replicas. | |
| Both: global + module | Global WORKERS_ENABLED as master switch, plus module-level toggles for selective disabling. | ✓ |
| Keep current per-worker only | Existing envToggle per worker class is sufficient. | |

**User's choice:** Both: global + module
**Notes:** None

---

## Additional Research-Driven Items

User requested deeper research into scaling while saving resources. Two additional items surfaced and were folded into scope:

| Item | Description | Folded |
|------|-------------|--------|
| enableOfflineQueue config | Set enableOfflineQueue: false on Queue connections (fast-fail), keep default on Workers. | ✓ |
| Verify maxmemory-policy | Add startup check that warns if Redis maxmemory-policy is not noeviction. | ✓ |

---

## Claude's Discretion

- BullMQ internal key pattern details for direct Redis commands
- Exact refactoring approach per queue service
- enableOfflineQueue placement (singleton vs per-Queue)
- Migration order of operations

## Deferred Ideas

- Separate worker process (Railway service split)
- Job data size optimization (payloads to Postgres/S3)
- Redis AOF persistence tuning
