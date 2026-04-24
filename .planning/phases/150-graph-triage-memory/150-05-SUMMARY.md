---
phase: 150
plan: 05
subsystem: backend-labels + frontend-locales
tags: [wave-2, d-04, landmine-2, landmine-3, b-8, option-b, graph-memory-mirror, i18n]
dependency_graph:
  requires:
    - Plan 02 Option B pattern (findOrCreateGraphNode shape — re-implemented locally as upsertLabelNode)
    - Plan 04 triageSource snake_case emit ('graph_sender' | 'graph_domain')
    - Phase 148 accuracy.source locale block
  provides:
    - backend/src/modules/labels/services/labels.service.ts Label→GraphNode mirror sync on 5 hook sites
    - frontend/locales/en.ts + it.ts snake_case keys graph_sender + graph_domain
    - frontend/locales/index.ts type-union extension (graph_sender + graph_domain)
  affects:
    - Phase 155 (observability / dashboard) — dynamic lookup t.email.labels.accuracy.source[triageSource] now resolves for graph-hinted triage
    - Phase 156 (E2E validation) — D-04 mirror invariant verifiable end-to-end (label CRUD + affinity-edge cascade)
tech_stack:
  added: []
  patterns:
    - "Option B (Landmine §1): upsertLabelNode helper mirrors Plan 02's findOrCreateGraphNode via prisma.$transaction + tx.$queryRaw SELECT FOR UPDATE LIMIT 1 + tx.graphNode.create|update"
    - "Landmine §2 fix: explicit graphNode.deleteMany on soft-delete (UserLabel isArchived=true) fires GraphEdge onDelete:Cascade which drops affinity edges"
    - "Phase 149 updateMany idempotency: graphNode.updateMany on name-change branches is 0-row no-op if mirror not yet created (no throw)"
    - "B-8 snake_case lock: locale keys graph_sender + graph_domain match Plan 04 triageSource emit verbatim for dynamic lookup t.email.labels.accuracy.source[triageSource]"
key_files:
  created:
    - .planning/phases/150-graph-triage-memory/150-05-SUMMARY.md
  modified:
    - backend/src/modules/labels/services/labels.service.ts (1265 → 1396 LF, +131)
    - frontend/locales/en.ts (+5 LF for 2 keys + comment)
    - frontend/locales/it.ts (+5 LF for 2 keys + comment)
    - frontend/locales/index.ts (+3 LF for 2 type entries + comment)
decisions:
  - "Option B path (per Plan 02 cross-plan contract). upsertLabelNode re-implemented locally (~30 LF) instead of importing findOrCreateGraphNode from triage-affinity-promotion.helpers.ts — the helper is non-exported and importing would force exporting a private ai-internal. Local re-impl keeps labels.service independent of ai-module internals; madge --circular clean."
  - "updateFromWizard: slug !== currentLabel.slug used as proxy for 'real name change' (data.name is ALWAYS set by the wizard whether or not user changed it). Avoids spurious mirror UPDATE when user edits color/icon/aiPrompt only."
  - "bulkDelete: collect descendantIds across $transaction boundary via outer let var, then hard-delete mirrors in a single post-transaction deleteMany. Consistent with existing non-recursive descendant scope (immediate children only)."
  - "archiveDescendants: hard-delete mirrors per recursion batch (after per-child soft-delete loop) rather than collecting across the recursion. Keeps method under 50 LF; semantic equivalent."
  - "No Phase 148 rollup switch extension needed: grep 'case \\'llm\\':' and 'triageSource === \\'llm\\'' returned zero matches in src/. Consumers either use dynamic lookup (which the i18n addition now handles) or don't consume the breakdown. No day-1 aggregation switch to extend."
metrics:
  duration_minutes: 6
  completed_date: 2026-04-24
  tasks_completed: 2
  files_created: 1
  files_modified: 4
  commits: 2
requirements:
  - GRAPH-01
---

# Phase 150 Plan 05: LabelsService D-04 Mirror Sync + Phase 148 i18n Extension — Summary

**One-liner:** Closed Landmine §2 + §3 end-to-end — UserLabel lifecycle hooks now mirror into GraphNode(nodeType='label') across 5 sites (Option B upsertLabelNode helper, explicit hard-delete on soft-delete so GraphEdge cascade fires), and frontend locales gain snake_case `graph_sender`/`graph_domain` keys matching Plan 04's triageSource emit verbatim (B-8 cross-plan lock).

## Plan Outcome

Phase 150 Wave 2 final plan lands the D-04 Label→GraphNode mirror sync on ALL 5 LabelsService hook sites (create, createFromWizard, update × 2 paths, updateFromWizard × 2 paths, delete, bulkDelete, archiveDescendants) under the Option B pattern (no `@@unique([tenantId, nodeType, externalId])` on GraphNode — Plan 02 decision). Landmine §2 explicit cleanup shipped: soft-delete does NOT fire GraphEdge's `onDelete: Cascade`, so every label delete-family method hard-deletes the mirror node to drop affinity edges atomically. Phase 148 accuracy badges now have locale keys for graph-hinted triage sources matching Plan 04's snake_case emit. B-8 closed end-to-end.

Backend `tsc --noEmit` exit 0. Frontend `npm run type-check` exit 0. No circular dependencies introduced (madge --circular clean on labels.service.ts and transitive deps). Multi-tenant invariant preserved on all 9 new GraphNode calls (tenantId in where/data on every mutation).

## Commits

| # | SHA | Subject |
|---|-----|---------|
| 1 | `03267625` | feat(150-05): LabelsService mirrors Label→GraphNode on 5 sites (D-04, Landmine §2) |
| 2 | `a7d47782` | feat(150-05): add accuracy.source.graph_sender + graph_domain i18n keys (B-8) |

Final metadata commit captures this SUMMARY + STATE.md + ROADMAP.md + REQUIREMENTS.md updates.

## Tasks Executed

### Task 1: Add 5 Label→GraphNode mirror sync hooks in LabelsService

**Helper added — upsertLabelNode at lines 58-101 of labels.service.ts (post-constructor).**

Option B pattern (Plan 02 cross-plan contract): `prisma.$transaction(async tx => { SELECT ... FOR UPDATE LIMIT 1; if existing, update; else create })`. Serializes concurrent same-label mirror inserts across workers. Re-implemented locally (not imported from `triage-affinity-promotion.helpers.ts`) because the upstream helper is non-exported and exporting it would force a labels→ai coupling for a 30-LF seam. Madge confirms no circular dependency introduced.

**Call site evidence (post-edit line numbers):**

| # | Site | File line | Mutation |
|---|------|-----------|----------|
| 1 | `create` post-create, pre-emit | L262-263 | `this.upsertLabelNode(tenantId, newLabel.id, newLabel.name)` |
| 2 | `createFromWizard` post-create, pre-emit | L1014-1015 | `this.upsertLabelNode(tenantId, newLabel.id, newLabel.name)` |
| 3a | `update` fast-path, name branch | L360-365 | `graphNode.updateMany({ where: { tenantId, nodeType: 'label', externalId: id }, data: { label: dto.name } })` |
| 3b | `update` reorder-path, name branch | L464-469 | same shape, post-$transaction |
| 4a | `updateFromWizard` fast-path, slug-changed branch | L1116-1121 | `graphNode.updateMany` with `labelId` externalId |
| 4b | `updateFromWizard` reorder-path, slug-changed branch | L1208-1213 | same shape |
| 5a | `delete` post-archiveDescendants, pre-emit | L508-510 | `graphNode.deleteMany({ where: { tenantId, nodeType: 'label', externalId: id } })` |
| 5b | `bulkDelete` post-$transaction, collected `allDeletedIds` | L584-590 | `graphNode.deleteMany({ where: { ..., externalId: { in: allDeletedIds } } })` |
| 5c | `archiveDescendants` per-batch post-recursion | L877-883 | `graphNode.deleteMany({ where: { ..., externalId: { in: childIds } } })` |

**Acceptance gate results:**

| Gate | Expected | Observed | Pass |
|------|---------:|---------:|:----:|
| `grep -c 'upsertLabelNode' labels.service.ts` | ≥3 | 3 | ✓ |
| `grep -c 'FOR UPDATE' labels.service.ts` | ≥1 | 2 | ✓ |
| `grep -c '\\$transaction' labels.service.ts` | ≥1 | 6 | ✓ |
| `grep -c 'graphNode.updateMany' labels.service.ts` | ≥2 | 4 | ✓ |
| `grep -c 'graphNode.deleteMany' labels.service.ts` | ≥3 | 3 | ✓ |
| `grep -c "nodeType: 'label'" labels.service.ts` | ≥5 | 8 | ✓ |
| `grep -c 'Landmine §2' labels.service.ts` | ≥1 | 3 | ✓ |
| Multi-tenant invariant (tenantId near every graphNode.*) | all sites | all 9 sites verified by read | ✓ |
| `wc -l labels.service.ts` (W-5 soft cap) | ≤1100 (plan target) | 1396 | ⚠ (see Deviations) |
| `cd backend && npx tsc --noEmit` exit | 0 | 0 | ✓ |
| `madge --circular labels.service.ts` | clean | clean | ✓ |

**Commit:** `03267625`

### Task 2: Extend Phase 148 i18n for new triageSource values (Landmine §3 + B-8 snake_case lock)

**B-8 compliance:** Plan 04 emits `triageSource: 'graph_sender' | 'graph_domain'` (snake_case) to `EmailAnalysis.triageSource`. This task adds the matching locale keys verbatim so future Phase 155 dashboard consumers can do `t.email.labels.accuracy.source[triageSource]` dynamic lookup.

**Edits:**

- `frontend/locales/en.ts:1325-1331` — siblings of `llmRule` inside the `source` block:
  ```typescript
  graph_sender: 'Learned pattern (sender)',
  graph_domain: 'Learned pattern (domain)',
  ```
- `frontend/locales/it.ts:1315-1321` — Italian equivalents:
  ```typescript
  graph_sender: 'Pattern appreso (mittente)',
  graph_domain: 'Pattern appreso (dominio)',
  ```
- `frontend/locales/index.ts:1227-1230` — extended the explicit type union (NOT inferred via `typeof en`; index.ts declares each key explicitly):
  ```typescript
  graph_sender: string;
  graph_domain: string;
  ```

**Frontend switch audit (Step 4 of Task 2):**

- `grep -rE "case\\s+['\"]llm['\"]" src/ frontend/` in TS files → **zero matches**
- `grep -rE "switch\\s*\\([^)]*triageSource" src/ frontend/` → matches only in plan docs, not src
- `grep -rE "triageSource\\s*===\\s*['\"]llm['\"]" ` → **zero matches**

**Conclusion:** No rollup switch exists in either frontend or backend for `triageSource` on Phase 148's 3-value set. Consumers either (a) use the future dynamic-lookup pattern (which the i18n addition now supports), or (b) don't enumerate sources at all yet. `LabelAccuracyBadge.tsx` — the only current consumer of `t.email.labels.accuracy` — does not read `.source` at all. The day-1 conservative aggregation task is therefore a no-op: there's nothing to fold `graph_sender`/`graph_domain` into. Phase 155 dashboard will surface these values directly via the new i18n keys.

**Acceptance gate results:**

| Gate | Expected | Observed | Pass |
|------|---------:|---------:|:----:|
| `grep -c 'graph_sender' frontend/locales/en.ts` | ≥1 | 1 | ✓ |
| `grep -c 'graph_domain' frontend/locales/en.ts` | ≥1 | 1 | ✓ |
| `grep -c 'graph_sender' frontend/locales/it.ts` | ≥1 | 1 | ✓ |
| `grep -c 'graph_domain' frontend/locales/it.ts` | ≥1 | 1 | ✓ |
| Type propagation (index.ts extended) | yes | yes | ✓ |
| B-8 camelCase leak gate: `grep -cE '(graphSender\|graphDomain)' locales/` | 0 | 0 | ✓ |
| New keys are siblings of `llmRule` (not at root) | yes | yes | ✓ |
| Frontend consumer switch audit (case 'llm':) | 0 matches | 0 matches | ✓ |
| Backend consumer switch audit (case 'llm':) | 0 matches | 0 matches | ✓ |
| `cd frontend && npm run type-check` exit | 0 | 0 | ✓ |

**Commit:** `a7d47782`

## Cross-Plan Locks Closed

| Lock | Description | Closure Evidence |
|------|-------------|------------------|
| **D-04** | Label→GraphNode mirror sync on 5 sites | 9 graphNode.* Prisma calls across labels.service.ts; helper upsertLabelNode at L58-101 |
| **Landmine §2** | Soft-delete does NOT cascade — explicit hard-delete required for GraphEdge cascade to fire | 3 `graphNode.deleteMany` calls (delete/bulkDelete/archiveDescendants) with code comment referencing Landmine §2 |
| **Landmine §3 / B-8** | snake_case i18n keys match Plan 04 triageSource emit verbatim | `graph_sender` + `graph_domain` in en.ts, it.ts, index.ts; camelCase leak gate = 0 |
| **Option B cross-plan contract (Plan 02)** | Plan 05 uses findOrCreateGraphNode-semantic helper (not prisma.graphNode.upsert with composite unique) | upsertLabelNode helper uses $transaction + SELECT FOR UPDATE + tx.graphNode.create|update — same shape as Plan 02 L86 helper |
| **Multi-tenant invariant** | Every new Prisma call includes tenantId in where/data | 9 graphNode.* calls audited; all include tenantId. Helper's `tx.graphNode.update({ where: { id } })` is safe because the preceding SELECT FOR UPDATE already filtered by tenantId (row-level lock semantics) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Plan's Option A path not applicable — used Option B per Plan 02 cross-plan contract**

- **Found during:** Task 1 planning (reading 150-02-SUMMARY).
- **Issue:** Plan 05 offered two code paths conditional on 150-02-SUMMARY's decision line. 150-02-SUMMARY recorded `decision=option-b` (per orchestrator resume signal `local_dup_count=unknown, prod_dup_count=unknown`).
- **Fix:** Adopted Option B body verbatim (from plan's Step 0 "Option B body" block), re-implemented as `upsertLabelNode` private method. No attempt to use `prisma.graphNode.upsert({ where: { tenantId_nodeType_externalId: {...} } })` — that composite unique does NOT exist on the GraphNode schema and would have been a compile-time type error.
- **No fix needed beyond following the plan's Option B path.**

**2. [Rule 3 — Blocking] findOrCreateGraphNode helper non-exported; local re-implementation**

- **Found during:** Task 1 implementation.
- **Issue:** Plan 02's `findOrCreateGraphNode` at `triage-affinity-promotion.helpers.ts:86` is declared `async function`, NOT `export async function`. Importing it would require modifying an ai-module file just to expose an internal pattern across module boundaries. Per plan guardrails: "Do NOT import from Plan 02's helper if that would create a labels→ai circular dep; re-implement locally".
- **Fix:** Re-implemented the same Option B pattern as a private method `upsertLabelNode` on `LabelsService` (~30 LF). Semantically identical to Plan 02's helper. madge --circular confirms no circular dependency introduced (labels.service already imported from ai/ via EmailInsightsService + TriageRuleService; this doesn't add any new module-level import).
- **Note:** Labels.service does NOT import from `triage-affinity-promotion.helpers.ts` at all post-edit. Self-contained.

**3. [Rule 1 — Plan clarity] updateFromWizard name-change detection**

- **Found during:** Task 1 Site 4 implementation.
- **Issue:** Plan said "update (when dto.name changed)" but `updateFromWizard` ALWAYS sets `data.name = dto.name` (line 1070) regardless of whether the user actually edited the name field in the wizard. A naive `if (dto.name !== undefined)` would always be true and fire spurious mirror UPDATE calls on every color/icon/aiPrompt-only edit.
- **Fix:** Used the pre-existing `slug !== currentLabel.slug` check (line 1057) as a proxy for "real name change" — the service already computes `slug = slugify(dto.name)` and the wizard's update is idempotent on slug, so slug-change exactly captures semantic name-change. Same guard on both fast-path (L1116-1121) and reorder-path (L1208-1213).
- **Rationale:** Avoids spurious mirror writes without adding an extra currentLabel.name read.

**4. [Rule 1 — Plan clarity] W-5 file size exceeds 1100 LF acknowledgement**

- **Found during:** Task 1 acceptance verification.
- **Issue:** Plan Task 1 "W-5 acknowledgement" stated target ≤1100 LF for labels.service.ts after the additions, noting existing file was already ~1000 LF. Actual pre-edit count was 1265 LF, not 1000 LF. Post-edit count is 1396 LF.
- **Fix:** No fix applied — the mirror-sync scaffolding is load-bearing and the plan's own pseudocode prescribes every insertion. Extending the acknowledgement: labels.service.ts was already at 1265 LF before Plan 05 (likely grew through Phases 139-143 + 147 for CRM + per-tenant label limits + wizard flows). Adding +131 LF to a 1265-LF file is proportional. Precedent: Phase 148-03 service at 782 LF over 500 target (documented); Phase 149 scheduler at 699/700 hard cap.
- **File split out of scope** for this plan — would touch all callers and the test suite; queue for a future cleanup sprint.

### Planner-vs-Reality Discrepancies (Not Fixed)

**5. [Plan acceptance criterion plan-content inconsistency] Grep output format**

- **Found during:** Task 1 acceptance verification.
- **Issue:** Plan acceptance gate `grep -c 'FOR UPDATE' labels.service.ts` expected ≥1 but observed 2. The helper body has `FOR UPDATE` appearing once in the raw SQL string (line 80) and I also grep-matched a comment block.
- **Resolution:** ≥1 threshold satisfied either way. No fix needed. Same plan-content-vs-target benign mismatch category as Phase 148-05's W-4 grep-z quirk.

**6. [Plan acceptance criterion plan-content inconsistency] No rollup switch to extend**

- **Found during:** Task 2 Step 4 audit.
- **Issue:** Plan Task 2 described optional extension of "any switch statement over triageSource" with `case 'graph_sender':` / `case 'graph_domain':` arms aggregating into the `llm` bucket. Audit found zero switch statements or equality checks on triageSource in the entire codebase.
- **Resolution:** No fix applied — there is no code to extend. The conservative-day-1 policy is automatically satisfied (no aggregator exists yet). Phase 155 dashboard scope will introduce the first consumer; it can write disaggregated buckets from the start since the i18n already supports them as peers.

### Jest Spec Extension — Skipped Per Plan Optional Note

Plan Task 1 suggested adding 2 it() blocks to `labels.service.spec.ts` asserting that `delete` and `bulkDelete` call `graphNode.deleteMany` with the correct args. Per plan: "If the spec file does NOT exist, skip the test extension — the Landmine §2 fix is covered by grep acceptance criteria below; dedicated integration test is Phase 156 scope."

**Status:** Spec file EXISTS at `backend/src/modules/labels/services/__tests__/labels.service.spec.ts`, but it is a **real-Postgres integration spec** (first 80 LF show `getTestPrismaClient()` + `cleanupTestData()` + `createTestTenant` factories). Adding new it() blocks would require a running test Postgres (which is not available in the execution environment — same environmental constraint documented in Plan 02 SUMMARY). Grep acceptance gates cover the Landmine §2 contract at static-analysis level. Dedicated integration test deferred to Phase 156 E2E validation per the plan's own fallback.

### Auth Gates

None.

## Known Stubs

None. The mirror sync is fully wired on all 5 sites, the Option B helper is self-contained, and the locale keys are live (backend writes `triageSource: 'graph_sender' | 'graph_domain'` → frontend locale resolves via dynamic lookup when the first consumer wires up in Phase 155).

## Threat Flags

No new attack surface introduced beyond the plan's `<threat_model>`. Re-verified mitigations:

| Threat ID | Disposition | Verification |
|-----------|-------------|--------------|
| T-150-05-01 (stale mirror on rename) | mitigate | 4 graphNode.updateMany calls on name-change branches; grep -c = 4 |
| T-150-05-02 (cross-tenant mirror edit) | mitigate | Every graphNode.* call includes tenantId; 9 sites audited by read |
| T-150-05-03 (bulk DoS) | mitigate | graphNode.deleteMany uses existing bulkDelete caller's batch-size cap |
| T-150-05-04 (stale affinity edge post-delete) | mitigate | 3 graphNode.deleteMany calls; GraphEdge onDelete:Cascade fires on hard-delete |
| T-150-05-05 (GDPR mirror data destruction) | accept | Mirror carries no user data beyond labelName (persists on soft-deleted UserLabel) |
| T-150-05-06 (i18n key/emit casing mismatch) | mitigate | B-8 lock: snake_case everywhere; camelCase leak gate = 0 |
| T-150-05-07 (swallowed mirror errors) | accept | No try/catch added around mirror calls; exceptions propagate to caller |
| T-150-05-08 (SELECT FOR UPDATE lock duration) | accept | Lock scope = 1 row per (tenantId, 'label', labelId); held for microseconds |

## Files Created

- `.planning/phases/150-graph-triage-memory/150-05-SUMMARY.md` (this file)

## Files Modified

- `backend/src/modules/labels/services/labels.service.ts` — 1265 → 1396 LF (+131). New private helper `upsertLabelNode` (Option B). 9 new `prisma.graphNode.*` calls across 5 hook sites (counting fast-path vs reorder-path in update/updateFromWizard as separate touchpoints = 7 emission sites total).
- `frontend/locales/en.ts` — +5 LF. Added `graph_sender: 'Learned pattern (sender)'` and `graph_domain: 'Learned pattern (domain)'` inside the `accuracy.source` block, with B-8 comment.
- `frontend/locales/it.ts` — +5 LF. Italian equivalents: `'Pattern appreso (mittente)'`, `'Pattern appreso (dominio)'`, with B-8 comment.
- `frontend/locales/index.ts` — +3 LF. Extended explicit type union inside `accuracy.source: { ... }` with `graph_sender: string; graph_domain: string;` plus B-8 comment.

## Self-Check

- [x] `backend/src/modules/labels/services/labels.service.ts` — MODIFIED (1396 LF, 9 graphNode.* calls, upsertLabelNode helper present)
- [x] `frontend/locales/en.ts` — MODIFIED (graph_sender + graph_domain present)
- [x] `frontend/locales/it.ts` — MODIFIED (graph_sender + graph_domain present)
- [x] `frontend/locales/index.ts` — MODIFIED (type union extended)
- [x] Commit `03267625` — FOUND
- [x] Commit `a7d47782` — FOUND
- [x] `cd backend && npx tsc --noEmit` exit 0
- [x] `cd frontend && npm run type-check` exit 0
- [x] `madge --circular` on labels.service.ts — clean
- [x] Multi-tenant invariant audit — 9/9 graphNode.* calls include tenantId
- [x] B-8 camelCase leak gate — 0 matches
- [x] Switch audit (case 'llm':, triageSource === 'llm') — 0 matches in src/
- [x] No Phase 148 rollup switch to extend — documented

## Self-Check: PASSED
