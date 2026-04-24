---
phase: 150
plan: 01
subsystem: backend-ai-triage
tags: [wave-0, red-specs, nyquist, graph-memory, pre-migration-scan]
dependency_graph:
  requires: [Phase 149 triage-decay-gc.helpers.ts, Phase 147 triage-feedback.service.ts, Phase 148 triage-correction-weight.ts]
  provides:
    - backend/scripts/scan-graph-nodes-duplicates.sql
    - RED spec triage-graph-lookup.service.spec.ts (10 it blocks)
    - RED spec triage-affinity-promotion.helpers.spec.ts (7 it blocks)
    - RED spec triage-decay-gc.helpers.spec.ts (5 it blocks)
  affects: [Plan 02 depends on scan result for Open Q9 branch; Plans 02/03/04 turn specs green]
tech_stack:
  added: []
  patterns:
    - "Nyquist Wave 0 contract: specs RED at Jest runtime while tsc clean via tsconfig exclude"
    - "@willsoto/nestjs-prometheus getToken() for metric DI token in test providers"
    - "Pure-function helper test pattern (no Test.createTestingModule) with DepBag"
key_files:
  created:
    - backend/scripts/scan-graph-nodes-duplicates.sql
    - backend/src/modules/ai/services/__tests__/triage-graph-lookup.service.spec.ts
    - backend/src/modules/ai/services/__tests__/triage-affinity-promotion.helpers.spec.ts
    - backend/src/modules/ai/services/__tests__/triage-decay-gc.helpers.spec.ts
  modified: []
decisions:
  - "Wave 0 ships tsc-clean by construction (tsconfig excludes **/*spec.ts); RED state lives exclusively in Jest runtime."
  - "EmailTriageFeedback has NO overrideId column — decay-gc spec relies exclusively on edge.metadata.derivedFromOverrideIds provenance walk (B-2 schema compliance)."
  - "D-04a normalization assertions verify sender kept with + intact and domain kept without subdomain collapsing (no Gmail alias stripping)."
metrics:
  duration_minutes: 6
  completed_date: 2026-04-24
  tasks_completed: 5
  files_created: 4
  total_it_blocks: 22
  commits: 4
requirements:
  - GRAPH-01
  - GRAPH-02
  - GRAPH-03
---

# Phase 150 Plan 01: Wave 0 — Pre-Migration Scan SQL + RED Spec Scaffolds Summary

**One-liner:** Wave 0 Nyquist gate for Phase 150 — shipped a read-only duplicate-scan SQL (Open Q9 decision input) and 22 RED it() blocks across 3 spec files that Plans 02/03/04 must turn green, all while keeping `tsc --noEmit` exit-0 via the pre-existing `tsconfig.json` `**/*spec.ts` exclusion.

## Objective

Wave 0 safety gate: produce (1) the read-only SQL scan that determines whether the Phase 150 migration can safely add `@@unique([tenantId, nodeType, externalId])` to `GraphNode` (Open Q9) and (2) failing tests pointing at every must-have in VALIDATION.md before any implementation plan runs. This plan ships zero production code — it produces the RED test harness and the SQL input to the Wave 1 checkpoint.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Pre-migration duplicate scan SQL (Open Q9) | `cd515394` | backend/scripts/scan-graph-nodes-duplicates.sql |
| 2 | RED spec for TriageGraphLookupService — D-03/D-05/D-07 | `61e1d97c` | backend/src/modules/ai/services/__tests__/triage-graph-lookup.service.spec.ts |
| 3 | RED spec for triage-affinity-promotion.helpers — D-01 gates + D-01a provenance | `9dd1784e` | backend/src/modules/ai/services/__tests__/triage-affinity-promotion.helpers.spec.ts |
| 4 | RED spec for triage-decay-gc.helpers — D-06 third-store extension | `7db1c1b2` | backend/src/modules/ai/services/__tests__/triage-decay-gc.helpers.spec.ts |
| 5 | tsc type-check gate (tsc --noEmit exits 0) | _(no commit — verification only)_ | _(no files)_ |

## Nyquist RED Verification Evidence

All three spec files were run via Jest (with a temporary config that bypasses `globalSetup` so no DB is required) and confirmed to FAIL with the expected error mode:

| Spec | it() blocks | RED Mode | Observed Failure |
|------|------------:|----------|------------------|
| triage-graph-lookup.service.spec.ts | 10 | Missing module | `Cannot find module '../triage-graph-lookup.service'` at line 13 — Plan 04 creates the service |
| triage-affinity-promotion.helpers.spec.ts | 7 | Missing module | `Cannot find module '../triage-affinity-promotion.helpers'` at line 13 — Plan 02 extracts the helper |
| triage-decay-gc.helpers.spec.ts | 5 | Missing export | `TypeError: processAffinityEdgeDecayForTenant is not a function` in 5/5 tests — Plan 03 adds the export to the existing Phase 149 helper |
| **Total** | **22** | | |

Each RED signature is informative (names the missing production symbol) rather than a generic compile error — this is the "test exists, points at the production contract, compiles, but fails because production doesn't exist yet" Wave 0 invariant.

Verification command used (documented so Plans 02/03/04 can re-run after their implementations land):

```bash
cd backend && npx jest --testPathPatterns='<spec-name>' --config=<temp-config-no-globalSetup>
```

Once Plan 02 stands up a local Postgres test DB (`npm run test:docker:up`), the normal `npx jest <spec>` will work with its standard globalSetup. For Wave 0 all three specs are pure unit with mocks — no DB required — so the bypass run is equivalent.

## Acceptance Criteria Results

| Gate | Expected | Observed | Pass |
|------|----------|----------|------|
| `scan-graph-nodes-duplicates.sql` exists | ✓ | ✓ | ✓ |
| Mutation tokens in SQL `(UPDATE\|DELETE\|DROP\|TRUNCATE\|INSERT)` | 0 | 0 | ✓ |
| `HAVING COUNT(*) > 1` in SQL | 1 | 1 | ✓ |
| `LIMIT 100` in SQL | 1 | 1 | ✓ |
| triage-graph-lookup it() count | 10 | 10 | ✓ |
| triage-graph-lookup `would_skip_shadow` mentions | ≥2 | 3 | ✓ |
| triage-graph-lookup `CASE WHEN src` (D-05 SQL gate) | 1 | 1 | ✓ |
| triage-graph-lookup `D-04a` mentions | ≥2 | 3 | ✓ |
| triage-graph-lookup `getToken('triage_graph_lookup_total')` | 1 (plan criterion) | 2 (import + provide) | ✓ (both required; plan undercount) |
| triage-affinity-promotion it() count | 7 | 7 | ✓ |
| triage-affinity-promotion `D-01a` mentions | ≥1 | 2 | ✓ |
| triage-affinity-promotion `distinct senders` mentions | ≥1 | 1 | ✓ |
| triage-affinity-promotion `promotionAudit` mentions | ≥1 | 3 | ✓ |
| triage-affinity-promotion `derivedFromOverrideIds` mentions | ≥1 | 3 | ✓ |
| triage-affinity-promotion `userLabel.findFirst` mentions | ≥2 | 5 | ✓ |
| triage-decay-gc it() count | 5 | 5 | ✓ |
| triage-decay-gc `store: 'graph_edge'` mentions | ≥1 | 1 | ✓ |
| triage-decay-gc `tenantId: 't1'` mentions | ≥3 | 15 | ✓ |
| triage-decay-gc `derivedFromOverrideIds` mentions | ≥3 | 7 | ✓ |
| triage-decay-gc `overrideId:` mentions (B-2 schema compliance) | 0 | 0 | ✓ |
| Total it() across 3 specs | ≥22 | 22 | ✓ |
| `tsc --noEmit` exit code | 0 | 0 | ✓ |
| tsconfig excludes `**/*spec.ts` | present | present (line 30) | ✓ |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written.

### Plan-vs-Reality Discrepancies (Documented, No Fix Applied)

**1. [Plan acceptance criterion inconsistency] `grep -c 'SELECT' scan-graph-nodes-duplicates.sql` returns 3, not 1**

- **Found during:** Task 1 acceptance criteria verification.
- **Root cause:** The plan's exact-content block for the SQL file (plan lines 138-163) itself contains three lines mentioning "SELECT":
  1. Header comment line: "USAGE: run as read-only SELECT against BOTH local dev and production."
  2. Local-run example line: "Local: cd backend && psql $DATABASE_URL -f scripts/scan-graph-nodes-duplicates.sql" (line does not actually contain SELECT — recounting... actually 3 matches are: header "read-only SELECT", the actual `SELECT` statement, and "Zero rows returned" no wait — verified via grep, exactly 3 lines match /SELECT/.)
  3. The actual `SELECT` statement at the bottom.
- **Resolution:** The intent of the acceptance criterion (a single SELECT statement, no other DML) is fully satisfied — the mutation-token check returns 0 as required. File content matches the plan's exact-content block verbatim. The "returns 1" target was a planner oversight; semantic intent is met. No fix applied (would require deviating from the plan's mandated file content).

**2. [Plan-vs-plan acceptance inconsistency] `getToken('triage_graph_lookup_total')` grep returns 2, not 1**

- **Found during:** Task 2 acceptance criteria verification.
- **Root cause:** The plan's mandated scaffold uses `getToken(...)` both in the `import` statement and in the `providers` array entry — i.e., the plan's own example code contains 2 occurrences, not 1.
- **Resolution:** Both occurrences are required for the spec to compile and run. The plan's "returns 1" target was a planner undercount. Semantic intent (token-based DI wiring) is fully met. No fix applied.

### Framework/Environment Notes

**3. [Environment note — not a deviation] Jest globalSetup requires a live test Postgres**

- **Found during:** Nyquist RED-verification step.
- **Detail:** `backend/jest.config.js` wires `globalSetup: '<rootDir>/test/global-setup.ts'` which runs `prisma migrate deploy` + `prisma db seed`. Without `npm run test:docker:up` the setup aborts before any test file loads, so the normal `npx jest <spec>` cannot directly demonstrate the RED state for Wave 0 specs.
- **Workaround:** Created a temp Jest config at `D:/tmp/jest-wave0-config.json` that inherits all production-relevant options except globalSetup/globalTeardown, allowing the three spec files to run as pure-unit mocks. Every Plan 02/03/04 executor with a running local Postgres will use the normal `npx jest` invocation; this workaround is for Wave 0 only.
- **Not a Rule 3 fix:** this is a pre-existing test-infra posture (Phase 148/149 specs face the same pattern), not a Plan 01 regression.

### Auth Gates

None.

## Known Stubs

None — this plan produces only RED tests + read-only SQL. No UI, no production code paths.

## Threat Flags

None — no new attack surface introduced. The SQL script is read-only and bounded (`LIMIT 100`); the spec files execute only against mocks.

## Files Created

- `backend/scripts/scan-graph-nodes-duplicates.sql` (25 lines, ~1 KB) — Read-only duplicate scan for Open Q9 decision input. Header comment encodes the Plan 02 branch rule (zero rows → `@@unique` constraint; non-zero → Landmine §1 Option (b) transaction fallback).
- `backend/src/modules/ai/services/__tests__/triage-graph-lookup.service.spec.ts` (162 lines, 7.2 KB) — 10 it() blocks. Covers D-03 three-layer read matrix, D-05 sender-beats-domain via SQL ORDER BY grep, D-07 shadow counter always-on, D-04a normalization, validUntil filter.
- `backend/src/modules/ai/services/__tests__/triage-affinity-promotion.helpers.spec.ts` (265 lines, 12 KB) — 7 it() blocks. Covers D-01 OpenClaw 3/0.8 gates (row count, confidence, update vs create), D-01a provenance JSONB, Open Q1 domain-aggregation inheritance, B-3 UserLabel.findFirst resolution.
- `backend/src/modules/ai/services/__tests__/triage-decay-gc.helpers.spec.ts` (191 lines, 7.6 KB) — 5 it() blocks. Covers D-06 third-store scenarios: hard-delete below 0.3, keep at 0.35, defensive corrupt provenance, multi-tenant isolation, `store='graph_edge'` counter emit.

## Files Modified

None.

## Wave 0 Contract — Checklist

- [x] `backend/src/modules/ai/services/__tests__/triage-graph-lookup.service.spec.ts` — ≥10 it() blocks covering D-03/D-05/D-07
- [x] `backend/src/modules/ai/services/__tests__/triage-affinity-promotion.helpers.spec.ts` — ≥7 it() blocks covering D-01 gates + D-01a provenance + Open Q1 domain inheritance
- [x] `backend/src/modules/ai/services/__tests__/triage-decay-gc.helpers.spec.ts` — ≥5 it() blocks covering D-06 third-store (Plan 01 chose this cleaner per-plan-separation over extending `triage-learning-redis.spec.ts`, per Open Q4 and RESEARCH recommendation)
- [x] Pre-migration safety script for Open Q9 — ready for developer to run against prod BEFORE Plan 02 commits the migration
- [x] `tsc --noEmit` exit 0 — Wave 0 ships tsc-clean by construction via `tsconfig.json` `**/*spec.ts` exclusion
- [x] Total ≥22 RED it() blocks (observed: 22)
- [ ] `email-triage.service.spec.ts` extension (≥3 new it() blocks for graph integration) — **deferred to Plan 04** (scope boundary: Plan 04 owns the EmailTriageService integration and its spec extensions; this Plan 01 ships only the NEW spec files)
- [ ] `labels.service.spec.ts` extension (≥2 new it() blocks for D-04 mirror sync) — **deferred to Plan 05** (Plan 05 owns the LabelsService hook work and spec extension)

Scope boundary clarification: `150-VALIDATION.md` Wave 0 Requirements lists five spec surfaces. Plans 01 through 05 are partitioned so each plan ships the specs closest to the code it introduces — Plan 01 scope is the three standalone NEW spec files (plus the scan SQL), and the two extension surfaces move with their owning plans. Plan 04's SUMMARY will account for the `email-triage` extension; Plan 05's will account for `labels.service` extension.

## Key Decisions

1. **Wave 0 RED via missing-symbol runtime errors, not compile errors.** tsconfig excludes `**/*spec.ts` from the main `tsc --noEmit` so the production build stays clean. The specs compile under the `tsconfig.test.json` override (`exclude: []`) at Jest runtime but blow up on `Cannot find module` / `is not a function` — a precise, informative RED signal that points exactly at the missing production surface Plans 02/03/04 must create.

2. **Three-way split of the spec scaffolds** (lookup service, affinity promotion helper, decay-gc helper) rather than one giant file — mirrors the Plan 02/03/04 production-code split and keeps each RED spec immediately adjacent to the plan that turns it green.

3. **B-2 schema compliance in decay-gc spec.** Zero `overrideId:` references. All provenance walks go through `edge.metadata.derivedFromOverrideIds`. `EmailTriageFeedback` table has NO `overrideId` column (verified against `backend/prisma/schema.prisma` §EmailTriageFeedback lines 2560-2576), so specs relying on that column would silently pass under Plan 03's implementation while leaving the real provenance walk untested.

4. **Jest temporary-config workaround for Wave 0 RED verification.** The production `jest.config.js` wires globalSetup to `prisma migrate deploy + seed`, which requires Docker Postgres (`npm run test:docker:up`) unavailable at Wave 0 verification time. Bypass config at `D:/tmp/jest-wave0-config.json` lets us demonstrate RED without standing up a DB — safe because all three Wave 0 specs are pure-unit with mocks. Plans 02/03/04 will use the standard invocation.

## Self-Check

- [x] backend/scripts/scan-graph-nodes-duplicates.sql — FOUND
- [x] backend/src/modules/ai/services/__tests__/triage-graph-lookup.service.spec.ts — FOUND
- [x] backend/src/modules/ai/services/__tests__/triage-affinity-promotion.helpers.spec.ts — FOUND
- [x] backend/src/modules/ai/services/__tests__/triage-decay-gc.helpers.spec.ts — FOUND
- [x] Commit `cd515394` — FOUND
- [x] Commit `61e1d97c` — FOUND
- [x] Commit `9dd1784e` — FOUND
- [x] Commit `7db1c1b2` — FOUND

## Self-Check: PASSED
