---
phase: 150-graph-triage-memory
reviewed: 2026-04-24T13:15:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - backend/prisma/schema.prisma
  - backend/prisma/migrations/20260424100000_add_graph_affinity_columns/migration.sql
  - backend/scripts/scan-graph-nodes-duplicates.sql
  - backend/src/modules/ai/services/triage-affinity-promotion.helpers.ts
  - backend/src/modules/ai/services/triage-decay-gc.helpers.ts
  - backend/src/modules/ai/services/triage-graph-lookup.service.ts
  - backend/src/modules/ai/services/triage-backfill-scheduler.service.ts
  - backend/src/modules/ai/services/triage-override.service.ts
  - backend/src/modules/ai/services/triage-feedback.service.ts
  - backend/src/modules/ai/services/email-triage.service.ts
  - backend/src/modules/ai/services/email-analysis.service.ts
  - backend/src/modules/ai/ai.module.ts
  - backend/src/common/metrics/metrics.module.ts
  - backend/src/modules/labels/services/labels.service.ts
  - backend/src/modules/ai/services/__tests__/triage-graph-lookup.service.spec.ts
  - backend/src/modules/ai/services/__tests__/triage-affinity-promotion.helpers.spec.ts
  - backend/src/modules/ai/services/__tests__/triage-decay-gc.helpers.spec.ts
  - backend/src/modules/ai/services/__tests__/email-triage.service.spec.ts
  - frontend/locales/en.ts
  - frontend/locales/it.ts
  - frontend/locales/index.ts
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 150: Code Review Report

**Reviewed:** 2026-04-24T13:15:00Z
**Depth:** standard
**Files Reviewed:** 19 (20 paths listed — `frontend/locales/index.ts` reviewed via grep only, the rest read in full)
**Status:** issues_found

## Summary

Overall strong landing across 5 plans / 3 waves. All high-priority invariants hold:

- **Multi-tenant invariant**: every `graphNode`, `graphEdge`, `triageOverride`, `emailTriageFeedback` Prisma call includes explicit `tenantId` in `where` (both belt-and-braces on `deleteMany` with composite `{ id, tenantId }`). No security-boundary violations found.
- **SC-3 write-isolation**: `triage-graph-lookup.service.ts` is strictly read-only — grep for `graphEdge.(create|upsert|update|delete)` and `graphNode.(create|upsert|update|delete)` returns zero hits in that file.
- **D-07 shadow counter nesting**: the `would_skip_shadow` emit at `triage-graph-lookup.service.ts:117-123` is a sibling branch to the cutoff check at `:126-145`, correctly unnested per the documented Failure Mode §4. With default cutoff=9999 and a confidence=0.95 edge, shadow fires and `skipped` does NOT — confirmed by the `emits outcome=would_skip_shadow independently of cutoff` spec case.
- **Landmine §2 (label delete → graph cascade)**: every `labels.service.ts` delete site (`delete`, `bulkDelete`, `archiveDescendants`) issues an explicit `graphNode.deleteMany` to hard-delete the mirror so `GraphEdge.onDelete: Cascade` fires. Present at `:508`, `:584`, and `:877`.
- **B-8 snake_case**: zero `graphSender` or `graphDomain` camelCase leaks anywhere in `backend/src/` or `frontend/` — verified via grep. `en.ts`/`it.ts`/`index.ts` use `graph_sender`/`graph_domain` matching the emit verbatim.
- **Migration safety**: `20260424100000_add_graph_affinity_columns/migration.sql` is pure nullable-additive (`ADD COLUMN` + `CREATE INDEX` only). No `DROP`, no `NOT NULL` backfill, no `TRUNCATE`. Passes Guard A.
- **Env-var parsing**: both `TRIAGE_GRAPH_CONFIDENCE_CUTOFF` readers (`triage-graph-lookup.service.ts:51-55` and `email-triage.service.ts:142-145`) use `parseFloat` + `Number.isFinite` clamp; malformed values fall back to `9999` (effectively disabled).
- **$queryRaw generics**: both raw SQL calls (`triage-graph-lookup.service.ts:73` and `triage-affinity-promotion.helpers.ts:100`, `labels.service.ts:75`) supply `<Array<{ id: string, ... }>>` generics. No untyped raw queries.
- **Cardinality**: metric label sets audited in `metrics.module.ts:129-152` — 50 tenants × 4 outcomes × 3 sources = 600 series max on `triage_graph_lookup_total`. Bounded.

Issues found are data-consistency gaps and a narrow scope-ordering concern, not security or correctness-breaking bugs. All findings are below Critical.

## Warnings

### WR-01: Graph short-circuit skips `EmailLabel` junction-table write

**File:** `backend/src/modules/ai/services/email-triage.service.ts:404-422`
**Issue:** When the graph lookup short-circuits the LLM (confidence ≥ cutoff), the handler writes `aiLabels: [g.predictedLabelName]` onto `Email` and upserts `EmailAnalysis` with `triageSource: graph_sender|graph_domain` — but it never calls `this.utils.linkEmailToUserLabels(tenantId, emailId, [g.predictedLabelName])`. Compare with the LLM path at `email-analysis.service.ts:267-269` which DOES call `linkEmailToUserLabels` after a successful unified analysis. Result: the `emailLabels` junction rows that power "emails-in-label" views are missing for every graph-short-circuited email. Queries like `LabelsService.getEmailsForLabel(tenantId, labelId)` at `labels.service.ts:749-767` filter on `emailLabels: { some: { labelId } }` and will return empty for labels that were only assigned via graph short-circuit.

This is invisible right now because `TRIAGE_GRAPH_CONFIDENCE_CUTOFF` defaults to `9999` (kill-switched). It becomes visible the moment an operator flips the cutoff to `0.9` in production.

**Fix:**
```typescript
// email-triage.service.ts, after the emailAnalysis.upsert at ~line 422:
await this.prisma.email.updateMany({ /* existing */ });
await this.prisma.emailAnalysis.upsert({ /* existing */ });

// NEW: wire the junction table so the email shows up in label views.
// Resolve labelName -> labelId already established via UserLabel.findFirst?
// Callee expects label NAMES (matches email-analysis.service.ts:267).
await this.emailInsights.linkEmailToUserLabels?.(  // or inject InsightUtilsService directly
  tenantId,
  emailId,
  [g.predictedLabelName],
);
```
Alternative: inject `InsightUtilsService` directly into `EmailTriageService` and call `this.insightUtils.linkEmailToUserLabels(...)` — cleaner than going through `EmailInsightsService`.

### WR-02: Graph short-circuit leaves `aiPriority`/`aiLane`/`aiPriorityReason` in inconsistent state

**File:** `backend/src/modules/ai/services/email-triage.service.ts:404-411`
**Issue:** The muting-override short-circuit at `:327-338` deliberately nulls `aiPriority`, `aiPriorityReason`, `aiSentiment`, `aiCategory` and sets a deterministic `aiLane` (per CR-01 rationale: "the row isn't internally inconsistent e.g. aiLane='system-alerts' + aiPriority=1"). The graph short-circuit at `:404-411` writes only `aiLabels` + `isAutoTriaged` + `autoTriagedAt` — it leaves `aiPriority`, `aiLane`, `aiPriorityReason`, `aiSentiment`, `aiCategory` at their pre-existing values (null for a freshly-arrived email, or stale for a re-triaged one). Downstream lane-sort UIs and "Urgent" filters will misorder or entirely skip graph-short-circuited emails.

Same latent-bug profile as WR-01: invisible at cutoff=9999, live at any lower cutoff.

**Fix:** Decide intent and apply uniformly. Two defensible choices:
- (A) Null the signals like muting does: `aiPriority: null, aiPriorityReason: null, aiSentiment: null, aiCategory: null, aiLane: null` — treats graph short-circuit as "we know the label, nothing else."
- (B) Derive a deterministic lane from the predicted label's `defaultLane` (look up `UserLabel.defaultLane` for `g.predictedLabelId`) and leave the other signals null. Matches the spirit of "skip LLM, preserve classifier intent."

Whichever path is chosen, document it in a code comment paralleling the CR-01 comment at `:316-325`.

### WR-03: Labels mirror write-after-commit — orphaned writes on partial failure

**File:** `backend/src/modules/labels/services/labels.service.ts:485-521` (`delete`) and `:523-606` (`bulkDelete`) and `:224-262` (`create`)
**Issue:** The GraphNode mirror operations (`upsertLabelNode` on create, `graphNode.deleteMany` on delete/bulkDelete, `graphNode.updateMany` on rename) all live OUTSIDE the `userLabel.*` transaction boundary. Example in `delete`:

```typescript
await this.prisma.userLabel.update({ ... isArchived: true ... });  // tx 1
await this.archiveDescendants(tenantId, id);                        // tx 2..N
await this.prisma.graphNode.deleteMany({ ... });                    // tx N+1 — can fail independently
```

If the process crashes or the DB connection drops between the `userLabel.update` and the `graphNode.deleteMany`, the label is soft-deleted but the mirror + its affinity edges survive. The graph lookup service would then return "Learned pattern: Q4 Sales Report" for a label the user deleted an hour ago. Similarly in `create`: if `upsertLabelNode` fails after `userLabel.create` succeeds, the user has a label with no mirror, and the next affinity-promotion run will try to `findOrCreateGraphNode` against a label the promotion service will happily (re-)create — but its `externalId` matches the existing UserLabel.id, so `findOrCreateGraphNode` just creates the missing node. That path self-heals.

The delete path does NOT self-heal: once the mirror escapes cascade-deletion, nothing ever reaps it. Graph-decay-GC (Phase 150 D-06) prunes edges by recomputed confidence, not by orphan-detection.

**Fix:** Wrap each mutation + mirror-operation in a single `$transaction`. For `delete`:
```typescript
await this.prisma.$transaction(async (tx) => {
  await tx.userLabel.update({ where: { id }, data: { isArchived: true, slug: deletedSlug } });
  // inline archiveDescendants into the tx body OR accept tx param
  await this.archiveDescendantsTx(tx, tenantId, id);
  await tx.graphNode.deleteMany({ where: { tenantId, nodeType: 'label', externalId: id } });
});
```
For `create`:
```typescript
const newLabel = await this.prisma.$transaction(async (tx) => {
  const label = await tx.userLabel.create({ ... });
  // inline upsertLabelNode logic with tx in place of this.prisma
  await tx.$queryRaw`SELECT id FROM graph_nodes WHERE ... FOR UPDATE LIMIT 1`;
  // ... rest of upsert flow
  return label;
});
```
Alternative (lighter): accept the race, and add a nightly orphan-reaper in `triage-decay-gc.helpers.ts` that does `graphNode.deleteMany({ where: { nodeType: 'label', externalId: { notIn: await tenantActiveLabelIds } } })` per tenant. This moves the complexity from the hot path to the nightly sweep but adds a fourth GC store.

### WR-04: Graph-memory domain-source label cardinality allows fallback surprise

**File:** `backend/src/modules/ai/services/triage-graph-lookup.service.ts:104-108` (`extractDomain`) interacting with affinity promotion at `triage-affinity-promotion.helpers.ts:355-378`
**Issue:** `triage-graph-lookup.service.ts` normalizes `domain` as `normalized.slice(atIdx + 1)` — no subdomain collapsing (D-04a). `triage-affinity-promotion.helpers.ts` extracts domain via `extractDomain(senderEmail)` which at `triage-decay-gc.helpers.ts:48-52` returns `from.match(/@([^>\s]+)/)[1].toLowerCase().trim()` — also no subdomain collapsing. The two agree. Good.

However: the lookup at `:94-96` uses the FULL domain including subdomain (e.g., `mail.acme.com`), but the promotion helper also uses the FULL domain. A corporate sender on `mail.acme.com` will never get a domain-level edge that fires for `alerts.acme.com`, which is the current intent (per D-04a comment) — but the comment "NO subdomain collapsing" is a design guarantee that needs an acceptance test or a docs note. Right now the only test is `extracts domain without + stripping or subdomain collapsing — D-04a` which only asserts the SQL values contain `mail.acme.com`, not that cross-subdomain edges are suppressed.

Severity: Warning (not Info) because the PATTERNS.md comment at line 766 and the D-04a contract are the only defenses; any future "helpful" refactor that starts collapsing subdomains silently changes which sender-bucket maps to which domain edge and invalidates existing metadata.

**Fix:** Add an integration test case at `triage-affinity-promotion.helpers.spec.ts`:
```typescript
it('domain aggregation uses full FQDN, not root domain (D-04a)', async () => {
  // 3 distinct non-role senders on mail.acme.com should NOT share a domain
  // bucket with 3 senders on alerts.acme.com.
  // Expect two separate DOMAIN_LABEL_AFFINITY edges (externalId=mail.acme.com
  // and externalId=alerts.acme.com), NOT one edge at externalId=acme.com.
});
```
And consider extracting `extractDomain` to a shared utility imported by both services — currently `triage-graph-lookup.service.ts:60-62` inlines the slice-after-`@` logic while the promotion helper goes through `extractDomain` which uses a regex. Two separate implementations of "same" normalization is a future drift vector.

## Info

### IN-01: Double env-var read for `TRIAGE_GRAPH_CONFIDENCE_CUTOFF`

**File:** `backend/src/modules/ai/services/triage-graph-lookup.service.ts:51-55` and `backend/src/modules/ai/services/email-triage.service.ts:142-145`
**Issue:** Both services independently read and `parseFloat` the same env var. `TriageGraphLookupService` uses its own `this.cutoff` to classify `outcome=skipped|hinted|missed`; `EmailTriageService` uses its own `this.graphCutoff` to decide whether to short-circuit. In the current code both end up equal, but if an operator sets the env var differently per-container or if a future refactor makes one dynamic (e.g., per-tenant override), the two will drift and the `outcome=skipped` counter will lie about which calls actually short-circuited.

**Fix:** Expose a single accessor on `TriageGraphLookupService.getCutoff()` and have `EmailTriageService` read it from the service instance. Or centralize in a `TriageGraphConfigService`. Non-blocking — just eliminate the duplicate `parseFloat`.

### IN-02: `weightCorrection` called without `{ halfLifeDays }` option in `triage-feedback.service.ts`

**File:** `backend/src/modules/ai/services/triage-feedback.service.ts:242`
**Issue:** `const w = weightCorrection(ageDays);` — no options object. The other call sites (`triage-affinity-promotion.helpers.ts:225`, `triage-decay-gc.helpers.ts:115/269/400`) all pass `{ halfLifeDays }`. The comment at `:242` says "Phase 147: 1 if <=30d else 0 (D-12)" — so the default behavior is intentional step-function, not exponential decay. But this is the ONLY call site that relies on the default; a future "make everything consistent" refactor could replace the default with continuous decay and silently change the Phase 147 D-03/D-04 promotion gates. 

**Fix:** Make the intent explicit:
```typescript
const w = weightCorrection(ageDays, { mode: 'step', cutoffDays: 30 });
// or, if the utility doesn't accept a mode:
const w = ageDays <= 30 ? 1 : 0;  // D-12: step function, Phase 147 semantics
```
Adds zero runtime cost, prevents a landmine during future consolidation.

### IN-03: Redundant `as any` casts on `edge.metadata` reads

**File:** `backend/src/modules/ai/services/triage-decay-gc.helpers.ts:326-327`, `:340-343`, `:386-388`
**Issue:**
```typescript
const ids = (((e as any).metadata as any)?.derivedFromOverrideIds ?? []) as string[];
```
The double `as any` cascade plus the final `as string[]` signals that the helper is fighting Prisma's `Json` typing. Prisma exposes `metadata` as `Prisma.JsonValue` — a type-narrowing helper would clean this up.

**Fix:**
```typescript
function readOverrideIds(metadata: Prisma.JsonValue | null): string[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const ids = (metadata as Record<string, unknown>).derivedFromOverrideIds;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
}
```
Use at each read site. Removes four `as any` and adds runtime validation for corrupt JSON (which the comment at `:294-296` promises defensive semantics for but the current code would throw on for `metadata = "not-an-object-at-all"`).

### IN-04: `existing > 0` read-before-upsert is a benign TOCTOU

**File:** `backend/src/modules/ai/services/triage-affinity-promotion.helpers.ts:281-330` and `:412-466`
**Issue:** The helper does `const existing = await prisma.graphEdge.count(...)` followed by `prisma.graphEdge.upsert(...)` and classifies the action as `'updated' | 'created'` based on the `count` result. Between the `count` and the `upsert`, another writer could insert/delete the edge. Given BullMQ `concurrency: 1` for this worker and the nightly 3 AM schedule, concurrent writes should not occur — but this is the kind of assumption that breaks when someone manually triggers the promotion job alongside an auto run.

Low severity because the counter emit with `action=created` vs `action=updated` is observability-only; the actual upsert is correct regardless. Flagging as Info so it's in the record.

**Fix:** Use `upsert`'s return value or a RETURNING clause to distinguish via `createdAt === jobTimestamp`. Or drop the action label entirely and emit `triage_graph_promotion_total{tenant_id, edge_type}` without `action`, then compute created-vs-updated from `triage_graph_edges_active` over time.

### IN-05: `TriageGraphLookupService` correctly NOT exported, but not documented

**File:** `backend/src/modules/ai/ai.module.ts:177-178` (provider) and the absence from the `exports` array at `:195-230`
**Issue:** Per Open Q5 (noted in the inline comment at `:177`: "Open Q5 — provider-only, NOT exported"), `TriageGraphLookupService` is intentionally NOT in the `exports: [...]` array so no other module can inject it. Good — it's a read-path detail of `EmailTriageService`. But the comment is the only signal; a future cleanup PR that "tidies up" provider/export alignment (there are 19+ providers and ~10 of them ARE exported) could easily add it to `exports:` without realizing Open Q5 exists.

**Fix:** Move the Open Q5 rationale into a doc comment ABOVE the provider line with the words "DO NOT EXPORT — read-path internal to EmailTriageService." Or add an ESLint rule forbidding the export. Non-blocking.

---

## Not Flagged (verified to be correct per CONTEXT/VALIDATION)

- Absence of `@@unique([tenantId, nodeType, externalId])` on `GraphNode`: intentional per Open Q9 / Option B. `findOrCreateGraphNode` uses `$transaction` + `SELECT FOR UPDATE LIMIT 1`. Confirmed at `triage-affinity-promotion.helpers.ts:86-122` and mirrored at `labels.service.ts:69-99`.
- `triage-decay-gc.helpers.ts:326` reads `e.metadata` via `as any` — flagged above as IN-03, but the defensive-semantics comment at `:294-296` ("Edge with empty/missing `derivedFromOverrideIds` → weightedSum = 0 → delete") is correctly implemented: empty array produces zero loop iterations → `weightedSum=0` → delete.
- `triage-backfill-scheduler.service.ts:226-247` ordering (promotion BEFORE decay-gc): explicitly documented at `:221-225` as Landmine §5 invariant, correctly preserved.
- `EmailTriageFeedback` has NO `overrideId` column: confirmed by reading schema.prisma `:2565-2580`. The B-2 contract ("recompute walks `edge.metadata.derivedFromOverrideIds` -> `TriageOverride.findMany`") is the ONLY join path between feedback rows and edges. Both `processAffinityPromotionForTenant` (writer) and `processAffinityEdgeDecayForTenant` (reader) use the same `(override.pattern, override.action)` matching logic.
- `labels.service.ts:508-510`, `:584-591`, `:877-883`: all three delete sites (single, bulk, descendants) issue explicit `graphNode.deleteMany`. Landmine §2 satisfied.
- Scan script `scripts/scan-graph-nodes-duplicates.sql`: read-only SELECT, correctly scoped, no backup needed per CLAUDE.md "Backup Before Touch" (reads don't mutate).

---

_Reviewed: 2026-04-24T13:15:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
