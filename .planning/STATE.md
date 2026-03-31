---
gsd_state_version: 1.0
milestone: v11.0
milestone_name: Legacy Cleanup, Scalability & Billing Hardening
status: completed
stopped_at: Completed 129-01-PLAN.md and 129-02-PLAN.md
last_updated: "2026-03-31T13:41:00.000Z"
last_activity: 2026-03-31
progress:
  total_phases: 9
  completed_phases: 4
  total_plans: 10
  completed_plans: 9
  percent: 66
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-31)

**Core value:** The best professional AI mail client -- fast, intelligent, and secure
**Current focus:** Phase 128 — state-externalization

## Current Position

Phase: 129
Plan: Not started
Status: Plans 128-01 and 128-02 complete
Last activity: 2026-03-31

Progress: [██████░░░░] 66%

## Performance Metrics

**v10.0 Velocity (previous):**

- 13 phases, 27 plans completed
- ~158 commits, 533 files changed
- Timeline: 5 days (2026-03-26 -> 2026-03-30)
- Requirements: 49/50 satisfied

**v11.0 Velocity:**

- Total plans completed: 2
- Average duration: ~27min
- Total execution time: ~0.9 hours

## Accumulated Context

### Decisions

- v11.0 roadmap: Legacy cleanup (125-126) must complete before scaling (127-129) due to @Cron multi-fire risk
- v11.0 roadmap: Frontend perf (130) and billing frontend (131) can run parallel to scaling chain
- v11.0 roadmap: Billing E2E (133) last — depends on frontend UI + backend webhook
- [Phase 125]: Included ticket.controller.ts (39th file) in ApiBearerAuth cleanup -- added after research
- 125-02: Tailwind fully removed; MUI CssBaseline provides CSS reset, native @layer base for custom properties
- [Phase 125]: Swagger visual check via source inspection (production disables Swagger UI)
- [Phase 125]: Frontend visual verification via Playwright CDP against Railway/Vercel production
- [Phase 126]: All 8 @Cron decorators replaced with BullMQ registerHandler -- zero @Cron remains in codebase
- [Phase 126]: Manual package.json edit for @nestjs/schedule removal (worktree has no node_modules)
- [Phase 127]: Pool default max=20 (conservative for 2-4 replicas with max_connections=100)
- [Phase 127]: Strip connection_limit/pool_timeout from URL proactively to prevent developer confusion
- [Phase 128]: Redis Lua semaphore for triage concurrency (fail-closed, 120s TTL safety net)
- [Phase 128]: CircuitBreaker stays per-instance by design (industry standard, convergence within 90s)
- [Phase 129]: scaleForReplicas reads WORKER_REPLICA_COUNT at call time; getWorkerOptions auto-scales preset concurrency; min floor 1
- [Phase 129]: 25s shutdown timeout (env-configurable) fits within Railway 30s grace period
- [Phase 129]: WebSocket adapter closes before app.close() to prevent orphaned pub/sub
- [Phase 129]: PrismaService uses OnModuleDestroy lifecycle instead of manual signal handlers

### Blockers/Concerns

- Research: Autumn webhook contract needs verification before Phase 132 (SDK at 0.1.x)
- Research: CircuitBreaker Redis vs per-instance decision needed in Phase 128 planning

### Decisions

- [Phase 128]: TriageLearningService signalBuffer+scoreCache Maps removed; Redis RPUSH+Lua drain for multi-replica safety
- [Phase 128]: recordSignal sync->async safe (no external callers); 600s buffer TTL as orphan safety net

## Session Continuity

Last session: 2026-03-31T13:41:00.000Z
Stopped at: Completed 129-01-PLAN.md and 129-02-PLAN.md
Resume file: None
