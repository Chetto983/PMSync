---
phase: 147-feedback-loop
plan: 05
plan_number: 05
name: Admin Force-Promote Endpoint + End-to-End Plumbing Verification
status: complete
completed_at: 2026-04-19
wave: 5
subsystem: ai
tags:
  - triage
  - feedback-loop
  - admin-endpoint
  - cache-invalidation
  - plumbing-verification
dependencies:
  requires:
    - 147-01
    - 147-02
    - 147-03
    - 147-04
  provides:
    - admin-force-promote-endpoint
    - lane-correction-promotion-branch
    - promotion-cache-invalidation
    - feedback-loop-plumbing-contract
  affects:
    - backend/src/modules/ai/controllers/triage-overrides.controller.ts
    - backend/src/modules/ai/services/triage-promotion.service.ts
    - backend/src/modules/ai/services/triage-override.service.ts
tech-stack:
  patterns:
    - class-level RolesGuard with opt-in via @Roles decorator
    - inverse action-to-lane map for forward-compat promotion
    - upsert-backed idempotent promotion
    - mocked-collaborator seam-wiring plumbing spec
key-files:
  created:
    - backend/src/modules/ai/services/__tests__/triage-promotion.plumbing.spec.ts
  modified:
    - backend/src/modules/ai/controllers/triage-overrides.controller.ts
    - backend/src/modules/ai/services/triage-promotion.service.ts
    - backend/src/modules/ai/services/triage-override.service.ts
decisions:
  - D-06 trigger 3 (admin force-promote) lives on the existing triage-overrides controller, not a new admin controller, per CONTEXT.md §Claude's Discretion
  - RolesGuard applied at class level (safe because missing @Roles means ALLOW per roles.guard.ts:40-42)
  - LANE_TO_ACTION placed in triage-override.service.ts next to ACTION_TO_LANE (both maps must stay inverse)
  - Plumbing spec explicitly renamed .plumbing.spec.ts (W5 revision) to avoid misleading "integration" label
  - Cache invalidation collects affected emailIds across all promoted patterns, single invalidateCache call
metrics:
  tasks_completed: 2
  commits: 2
  files_modified: 3
  files_created: 1
  tests_added: 4
  tests_all_phase_147: 51  # 46 jest + 5 vitest across 7 suites
  completed_at: 2026-04-19
---

# Phase 147 Plan 05: Admin Force-Promote Endpoint + End-to-End Plumbing Verification Summary

Wave 5 closed the final three wiring gaps of the feedback loop:
(1) the super-admin force-promote endpoint, (2) lane-correction promotion
forward-compat + cache invalidation after promotion, (3) a plumbing
verification spec that proves the seams between TriagePromotionService
and its collaborators are wired correctly. Phase 147 is now functionally
complete at the plumbing level — true end-to-end validation is a
Railway smoke test responsibility (see §Railway Smoke Test below).

## What was built

### Task 1 — Admin endpoint + cache invalidation in promotion handler

Commit: `f1e67e99`.

**`triage-override.service.ts`:**
- Added `export const LANE_TO_ACTION` — the inverse of the existing
  `ACTION_TO_LANE` map. Both maps MUST stay inverse; the comment flags
  this contract. Phase 148+ lane_correction suggestions whose `target`
  is a lane name will use this map to translate back to the override
  `action` accepted by `addOverride`.

**`triage-promotion.service.ts` — `promoteOverrides` rewritten:**
- For each suggestion returned by `feedbackService.getSuggestions(tenantId)`,
  look up `LANE_TO_ACTION[s.target]`.
  - If `undefined` (label_correction case — D-05a): skip.
  - If defined (lane_correction case — forward-compat): call
    `overrideService.addOverride(tenantId, s.scope, s.pattern, action)`
    and collect `{scope, pattern}` into `patternsPromoted`.
- After the promotion loop, for every promoted pattern:
  - scope='sender' → `email.findMany({ where: { tenantId, from: { equals, mode: 'insensitive' } } })`
  - scope='domain' → `email.findMany({ where: { tenantId, from: { contains: '@<domain>', mode: 'insensitive' } } })`
  - Collect all matched `email.id`s into `affectedEmailIds`.
- Call `analysisService.invalidateCache(tenantId, affectedEmailIds)` once
  across all promoted patterns.
- Idempotency key (Redis `triage:last-promoted:<tenantId>`, 5min window,
  1h TTL) writes ONLY after successful completion.
- Multi-tenant: every Prisma query scopes by `tenantId`. Phase 147 has no
  lane_correction producers (D-02 defers), so in production this loop
  no-ops today; Phase 148+ lights up instantly with zero code changes.

**`triage-overrides.controller.ts`:**
- Added `RolesGuard` at the class-level `@UseGuards(TenantGuard, RolesGuard)`.
  This is safe because `roles.guard.ts:40-42` treats missing `@Roles` as
  ALLOW; existing unmarked routes keep their prior TenantGuard-only
  semantics. Only methods decorated with `@Roles` are gated.
- Added constructor-injected `TriagePromotionService`.
- New endpoint `POST /api/ai/triage-overrides/promote-suggestions`:
  - `@Roles('super-admin')` + `@RateTierDecorator('destructive-write')`
  - `tenantId` sourced from `req.user.tenantId` only — NEVER from body.
  - No request body. Returns the raw `{ promoted, skipped }` result.
  - Swagger doc flags this as admin-only for support + Phase 156 E2E
    benchmarks; debounced enqueue still handles production normally.

**RolesGuard placement decision:** The plan's Step C offered two
alternatives (class-level vs method-level). After reading `roles.guard.ts`,
the class-level approach was chosen because the guard's line 40-42 allows
all requests when no `@Roles` is present on either handler OR class. This
preserves the prior auth surface for existing routes while gating the new
one via the method-level decorator.

**Verification:**
- `cd backend && npx tsc --noEmit` → exit 0
- `cd backend && npx jest triage-promotion.service.spec.ts` → **6/6 pass**
  (Plan 03 spec still green with the rewritten `promoteOverrides` body)

### Task 2 — Plumbing verification spec

Commit: `364e1fb4`.

`backend/src/modules/ai/services/__tests__/triage-promotion.plumbing.spec.ts`
— 234 lines, 4 scenarios, all green.

**W5 revision honored:** the filename ends in `.plumbing.spec.ts`, NOT
`.integration.spec.ts`. Every dependency is mocked (feedback, override,
analysis, scheduled-jobs, Redis, Prisma). This is a PLUMBING/SEAM test —
it verifies the wiring between services is correct, NOT that an end-to-end
request-through-a-running-server flow works.

Reuses the `queue.config` module-mock pattern from the Plan 03 promotion
spec so `TriagePromotionService.getRedis()` receives a Map-backed Redis
stub without stubbing a private field (the plan's suggested
`(service as any).redis = {...}` approach wouldn't work with the current
lazy-acquire implementation — adaptation documented below).

**Deviation from plan template (documented):** the plan's Task 2 `<action>`
template uses `(promotionService as any).redis = {...}` to stub the Redis
handle. The live `TriagePromotionService` does NOT expose a `redis` field
— it lazily acquires via `getRedis()` → `getSharedRedisConnection()` (see
triage-promotion.service.ts:76-86). Adapting the spec to mock the
`queue.config` module instead (matching the existing Plan 03 spec's
pattern) is a Rule 3 scope-fix: the plan template wouldn't have worked
against the real service, and the mock-module approach is already
established in-repo. All 4 scenarios still verify the plan's stated
behavior contracts.

**Scenarios (4/4 green):**

1. **Scenario 1 — label_correction suggestions do NOT mint TriageOverride**
   (D-05a plumbing). Seed a suggestion with `target: 'Work'` (label name,
   not a lane). Assert `promoted: 0`, `addOverride` not called,
   `invalidateCache` not called, idempotency key WAS written (successful
   no-op).

2. **Scenario 2 — lane_correction suggestion mints TriageOverride + invalidates cache**
   (forward-compat for Phase 148). Seed a suggestion with `target: 'action-now'`
   (lane → `LANE_TO_ACTION['action-now'] = 'always-important'`). Assert
   `addOverride('t1', 'sender', 'boss@acme.com', 'always-important')`,
   `invalidateCache('t1', arrayContaining([...emailIds]))`, `findMany`
   called with `tenantId: 't1'` + `from: { equals: 'boss@acme.com' }`.

3. **Scenario 3 — idempotency**. Two consecutive calls within 5min:
   first returns `skipped: false`, second returns `skipped: true`.
   `getSuggestions` called only ONCE (idempotency short-circuits BEFORE
   feedback consultation).

4. **Scenario 4 — domain-scope cache invalidation uses `contains: '@<domain>'`**.
   Seed a domain-scope suggestion with `pattern: 'acme.com'`. Assert the
   `findMany` filter uses `from: { contains: '@acme.com', mode: 'insensitive' }`
   + `tenantId: 't1'`.

## Verification (all green)

```
cd backend
npx tsc --noEmit                                                        → exit 0
npx jest src/modules/ai/utils/__tests__/triage-correction-weight.spec.ts → 6/6 pass
npx jest src/modules/ai/services/__tests__/triage-correction.service.spec.ts → 5/5 pass
npx jest src/modules/ai/services/__tests__/triage-feedback.service.spec.ts   → 14/14 pass
npx vitest run src/modules/ai/services/__tests__/triage-prompt-budget.test.ts → 5/5 pass
npx jest src/modules/ai/services/__tests__/triage-promotion.service.spec.ts → 6/6 pass
npx jest src/modules/ai/services/__tests__/triage-promotion.plumbing.spec.ts → 4/4 pass
npx jest src/modules/ai/services/__tests__/email-triage.service.spec.ts     → 4/4 pass
npx jest src/modules/email/services/__tests__/email-crud.service.spec.ts    → 7/7 pass
npx madge --circular --extensions ts src/modules/ai src/modules/email       → 1 cycle (expected forwardRef)

cd ../frontend
npm run type-check                                                           → exit 0
```

**Total Phase 147 tests (all 5 plans):** 46 Jest + 5 Vitest = **51 tests green** across 7 suites.

## Phase 147 test-file inventory (all 5 plans)

| File | Spec count | Pass |
|------|-----------|------|
| `backend/src/modules/ai/utils/__tests__/triage-correction-weight.spec.ts` | 6 | 6/6 |
| `backend/src/modules/ai/services/__tests__/triage-correction.service.spec.ts` | 5 | 5/5 |
| `backend/src/modules/ai/services/__tests__/triage-feedback.service.spec.ts` | 14 | 14/14 |
| `backend/src/modules/ai/services/__tests__/triage-prompt-budget.test.ts` (vitest) | 5 | 5/5 |
| `backend/src/modules/ai/services/__tests__/triage-promotion.service.spec.ts` | 6 | 6/6 |
| `backend/src/modules/ai/services/__tests__/triage-promotion.plumbing.spec.ts` *(new)* | 4 | 4/4 |
| `backend/src/modules/ai/services/__tests__/email-triage.service.spec.ts` | 4 | 4/4 |
| `backend/src/modules/email/services/__tests__/email-crud.service.spec.ts` | 7 | 7/7 |

## Roadmap success criteria — wired confirmation

The three Phase 147 roadmap success criteria are now plumbing-provable:

### 1. User correction → next triage from same sender uses correction as hint

**Wiring:** Explicit `POST /api/emails/:id/correct-triage` endpoint (Plan 04)
persists `EmailTriageFeedback` rows with `signal='correction'`. Auto-diff
from `EmailCrudService.updateEmail` (Plan 04) persists `signal='edit'` rows
for drift-detection only (NOT consumed by few-shot in Phase 147). The
few-shot path in `TriageCorrectionService.getFewShotExamples` (Plan 01 +
exercised in prompt-budget test) fetches `signal='correction'` rows for
the email's sender (domain fallback, D-09a) and injects up to 3 examples
into the `<CORRECTIONS>` block of the system prompt. The block exists
because `buildAnalyzeSystemPrompt` (Plan 03) was rebalanced to 55/25/20
with a 20% slice reserved for corrections.

**Caveat explicitly noted in plan `<output>`:** `captureLabelDiff`'s
`signal='edit'` rows are captured for Phase 148 drift-detection and are
**NOT** consumed by the few-shot path in Phase 147. Only the explicit
`/correct-triage` endpoint's `signal='correction'` rows feed
`getFewShotExamples`.

### 2. getSuggestions output auto-creates TriageOverride above 80% (concentration)

**Wiring:** `TriageFeedbackService.getSuggestions(tenantId)` (Plan 03)
applies D-03 concentration-ratio rules (≥80% agreement AND ≥3 absolute
corrections for sender; ≥8 corrections + ≥3 distinct senders +
no-role-account for domain). `TriagePromotionService.promoteOverrides`
(Plan 03 + Plan 05 rewrite) consumes those suggestions and — for any
suggestion whose `target` is a lane name via `LANE_TO_ACTION` (Plan 05)
— calls `TriageOverrideService.addOverride` and invalidates the cache.
Three trigger paths route through the same `promoteOverrides` method:
- **Debounced enqueue** (Plan 03 queue + Plan 04 `EmailCrudService` call site):
  every `recordFeedback` fires `enqueueDebounced(tenantId)` with 5min
  delay + BullMQ dedup.
- **Safety-net cron** (Plan 03): 04:17 UTC daily, fans out one job per
  tenant with 24h-recent feedback.
- **Admin force** (Plan 05 this endpoint): `POST /promote-suggestions`.

**Phase 147 caveat (D-02/D-05a):** label_correction suggestions do NOT
mint overrides (their `target` is a label name, not a lane).
Lane_correction wiring arrives in Phase 148+; the machinery already works,
just has no producers yet. Forward-compat proven by Scenario 2 of the
plumbing spec.

### 3. Few-shot correction examples injected into LLM prompt for sender/domain matches

**Wiring:** `EmailAnalysisService.buildAnalyzeSystemPrompt` (Plan 03)
invokes `TriageCorrectionService.getFewShotExamples(tenantId, email.from)`
(Plan 01) before prompt assembly. Up to 3 examples (D-09c), each
PII-redacted + sanitized + truncated to 80 chars, formatted per D-11 and
wrapped in `<CORRECTIONS>...</CORRECTIONS>` via `buildTaggedPromptSection`.
Placed LAST in the system prompt (D-09d RoPE recency). `MAX_ANALYZE_SYSTEM_PROMPT_LENGTH = 4600`
invariant preserved — `triage-prompt-budget.test.ts` asserts this on every run.

## Circular-dependency resolutions

`madge --circular --extensions ts src/modules/ai src/modules/email` reports
**one cycle**: `TriagePromotionService ↔ TriagePromotionQueueService`.

**Justification:** this is the same pre-existing cycle introduced in Plan 03.
Nest's `forwardRef()` is applied on both sides (canonical escape hatch). The
cycle is necessary because:
- `TriagePromotionQueueService.processPromotion` needs to call back into
  `TriagePromotionService.promoteOverrides(tenantId)` from the BullMQ worker.
- `TriagePromotionService.runSafetyNet` needs to call back into
  `TriagePromotionQueueService.enqueueDebounced(tenantId, {delayOverride})`
  to fan out per-tenant with jitter.

Extracting a shared interface would require either a third coordinator
module or event-bus indirection, both of which add more weight than the
single `forwardRef` they'd remove. Documented in Plan 03 SUMMARY and
reconfirmed here: **no new cycles introduced by Plan 05**.

## Plumbing vs integration — W5 honesty note

**The file `triage-promotion.plumbing.spec.ts` is a plumbing/seam test.**
Every dependency is mocked. It proves the wiring between services is
correct — NOT that the end-to-end request-through-a-running-server flow
works. Specifically, it does NOT verify:

- Real Prisma queries against a real Postgres return the expected rows.
- Real BullMQ dedup under real Redis collapses the 20-corrections-burst.
- Real `EmailAnalysis.findFirst` + `processedAt` cache eviction behaves
  as expected when `invalidateCache` sets `processedAt` to epoch.
- Real `recordFeedback → enqueueDebounced → worker → promoteOverrides →
  addOverride → invalidateCache → next triage` chain under real load.
- `RolesGuard` actually rejects a non-super-admin request in a live server.

The plumbing spec intentionally uses mocks for these because in-process
jest specs cannot faithfully simulate BullMQ's Redis-backed dedup or
Prisma's transactional atomicity. Plumbing is what jest is for; integration
is what a running deployment is for.

## Railway smoke test recommendation

Once Plan 05 deploys to Railway, manually smoke-test the full loop to
gain real end-to-end confidence:

1. **Log in as a regular user.** Open any email whose sender has no
   existing `TriageOverride` rows.
2. **Change `aiLabels`.** Either dismiss an AI-suggested label via the
   existing X affordance, or click the new "Should be…" pencil chip
   (Plan 04) to set an explicit correction. This writes a
   `signal='edit'` (for aiLabels edit) or `signal='correction'` (for
   explicit correction) row to `EmailTriageFeedback` and enqueues a
   debounced promotion job.
3. **Wait 5 minutes.** The BullMQ dedup window closes; the worker picks
   up the job and calls `promoteOverrides`.
4. **Confirm promotion ran.** Railway logs should show the
   `TriagePromotionService` log line `"Promotion run complete for
   tenant=<id>: promoted=<n>"`. In Phase 147 the count will be 0 (no
   lane_correction suggestions exist); Phase 148+ deploys will start
   minting overrides here.
5. **Trigger a new triage for the same sender.** Send a fresh email from
   the same sender (or use the admin re-triage endpoint). Verify in the
   Mistral call logs (debug level) that the `<CORRECTIONS>` block of the
   system prompt contains the correction from step 2. The block will
   render if any `signal='correction'` rows exist for the sender within
   the 30-day window.
6. **Super-admin only: force-promote.** Log in as a super-admin user.
   `curl -X POST <backend>/api/ai/triage-overrides/promote-suggestions`
   with session cookie. Verify 200 response + log shows the promotion
   run. Verify a regular-role user gets 403.

**Why this matters:** the plumbing spec only guards seams; the manual
Railway smoke test is what provides real end-to-end confidence. Do not
treat Plan 05 as production-verified until step 5 has been exercised
with a real email + real Mistral call.

## Commits in Plan 05

- `f1e67e99` — Task 1: admin force-promote endpoint + cache invalidation
  in promotion handler (controller + override svc + promotion svc)
- `364e1fb4` — Task 2: plumbing verification spec (new spec file, 4
  scenarios green)
- (this SUMMARY commit follows)

## Phase 147 completion

Phase 147 is functionally complete at the plumbing level after Plan 05.
All 3 roadmap success criteria are plumbing-provable; real end-to-end
confidence comes from the Railway smoke test above. The phase itself is
NOT marked complete here — the orchestrator handles that after the
verifier run.

## Self-Check: PASSED

- File `.planning/phases/147-feedback-loop/147-05-SUMMARY.md` being written now.
- Commit `f1e67e99` exists:
  `feat(147-05): admin force-promote endpoint + cache invalidation in promotion handler (task 1/2)`.
- Commit `364e1fb4` exists:
  `test(147-05): plumbing verification spec for feedback-loop seam wiring (task 2/2)`.
- File `backend/src/modules/ai/services/__tests__/triage-promotion.plumbing.spec.ts` exists (234 lines).
- Modifications in `backend/src/modules/ai/controllers/triage-overrides.controller.ts`,
  `backend/src/modules/ai/services/triage-promotion.service.ts`,
  `backend/src/modules/ai/services/triage-override.service.ts` present on `main`.
