---
gsd_state_version: 1.0
milestone: v13.0
milestone_name: Intelligent Triage & Memory Consolidation
status: in_progress
stopped_at: Phase 148 Plan 05 complete — TriageAccuracyController wired at GET /api/v1/ai/triage/label-accuracy with TenantGuard + class-validator DTO + plumbing spec (6 cases); Wave 4 fully done, only Plan 06 (frontend badge) remains in Phase 148
last_updated: "2026-04-20T12:40:00Z"
last_activity: 2026-04-20
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 32
  completed_plans: 31
  percent: 97
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-01)

**Core value:** The best professional AI mail client -- fast, intelligent, and secure
**Current focus:** Phase 147 COMPLETE (UAT 7/7 PASS @ 10/10 against live prod). Ready to plan Phase 148 (Per-Label Accuracy Profiles).

## Current Position

Phase: 148 — Per-Label Accuracy Profiles (IN PROGRESS — Plans 01+02+03+04+05 of 6 complete; only Plan 06 frontend remains)
Just completed: Phase 148 Plan 05 — TriageAccuracyController at /api/v1/ai/triage/label-accuracy (@Controller('ai/triage') + @Get('label-accuracy') + @UseGuards(TenantGuard) class-level, NOT admin-only per D-09; tenantId sourced exclusively from req.user.tenantId, never query/body) + GetLabelAccuracyQueryDto (class-validator @Matches closed-enum regex on 'windows' + 'includeBreakdown' plus class-transformer @Transform string→boolean) + ai.module.ts controllers-array registration + plumbing spec with 6 it( blocks (cold-start / populated / tenant-isolation rogue-query-tenantId assertion / windows parser "7d,all" / windows default triple / includeBreakdown passthrough; TenantGuard overrideGuard'd, LabelAccuracyService {read: readMock} useValue); B-3 confirmed (setGlobalPrefix('api/v1') in main.ts:616) so no double-prefix; controller=125 LF, spec=180 LF; tsc --noEmit green; 6/6 tests green (2026-04-20)
Previously shipped (Phase 148, this session set): 148-01 — schema + wilsonInterval + TP_IMPLICIT_WINDOW_DAYS; 148-02 — Prisma migration generated offline; 148-03 — LabelAccuracyService counter engine + AccuracyDelta contract + queue + listener; 148-04 — TriageFeedbackService emit + MetricsModule 3 gauges + 1 counter + runSweep refreshGauges + 30d backfill script (2026-04-20)
Previously shipped (Phase 147, v13.0): 147-01/02/03/04/05 — all 5 plans done, 7/7 UAT PASS @ 10/10 on Railway prod
Previous (v12.0 trailing): Phase 157 PARTIAL — 157-01/02/03 shipped; 157-04/05 deferred pending Railway `staging`.
Production health: backend deployment fe363ef5 is SUCCESS. Phase 147 fully live on prod. Phase 148 Plans 01+02+03 pure additions; Plan 04 activates the feedback→event→queue→counter chain end-to-end and exposes gauges/counter on /metrics; Plan 05 exposes the HTTP read surface — frontend-visible effect still waits on Plan 06 badge pill.
Next: Plan 06 (Wave 6 — frontend: translations + TanStack hook + LabelAccuracyBadge pill + LabelTreeItem wiring per D-10/D-11/D-12)
Last activity: 2026-04-20

Progress: [█████████▓] 97% (v13.0 Phase 147 done + 148-01/02/03/04/05 done, 1 plan remains in Phase 148, 9 phases remain in milestone)

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
- [Phase 148-04]: TriageFeedbackService `EventEmitter2` appended as the LAST constructor argument per W-3. Emit happens AFTER the Prisma create and is wrapped in try/catch so a handler exception cannot corrupt the feedback write. B-2 spec asserts zero `ACCURACY_APPLIED_TOPIC` emits for the Phase 147 `added_personal_label` branch (D-04 invariant).
- [Phase 148-04]: MetricsModule gauge labelNames env-gated at module-load time (`process.env.TRIAGE_METRICS_PER_TENANT === 'true'` → `['tenant_id','window']`, else `['window']`). Flipping the env at runtime requires a process restart — documented in the provider JSDoc. Default OFF keeps under 2026 Prometheus ~100-values-per-label cardinality budget.
- [Phase 148-04]: `triage_accuracy_corrections_total` counter has NO `tenant_id` label (D-13 cardinality cap). Bounded 3×4×4 = 48 series max across `signal` × `triage_source` × `kind`.
- [Phase 148-04]: `kind='tp_credited'` label emitted when `kind==='tp' && signal==='system'` — distinguishes sweeper/backfill TP credits from live user-event TPs on Grafana. Raw `'tp'` kept for future live-path TPs (none today but the discriminator is cheap).
- [Phase 148-04]: `refreshGauges()` extracted as private LabelAccuracyService method rather than inlined at end of `runSweep` — keeps the Plan 03 stub-to-real replacement grep-auditable as a single block and makes future decay (Phase 149) hooks obvious. Service file grew 782 → 848 LF (under the 900 hard cap; 500 target carried over from Plan 03's known plan-content-vs-target inconsistency).
- [Phase 148-04]: Backfill script calls `LabelAccuracyService.applyDelta` DIRECTLY (not via `ACCURACY_APPLIED_TOPIC` emit) — simpler control flow for a one-shot script, avoids BullMQ round-trip per feedback row, and keeps side-effects observable synchronously (critical for pre/post integrity check).
- [Phase 148-04]: B-5 invariant pre-write gate: `grep -B2 -A8 "added_personal_label" backend/src/modules/ai/services/triage-feedback.service.ts` confirmed the `// else: added_personal_label — silent no-op` at line 192 with NO adjacent `recordFeedback` call. Backfill counter math is correct because the Phase 147 D-04 invariant holds.
- [Phase 148-04]: Backfill script Redis dedup sets — `triage:accuracy-backfill:feedback-seen:${tenantId}` (feedback.id members) + `triage:accuracy-backfill:credited:${tenantId}` (`${emailId}:${labelId}` members) with 7d TTL. Script is idempotent on re-run; CLI only exposes `--tenant=<id>` + `--dry-run` (no counter values accepted per T-148-04-04).
- [Phase 148-04]: All 14-day / 44-day offsets in backfill are DERIVED from `TP_IMPLICIT_WINDOW_DAYS` import (B-1 single source of truth). Only local window constant is `BACKFILL_LOOKBACK_DAYS = 30`. `grep -cE "(= |: )(14|44)(;|\s*//)"` returns 0 in the script.
- [Phase 148-05]: New controller file at `backend/src/modules/ai/controllers/triage-accuracy.controller.ts` (not merged into `TriageOverridesController`) — each triage read/write surface stays single-concern; Phase 147's overrides controller was already carrying override + promotion endpoints and doesn't need accuracy on top.
- [Phase 148-05]: Controller uses `@Controller('ai/triage')` — module-relative only — because `app.setGlobalPrefix('api/v1')` in `backend/src/main.ts:616` applies `api/v1` automatically. Double-prefixing (`@Controller('api/v1/ai/triage')`) would produce `/api/v1/api/v1/...` and break Plan 06's `apiClient` which also prefixes `/api/v1`. B-3 gate enforces this at execute time.
- [Phase 148-05]: NO `RolesGuard` and NO `@Roles(...)` decorators on the accuracy controller — D-09 says every authenticated tenant member reads their tenant's accuracy (not admin-only). Diverges intentionally from Phase 147's `TriageOverridesController` which IS gated on mutations.
- [Phase 148-05]: tenantId sourced exclusively from `req.user.tenantId` (T-148-05-01 cross-tenant info-disclosure mitigation). The plumbing spec includes a dedicated tenant-isolation case that stuffs a rogue `tenantId: 'tenant-B'` on the query DTO and asserts the controller still calls `read('tenant-A', ...)` — defensive test against future refactors accidentally introducing query-based tenant resolution.
- [Phase 148-05]: `GetLabelAccuracyQueryDto` uses `@Matches(/^(?:7d|30d|all)(?:,(?:7d|30d|all))*$/)` on `windows` (closed enum regex, rejects injection) + `@Matches(/^(?:true|false)$/)` on `includeBreakdown` plus `@Transform(({ value }) => value === 'true')`. Belt-and-braces in-controller `.filter(s => s === '7d' || ...)` adds a second line of defense inside the handler.
- [Phase 148-05]: Plumbing spec named `.plumbing.spec.ts` (W5 honesty — Phase 147 Plan 05 precedent). 6 `it(` blocks: cold-start / populated / tenant-isolation / windows parser / windows default / includeBreakdown passthrough. `TenantGuard` overrideGuard'd; `LabelAccuracyService` mocked via `{ read: readMock }` useValue. True end-to-end validation deferred to Plan 06 frontend TanStack hook or Railway smoke test.
- [Phase 148-05]: W-4 AiModule registration gate requires `grep -z` (null-delimited) to span newlines; plain `grep -qE` fails on GNU grep. Used multi-line `controllers: [...]` format (standard NestJS idiom at 7 entries) and documented the plan-gate quirk — semantic intent (`TriageAccuracyController` in the controllers array) is verified and supplementary `grep -c 'TriageAccuracyController' = 2` passes (import + array entry).

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

Last session: 2026-04-20T12:40:00Z
Stopped at: Phase 148 Plan 05 complete — TriageAccuracyController at GET /api/v1/ai/triage/label-accuracy (TenantGuard class-level, NOT admin-only per D-09; tenantId from req.user.tenantId only) + GetLabelAccuracyQueryDto (class-validator @Matches closed-enum + class-transformer boolean coercion) + ai.module.ts controllers-array wiring + plumbing spec with 6 cases (cold-start / populated / tenant-isolation rogue-query-tenantId / windows parser / windows default / includeBreakdown passthrough); B-3 confirmed, 6/6 tests green, tsc clean; only Plan 06 frontend remains in Phase 148
Resume file: .planning/phases/148-label-accuracy/148-06-PLAN.md
