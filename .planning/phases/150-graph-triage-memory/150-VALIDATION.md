---
phase: 150
slug: graph-triage-memory
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-24
---

# Phase 150 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Authoritative details live in `150-RESEARCH.md §Validation Architecture` (referenced below). This file is the executable contract — planner and plan-checker read it directly; executor consults `<automated>` commands per task.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest via `@nestjs/testing` (existing — 28 triage specs today) |
| **Config file** | `backend/jest.config.js` (inherit — no new config) |
| **Quick run command** | `cd backend && npx jest --testPathPatterns='triage-graph-lookup\|triage-affinity-promotion\|triage-correction-weight'` |
| **Full suite command** | `cd backend && npm test` (unit specs only — integration specs require `npm run test:docker:up`) |
| **Type check** | `cd backend && npx tsc --noEmit` (mandatory per CLAUDE.md post-edit validation) |
| **Estimated runtime** | ~12 seconds quick · ~90 seconds full |

---

## Sampling Rate

- **After every task commit:** `cd backend && npx jest --testPathPatterns='<touched-spec>'` + `cd backend && npx tsc --noEmit`
- **After every plan wave:** `cd backend && npx jest --testPathPatterns='triage-'` (all triage specs) + `cd backend && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full quick command green + `tsc --noEmit` exits 0 + Guard A/E/F/G dry-run clean
- **Max feedback latency:** 15 seconds (quick command)
- **No watch-mode flags anywhere.**

---

## Per-Task Verification Map

> Actual Task IDs are assigned by the planner. This map encodes the minimum coverage shape plans MUST satisfy. Every phase requirement (GRAPH-01/02/03) MUST appear in ≥1 Task row. Refer to `150-RESEARCH.md §Validation Architecture §Phase Requirements → Test Map` for the full requirement matrix.

| Task | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| Schema migration | GRAPH-01, GRAPH-03 | Nullable columns only, no DROP, Guard A passes | static | `cd backend && node scripts/check-migration-safety.js prisma/migrations/*_add_graph_affinity_columns/migration.sql` | ❌ W0 | ⬜ pending |
| Schema migration | GRAPH-01, GRAPH-03 | Runtime drift check passes post-deploy | integration | `cd backend && npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource $DATABASE_URL --exit-code` | ✅ exists | ⬜ pending |
| `TriageGraphLookupService.lookup` | GRAPH-02 | Returns sender edge when both sender + domain exist (D-05) | unit | `cd backend && npx jest triage-graph-lookup.service.spec.ts` | ❌ W0 | ⬜ pending |
| `TriageGraphLookupService.lookup` | GRAPH-02 | `would_skip_shadow` emits regardless of `TRIAGE_GRAPH_CONFIDENCE_CUTOFF` | unit | `cd backend && npx jest triage-graph-lookup.service.spec.ts -t 'shadow'` | ❌ W0 | ⬜ pending |
| `TriageGraphLookupService.lookup` | GRAPH-03 | `validUntil < now()` edges filtered out of results | unit | `cd backend && npx jest triage-graph-lookup.service.spec.ts -t 'validUntil'` | ❌ W0 | ⬜ pending |
| `EmailTriageService.triageEmail` integration | GRAPH-02 | Graph lookup called AFTER override, BEFORE LLM; short-circuit on `confidence >= cutoff` | unit | `cd backend && npx jest email-triage.service.spec.ts -t 'graph'` | ✅ extend | ⬜ pending |
| `EmailTriageService.triageEmail` integration | GRAPH-02 | Visible/muting override match SKIPS graph lookup entirely (Open Q2 Option A) | unit | `cd backend && npx jest email-triage.service.spec.ts -t 'override precedes graph'` | ✅ extend | ⬜ pending |
| `triage-affinity-promotion.helpers` | GRAPH-01 | OpenClaw 3/0.8 gate: weighted-sum ≥ 0.8 AND feedback rows ≥ 3 upsert edge | unit | `cd backend && npx jest triage-affinity-promotion.helpers.spec.ts -t 'gate'` | ❌ W0 | ⬜ pending |
| `triage-affinity-promotion.helpers` | GRAPH-01 | Domain aggregation inherits Phase 147 `MIN_DISTINCT_SENDERS_FOR_DOMAIN=3` + role-account exclusion (Open Q1 recommended) | unit | `cd backend && npx jest triage-affinity-promotion.helpers.spec.ts -t 'domain'` | ❌ W0 | ⬜ pending |
| `triage-affinity-promotion.helpers` | GRAPH-01 | `metadata.derivedFromOverrideIds` + `metadata.promotionAudit` set on every upsert (D-01a) | unit | `cd backend && npx jest triage-affinity-promotion.helpers.spec.ts -t 'provenance'` | ❌ W0 | ⬜ pending |
| `TriageBackfillSchedulerService.processAffinityPromotion` | GRAPH-01 | `'affinity-promotion'` dispatch added to `BackfillJobData['type']` union at line 16 | unit | `cd backend && npx jest triage-backfill-scheduler.service.spec.ts -t 'affinity-promotion'` | ⚠ check | ⬜ pending |
| `decay-gc` third store (GraphEdge) | GRAPH-03 | Recomputed confidence < 0.3 hard-deletes affinity edges + `gcCounter{store='graph_edge'}` emits | unit | `cd backend && npx jest triage-decay-gc.helpers.spec.ts` OR `cd backend && npx jest triage-learning-redis.spec.ts -t 'graph_edge'` | ⚠ W0 (see Gaps) | ⬜ pending |
| `LabelsService.delete/bulkDelete` | GRAPH-01 | Soft-delete ALSO hard-deletes mirror `GraphNode` (Landmine §2 fix) | unit | `cd backend && npx jest labels.service.spec.ts -t 'graph node cleanup'` | ⚠ extend | ⬜ pending |
| Prometheus metrics | GRAPH-01, GRAPH-02 | `triage_graph_lookup_total`, `triage_graph_promotion_total`, `triage_graph_edges_active` registered | static | `cd backend && grep -n 'triage_graph_' src/common/metrics/metrics.module.ts` | ⚠ extend | ⬜ pending |
| Env var gate | GRAPH-02 | `TRIAGE_GRAPH_CONFIDENCE_CUTOFF` read via `ConfigService.get<string>(...)`, default `'9999'` | static | `cd backend && grep -rn 'TRIAGE_GRAPH_CONFIDENCE_CUTOFF' src/` | ❌ new | ⬜ pending |
| Multi-tenant invariant | cross-cutting | Every new `prisma.*` call has `tenantId` in `where` | static (grep review) | `cd backend && grep -rn 'prisma\.\(graphEdge\|graphNode\)' src/modules/ai/ src/modules/labels/` + manual review | — | ⬜ pending |
| SC-3 promotion-write isolation | cross-cutting | `TriageGraphLookupService` contains ZERO `graphEdge.create\|upsert\|update\|delete` | static | `cd backend && grep -c 'graphEdge\.\(create\|upsert\|update\|delete\)' src/modules/ai/services/triage-graph-lookup.service.ts` → expect `0` | ❌ new | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠ flaky or partial*

---

## Wave 0 Requirements

- [ ] `backend/src/modules/ai/services/__tests__/triage-graph-lookup.service.spec.ts` — ≥ 10 `it` blocks covering D-03 three-layer read path matrix, D-05 sender-beats-domain precedence (SQL pattern grep OR real Postgres fixture), D-07 shadow-counter-always-on.
- [ ] `backend/src/modules/ai/services/__tests__/triage-affinity-promotion.helpers.spec.ts` — ≥ 7 `it` blocks covering D-01 OpenClaw gates (pass/fail each gate independently), D-01a provenance metadata, domain aggregation per Open Q1.
- [ ] Extend `backend/src/modules/ai/services/__tests__/email-triage.service.spec.ts` — ≥ 3 new `it` blocks: graph lookup invoked after override-miss, short-circuit on `confidence >= cutoff`, override-match skips graph (Open Q2 Option A).
- [ ] Extend `backend/src/modules/ai/services/__tests__/triage-learning-redis.spec.ts` OR create `triage-decay-gc.helpers.spec.ts` — ≥ 5 `it` blocks for D-06 third-store scenarios (below threshold, at threshold, multi-tenant scope, corrupt provenance defensive branch, regression against Phase 149 5.1–5.12).
- [ ] Extend `backend/src/modules/labels/__tests__/labels.service.spec.ts` — ≥ 2 `it` blocks: `delete` cleans up `GraphNode{nodeType:'label'}` mirror; `bulkDelete` same.
- [ ] Migration file `backend/prisma/migrations/<timestamp>_add_graph_affinity_columns/migration.sql` — generated via `cd backend && npx prisma migrate dev --name add_graph_affinity_columns` against LOCAL Postgres ONLY (per CLAUDE.md Guard suite).
- [ ] Framework install: none — Jest + `@willsoto/nestjs-prometheus` + BullMQ + ioredis already in use.

**Pre-migration safety script (Open Q9):** Run read-only scan against prod BEFORE adding `@@unique([tenantId, nodeType, externalId])` to `GraphNode`:

```sql
SELECT "tenantId", "nodeType", "externalId", COUNT(*)
FROM graph_nodes
GROUP BY "tenantId", "nodeType", "externalId"
HAVING COUNT(*) > 1;
```

If zero rows → add the unique constraint in the Phase 150 migration. If non-zero → plan must either add a dedup task to Wave 0 OR drop the unique-constraint ambition and use `$transaction` + `SELECT FOR UPDATE` per Landmine §1 Option (b).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| p95 `TriageGraphLookupService.lookup` latency < 5ms on realistic prod shape | Success Criterion 2 (implicit) | Production measurement only — CI hardware variance makes ms-level assertions flaky; real shape requires prod-like cardinality (274 emails, 540 contacts, 810 graph edges + seeded affinity edges) | Phase 155 dashboard panel `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{route=~"/api/v1/emails.*triage"}[5m])))` measures post-deploy. Phase 156 formally benchmarks. Phase 150 ships instrumentation only. |
| SC-4: `rate(triage_graph_lookup_total{outcome='would_skip_shadow'}) / rate(triage_email_total) >= 0.20` after 30-day warmup | Success Criterion 4 | Requires 30 days of real traffic + Prometheus retention | Monitor Grafana dashboard; Phase 156 validates the 20% target. |
| Affinity-promotion → decay-gc dispatch ordering within same 3 AM cron slot | Landmine §5 | BullMQ enqueue order observable only via production logs | After first nightly run post-deploy: inspect Railway logs for job-id ordering. Document observed order in phase SUMMARY.md. |

---

## Validation Sign-Off

- [ ] Every task in the plan has either an `<automated>` command pointing at a spec in this file OR a Wave 0 dependency edge
- [ ] Sampling continuity: no 3 consecutive tasks without an `<automated>` verify step
- [ ] Wave 0 list above covers all ❌ rows in the Per-Task Verification Map
- [ ] No `--watch` flags anywhere in commands
- [ ] Feedback latency < 15s on quick command
- [ ] `nyquist_compliant: true` flipped in frontmatter when plan-checker confirms coverage matches §Sampling Rate matrix from RESEARCH.md

**Approval:** pending
