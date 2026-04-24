---
phase: 150
plan: 03
subsystem: backend-ai-triage
tags: [wave-2, decay-gc, third-store, graph-memory, b-2-resolution]
dependency_graph:
  requires:
    - Phase 149 triage-decay-gc.helpers.ts (extension target)
    - Phase 150-02 GraphEdge migration (confidence/validFrom/validUntil columns + 2 indexes)
    - Phase 150-02 triage-affinity-promotion.helpers (writer populating metadata.derivedFromOverrideIds)
    - Phase 148 triage-correction-weight (weightCorrection — single source decay math)
    - Plan 01 Wave 0 RED spec: triage-decay-gc.helpers.spec.ts (5 it blocks)
  provides:
    - backend/src/modules/ai/services/triage-decay-gc.helpers.ts processAffinityEdgeDecayForTenant export
    - backend/src/modules/ai/services/triage-decay-gc.helpers.ts AFFINITY_EDGE_DECAY_CUTOFF = 0.3 constant
    - backend/src/modules/ai/services/triage-decay-gc.helpers.ts GraphEdgeDecayResult type
    - Scheduler processDecayGc 3-store sweep (Redis + TriageOverride + affinity GraphEdges)
  affects:
    - Plan 04 (read-path TriageGraphLookupService) — sees strictly live edges after this sweep runs
    - Plan 05 (LabelsService mirror hook) — node-family stability preserved (this plan deletes edges, not nodes)
tech_stack:
  added: []
  patterns:
    - "Phase 149 decay-gc helper pattern extended: pure async function + DepBag, no class-method coupling"
    - "B-2 resolution: recompute walks edge.metadata.derivedFromOverrideIds → TriageOverride → (email.from, feedback.newValue) match (no dependency on non-existent EmailTriageFeedback.overrideId column)"
    - "Batch-fetch strategy: one findMany per related table + in-memory (pattern|action) evidence index → per-edge recompute is O(|overrideIds| * avg_feedback_per_key)"
    - "Defensive evidence: empty/missing derivedFromOverrideIds → weightedSum=0 → delete (stale by construction)"
key_files:
  created: []
  modified:
    - backend/src/modules/ai/services/triage-decay-gc.helpers.ts
    - backend/src/modules/ai/services/triage-backfill-scheduler.service.ts
decisions:
  - "Third-store sweep runs INSIDE the same per-tenant try/catch as the 2-store helper — D-10 isolation preserved, one failing tenant cannot halt the whole sweep"
  - "Shared DepBag hoisted outside the helper calls (no duplication, tsc-safe)"
  - "Scheduler JSDoc compacted from 17 LF to 7 LF + D-11 tail comment trimmed to stay at exactly 699 LF (Phase 149 precedent, 1 LF under hard cap)"
  - "Empty derivedFromOverrideIds treated as stale: deleted — no traceable evidence means the edge cannot be defended on audit. Spec test 3 asserts no throw in this corrupt/legacy path."
  - "`actionsOfInterest` narrowing: feedback findMany scoped to { newValue IN actionsOfInterest } reduces candidate set by orders of magnitude at scale (most feedback is not for promoted-edge actions)"
metrics:
  duration_minutes: 10
  completed_date: 2026-04-24
  tasks_completed: 2
  files_created: 0
  files_modified: 2
  commits: 2
requirements:
  - GRAPH-03
---

# Phase 150 Plan 03: Decay-GC Third Store (Affinity Edges) — Summary

**One-liner:** Extended the Phase 149 nightly decay-gc helper with a third store — affinity edges whose recomputed weighted-sum falls below `AFFINITY_EDGE_DECAY_CUTOFF = 0.3` are hard-deleted with `triage_patterns_gc_total{store='graph_edge'}` emission; Plan 01 Task 4's 5-block RED spec turned GREEN; scheduler stays at exactly 699 LF under the Phase 149 precedent.

## Tasks Completed

| Task | Name                                                              | Commit     | Files                                                        |
| ---- | ----------------------------------------------------------------- | ---------- | ------------------------------------------------------------ |
| 1    | Extend triage-decay-gc.helpers.ts with processAffinityEdgeDecayForTenant | `e2b5afdf` | backend/src/modules/ai/services/triage-decay-gc.helpers.ts           |
| 2    | Wire processAffinityEdgeDecayForTenant into scheduler processDecayGc       | `cdc2be1e` | backend/src/modules/ai/services/triage-backfill-scheduler.service.ts |

## Helper Export Signature

```typescript
export const AFFINITY_EDGE_DECAY_CUTOFF = 0.3;

export interface GraphEdgeDecayResult {
  graphEdgeDeleted: number;
}

export async function processAffinityEdgeDecayForTenant(
  tenantId: string,
  deps: DecayGcDeps,
): Promise<GraphEdgeDecayResult>;
```

`DecayGcDeps` is reused verbatim from Phase 149 (`{ prisma, redis, gcCounter, halfLifeDays }`) — no interface change, so plan deviation Rule 4 was not triggered.

## Scheduler Integration Point

`triage-backfill-scheduler.service.ts` lines 458-463 (per-tenant loop inside `processDecayGc`):

```
Line 458:          await processDecayGcForTenant(tenant.tenantId, deps);
Line 459-460:  // Phase 150 D-06 comment
Line 461-462:  await processAffinityEdgeDecayForTenant(tenant.tenantId, deps);
```

Ordering invariant: `processDecayGcForTenant` (line 458) < `processAffinityEdgeDecayForTenant` (line 462) — two-store sweep completes before the affinity-edge sweep reads `TriageOverride` (D-09 ordering extended: recomputed override evidence drives edge recompute).

Both helper calls live inside the SAME per-tenant `try/catch` (D-10 isolation). A failing affinity-edge sweep for tenant A does not halt the outer loop — the next tenant proceeds after the standard 500ms sleep.

## Acceptance Criteria Results

### Task 1 — Helper

| Gate                                                                                                   | Expected | Observed | Pass |
| ------------------------------------------------------------------------------------------------------ | -------- | -------- | ---- |
| `grep -c 'export async function processAffinityEdgeDecayForTenant'`                                    | 1        | 1        | ✓    |
| `grep -c 'AFFINITY_EDGE_DECAY_CUTOFF = 0.3'`                                                           | 1        | 1        | ✓    |
| `grep -c "store: 'graph_edge'"`                                                                        | ≥1       | 1        | ✓    |
| `grep -c 'derivedFromOverrideIds'`                                                                     | ≥2       | 4        | ✓    |
| `grep -c 'prisma.triageOverride.findMany'`                                                             | ≥1       | 1 (in new fn) / 2 (file total) | ✓    |
| `grep -cE 'prisma\.(graphEdge\|emailTriageFeedback\|triageOverride\|email)\.(findMany\|deleteMany)'` | ≥5       | 9        | ✓    |
| `grep -c 'fb\.overrideId\|feedback\.overrideId'` (B-2 compliance)                                      | 0        | 0        | ✓    |
| File LF                                                                                                | ≤500     | 414      | ✓    |
| `npx tsc --noEmit` exit code                                                                           | 0        | 0        | ✓    |
| `npx jest triage-decay-gc.helpers.spec.ts` — 5/5 GREEN                                                 | 5/5      | 5/5      | ✓    |
| Phase 149 regression (`triage-learning-redis`)                                                         | green    | 21/21    | ✓    |

### Task 2 — Scheduler

| Gate                                                              | Expected | Observed | Pass |
| ----------------------------------------------------------------- | -------- | -------- | ---- |
| `grep -c 'processAffinityEdgeDecayForTenant'` (import + call)     | ≥2       | 2        | ✓    |
| `grep -c 'graph_edge'` (comments + log line)                      | ≥1       | 3        | ✓    |
| `grep -c 'Phase 150 D-06'` (code comment)                         | ≥1       | 3        | ✓    |
| Call ordering: 2-store line < 3-store line                        | OK       | 458 < 462 | ✓    |
| File LF                                                           | ≤700     | 699      | ✓    |
| `npx tsc --noEmit` exit code                                      | 0        | 0        | ✓    |
| Wave 0/1 + Phase 149 regression suite                             | all green | 49/49    | ✓    |

## Jest Evidence

### Plan 01 RED → Plan 03 GREEN

```
Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
Time:        0.519 s
```

All 5 Plan 01 Task 4 RED it() blocks now pass:

1. `hard-deletes affinity edge when recomputed confidence < 0.3` — PASS
2. `keeps affinity edge when recomputed confidence = 0.35 (just above threshold)` — PASS
3. `defensively handles affinity edge with empty derivedFromOverrideIds (corrupt/legacy)` — PASS
4. `scopes deletes per tenant (multi-tenant invariant)` — PASS
5. `emits gcCounter with store=graph_edge label on every delete` — PASS

### Phase 149 Regression Suite

```
Test Suites: 6 passed, 6 total
Tests:       49 passed, 49 total
Time:        5.636 s
```

Covers `triage-learning-redis`, `triage-correction.service`, `triage-correction-weight`, `triage-feedback`, `triage-promotion*` (5 patterns → 6 spec files). Zero regressions from the third-store extension.

### Plan 01 + Plan 02 + Plan 03 Combined

```
Test Suites: 2 passed, 2 total
Tests:       12 passed, 12 total
```

`triage-decay-gc.helpers.spec.ts` (5) + `triage-affinity-promotion.helpers.spec.ts` (7) — both Wave 0/1 helper specs green together.

Run command (Wave 0 bypass config, same as Plans 01/02 — skips globalSetup because local Postgres test DB is not running in this executor's environment):

```bash
npx jest --config=D:/tmp/jest-wave0-config.json triage-decay-gc.helpers.spec.ts
```

## B-2 Resolution Confirmation

**Problem:** `EmailTriageFeedback` table (schema.prisma §2565-2581) has NO `overrideId` column. Any spec or implementation walking `feedback.overrideId` would silently compile but fail at runtime against a real schema — OR pass at unit-test time with a permissive mock but leak evidence at prod time.

**Plan 03's resolution:**

1. The helper NEVER accesses `.overrideId` on a feedback row. `grep 'fb\.overrideId|feedback\.overrideId'` returns zero.
2. Evidence walk goes: `edge.metadata.derivedFromOverrideIds` (plural, on the EDGE) → `prisma.triageOverride.findMany({ where: { tenantId, id: { in: [...] } } })` (tenant-scoped batch) → map-by-id → (pattern, action) extraction → `prisma.emailTriageFeedback.findMany({ where: { tenantId, newValue: { in: actions } } })` → `prisma.email.findMany` → in-memory key `${emailFromLower}|${feedback.newValue}` matches `${override.pattern.toLower()}|${override.action}`.
3. Same matching logic as Plan 02 Task 3 promotion writer (`triage-affinity-promotion.helpers.ts`) — if the writer promoted an edge based on (sender, label) evidence, this reader finds the same evidence using the same normalization.

**Spec test 3 specifically covers the defensive path** (empty `derivedFromOverrideIds` array → weightedSum=0 → edge deleted, no throw).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Scheduler grew to 716 LF on first extension, over the 700 hard cap**

- **Found during:** Task 2 tsc+LF verification.
- **Issue:** Adding the new helper call + totalGraphEdgeDeleted accumulator + per-tenant log line added ~17 LF, pushing the file from 699 to 716 LF. Phase 149 precedent is 700 LF hard cap.
- **Fix:** Compacted the processDecayGc JSDoc from 17 LF (Phase 149 original) to 7 LF (now covers 3 stores + same emission invariants) + trimmed the D-11 "stamp end-of-run gauge" comment block from 5 LF to 4 LF. Net reduction: 11 LF ⇒ file ends at exactly 699 LF — same precedent as Plan 02.
- **Files modified:** `backend/src/modules/ai/services/triage-backfill-scheduler.service.ts`
- **Commit:** `cdc2be1e` (combined Task 2 change — single commit)

### Planner-vs-Reality Discrepancies (Not Fixed)

None for Plan 03. The plan's pseudocode landed verbatim with only the Option B note not being applicable (this plan deletes edges, doesn't create nodes, so `findOrCreateGraphNode` from the 150-02 cross-plan contract is not needed here — documented as N/A in the plan itself).

### Jest test-infra posture (carried from Plans 01 + 02)

- `backend/jest.config.js` wires `globalSetup: '<rootDir>/test/global-setup.ts'` which runs `prisma migrate deploy + seed`. Local Postgres is not running in this executor's environment, so standard `npx jest <spec>` aborts before any test loads.
- Reused Plans 01+02's `D:/tmp/jest-wave0-config.json` bypass config (no globalSetup/globalTeardown). All 5 decay-gc spec assertions are pure-unit (mocks only, no DB), so the bypass run is semantically equivalent.

### Auth Gates

None.

## Key Decisions

1. **Shared DepBag hoisted once per tenant iteration.** The Phase 149 helper and the new Phase 150 helper both take the same `DecayGcDeps` shape. Rather than constructing the bag twice (once inline at each call site), it's built once at the top of the per-tenant `try` block and passed to both calls. Cuts 5 LF and makes the helper-signature contract load-bearing (changing `DecayGcDeps` shape breaks both call sites at once, which is what we want).

2. **Third-store sweep INSIDE the 2-store sweep's try/catch.** An alternative was a separate try/catch per helper call. Rejected: if the affinity-edge sweep throws, we still incremented the 2-store accumulators — confusing on metrics/logs. A single try/catch per tenant means one log line per tenant AND one failure mode per tenant, consistent with Phase 149 D-10.

3. **Empty `derivedFromOverrideIds` → delete (not keep).** Corrupt/legacy edges with no provenance cannot be defended on audit. The alternative (keep them with `validUntil` pushed out) would accumulate untraceable edges indefinitely. Spec test 3 explicitly asserts "no throw" but does not assert count/delete — that was plan-left-intentionally-ambiguous. We chose delete because the helper's contract is "decay sweep" and edges with no evidence are, by construction, fully decayed.

4. **`newValue IN actionsOfInterest` narrowing on feedback findMany.** Without this narrowing, the feedback findMany would return ALL correction feedback for the tenant — at scale (~233 ai_run_ledger rows relinked post-wipe, ~274 emails synced), the fanout would dominate the sweep. Narrowing by action keeps the result set proportional to the number of distinct promoted actions (today ~5-10 per tenant).

5. **Comment compacting ≠ behavior change.** The Phase 149 `processDecayGc` JSDoc covered the 2 stores in 17 LF. The Phase 150 version covers 3 stores in 7 LF — same semantic contract (the body is authoritative, the JSDoc is a map). No metric emissions changed, no ordering changed, no tenant isolation changed.

## Known Stubs

None. Third-store sweep is fully wired:
- Helper function exported and typed.
- Constant threshold exported (`AFFINITY_EDGE_DECAY_CUTOFF = 0.3`).
- Scheduler calls it inside the existing per-tenant try/catch.
- Metrics emit with `store: 'graph_edge'` label (MetricsModule provider already registered in 150-02 `57287bd6`).
- Plan 01 RED spec turned GREEN (5/5).

## Threat Flags

No new attack surface introduced beyond the plan's existing `<threat_model>` mitigations. Re-verified against the Plan 03 `<threat_model>` table:

| Threat ID     | Status     | Verification                                                                                             |
| ------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| T-150-03-01   | mitigated  | Defensive `((e.metadata as any)?.derivedFromOverrideIds ?? [])` in 2 places; spec test 3 no-throw asserted |
| T-150-03-02   | mitigated  | Every `prisma.{graphEdge,triageOverride,emailTriageFeedback,email}.(findMany\|deleteMany)` includes `tenantId` — spec test 4 asserts |
| T-150-03-03   | mitigated  | `where` clause uses Phase 150-02 indexes `(tenantId, edgeType, confidence)` + `(tenantId, edgeType, validUntil)` |
| T-150-03-04   | mitigated  | `gcCounter?.inc({ store: 'graph_edge', tenant_id })` emits immediately before `deleteMany`; spec test 5 asserts |
| T-150-03-05   | mitigated  | Every batch fetch tenant-scoped; cross-tenant evidence cannot leak into the (pattern\|action) index      |
| T-150-03-06   | accepted   | Hardcoded `['SENDER_LABEL_AFFINITY', 'DOMAIN_LABEL_AFFINITY']` — future edgeType rename must update this |
| T-150-03-07   | mitigated  | BullMQ concurrency:1 + Plan 02 FIFO ordering (promotion BEFORE decay-gc); unchanged by this plan          |
| T-150-03-08   | mitigated  | All batch fetches tenant-scoped — collision on (pattern, action) within same tenant is intentional dedup |

## Files Modified

- `backend/src/modules/ai/services/triage-decay-gc.helpers.ts` — 270 → 414 LF (+144). Added `AFFINITY_EDGE_DECAY_CUTOFF` const, `GraphEdgeDecayResult` interface, `processAffinityEdgeDecayForTenant` function with batch-fetch + in-memory evidence index + tenant-scoped hard-delete path.
- `backend/src/modules/ai/services/triage-backfill-scheduler.service.ts` — 699 → 699 LF (same count, +28/-28 lines net). Import block updated (named list instead of single import), `processDecayGc` JSDoc compacted from 17 to 7 LF, per-tenant loop extended with shared DepBag + affinity-edge call + per-tenant log line + summary log with graph_edges counter, D-11 tail comment trimmed.

## Commits

| Hash       | Subject                                                             |
| ---------- | ------------------------------------------------------------------- |
| `e2b5afdf` | feat(150-03): extend decay-gc with affinity-edge third store (D-06) |
| `cdc2be1e` | feat(150-03): wire affinity-edge decay into scheduler processDecayGc (D-06) |

## Self-Check

- [x] backend/src/modules/ai/services/triage-decay-gc.helpers.ts — MODIFIED (414 LF, processAffinityEdgeDecayForTenant present)
- [x] backend/src/modules/ai/services/triage-backfill-scheduler.service.ts — MODIFIED (699 LF, 2 occurrences of processAffinityEdgeDecayForTenant)
- [x] Commit `e2b5afdf` — FOUND in git log
- [x] Commit `cdc2be1e` — FOUND in git log
- [x] `npx tsc --noEmit` exit 0
- [x] `npx jest triage-decay-gc.helpers.spec.ts` — 5/5 GREEN
- [x] Phase 149 regression (`triage-learning-redis|triage-correction.service|triage-correction-weight|triage-feedback|triage-promotion`) — 49/49 GREEN
- [x] B-2 compliance: zero `fb.overrideId|feedback.overrideId` references in helper

## Self-Check: PASSED
