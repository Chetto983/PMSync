---
phase: 150
plan: 04
subsystem: backend/ai/triage
tags: [graph-memory, read-path, layer-2, llm-skip, GRAPH-02, observability]
requires: [150-01, 150-02]
provides:
  - TriageGraphLookupService (read-only Layer 2 lookup)
  - graphHint plumbing into LLM system prompt
  - TRIAGE_GRAPH_CONFIDENCE_CUTOFF kill switch (default '9999' = disabled)
  - 3 new it() blocks in email-triage.service.spec.ts
affects:
  - backend/src/modules/ai/services/email-triage.service.ts (Layer 2 integration)
  - backend/src/modules/ai/services/email-analysis.service.ts (graphHint -> system prompt)
  - backend/src/modules/ai/services/triage-override.service.ts (extractEmail exported)
  - backend/src/modules/ai/ai.module.ts (provider registration)
tech-stack:
  added: []
  patterns:
    - Single $queryRaw with sender-first ORDER BY for D-05 precedence
    - Shadow counter (D-07) emitted INDEPENDENTLY of cutoff branch
    - SC-3 write-isolation enforced by grep gate
    - Mandatory ConfigService injection (B-5) — Nest fails loudly on missing DI
    - W-1 single-source-of-truth for extractEmail (export from triage-override.service)
    - B-4 structured graphHint threaded into LLM system prompt via buildTaggedPromptSection
    - B-8 snake_case triageSource lock (graph_sender|graph_domain) for Plan 05 i18n mirror
key-files:
  created:
    - backend/src/modules/ai/services/triage-graph-lookup.service.ts (154 LF)
    - .planning/phases/150-graph-triage-memory/deferred-items.md
  modified:
    - backend/src/modules/ai/services/__tests__/triage-graph-lookup.service.spec.ts (Rule 1 test-isolation hygiene fix)
    - backend/src/modules/ai/ai.module.ts (provider registration)
    - backend/src/modules/ai/services/triage-override.service.ts (extractEmail export)
    - backend/src/modules/ai/services/email-triage.service.ts (Layer 2 integration, +75 LF -> 737 LF)
    - backend/src/modules/ai/services/email-analysis.service.ts (graphHint plumbing, +25 LF -> 647 LF)
    - backend/src/modules/ai/services/__tests__/email-triage.service.spec.ts (3 new it blocks, W-2 mocks)
decisions:
  - ConfigService position deviation — placed BEFORE @Optional block instead of AFTER (TS rule: required cannot follow optional). B-5 semantic intent preserved.
  - GRAPH_HINT block concatenated with USER_OVERRIDE block in 5th locale slot (locale signature has 5 positional args; concat keeps the contract intact without locale-file changes).
  - Spec hygiene Rule 1 fix — added explicit configMock.get.mockImplementation reset in beforeEach (jest.clearAllMocks does not reset mockImplementation, leaking cutoff=0.9 from test 3 into test 7).
  - .env.example NOT updated for TRIAGE_GRAPH_CONFIDENCE_CUTOFF — Phase 149/148 also did not document their TRIAGE_* envs there. Documented in this SUMMARY instead.
  - Task 1 metrics already shipped in commit 57287bd6 (Plan 02). No additional commit needed.
metrics:
  duration_min: 15
  tasks: 6
  files: 7
  commits: 4
  completed_date: 2026-04-24
---

# Phase 150 Plan 04: Read Path — TriageGraphLookupService + Layer 2 Integration Summary

**One-liner:** Layer 2 of the 3-layer triage stack — single-query graph lookup with SC-3 write-isolation, D-07 shadow counter, B-8 snake_case triageSource lock, and B-4 graphHint threading into the LLM system prompt.

## Plan Outcome

GRAPH-02 confidence-gating shipped end-to-end behind a default-OFF kill switch (`TRIAGE_GRAPH_CONFIDENCE_CUTOFF=9999`). The shadow counter (`outcome='would_skip_shadow'`) emits from day one regardless of cutoff, providing SC-4 measurement data to operators considering lowering the cutoff.

Plan 01 Task 2 RED contract (10 it blocks in `triage-graph-lookup.service.spec.ts`) turned 10/10 GREEN. Plan 01 Task 5 contract (3 new it blocks in `email-triage.service.spec.ts`) shipped — 7/7 spec total green (4 Phase 147 + 3 Phase 150). Phase 149 regression preserved (49/49 green across 5 services). Plan 02 + 03 helpers preserved (12/12 green). tsc --noEmit exit 0.

## Commits

| # | SHA | Subject |
|---|-----|---------|
| 1 | `7e3ebc2b` | feat(150-04): TriageGraphLookupService — single-query D-03a read path |
| 2 | `1b8fd689` | feat(150-04): register TriageGraphLookupService in AiModule (Open Q5: provider-only) |
| 3 | `108dab24` | refactor(150-04): export extractEmail from triage-override.service (W-1) |
| 4 | `11fab1c7` | feat(150-04): wire Layer 2 graph lookup into EmailTriageService + thread graphHint to LLM (B-4, B-5, B-8, W-1) |
| 5 | `9eb084d0` | test(150-04): extend email-triage spec with 3 graph-lookup integration tests (W-2) |

Predecessor (Plan 02): `57287bd6 feat(150-02): register 3 Phase 150 D-07a graph triage metric providers` — Task 1 (metrics module) was already shipped in Plan 02 per the cross-plan contract documented in `150-02-SUMMARY.md`. No re-commit needed.

## Tasks Executed

### Task 1: Register 3 Prometheus metrics — ALREADY SHIPPED IN PLAN 02

Verified all 6 acceptance gates green in current state of `backend/src/common/metrics/metrics.module.ts` (commit `57287bd6`):

```
grep -c 'triage_graph_lookup_total'   = 2 (need >=2)  PASS
grep -c 'triage_graph_promotion_total' = 2 (need >=2)  PASS
grep -c 'triage_graph_edges_active'   = 2 (need >=2)  PASS
grep -c "labelNames: ['outcome', 'edge_source', 'tenant_id']" = 1  PASS
grep -c 'makeGaugeProvider' = 9  PASS (>=1 needed)
tsc --noEmit exit 0
```

### Task 2: Create TriageGraphLookupService — Plan 01 RED → 10/10 GREEN

154 LF service file created. Acceptance gates:

```
SC-3 write-isolation:    grep -cE 'graphEdge\.(create|upsert|update|delete)' = 0  PASS
TRIAGE_GRAPH_CONFIDENCE_CUTOFF refs:  grep -c = 2  PASS (>=1)
Default '9999' literal:               grep -c "default.*'9999'" = 1  PASS (>=1)
D-05 ORDER BY sender-first:           grep -cE "CASE WHEN src...nodeType.. = 'sender' THEN 0 ELSE 1 END" = 1  PASS
D-07 shadow counter:                  grep -c 'would_skip_shadow' = 2  PASS (>=1)
Multi-tenant:                         grep -c 'tenantId' = 10  PASS (>=3)
validUntil expiry:                    grep -cE 'validUntil.*IS NULL.*OR.*validUntil.*>.*now\(\)' = 2  PASS (>=1)
File length: 154 LF (target 80-250)   PASS
tsc --noEmit:                         exit 0  PASS
Spec result:                          10/10 GREEN  PASS
```

**Shadow counter structural isolation (D-07):** the `if (row.confidence >= 0.9)` shadow emit is a SIBLING of the `if (row.confidence >= this.cutoff)` cutoff branch (not nested). Verified by reading the file at lines 116-138.

**Spec hygiene fix (Rule 1):** Plan 01 Task 2 spec used `jest.clearAllMocks()` in beforeEach, which does NOT reset `mockImplementation`. Test 3 set `configMock.get.mockImplementation(() => '0.9')` and that implementation leaked into test 7 (which expected the default cutoff=9999 behavior). Without the fix, 9/10 GREEN. With the fix (one added line in beforeEach: `configMock.get.mockImplementation((_k, dflt) => dflt ?? '9999')`), 10/10 GREEN. Zero assertion changes.

### Task 3: Register service in AiModule — Open Q5 provider-only

```
grep -c 'TriageGraphLookupService' src/modules/ai/ai.module.ts = 2 (import + providers)  PASS
exports[] entry: NOT present (verified by reading file)  PASS
tsc --noEmit exit 0  PASS
```

### Task 3.5: Export `extractEmail` from triage-override.service.ts — W-1

```
grep -c '^export function extractEmail' = 1  PASS
grep -cE '^function extractEmail'       = 0  PASS (non-exported form gone)
tsc --noEmit exit 0  PASS
No Phase 147 spec exists for triage-override (skip regression — file confirmed absent).
```

### Task 4: Layer 2 integration in EmailTriageService — B-5, B-8, W-1

Constructor extended with mandatory `ConfigService` (no @Optional) and optional `TriageGraphLookupService`. Layer 2 inserted between override-block-end and `analyzeEmailUnified` call. Short-circuit branch writes snake_case `triageSource: 'graph_sender' | 'graph_domain'` to EmailAnalysis.

```
TGLS refs:               grep -c 'triageGraphLookupService' = 3  PASS (>=3)
graphCutoff field+use:   grep -c 'graphCutoff' = 3  PASS (>=2)
ENV ref:                 grep -c 'TRIAGE_GRAPH_CONFIDENCE_CUTOFF' = 2  PASS (>=1)
configService refs:      grep -c 'configService' = 2  PASS (>=2)
@Optional near config:   grep -B1 'configService' | grep -c '@Optional' = 0  PASS (B-5 mandatory)
extractEmail import+use: grep -c 'extractEmail' = 2  PASS (>=2 — W-1 reuse)
graph_sender literal:    grep -c 'graph_sender' = 3  PASS (>=1)
graph_domain literal:    grep -c 'graph_domain' = 3  PASS (>=1)
camelCase leak:          grep -cE "'graphSender'|'graphDomain'" = 0  PASS
File length: 737 LF (under 900 cap)  PASS
Multi-tenant: both prisma.email.updateMany + prisma.emailAnalysis.upsert include tenantId  PASS
```

**Open Q2 Option A gate verified by reading the file:** the Layer 2 block opens with `if (!matchedOverrideAction && this.triageGraphLookupService) {` — when override matched, Layer 2 is fully skipped.

### Task 4.5: Thread graphHint into LLM system prompt — B-4

```
graphHint refs in email-analysis.service.ts: grep -c 'graphHint' = 8  PASS (>=4)
GRAPH_HINT tag literal:                      grep -c 'GRAPH_HINT' = 2  PASS (>=1)
predictedLabel refs:                         grep -c 'predictedLabel' = 2  PASS (>=2)
email-insights.service.ts (facade unchanged): grep -c 'graphHint' = 0  PASS (<=1)
File length: 647 LF (under 900 cap)  PASS
tsc --noEmit exit 0  PASS
```

**Locale-signature deviation:** `t.insights.analyzeUnified.systemPrompt(...)` accepts 5 positional string args. Rather than break the locale contract by adding a 6th, the new GRAPH_HINT block is concatenated with the existing USER_OVERRIDE block in the 5th slot (`overrideAndGraphBlock = [overrideBlock, graphHintBlock].filter(Boolean).join('\n')`). Both blocks preserve their tag boundaries from `buildTaggedPromptSection`, so the LLM sees them as distinct sections (`<USER_OVERRIDE>...</USER_OVERRIDE>\n<GRAPH_HINT>...</GRAPH_HINT>`).

### Task 5: Spec extension — W-2 explicit mocks + 3 new it blocks

```
TriageGraphLookupService refs in spec: grep -c = 3  PASS (>=2)
provide: ConfigService:                grep -c = 1  PASS (>=1)
provide: TriageGraphLookupService:     grep -c = 1  PASS (>=1)
3 required it titles:                  grep -cE = 3  PASS (=3)
graph_sender assertion in test 3:      grep -c = 2  PASS (>=1)
Spec result:                           7/7 GREEN  PASS
```

`buildModule()` helper extracted so test 3 can rebuild the testing module after mutating `configMock.get.mockImplementation` (cutoff is read once at constructor time).

## Cross-Plan Locks Closed

| Lock | Description | Closure Evidence |
|------|-------------|------------------|
| **B-4** | `graphHint` reaches LLM system prompt via `buildTaggedPromptSection('GRAPH_HINT', ...)` | email-analysis.service.ts L378-385 builds GRAPH_HINT block and concatenates with USER_OVERRIDE in 5th locale arg slot. 200-char cap preserved. |
| **B-5** | `ConfigService` mandatory on `EmailTriageService` (no @Optional) | email-triage.service.ts L130 declares `private readonly configService: ConfigService` with NO `@Optional()` decorator. `grep -B1 configService \| grep -c @Optional = 0`. |
| **B-8** | snake_case `triageSource` (`graph_sender`, `graph_domain`) | Short-circuit branch writes `triageSource: 'graph_sender' \| 'graph_domain'` to EmailAnalysis (B-8 cross-plan lock with Plan 05 i18n mirror). camelCase grep returns 0. |
| **W-1** | `extractEmail` exported from triage-override.service.ts, imported in email-triage.service.ts | `^export function extractEmail` grep = 1. email-triage.service.ts imports `extractEmail` from `./triage-override.service`. No duplicate 5-line helper. |
| **W-2** | Spec providers include ConfigService + TriageGraphLookupService mocks explicitly | Both `provide: ConfigService` + `provide: TriageGraphLookupService` present in providers array. No auto-provide reliance. |
| **I-1** | No hardcoded line numbers in shipped code | All Task 4 anchors resolved by reading current file. Service file does not reference any plan line numbers. |
| **SC-3** | Read-only `TriageGraphLookupService` (zero edge mutations) | `grep -cE 'graphEdge\.(create\|upsert\|update\|delete)' triage-graph-lookup.service.ts = 0`. Doc comment phrased to satisfy literal grep without losing semantic intent. |
| **D-07** | Shadow counter emit independent of cutoff | Service code: `if (row.confidence >= 0.9) { ...shadow inc... }` is a SIBLING of `if (row.confidence >= this.cutoff)`. Spec test 7 explicitly asserts this with cutoff=9999 + confidence=0.95: shadow emits, skipped does not. |

## Test Evidence

```
triage-graph-lookup.service.spec.ts:    Tests: 10 passed, 10 total
email-triage.service.spec.ts:           Tests:  7 passed,  7 total  (4 Phase 147 + 3 Phase 150)
Combined:                               Tests: 17 passed, 17 total

Phase 149 regression suite:
  triage-learning-redis|triage-correction.service|triage-correction-weight|triage-feedback|triage-promotion
  Tests: 49 passed, 49 total

Plan 02 + Plan 03 helpers:
  triage-affinity-promotion.helpers|triage-decay-gc.helpers
  Tests: 12 passed, 12 total

tsc --noEmit: exit 0
```

## Deviations from Plan

### [Rule 1 — Bug] Test isolation: jest.clearAllMocks does not reset mockImplementation

- **Found during:** Task 2 first spec run
- **Issue:** Plan 01 Task 2 spec at line 19 declared `configMock.get = jest.fn((_k, d?) => d ?? '9999')`, then test 3 (line 53) called `configMock.get.mockImplementation(...)` to set cutoff=0.9, then test 7 (line 118) ran with the shared `service` instance (rebuilt in beforeEach with cutoff=9999 EXPECTED but actually inherited cutoff=0.9 from leaked impl). Result: 9/10 GREEN, test 7 saw `outcome=skipped` emitted when assertion expected NOT to be called.
- **Fix:** Added 1-line `configMock.get.mockImplementation((_k, d?) => d ?? '9999')` reset inside beforeEach (after `jest.clearAllMocks()`).
- **No assertion change.** Spec hygiene only.
- **Files modified:** `backend/src/modules/ai/services/__tests__/triage-graph-lookup.service.spec.ts`
- **Commit:** `7e3ebc2b`

### [Rule 1 — Plan inconsistency] ConfigService constructor position

- **Found during:** Task 4 first edit
- **Issue:** Plan pseudocode placed `ConfigService` AFTER the `@Optional() triageOverrideService?` argument. TS rule: "required parameter cannot follow optional parameter" → tsc compile error.
- **Fix:** Placed `ConfigService` BEFORE the `@Optional()` block (after the 4th required `redisConnection` arg). B-5 semantic intent (mandatory, no @Optional) preserved. Order in constructor: prisma, emailInsights, subscriptionService, redisConnection, **configService**, then `@Optional()`-decorated optional services.
- **No semantic change.** B-5 acceptance gate `grep -B1 configService | grep -c @Optional = 0` still passes.
- **Files modified:** `backend/src/modules/ai/services/email-triage.service.ts`
- **Commit:** `11fab1c7`

### [Rule 1 — Plan inconsistency] Locale signature has 5 args, not 6

- **Found during:** Task 4.5 first edit
- **Issue:** Plan pseudocode added a 6th positional argument `graphHintBlock` to `t.insights.analyzeUnified.systemPrompt(...)`. The locale type contract (`backend/src/modules/ai/locales/types.ts:144-152`) accepts only 5 args (`allowedLabels`, `labelRules?`, `triageRules?`, `correctionsBlock?`, `overrideHint?`). Adding a 6th would require touching `en.ts` + `it.ts` + `types.ts`, expanding scope.
- **Fix:** Concatenate `graphHintBlock` with `overrideBlock` in the 5th slot (`overrideAndGraphBlock = [overrideBlock, graphHintBlock].filter(Boolean).join('\n')`). Both retain their `<USER_OVERRIDE>...</USER_OVERRIDE>` and `<GRAPH_HINT>...</GRAPH_HINT>` tag boundaries from `buildTaggedPromptSection`, so the LLM sees them as distinct sections.
- **No locale-file changes required.**
- **Files modified:** `backend/src/modules/ai/services/email-analysis.service.ts`
- **Commit:** `11fab1c7`

### [Rule 3 — Blocking] Jest globalSetup requires localhost:5432 Postgres

- **Found during:** Task 2 spec run
- **Issue:** Default jest config wires `prisma migrate deploy` in globalSetup, which connects to `localhost:5432`. Local Postgres is not running in this execution environment.
- **Fix:** Use Plan 01's pre-existing `D:/tmp/jest-wave0-config.json` (bypasses globalSetup) for spec runs. Same path used by Plans 01-03.
- **No production code change.** Workaround for execution-environment constraint.
- **Files modified:** none

## Auth gates

None during execution. Local-only edits.

## Known Stubs

None. The graph short-circuit writes real values (Email.aiLabels, EmailAnalysis.triageSource, EmailAnalysis.modelUsed) and the graphHint flows through to a real `buildTaggedPromptSection` block in the LLM system prompt.

## Threat Flags

No new security-relevant surface beyond what's already in the plan's threat_model. The new `prisma.$queryRaw` is parameterized via Prisma tagged-template binding; both new short-circuit Prisma writes include `tenantId` in WHERE/composite-key.

## Task 1 Already-Shipped Note

Plan 02 commit `57287bd6 feat(150-02): register 3 Phase 150 D-07a graph triage metric providers` shipped the 3 metric providers + 3 exports in `backend/src/common/metrics/metrics.module.ts` ahead of Plan 04. Per Plan 02 SUMMARY (`150-02-SUMMARY.md`), this was intentional cross-plan front-loading so Plan 04's `@InjectMetric('triage_graph_lookup_total')` would resolve at DI time. Verified all 6 Plan 04 Task 1 acceptance gates green against the existing file state. No additional commit created.

## Env Var Registration

`TRIAGE_GRAPH_CONFIDENCE_CUTOFF` (default `'9999'` — effectively disabled).

- **Read by:** `EmailTriageService` constructor + `TriageGraphLookupService` constructor (both via `ConfigService.get<string>(..., '9999')` with parseFloat + Number.isFinite clamp).
- **Effect when set:** When graph lookup returns a result with `confidence >= cutoff`, the LLM call is skipped entirely and EmailAnalysis is written with `triageSource='graph_sender'|'graph_domain'`.
- **Recommended values:**
  - `9999` (default, disabled): no short-circuit. Shadow counter still emits at confidence >= 0.9 — use this to measure how often a real cutoff would fire.
  - `0.95` (aggressive, post-validation): only short-circuit on near-certain matches.
  - `0.9` (moderate): suggested first lowering after observing ≥1 week of `would_skip_shadow` data with no false positives in user feedback.
  - Below 0.7: ineffective — SQL filter `confidence >= 0.7` excludes lower-confidence rows.
- **Catalog status:** NOT added to `backend/.env.example` — Phase 148 (`TRIAGE_METRICS_PER_TENANT`) and Phase 149 (`TRIAGE_DECAY_HALF_LIFE_DAYS`) also did not register their TRIAGE_* envs there. Following existing convention. If a Phase 153+ env catalog cleanup sprint runs, register all three together.

## Self-Check: PASSED

Files verified to exist:
- `backend/src/modules/ai/services/triage-graph-lookup.service.ts` — FOUND (154 LF)
- `.planning/phases/150-graph-triage-memory/deferred-items.md` — FOUND
- `.planning/phases/150-graph-triage-memory/150-04-SUMMARY.md` — FOUND (this file)

Commits verified in `git log --oneline --all`:
- `7e3ebc2b` — FOUND
- `1b8fd689` — FOUND
- `108dab24` — FOUND
- `11fab1c7` — FOUND
- `9eb084d0` — FOUND
