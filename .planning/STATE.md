---
gsd_state_version: 1.0
milestone: v13.0
milestone_name: Intelligent Triage & Memory Consolidation
status: in_progress
stopped_at: Phase 148 Plan 03 complete — LabelAccuracyService + AccuracyDelta event contract + queue + listener + sweeper shipped (Wave 3 done, 3 plans remain)
last_updated: "2026-04-20T09:54:53Z"
last_activity: 2026-04-20
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 32
  completed_plans: 29
  percent: 91
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-01)

**Core value:** The best professional AI mail client -- fast, intelligent, and secure
**Current focus:** Phase 147 COMPLETE (UAT 7/7 PASS @ 10/10 against live prod). Ready to plan Phase 148 (Per-Label Accuracy Profiles).

## Current Position

Phase: 148 — Per-Label Accuracy Profiles (IN PROGRESS — Plans 01+02+03 of 6 complete, Waves 1+2+3 done)
Just completed: Phase 148 Plan 03 — LabelAccuracyService (applyDelta / sweepTps / rolloverWindows / read / runSweep) with constructor-sync W6 TRIAGE_ACCURACY_SWEEP handler + AccuracyDelta event contract (D-15 public topics + interfaces) + LabelAccuracyQueueService (BullMQ accuracy-update queue, 5min dedup) + LabelAccuracyListener (@OnEvent ACCURACY_APPLIED_TOPIC, B-7 per-branch separator guards) + AiModule wiring; 13 service spec tests green, tsc --noEmit green; Rule 1 deviation: plan's `Email.processedAt` swapped to `Email.autoTriagedAt` (plan-bug, processedAt lives on EmailAnalysis not Email — semantics identical per schema comment); B-4 Prometheus DI seam in place with 4 @Optional() tokens as null for Plan 04 enrichment (2026-04-20)
Previously shipped (Phase 148, this session): 148-01 — schema additions + wilsonInterval + TP_IMPLICIT_WINDOW_DAYS; 148-02 — Prisma migration generated offline (2026-04-20)
Previously shipped (Phase 147, v13.0): 147-01/02/03/04/05 — all 5 plans done, 7/7 UAT PASS @ 10/10 on Railway prod
Previous (v12.0 trailing): Phase 157 PARTIAL — 157-01/02/03 shipped; 157-04/05 deferred pending Railway `staging`.
Production health: backend deployment fe363ef5 is SUCCESS. Phase 147 fully live on prod. Phase 148 Plans 01+02+03 are pure additions (no emit site yet; Plan 04 wires TriageFeedbackService emitter + MetricsModule providers + backfill) — no runtime behavior change.
Next: Plan 04 (Wave 4 — TriageFeedbackService emits ACCURACY_APPLIED_TOPIC + Prometheus providers replace Plan 03 null tokens + runSweep gauge-refresh block + 30-day idempotent backfill script)
Last activity: 2026-04-20

Progress: [█████████░] 91% (v13.0 Phase 147 done + 148-01/02/03 done, 3 plans remain in Phase 148, 9 phases remain in milestone)

## Performance Metrics

**v11.0 Velocity (previous):**

- 10 phases, 18 plans completed
- Timeline: 1 day (2026-04-01)
- Requirements: 16/16 satisfied

## Accumulated Context

### Decisions

- v12.0: Superhuman-Linear hybrid — 4-pillar nav, contextual sidebar, unified tasks, Cmd+K
- v12.0: CRM data NOT deleted — surfaces via contextual panels and filtered views
- v12.0: AI Assistant moves from standalone page to overlay panel
- v12.0: Follow-ups + Reminders + Tickets + Deal tasks -> unified Tasks pillar
- v12.0: Backend unified task model before frontend Tasks page (TASK-01 prerequisite)
- v12.0: Sidebar reduction first (most visible, motivates all other changes)
- [Phase 0135]: Sidebar always 64px icon rail — no collapsed/expanded modes, mobile returns null
- [Phase 0135]: Settings pinned at bottom via flex spacer, excluded from DnD reorder
- [Phase 0137]: UncheckedUpdateInput for ManualTask FK updates -- Prisma UpdateInput requires relation objects, unchecked variant allows raw FK assignment
- [Phase 0137]: Parallel source aggregation pattern: Promise.all over filtered source queries with status reverse-mapping
- [Phase 0139]: Manual migration SQL for TaskSmartView due to shadow DB incompatibility; follows standard Prisma migration shape
- [Phase 0139]: CRM SavedViewsPanel pattern reused for SavedViewsBar with success color accent
- [Phase 0139]: Box wrapper with onClick+preventDefault to intercept sidebar Link navigation for Tasks popover
- [Phase 140]: localStorage key pmsync:crm-sidebar-open shared across email list and thread detail pages for consistent collapse state
- [Phase 0141]: Return total=-1 for timeline to avoid expensive count query; cursor pagination does not need total
- [Phase 0141]: Exclude CRM EMAIL type from timeline to prevent duplication with actual email records
- [Phase 0141]: pointer-events none/auto pattern on MUI Popover for flicker-free hover cards
- [Phase 142]: Manual migration SQL due to shadow DB conflict with crm_activities
- [Phase 142]: Raw SQL JSONB containment for contact email lookup (avoids loading all contacts)
- [Phase 142]: CategoryChip in ThreadListItem indicators row and ExpandedMessage subject header for non-intrusive visibility
- [Phase 0143]: Rule engine as typed array of SuggestionRule objects for declarative suggestion definitions
- [Phase 0143]: Extracted SidebarSuggestionsSection to separate file to keep EntityContextSidebar under 500 lines
- [Phase 147-05]: LANE_TO_ACTION placed in triage-override.service.ts next to ACTION_TO_LANE (both maps must stay inverse); forward-compat for Phase 148 lane_correction producers
- [Phase 147-05]: RolesGuard applied at class level on triage-overrides.controller — safe because roles.guard.ts:40-42 treats missing @Roles as ALLOW; only the new @Roles('super-admin') endpoint is gated
- [Phase 147-05]: Plumbing spec renamed .plumbing.spec.ts (W5 honesty) instead of .integration.spec.ts — every dep mocked, proves seam wiring NOT end-to-end behavior
- [Phase 147-05]: Cache invalidation collects affected emailIds across all promoted patterns into a single invalidateCache call (fewer Prisma round-trips)
- [Phase 147-05]: Plumbing spec reuses queue.config module-mock pattern from Plan 03 spec (not the plan's `(service as any).redis` stub — real service lazy-acquires via getRedis/getSharedRedisConnection)
- [Phase 148-01]: `LabelAccuracyProfile` uses compound `@@id([tenantId, labelId, windowKey])` (no surrogate id) — divergence from Phase 147 `TriageOverride` justified because Phase 148 never exposes rows by id in any API
- [Phase 148-01]: `labelId` stored as plain String (no FK to UserLabel) — intentional so historical accuracy survives label rename/delete without cascade destruction
- [Phase 148-01]: `TP_IMPLICIT_WINDOW_DAYS = 14` lives alongside `weightCorrection` in `triage-correction-weight.ts` — single-source-of-truth for Phase 149 exponential decay swap (B-1 fix avoids duplicate `14` literals in Plan 03 service and Plan 04 backfill)
- [Phase 148-01]: Sweep cron slot `'37 4 * * *'` — 20 min off Phase 147's `'17 4'` and off `'0 3'`/`'0 4'` clusters (anti-thundering-herd rule)
- [Phase 148-02]: Prisma migration generated offline via `prisma migrate diff --from-schema <pre> --to-schema <post> --script --output <file>` because (a) `.env` DATABASE_URL points at Railway prod where `migrate dev` is forbidden (2026-04-01 wipe memory), and (b) shadow DB fails with P3006/P1014 on Phase 142 `crm_activities` drift (same blocker Plans 139-01, 142-01, 147-02 hit). Same flow documented in Plan 147-02 SUMMARY. `prisma generate` + `tsc --noEmit` validated locally; Railway's `migrate deploy` applies on push.
- [Phase 148-03]: `Email.processedAt` referenced by plan does not exist on Email model (lives on EmailAnalysis). Used `Email.autoTriagedAt` instead — same D-06 semantics ("When auto-triage ran"). Rule 1 deviation documented in SUMMARY; spec updated to match.
- [Phase 148-03]: Service file lands at 782 LF lines (plan's 500-line cap target unachievable — plan's own pseudocode is ~700 lines verbatim). W-6 semantic intent (pure math in `label-accuracy.compute.ts`) is met; documented as Rule 1 plan-content-vs-target inconsistency in SUMMARY.
- [Phase 148-03]: B-4 `@Optional() @Inject(getToken(...))` seam with private `safeInc`/`safeSet` null-guarded helpers — Plan 03 spec passes `null` for all 4 Prometheus tokens; Plan 04 will enrich with mock Counter/Gauge without touching service constructor signature.
- [Phase 148-03]: W-2 post-transaction emit invariant enforced at both mutation sites (applyDelta + decrementSingleWindow); grep-verified no `eventEmitter.emit` appears inside a `$transaction` callback block.
- [Phase 148-03]: Redis mock for service spec reuses Phase 147 `triage-promotion.service.spec.ts` pattern — Map-backed stub via `jest.mock('../../../../common/config/queue.config', …)` so rolloverWindows tests hit `sismember`/`sadd` without opening a real ioredis socket.

### Roadmap Evolution

- Phase 146 added: RAM Harden — Redis Connection Consolidation & Memory Optimization
- v13.0 milestone created: Intelligent Triage & Memory Consolidation (Phases 147-156, 23 requirements)
  - Research basis: OpenClaw Dreaming (3-phase consolidation), Graphiti/Zep (temporal KG), SSGM (safety governance), RLM (batch reclass), Mem0 (importance scoring)
  - Key architecture: graph-based triage memory on existing EntityGraphService, BullMQ dreaming crons, confidence gating to reduce LLM calls
- Phase 157 added (2026-04-19): Scale to 1000 Users — Load Test, Quick Wins & Horizontal Split
  - Trailing infra phase after v12.0's Phase 146; depends on 146's WORKERS_ENABLED flag + module toggles
  - User chose bundled scope over 3-phase split (load-test, quick-wins, replica-split) despite recommendation to sequence them; flagged as higher-risk
  - Scope: k6/artillery load test, bound leaky Maps, scope googleapis imports, 2× HTTP-only + 1× worker-only replica topology

### Blockers/Concerns

(None yet)

## Session Continuity

Last session: 2026-04-20T09:54:53Z
Stopped at: Phase 148 Plan 03 complete — LabelAccuracyService + AccuracyDelta contract + accuracy-update queue + listener + sweeper handler shipped; 13/13 service spec tests green; ready for Plan 04 (Wave 4)
Resume file: .planning/phases/148-label-accuracy/148-04-PLAN.md
