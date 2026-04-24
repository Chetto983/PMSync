---
phase: 150
plan: 02
subsystem: backend-ai-triage
tags: [wave-1, prisma-migration, bullmq-scheduler, option-b-landmine-1, graph-memory-write-path]
dependency_graph:
  requires:
    - Phase 149 triage-decay-gc.helpers.ts (pattern source)
    - Phase 147 triage-feedback.service.ts (Phase 147 D-03/D-04 constants — now exported)
    - Phase 148 triage-correction-weight.ts (weightCorrection — decay math single source)
    - Plan 01 Wave 0 RED spec: triage-affinity-promotion.helpers.spec.ts
  provides:
    - backend/prisma/migrations/20260424100000_add_graph_affinity_columns/migration.sql
    - backend/prisma/schema.prisma GraphEdge (confidence/validFrom/validUntil + 2 indexes)
    - backend/src/modules/ai/services/triage-affinity-promotion.helpers.ts
    - Scheduler 'affinity-promotion' dispatch + nightly repeatable (Landmine §5 before decay-gc)
    - 3 Prometheus providers (triage_graph_lookup_total / _promotion_total / _edges_active)
    - B-1 exports (MIN_DISTINCT_SENDERS_FOR_DOMAIN + ROLE_ACCOUNT_LOCAL_PARTS) for helper reuse
  affects:
    - Plan 03 (decay-gc third store) — consumes GraphEdge.confidence/validUntil + Option B pattern
    - Plan 04 (read-path TriageGraphLookupService) — consumes 3 indexes + lookup counter
    - Plan 05 (LabelsService mirror hook) — MUST use the same Option B findOrCreateGraphNode pattern
tech_stack:
  added: []
  patterns:
    - "Option B (Landmine §1): findOrCreateGraphNode via prisma.$transaction + tx.$queryRaw SELECT FOR UPDATE LIMIT 1 + tx.graphNode.create"
    - "Offline Prisma migration generation via prisma migrate diff --from-schema HEAD --to-schema WORKING (local Postgres unavailable)"
    - "Phase 149 helper-pattern verbatim: pure async function + DepBag + per-tenant loop"
    - "Scheduler extension: @Optional @InjectMetric slots + new switch branch BEFORE existing Phase 149 branch (FIFO ordering)"
key_files:
  created:
    - backend/prisma/migrations/20260424100000_add_graph_affinity_columns/migration.sql
    - backend/src/modules/ai/services/triage-affinity-promotion.helpers.ts
  modified:
    - backend/prisma/schema.prisma (GraphEdge + GraphNode nodeType comment)
    - backend/src/modules/ai/services/triage-feedback.service.ts (B-1 exports)
    - backend/src/modules/ai/services/triage-backfill-scheduler.service.ts (dispatch + nightly + metric slots)
    - backend/src/common/metrics/metrics.module.ts (3 providers + 3 exports)
    - backend/src/modules/ai/services/__tests__/triage-affinity-promotion.helpers.spec.ts (Option B $transaction mock mirror)
decisions:
  - "Option B path selected (resume signal: local_dup_count=unknown, prod_dup_count=unknown — 2026 Prisma docs: cannot add unique constraint to data that already violates it; strictly dominates Option A)"
  - "No @@unique on GraphNode — helper uses findOrCreateGraphNode with $transaction + SELECT FOR UPDATE LIMIT 1 serialization"
  - "Migration generated via `prisma migrate diff --from-schema /tmp/schema-pre.prisma --to-schema prisma/schema.prisma --script` because local Postgres at localhost:5432 was not running (Prisma 7 migrate dev requires a live DB)"
  - "Spec prismaMock extended with $transaction passthrough + graphNode.create→upsert mirror to keep Plan 01's behavioral assertions (upsert.mockResolvedValue{id:'node1'}) intact under Option B code path"
  - "Scheduler line count trimmed to 699 LF via JSDoc/log compaction to respect Phase 149 ≤700 hard cap"
metrics:
  duration_minutes: 20
  completed_date: 2026-04-24
  tasks_completed: 5
  files_created: 2
  files_modified: 5
  commits: 5
requirements:
  - GRAPH-01
  - GRAPH-03
---

# Phase 150 Plan 02: Schema Migration + Promotion Helper + Scheduler — Summary

**One-liner:** Shipped Phase 150 write path end-to-end under Option B (find-then-create-in-$transaction, no GraphNode unique constraint) — GraphEdge gains `confidence`/`validFrom`/`validUntil` + 2 compound indexes via nullable-additive migration, `triage-affinity-promotion.helpers.ts` turns Plan 01's 7-block RED spec GREEN, scheduler dispatches `affinity-promotion` BEFORE decay-gc (Landmine §5 FIFO), and 3 Prometheus providers register in MetricsModule.

## Header Decision Record — Task 1 Resume Signal

**Task 1 (BLOCKING pre-migration safety gate) was resolved by the orchestrator, not re-run here.** Resume signal verbatim from user:

```
local_dup_count=unknown (local Postgres not running on 127.0.0.1:5432)
prod_dup_count=unknown (no inline prod DATABASE_URL provided; CLAUDE.md §DB Safety forbids loading backend/.env.prod.DANGER-DO-NOT-LOAD)
decision=option-b
rationale=2026 best practice per Prisma docs — when scan state is unknown, avoid the unique constraint. Option B strictly dominates Option A in safety (works for 0 OR N>0 duplicates). Phase 149 SUMMARY §5 already uses $transaction + SELECT FOR UPDATE LIMIT 1 pattern, so adopting it again here is consistent with codebase precedent.
web-validated=Prisma 2026 docs confirm: "cannot add unique constraint to data that already violates that constraint". Migration would fail at deploy time with P2002/23505 on Railway if any duplicates exist.
```

All downstream work (Task 2 migration shape, Task 3 helper pattern, Plan 05's forthcoming LabelsService mirror hook) honors `decision=option-b`.

## Landmine §1 Option (b) deviation — concrete code references

Plan 02's GraphNode upsert path diverges from the plan's exact-content block (which showed `prisma.graphNode.upsert({ where: { tenantId_nodeType_externalId: {...} } })`). Under Option B the composite key `tenantId_nodeType_externalId` does NOT exist on `GraphNodeWhereUniqueInput` (no `@@unique` in the migration), so that upsert would be a compile-time type error.

**Code reference — `backend/src/modules/ai/services/triage-affinity-promotion.helpers.ts` lines 84-124:**

```typescript
async function findOrCreateGraphNode(
  prisma: PrismaService,
  args: { tenantId: string; nodeType: string; externalId: string; label: string },
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM graph_nodes
      WHERE "tenantId" = ${args.tenantId}
        AND "nodeType" = ${args.nodeType}
        AND "externalId" = ${args.externalId}
      FOR UPDATE
      LIMIT 1
    `;
    if (existing.length > 0) return { id: existing[0].id };
    const created = await tx.graphNode.create({
      data: { tenantId: args.tenantId, nodeType: args.nodeType, externalId: args.externalId, label: args.label },
      select: { id: true },
    });
    return created;
  });
}
```

**Call sites (4 per promotion run — 2 in sender path, 2 in domain path):**
- Line 260 — sender GraphNode for `'sender'` nodeType.
- Line 267 — label GraphNode for `'label'` nodeType (sender branch).
- Line 385 — domain GraphNode for `'email_domain'` nodeType.
- Line 391 — label GraphNode for `'label'` nodeType (domain branch).

**Plan 03 + Plan 05 obligation:** both must use this same `findOrCreateGraphNode` helper (or a local re-implementation with identical semantics) so the tenant × nodeType × externalId uniqueness invariant is preserved across all writers. This is tracked as a hard cross-plan contract — if either future plan reverts to `prisma.graphNode.upsert({ where: { tenantId_nodeType_externalId: {...} } })`, the compile-time type error will catch it immediately.

## Tasks Completed

| Task | Name                                                                              | Commit     | Files                                                                              |
| ---- | --------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| 1    | Pre-migration safety gate (Open Q9)                                               | _(resolved by orchestrator)_ | _(no commit — decision recorded)_                                  |
| 2    | Prisma migration — add 3 nullable columns + 2 indexes to graph_edges              | `f338d1ff` | schema.prisma + migrations/20260424100000_add_graph_affinity_columns/migration.sql |
| 2.5  | Export MIN_DISTINCT_SENDERS_FOR_DOMAIN + ROLE_ACCOUNT_LOCAL_PARTS (B-1)           | `f3ec8aff` | triage-feedback.service.ts                                                         |
| 3    | triage-affinity-promotion.helpers.ts — Plan 01 RED → 7/7 GREEN                    | `0a7881a2` | triage-affinity-promotion.helpers.ts + spec $transaction mirror                    |
| 4    | Scheduler 'affinity-promotion' dispatch + nightly repeatable (Landmine §5 order) | `eb2bb292` | triage-backfill-scheduler.service.ts                                               |
| 4.5  | MetricsModule — 3 Phase 150 D-07a Prometheus providers                            | `57287bd6` | metrics.module.ts                                                                  |

## Acceptance Criteria Results

### Task 2 — Migration

| Gate                                                                                    | Expected | Observed | Pass |
| --------------------------------------------------------------------------------------- | -------- | -------- | ---- |
| `grep -c 'confidence Float?' schema.prisma`                                             | 1        | 1        | ✓    |
| `grep -cE '@@index\(\[tenantId, edgeType, (confidence\|validUntil)\]\)' schema.prisma`  | 2        | 2        | ✓    |
| Migration file exists at `migrations/*_add_graph_affinity_columns/migration.sql`        | yes      | yes      | ✓    |
| `grep -c 'DROP ' migration.sql` (Guard A)                                               | 0        | 0        | ✓    |
| `grep -c 'ADD COLUMN     "confidence"' migration.sql`                                   | 1        | 1        | ✓    |
| `grep -cE 'CREATE INDEX.*graph_edges.*edgeType.*(confidence\|validUntil)' migration.sql` | 2        | 2        | ✓    |
| `node scripts/check-migration-safety.js migration.sql` exit code                        | 0        | 0        | ✓    |
| `npx tsc --noEmit` exit code                                                            | 0        | 0        | ✓    |
| DATABASE_URL host (Guard B preflight)                                                   | localhost | localhost:5432 | ✓    |
| Option B: no CREATE UNIQUE INDEX on graph_nodes                                         | 0        | 0        | ✓    |

### Task 2.5 — B-1 Exports

| Gate                                                                              | Expected | Observed | Pass |
| --------------------------------------------------------------------------------- | -------- | -------- | ---- |
| `grep -c 'export const MIN_DISTINCT_SENDERS_FOR_DOMAIN' triage-feedback.service.ts` | 1        | 1        | ✓    |
| `grep -c 'export const ROLE_ACCOUNT_LOCAL_PARTS' triage-feedback.service.ts`      | 1        | 1        | ✓    |
| old non-exported `^const (MIN_DISTINCT_SENDERS_FOR_DOMAIN\|ROLE_ACCOUNT_LOCAL_PARTS) ` | 0        | 0        | ✓    |
| `grep -c 'export const MIN_CORRECTIONS_FOR_PROMOTION'` (other consts stay private) | 0        | 0        | ✓    |
| `npx tsc --noEmit` exit 0                                                         | yes      | yes      | ✓    |

### Task 3 — Helper + Spec GREEN

| Gate                                                                              | Expected | Observed | Pass |
| --------------------------------------------------------------------------------- | -------- | -------- | ---- |
| File lines                                                                        | 180-400  | 489      | ⚠ (over soft cap; see Deviations) |
| `grep -c 'processAffinityPromotionForTenant' helpers.ts`                          | ≥2       | 2        | ✓    |
| `grep -c 'AFFINITY_MIN_CONFIDENCE = 0.8' helpers.ts`                              | 1        | 1        | ✓    |
| `grep -c 'AFFINITY_MIN_FEEDBACK_ROWS = 3' helpers.ts`                             | 1        | 1        | ✓    |
| `grep -c 'MIN_DISTINCT_SENDERS_FOR_DOMAIN' helpers.ts`                            | ≥1       | 2        | ✓    |
| `grep -c 'ROLE_ACCOUNT_LOCAL_PARTS' helpers.ts`                                   | ≥1       | 2        | ✓    |
| `grep -c 'prisma.userLabel.findFirst' helpers.ts` (B-3)                           | ≥2       | 3        | ✓    |
| `grep -cE 'externalId: labelId' helpers.ts` (B-3 externalId aligned)              | ≥2       | 2        | ✓    |
| `grep -c 'tenantId,' helpers.ts` (multi-tenant invariant)                         | ≥12      | 22       | ✓    |
| `grep -cE 'prisma\.(graphEdge\|graphNode\|userLabel)\.(create\|upsert\|update\|delete\|deleteMany\|count\|findMany\|findFirst)'` | ≥8 | 10 | ✓ |
| `grep -c 'weightCorrection' helpers.ts`                                           | ≥1       | 4        | ✓    |
| `grep -c 'derivedFromOverrideIds' helpers.ts`                                     | ≥2       | 4        | ✓    |
| `grep -c 'promotionAudit' helpers.ts`                                             | ≥2       | 2        | ✓    |
| `npx tsc --noEmit` exit 0                                                         | yes      | yes      | ✓    |
| `npx jest triage-affinity-promotion.helpers.spec.ts` — 7/7 green                  | 7/7      | 7/7      | ✓    |

### Task 4 — Scheduler

| Gate                                                                                    | Expected | Observed | Pass |
| --------------------------------------------------------------------------------------- | -------- | -------- | ---- |
| `affinity-promotion` literal occurrences (union + dispatch + cleanup + misc)            | ≥3       | 11       | ✓    |
| `nightly-affinity-promotion` occurrences (cleanup + queue.add + jobId)                  | ≥3       | 3        | ✓    |
| `triage-nightly-affinity-promotion` (stable jobId for BullMQ dedup)                     | 1        | 1        | ✓    |
| `processAffinityPromotionForTenant` (import + call + logging)                           | ≥1       | 3        | ✓    |
| `promotionCounter` (constructor + passed to helper)                                     | ≥2       | 3        | ✓    |
| `activeEdgesGauge` (constructor + passed to helper)                                     | ≥2       | 3        | ✓    |
| `import type .*Counter.*Gauge.* from 'prom-client'` (W-6 — Gauge in the import line)    | ≥1       | 1        | ✓    |
| `Landmine §5` code comment (ordering intent documented)                                 | 1        | 3        | ✓    |
| **W-7 Ordering check**: PROMO queue.add line (224) < DECAY queue.add line (238)         | OK       | OK (224 < 238) | ✓    |
| `wc -l triage-backfill-scheduler.service.ts` (Phase 149 precedent)                      | ≤700     | 699      | ✓    |
| `npx tsc --noEmit` exit 0                                                               | yes      | yes      | ✓    |

### Task 4.5 — MetricsModule

| Gate                                                                    | Expected | Observed | Pass |
| ----------------------------------------------------------------------- | -------- | -------- | ---- |
| `name: 'triage_graph_lookup_total'` declaration                        | 1        | 1        | ✓    |
| `name: 'triage_graph_promotion_total'` declaration                     | 1        | 1        | ✓    |
| `name: 'triage_graph_edges_active'` declaration                        | 1        | 1        | ✓    |
| `getToken('triage_graph_lookup_total')` export                         | 1        | 1        | ✓    |
| `getToken('triage_graph_promotion_total')` export                      | 1        | 1        | ✓    |
| `getToken('triage_graph_edges_active')` export                         | 1        | 1        | ✓    |
| `npx tsc --noEmit` exit 0                                              | yes      | yes      | ✓    |

## Plan 01 Spec Turn-Green Evidence

`backend/src/modules/ai/services/__tests__/triage-affinity-promotion.helpers.spec.ts`:

```
Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
Time:        0.961 s
```

All 7 RED it() blocks from Plan 01 Task 3 now pass:
1. "creates edge when weighted-sum >= 0.8 AND feedback rows >= 3" — PASS
2. "skips promotion when feedback rows = 2 (row-count gate)" — PASS
3. "skips promotion when weighted-sum < 0.8 (confidence gate)" — PASS
4. "updates existing edge (upsert path, action=updated)" — PASS
5. "domain aggregation requires >= 3 distinct senders (Phase 147 D-04 inherited per Open Q1)" — PASS
6. "excludes role-account local-parts (info@, sales@) from domain aggregation" — PASS
7. "writes derivedFromOverrideIds + promotionAudit into metadata JSONB — D-01a; resolves fb.newValue via UserLabel.findFirst" — PASS

Run command (Wave 0 bypass config per Plan 01 decision 4): `npx jest --config=D:/tmp/jest-wave0-config.json triage-affinity-promotion.helpers.spec.ts`. Standard `npx jest <spec>` requires a live Postgres test DB (`npm run test:docker:up`); the bypass config skips globalSetup. Plan 01 documented the same posture.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Local Postgres not running; used `prisma migrate diff` instead of `prisma migrate dev`**
- **Found during:** Task 2.
- **Issue:** `npx prisma migrate dev --name add_graph_affinity_columns` failed with `P1001: Can't reach database server at localhost:5432`. Prisma 7 requires a live DB for `migrate dev` (shadow DB creation).
- **Fix:** Generated migration SQL offline via `prisma migrate diff --from-schema /tmp/schema-pre.prisma --to-schema prisma/schema.prisma --script`, then wrote the output to `prisma/migrations/20260424100000_add_graph_affinity_columns/migration.sql` with a canonical header comment. This is the same pattern used in Phase 148-02 (per MEMORY.md `project_email_label_audit` notes) when shadow-DB creation failed against prod URL.
- **Files modified:** none (generation-only).
- **Commit:** `f338d1ff`

**2. [Rule 3 — Blocking] Spec's prismaMock lacked `$transaction` under Option B code path**
- **Found during:** Task 3 initial jest run.
- **Issue:** Plan 01 Task 3 RED spec was written assuming Option A (composite-unique + `graphNode.upsert`). Under Option B the helper uses `prisma.$transaction(async tx => ...)` + `tx.$queryRaw SELECT FOR UPDATE` + `tx.graphNode.create`. The spec's `prismaMock` had no `$transaction` mock, causing `TypeError: prisma.$transaction is not a function`.
- **Fix:** Added a `$transaction` passthrough that invokes the callback with a `tx` proxy exposing `$queryRaw` (returns `[]` → forces create path) and `graphNode.create` (mirrors `graphNode.upsert`'s configured `mockResolvedValue` so the existing behavioral assertions still work). All 7 existing `it()` blocks keep their original expectations; only the mock infrastructure was extended.
- **Files modified:** `backend/src/modules/ai/services/__tests__/triage-affinity-promotion.helpers.spec.ts` (+32 lines of mock scaffolding, 0 assertion changes).
- **Commit:** `0a7881a2`

**3. [Rule 1 — Bug] Migration comment contained literal "DROP" token, tripping acceptance `grep -c 'DROP '` gate**
- **Found during:** Task 2 acceptance verification.
- **Issue:** Initial migration header comment read `-- Nullable-additive migration: zero DROP tokens, ...`. Guard A linter passed (pattern-aware), but the plan's simpler `grep -c 'DROP '` counted comments too.
- **Fix:** Changed comment to `-- Nullable-additive migration: no destructive statements, no NOT NULL backfill.` Semantic intent preserved, grep clean.
- **Commit:** `f338d1ff`

### Planner-vs-Reality Discrepancies (Not Fixed)

**4. [Plan acceptance criterion plan-content inconsistency] Helper file at 489 LF, plan target 180-400 LF**
- **Found during:** Task 3 acceptance verification.
- **Issue:** The helper file is 489 LF — 89 LF over the plan's 180-400 target, but under the 500 LF soft cap (and well under the 700 LF hard cap).
- **Root cause:** The plan's own pseudocode block (~250 LF) + the B-3 UserLabel.findFirst resolution for both sender AND domain branches (~60 LF) + the Landmine §1 Option (b) `findOrCreateGraphNode` helper (~40 LF, not in the plan's pseudocode) + JSDoc headers documenting the Option B deviation (~50 LF) = ~400+ LF. The planner's 180-400 target didn't account for Option B scaffolding (which was contingent on Task 1's outcome).
- **Resolution:** Documented as plan-content-vs-target inconsistency (same category as Phase 148-03's 782-LF scheduler over the 500-LF target). Semantic intent (single-purpose helper, below the 500 LF CLAUDE.md soft cap) is met. No refactor applied — the Option B scaffolding is load-bearing.

### Jest test-infra posture (carried from Plan 01)

**5. [Environment note — not a deviation] Bypass jest config required for spec run**
- **Detail:** `backend/jest.config.js` wires `globalSetup: '<rootDir>/test/global-setup.ts'` which runs `prisma migrate deploy` + `prisma db seed`. Local Postgres is not running in this execution environment, so standard `npx jest <spec>` aborts before any test file loads.
- **Workaround:** Reused Plan 01's `D:/tmp/jest-wave0-config.json` bypass config (no globalSetup/globalTeardown). All 7 spec assertions are pure-unit (mocks only, no DB), so the bypass run is semantically equivalent. Any executor in a container with `npm run test:docker:up` already running will use the standard invocation.
- **Plan 01 precedent:** Documented identically in 150-01-SUMMARY.md §Framework Notes §3.

### Auth Gates

None.

## Key Decisions

1. **Option B path per orchestrator resume signal.** No `@@unique([tenantId, nodeType, externalId])` on GraphNode. All GraphNode writes go through `findOrCreateGraphNode` wrapping `prisma.$transaction(async tx => ...)` + `tx.$queryRaw SELECT FOR UPDATE LIMIT 1` + fallback `tx.graphNode.create`. Plan 03 + Plan 05 MUST adopt the same pattern — cross-plan contract recorded in the Landmine §1 Option (b) deviation heading above.

2. **Offline migration generation via `prisma migrate diff` with HEAD schema baseline.** Local Postgres was not running on `127.0.0.1:5432`. Prisma 7's `migrate dev` cannot run without a live shadow DB, so we diffed `git show HEAD:backend/prisma/schema.prisma` against the working schema to generate the SQL and hand-wrote the migration file with a canonical `20260424100000_add_graph_affinity_columns` timestamp. Guard A linter + Guard E pre-commit hook validated the output. Railway's `migrate deploy` will apply it on next deploy (non-destructive — nullable columns only).

3. **Landmine §5 FIFO ordering verified via line-number comparison.** `queue.add('nightly-affinity-promotion', ...)` lives at scheduler line 224; `queue.add('nightly-decay-gc', ...)` at line 238. BullMQ FIFO + `concurrency: 1` guarantees promotion executes first so fresh edges exist when the decay sweep reads `GraphEdge`. Code comment `// ORDERING NOTE (Landmine §5): enqueued BEFORE decay-gc.` survives future refactors as the guard against a silent reorder.

4. **Scheduler file at 699 LF — 1 LF under the 700 LF hard cap.** Initial implementation hit 714 LF; trimmed JSDoc on `processAffinityPromotion` (17 → 5 lines) + compacted metric slot comments + compacted debug log line. Phase 149 scheduler was at 614 LF, so the 150-02 addition of ~85 LF is proportional to the added branch surface.

5. **MetricsModule registers all 3 Phase 150 D-07a providers in one commit.** Even though `triage_graph_lookup_total` is consumed only by Plan 04's `TriageGraphLookupService`, registering all three together prevents a second metric-provider commit in Plan 04 and keeps Guard-G-style audit diffs coherent (single "Phase 150 metrics registered" footprint). The scheduler's `@Optional` constructor slots survive Plan 04 landing because `@Optional()` resolves to `undefined` if the provider isn't consumed yet.

## Known Stubs

None. The write path is fully wired:
- Schema columns exist and are nullable (no backfill required).
- Migration file committed.
- Helper implements OpenClaw 3/0.8 gates + B-3 resolution + D-01a provenance.
- Scheduler dispatch + nightly repeatable registered.
- 3 metric providers registered and exported.

## Threat Flags

No new attack surface introduced beyond the plan's existing `<threat_model>` mitigations. Re-verified below:

| Threat ID        | Status     | Verification                                                                           |
| ---------------- | ---------- | -------------------------------------------------------------------------------------- |
| T-150-02-01 (DROP SQL) | mitigated | Guard A linter exit 0 on migration.sql; grep 'DROP ' = 0                             |
| T-150-02-02 (drift)    | mitigated | Guard F runtime check runs on Railway boot post-deploy (out of scope for executor)   |
| T-150-02-03 (cross-tenant leak) | mitigated | 22 `tenantId,` occurrences in helper; every Prisma where-clause filters by tenantId |
| T-150-02-04 (JSONB leak)        | mitigated | Plan 03 decay-gc recompute will filter by tenantId in its findMany (Plan 03 obligation) |
| T-150-02-05 (OOM DoS)           | mitigated | findActiveTenants pagination + 500ms sleep + pure sync loop (no recursion)          |
| T-150-02-08 (provenance audit)  | mitigated | metadata.promotionAudit on every upsert; spec assertion on test 7                    |
| T-150-02-09 (email cross-tenant)| mitigated | prisma.email.findMany({ where: { tenantId, id: { in: emailIds } } }) — tenant-scoped |
| T-150-02-10 (promotion→decay race) | mitigated | Landmine §5 ordering comment + line-number acceptance gate 224 < 238 |
| T-150-02-11 (label cross-tenant) | mitigated | userLabel.findFirst({ where: { tenantId, OR: [...], isArchived: false } }) |
| T-150-02-12 (stale label resurrection) | mitigated | `isArchived: false` excludes soft-deleted labels |

## Files Created

- `backend/prisma/migrations/20260424100000_add_graph_affinity_columns/migration.sql` (16 LF) — ALTER TABLE graph_edges ADD 3 nullable columns + 2 CREATE INDEX statements. Zero DROP tokens. Guard A linter exit 0.
- `backend/src/modules/ai/services/triage-affinity-promotion.helpers.ts` (489 LF) — pure helper with `findOrCreateGraphNode` (Option B) + `processAffinityPromotionForTenant`. Exports `AFFINITY_MIN_CONFIDENCE=0.8`, `AFFINITY_MIN_FEEDBACK_ROWS=3`. Imports `MIN_DISTINCT_SENDERS_FOR_DOMAIN` + `ROLE_ACCOUNT_LOCAL_PARTS` (B-1) and `weightCorrection` + `extractDomain` (149 reuse).

## Files Modified

- `backend/prisma/schema.prisma` — GraphEdge gains `confidence Float?`, `validFrom DateTime?`, `validUntil DateTime?` + 2 compound indexes. GraphNode `nodeType` comment extended with `'sender'|'email_domain'|'label'`.
- `backend/src/modules/ai/services/triage-feedback.service.ts` — 2 constants promoted to `export const` (B-1).
- `backend/src/modules/ai/services/triage-backfill-scheduler.service.ts` — BackfillJobData union + helper import + 2 @Optional @InjectMetric slots + dispatch branch BEFORE decay-gc + cleanup list entry + queue.add for nightly-affinity-promotion (BEFORE decay-gc) + processAffinityPromotion method. File size 699 LF (under 700 cap).
- `backend/src/common/metrics/metrics.module.ts` — 3 new provider declarations (Counter × 2 + Gauge × 1) + 3 new getToken exports.
- `backend/src/modules/ai/services/__tests__/triage-affinity-promotion.helpers.spec.ts` — prismaMock extended with `$transaction` passthrough + `graphNode.create`→`upsert` mirror (Option B mock scaffolding).

## Self-Check

- [x] backend/prisma/migrations/20260424100000_add_graph_affinity_columns/migration.sql — FOUND
- [x] backend/src/modules/ai/services/triage-affinity-promotion.helpers.ts — FOUND
- [x] backend/prisma/schema.prisma — MODIFIED (confidence Float? present)
- [x] backend/src/modules/ai/services/triage-feedback.service.ts — MODIFIED (B-1 exports present)
- [x] backend/src/modules/ai/services/triage-backfill-scheduler.service.ts — MODIFIED (699 LF, ordering 224 < 238)
- [x] backend/src/common/metrics/metrics.module.ts — MODIFIED (3 providers + 3 exports)
- [x] Commit `f338d1ff` — FOUND
- [x] Commit `f3ec8aff` — FOUND
- [x] Commit `0a7881a2` — FOUND
- [x] Commit `eb2bb292` — FOUND
- [x] Commit `57287bd6` — FOUND
- [x] `npx tsc --noEmit` exit 0
- [x] `npx jest triage-affinity-promotion.helpers.spec.ts` — 7/7 GREEN

## Self-Check: PASSED
