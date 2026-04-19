---
phase: 147-feedback-loop
verified: 2026-04-19T23:00:00Z
status: human_needed
must_haves_verified: 23/24
score: 23/24
requirements_verified:
  - LEARN-01 (v13.0 milestone — verified via plumbing)
  - LEARN-02 (v13.0 milestone — verified via plumbing)
overrides: []
human_verification:
  - test: "Railway smoke test — confirm CORRECTIONS block appears in real LLM prompt"
    expected: "After submitting one explicit correction via POST /correct-triage, the next triage of a same-sender email logs a <CORRECTIONS> block in the system prompt at debug level"
    why_human: "The prompt is only observable in prod logs with debug enabled; the plumbing spec mocks EmailAnalysisService and cannot confirm the block assembles against a real Prisma result."
  - test: "Frontend affordance — verify Pencil chip renders and fires mutation in live browser"
    expected: "On ExpandedMessage, each AI-label Chip shows a pencil icon; clicking opens an MUI Menu of user labels; selecting one calls POST /emails/:id/correct-triage and shows the 'Correction recorded' toast."
    why_human: "Only tsc --noEmit was run; no browser test was performed. Plan 04 SUMMARY explicitly notes: 'The Chip UX was verified via tsc --noEmit only — not in a live browser.'"
  - test: "Role guard on POST /promote-suggestions rejects non-super-admin"
    expected: "A request with a valid session for a user with role='admin' receives 403 Forbidden."
    why_human: "RolesGuard behavior at runtime depends on the guard's allow-unless-decorated logic (roles.guard.ts:40-42) which was verified only by code-reading; not tested against a running server."
gaps:
  - truth: "Muting override short-circuit does not wipe user-corrected labels (CR-01)"
    status: partial
    reason: "email.updateMany in the muting path unconditionally sets aiLabels: [] (line 301 of email-triage.service.ts), destroying labels a user previously corrected via the explicit /correct-triage endpoint. This corrupts the feedback loop's signal quality: a subsequent captureLabelDiff comparing [] vs restored labels will produce spurious 'added_back_correction' rows."
    artifacts:
      - path: "backend/src/modules/ai/services/email-triage.service.ts"
        issue: "updateMany { aiLabels: [] } on line 301 — muting rule is lane-shaped, not label-shaped; should preserve existing aiLabels"
    missing:
      - "Remove `aiLabels: []` from the muting updateMany payload OR add a guard that only clears aiLabels when no prior user correction exists for this email"
      - "Also remove `summary: null, keyPoints: [], suggestedActions: []` from the EmailAnalysis upsert update branch (preserving prior LLM analysis when the muting path fires on a re-triage)"
human_verification_note: "CR-01 is logged as a gap (data-quality regression), not a phase-goal blocker. The three roadmap success criteria are each independently plumbing-wired. CR-01 degrades signal quality for re-triaged muted emails but does not prevent the loop from functioning for the primary flow (new emails from senders with corrections). Marking status: human_needed because Railway smoke test and frontend browser test remain outstanding — not because of CR-01 alone."
deferred: []
---

# Phase 147: Close the Feedback Loop — Verification Report

**Phase Goal:** Wire triage corrections back into future classifications
**Verified:** 2026-04-19T23:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Roadmap Success Criteria (from v13.0-ROADMAP.md)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| SC-1 | User correction → next triage from same sender uses correction as hint | VERIFIED (plumbing) | `POST /emails/:id/correct-triage` (Plan 04) writes `signal='correction'` rows. `TriageCorrectionService.getFewShotExamples` reads them (`where: { signal: 'correction' }`). `EmailAnalysisService.buildAnalyzeSystemPrompt` injects them into the `<CORRECTIONS>` block. Chain is end-to-end wired. |
| SC-2 | `getSuggestions()` output auto-creates TriageOverride above 80% concentration | VERIFIED (plumbing) | `getSuggestions` (Plan 03) applies 80% concentration-ratio rule. `promoteOverrides` (Plan 05) calls `overrideService.addOverride` when `LANE_TO_ACTION[suggestion.target]` resolves. Three trigger paths: debounced BullMQ enqueue, daily cron, admin force endpoint. Phase 147 caveat: label_correction targets don't resolve (D-05a), so zero overrides are minted in Phase 147 — the machinery is correct and forward-compat for Phase 148+. Plumbing spec Scenario 2 proves the lane-correction branch works. |
| SC-3 | Few-shot correction examples injected into LLM prompt for sender/domain matches | VERIFIED | `buildAnalyzeSystemPrompt` receives `corrections: FewShotExample[]` from `getFewShotExamples`. `buildTaggedPromptSection('CORRECTIONS', ...)` wraps up to 3 lines (D-09c). Placed after LABEL_RULES + triage_context (D-09d). `triage-prompt-budget.test.ts` asserts the CORRECTIONS section appears and total stays ≤ 4600 chars. `MAX_ANALYZE_SYSTEM_PROMPT_LENGTH = 4600` invariant confirmed unchanged at line 47 of email-analysis.service.ts. |

**Score:** 3/3 roadmap success criteria plumbing-verified.

---

## Observable Truths — Per-Plan Verification

### Plan 01 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Prisma schema compiles with `signal` column (default 'edit') and `triageSource` (nullable) | VERIFIED | `schema.prisma` line 2563: `signal String @default("edit")`; line 1368: `triageSource String?`. `npx prisma validate` → 0 per SUMMARY-01. |
| 2 | `t.insights.analyzeUnified.systemPrompt` accepts 5 args in both en.ts and it.ts | VERIFIED | `en.ts` lines 204-205: `correctionsBlock?: string, overrideHint?: string`. Body interpolates both on lines 229-230. |
| 3 | `weightCorrection(ageDays)` helper exists and passes unit tests | VERIFIED | `triage-correction-weight.ts` exports `weightCorrection` with `ageDays <= 30 ? 1 : 0`. 6 spec tests documented green. |
| 4 | `TriageCorrectionService.getFewShotExamples(tenantId, senderFrom)` exists, Injectable, tenantId-filtered | VERIFIED | File exists. `tenantId` in both `emailTriageFeedback.findMany` and `email.findMany` where clauses. `signal: 'correction'` filter confirmed. 5 spec tests documented green. |

### Plan 02 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Migration file exists at `..._147_feedback_loop_signal_and_triagesource/migration.sql` | VERIFIED | Directory confirmed: `20260419120000_147_feedback_loop_signal_and_triagesource`. File read directly. |
| 2 | Migration SQL: 2 ADD COLUMN + 1 CREATE INDEX | VERIFIED | `ALTER TABLE "email_analyses" ADD COLUMN "triageSource"`, `ALTER TABLE "email_triage_feedback" ADD COLUMN "signal"`, `CREATE INDEX`. Exactly 2 ADD COLUMN + 1 CREATE INDEX. |
| 3 | No DROP statements | VERIFIED | Migration SQL read directly — no DROP, TRUNCATE, DELETE FROM, or RENAME TO present. |
| 4 | Prisma client regenerated; tsc passes | VERIFIED | SUMMARY-02 confirms 80 refs to `signal`, 41 refs to `triageSource` in generated client. `tsc --noEmit` → 0. |
| 5 | `_prisma_migrations` applied locally | PARTIAL — ACCEPTABLE | Migration was generated via `prisma migrate diff` (offline, no local Postgres). Railway applies on deploy. This is explicitly documented in SUMMARY-02 as an acceptable deviation from the `migrate dev` CLAUDE.md preference given the Railway-only DB setup. |

### Plan 03 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `getSuggestions()` emits only when ≥3 corrections AND ≥80% concentration (sender) OR ≥8+3distinct+no-role (domain) | VERIFIED | `MIN_CORRECTIONS_FOR_PROMOTION=3`, `CONCENTRATION_RATIO=0.8`, `MIN_CORRECTIONS_FOR_DOMAIN=8`, `MIN_DISTINCT_SENDERS_FOR_DOMAIN=3` confirmed in triage-feedback.service.ts. |
| 2 | `signal='edit'` rows excluded from promotion math | VERIFIED | getSuggestions where-clause: `signal: 'correction'` confirmed at line 176. |
| 3 | `buildAnalyzeSystemPrompt()` splits 55/25/20 budget; MAX=4600 unchanged | VERIFIED | `LABEL_RULES_BUDGET_RATIO=0.55`, `CORRECTIONS_BUDGET_RATIO=0.20`, `TRIAGE_CONTEXT_BUDGET_RATIO=0.25` confirmed. `MAX_ANALYZE_SYSTEM_PROMPT_LENGTH=4600` confirmed at line 47. |
| 4 | `<CORRECTIONS>` block built via `buildTaggedPromptSection`, PII-redacted, 80-char-truncated | VERIFIED | `buildTaggedPromptSection('CORRECTIONS', correctionLines, correctionsBudget)` confirmed in email-analysis.service.ts. |
| 5 | BullMQ queue `triage-promote-overrides` exists, debounced 5min, deduplication per tenant | VERIFIED | `queue.config.ts` confirms `TRIAGE_PROMOTE_OVERRIDES: 'triage-promote-overrides'`. `triage-promotion.queue.ts` exists. |
| 6 | `triage-promotion-safety-net` cron at `'17 4 * * *'` | VERIFIED | `scheduled-jobs.queue.ts` line 131: `[ScheduledJobType.TRIAGE_PROMOTION_SAFETY_NET]: '17 4 * * *'`. |
| 7 | `TriagePromotionService` registers ScheduledJobType handler in CONSTRUCTOR (not onModuleInit) | VERIFIED | SUMMARY-03 confirms; spec regression-guard test asserts mock called at compile() without lifecycle hooks. |
| 8 | `triage-prompt-budget.test.ts` assertions updated to reflect 55/25/20 | VERIFIED | 5/5 vitest pass per all SUMMARYs; budget test re-run confirmed green in Plan 04 SUMMARY. |

### Plan 04 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When user PATCHes `aiLabels`, `captureLabelDiff` fires post-commit and `enqueueDebounced` is called | VERIFIED | `email-crud.service.ts` lines 312-326 confirmed. Post-commit fire-and-forget with `.catch`. NOT inside `$transaction`. |
| 2 | `POST /emails/:id/correct-triage` exists, tenant-scoped, calls `recordFeedback({signal:'correction'})`, enqueues | VERIFIED | Controller endpoint confirmed at line 263. `signal: 'correction'` confirmed in `correctTriage` method. `enqueueDebounced` called. |
| 3 | Frontend ExpandedMessage renders "Should be…" affordance ONLY on AI-suggested labels | VERIFIED (code) | Chip action confirmed at line 730 inside `message.aiLabels.map()` block. `useCorrectTriageMutation` imported and used. NOT in `message.labels` block. HUMAN VERIFICATION needed for live browser rendering. |
| 4 | `triageEmail()` calls `applyOverrides` BEFORE LLM; muting short-circuits; visible injects hint + forces lane | VERIFIED | Pre-LLM block confirmed at line 284. `MUTING_ACTIONS.has(or.override.action)` gates short-circuit. `overrideHint` and `matchedOverrideAction` passed into `analyzeEmailUnified`. |
| 5 | `triageSource` persisted as `'llm' \| 'rule' \| 'llm+rule'` on every EmailAnalysis upsert | VERIFIED | Three paths confirmed: `triageSource: 'rule'` in email-triage.service.ts (muting), `triageSource = 'llm+rule'` in email-analysis.service.ts (visible override), default `'llm'` (pure-LLM path). |
| 6 | MAX_ANALYZE_SYSTEM_PROMPT_LENGTH = 4600 unchanged after Plan 04 | VERIFIED | Line 47 of email-analysis.service.ts confirms `4600`. Budget test re-run green per Plan 04 SUMMARY. |
| 7 | `madge --circular` exits 0 OR only forwardRef-resolved cycles | VERIFIED (documented) | Madge reports 1 cycle: `TriagePromotionQueueService ↔ TriagePromotionService`. Both Summaries 03 and 04 document this as expected and resolved via `forwardRef()`. No new cross-module cycles introduced by Plan 04. |

### Plan 05 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `POST /ai/triage-overrides/promote-suggestions` exists, guarded by TenantGuard + RolesGuard + @Roles('super-admin') | VERIFIED (code) | Controller line 101: `@Post('promote-suggestions')`, line 102: `@Roles('super-admin')`. `RolesGuard` at class level. `promoteOverrides` called. HUMAN VERIFICATION for 403 rejection in live server. |
| 2 | After promotion creating a new TriageOverride, `invalidateCache` is called | VERIFIED | `triage-promotion.service.ts` line 155: `analysisService.invalidateCache(tenantId, affectedEmailIds)` confirmed. Plumbing spec Scenario 2 asserts this. |
| 3 | Plumbing spec exists, seeds 3+ corrections, invokes `promoteOverrides`, verifies seams | VERIFIED | `triage-promotion.plumbing.spec.ts` exists (234 lines). 4 scenarios confirmed in SUMMARY-05. All 4 pass. Filename correctly ends `.plumbing.spec.ts`. |
| 4 | All 3 roadmap success criteria achievable end-to-end at plumbing level | VERIFIED (plumbing) | All wiring confirmed above. True E2E requires Railway smoke test (documented). |

**Must-Haves Score: 23/24** (Plan 04, truth #3 pending live browser verification)

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `backend/prisma/schema.prisma` | VERIFIED | `signal` + `triageSource` columns + compound index present |
| `backend/prisma/migrations/20260419120000_147_feedback_loop_signal_and_triagesource/migration.sql` | VERIFIED | 2 ADD COLUMN + 1 CREATE INDEX, zero DROP |
| `backend/src/modules/ai/locales/en.ts` | VERIFIED | 5-arg `systemPrompt` with `correctionsBlock` + `overrideHint` |
| `backend/src/modules/ai/locales/it.ts` | VERIFIED | Same 5-arg signature (per SUMMARY-01 and REVIEW) |
| `backend/src/modules/ai/locales/types.ts` | VERIFIED | AiTranslations interface widened |
| `backend/src/modules/ai/utils/triage-correction-weight.ts` | VERIFIED | `weightCorrection` exports, D-12 contract |
| `backend/src/modules/ai/services/triage-correction.service.ts` | VERIFIED | `getFewShotExamples`, Injectable, tenantId-filtered, signal='correction' filter, decay math |
| `backend/src/modules/ai/services/triage-feedback.service.ts` | VERIFIED | `MIN_CORRECTIONS_FOR_PROMOTION`, `CONCENTRATION_RATIO`, `captureLabelDiff`, updated `getSuggestions` |
| `backend/src/modules/ai/services/email-analysis.service.ts` | VERIFIED | `CORRECTIONS_BUDGET_RATIO`, `buildTaggedPromptSection('CORRECTIONS'`, `triageSource` persistence |
| `backend/src/modules/ai/services/triage-promotion.queue.ts` | VERIFIED | File exists (>100 lines per SUMMARY), `enqueueDebounced` |
| `backend/src/modules/ai/services/triage-promotion.service.ts` | VERIFIED | `promoteOverrides`, `LANE_TO_ACTION` import, `invalidateCache` call |
| `backend/src/common/config/queue.config.ts` | VERIFIED | `TRIAGE_PROMOTE_OVERRIDES: 'triage-promote-overrides'` |
| `backend/src/common/services/scheduled-jobs.queue.ts` | VERIFIED | `TRIAGE_PROMOTION_SAFETY_NET` at `'17 4 * * *'` |
| `backend/src/modules/ai/services/email-triage.service.ts` | VERIFIED | `applyOverrides`, `MUTING_ACTIONS`, `overrideHint`, `triageSource: 'rule'` |
| `backend/src/modules/ai/services/triage-override.service.ts` | VERIFIED | `export const ACTION_TO_LANE`, `export const MUTING_ACTIONS`, `export const LANE_TO_ACTION` |
| `backend/src/modules/email/services/email-crud.service.ts` | VERIFIED | `captureLabelDiff`, `enqueueDebounced`, `correctTriage` with `signal:'correction'` |
| `backend/src/modules/email/controllers/email-actions.controller.ts` | VERIFIED | `POST ':id/correct-triage'` route with `CorrectTriageDto` |
| `backend/src/modules/ai/controllers/triage-overrides.controller.ts` | VERIFIED | `@Post('promote-suggestions')` + `@Roles('super-admin')` |
| `frontend/locales/en.ts` | VERIFIED | `correctTo`, `correctTriagePopoverTitle`, `correctTriageSuccess` |
| `frontend/locales/it.ts` | VERIFIED | Italian equivalents (per REVIEW) |
| `frontend/hooks/queries/use-correct-triage.ts` | VERIFIED | `useCorrectTriageMutation` exported |
| `frontend/components/email/thread/ExpandedMessage.tsx` | VERIFIED (code only) | `useCorrectTriageMutation` imported and used inside `message.aiLabels.map` block |
| `backend/src/modules/ai/services/__tests__/triage-promotion.plumbing.spec.ts` | VERIFIED | 234 lines, 4 scenarios, `.plumbing.spec.ts` suffix |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `EmailCrudService.updateEmail` | `TriageFeedbackService.captureLabelDiff` | constructor DI + post-commit `.catch()` | WIRED | Confirmed at email-crud.service.ts:312-314 |
| `EmailCrudService.updateEmail` | `TriagePromotionQueueService.enqueueDebounced` | constructor DI + post-commit `.catch()` | WIRED | Confirmed at email-crud.service.ts:322-325 |
| `EmailCrudService.correctTriage` | `TriageFeedbackService.recordFeedback` | direct call with `signal:'correction'` | WIRED | Confirmed at email-crud.service.ts:360 |
| `EmailAnalysisService.buildAnalyzeSystemPrompt` | `TriageCorrectionService.getFewShotExamples` | constructor DI + async call before prompt build | WIRED | Confirmed at email-analysis.service.ts:120-124 |
| `EmailTriageService.triageEmail` | `TriageOverrideService.applyOverrides` | pre-LLM call | WIRED | Confirmed at email-triage.service.ts:284 |
| `TriagePromotionService.promoteOverrides` | `TriageFeedbackService.getSuggestions` | direct call | WIRED | Confirmed in plumbing spec Scenario 1 and promotion service |
| `TriagePromotionService.promoteOverrides` | `TriageOverrideService.addOverride` | LANE_TO_ACTION lookup | WIRED (plumbing) | Lane-correction branch confirmed; label-correction correctly skips (D-05a) |
| `TriagePromotionService.promoteOverrides` | `EmailAnalysisService.invalidateCache` | post-promotion call | WIRED | Confirmed at triage-promotion.service.ts:155 |
| `TriageOverridesController.promoteSuggestions` | `TriagePromotionService.promoteOverrides` | POST handler | WIRED | Confirmed at triage-overrides.controller.ts:115-116 |
| `ExpandedMessage.tsx` | `useCorrectTriageMutation` | React import + mutation call | WIRED | Confirmed at ExpandedMessage.tsx:44, 224, 734 |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `buildAnalyzeSystemPrompt` | `corrections: FewShotExample[]` | `TriageCorrectionService.getFewShotExamples` → `prisma.emailTriageFeedback.findMany` | Yes (real DB query, `signal='correction'` filter) | FLOWING when `signal='correction'` rows exist; EMPTY on fresh deploy (no producers yet until Wave 4 has been in prod) |
| `getSuggestions` | sender/domain bucket data | `prisma.emailTriageFeedback.findMany({ where: { signal:'correction' } })` | Yes (real DB query) | FLOWING |
| `triageSource` on EmailAnalysis | `'llm' \| 'rule' \| 'llm+rule'` | determined by override match path in EmailTriageService/EmailAnalysisService | Yes — every upsert writes this | FLOWING |

---

## Behavioral Spot-Checks

Step 7b: SKIPPED (no local server running; backend requires Railway Postgres for integration checks)

---

## Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|---------|
| LEARN-01 (v13.0) | Plans 01-04 | Triage corrections feed back into future triage decisions for same sender/domain | SATISFIED | Full chain: `correct-triage` endpoint → `signal='correction'` rows → `getFewShotExamples` → `<CORRECTIONS>` block in prompt. Plumbing-verified. |
| LEARN-02 (v13.0) | Plans 03, 05 | Auto-create TriageOverride entries when correction confidence exceeds 80% | SATISFIED (plumbing) | `getSuggestions` applies 80% concentration rule. `promoteOverrides` calls `addOverride` for lane-shaped suggestions. Three trigger paths (debounced/cron/admin). Label-corrections deliberately excluded per D-05a. |

Note: LEARN-01 and LEARN-02 are v13.0 milestone-level requirements — they do not appear in the v12.0 `REQUIREMENTS.md` file. They are defined at lines 150-151 of `v13.0-ROADMAP.md`. This is expected.

---

## Anti-Patterns Found

| File | Finding | Severity | Impact on Goal |
|------|---------|----------|----------------|
| `email-triage.service.ts:301` | `aiLabels: []` in muting updateMany unconditionally wipes user-corrected labels (CR-01 from REVIEW) | Warning | Degrades signal quality: re-triaged muted emails generate spurious `added_back_correction` rows when user restores labels. Does NOT block the primary correction→hint chain for new emails. |
| `triage-promotion.service.ts:138-152` | Unbounded `email.findMany` for cache invalidation with no LIMIT (WR-01 from REVIEW) | Warning | Memory/GC hazard under high volume; not a correctness issue. Does not block phase goal. |
| `triage-promotion.service.ts` + `triage-promotion.queue.ts` | Circular dependency via `forwardRef()` (WR-02 from REVIEW) | Warning | Violates CLAUDE.md `feedback_no_circular_deps` policy; resolved by Nest at runtime. Documented and accepted as necessary given the mutual-call pattern between queue worker and service. |
| `ExpandedMessage.tsx:778-787` | Silent error swallowing in correctTriage catch block; no user-visible toast on failure (WR-03 from REVIEW) | Warning | UX only — user gets no feedback on network failure. Does not break the plumbing. |
| `triage-overrides.controller.ts:52, 68-88` | `POST/DELETE /ai/triage-overrides` (create/remove) lack `@Roles` — any authenticated tenant member can mutate tenant-wide policies (WR-04 from REVIEW) | Warning | Authorization gap; not a cross-tenant leak. Exists before Phase 147; not introduced by this phase. |

**Blocker anti-patterns: 0.** CR-01 is a signal-quality regression, not a phase-goal blocker. All roadmap success criteria remain wired.

---

## Human Verification Required

### 1. Railway Smoke Test — Full loop end-to-end

**Test:**
1. Log in as any user. Open an email with no existing TriageOverride for that sender.
2. Click the new pencil-icon affordance on an AI-suggested label Chip.
3. Select a different label from the MUI Menu.
4. Verify the `POST /emails/:id/correct-triage` request fires (Network tab) and returns `{ ok: true }`.
5. Wait 5 minutes for the BullMQ dedup window.
6. Check Railway logs for: `"Promotion run complete for tenant=<id>: promoted=0"` (Phase 147 expected — no lane_correction producers yet).
7. Send or trigger triage of a new email from the same sender.
8. Enable debug logging and verify the system prompt logged by `EmailAnalysisService` includes a `<CORRECTIONS>` block.

**Expected:** Step 4 succeeds. Step 6 log appears. Step 8 shows `<CORRECTIONS>` block with the label pair from step 3.

**Why human:** The `<CORRECTIONS>` block is only observable via runtime LLM call logs. The plumbing spec mocks `EmailAnalysisService` and cannot confirm end-to-end assembly against real Prisma data. BullMQ dedup behavior requires real Redis.

### 2. Frontend Chip UI in Live Browser

**Test:**
Open the ExpandedMessage panel for an email that has `aiLabels`. Confirm the pencil icon appears adjacent to each AI-label Chip but NOT adjacent to user-added labels. Click the pencil icon and confirm the MUI Menu of labels opens. Select one. Confirm: (a) mutation fires, (b) success toast "Correction recorded" appears, (c) the AI-label Chip is dismissed locally.

**Expected:** Affordance visible, functional, scoped to AI labels only. Toast on success.

**Why human:** `tsc --noEmit` + `npm run type-check` passed, but no browser rendering was performed. Plan 04 SUMMARY explicitly notes this caveat. Menu positioning and Pencil icon alignment are not type-checkable.

### 3. RolesGuard 403 for Non-Super-Admin on POST /promote-suggestions

**Test:**
With a session cookie for a user with role `admin` (not `super-admin`), issue:
`curl -X POST <backend>/api/ai/triage-overrides/promote-suggestions --cookie <session>`

**Expected:** 403 Forbidden.

**Why human:** `roles.guard.ts:40-42` "allow when no @Roles" behavior was verified by code-reading only. The class-level `@UseGuards(TenantGuard, RolesGuard)` + method-level `@Roles('super-admin')` wiring was not tested against a running server.

---

## Gaps Summary

One actionable gap identified (not a phase-goal blocker):

**CR-01 — Muting override wipes user-corrected labels.** When `always-system-alert` or `never-follow-up` matches, `email.updateMany` unconditionally sets `aiLabels: []` and the EmailAnalysis upsert update-branch sets `summary: null, keyPoints: [], suggestedActions: []`. This is incorrect for re-triaged emails: a muting rule is lane-shaped (it decides the lane) but should not destroy prior label corrections or prior LLM analysis. The practical consequence is that re-triaging a muted email will generate spurious `added_back_correction` feedback rows on the next user interaction, degrading signal quality.

This does not block Phase 147's primary goal — the correction→hint chain works correctly for new emails. However, it should be fixed before Phase 148 drift-detection metrics are instrumented, since those metrics will consume `signal='edit'` rows and the spurious rows will skew them.

**Remediation:** In `email-triage.service.ts` muting path, remove `aiLabels: []` from the `updateMany` payload (and optionally clear only AI-inferred fields like `aiPriority`, `aiSentiment`). In the EmailAnalysis `upsert.update` branch, remove `summary: null, keyPoints: [], suggestedActions: []` to preserve prior LLM analysis.

---

## Recommendation

**Proceed to Railway deployment with the following action items:**

1. **Before Phase 148:** Fix CR-01 (muting path label wipe) to prevent drift-detection signal corruption. This is a targeted 3-line removal in `email-triage.service.ts`.

2. **Immediately after Phase 147 deploy:** Run the Railway smoke test (Human Verification item 1) to confirm the `<CORRECTIONS>` block actually renders in a real LLM call. The plumbing spec proves the wiring is correct; the smoke test proves the Prisma queries return real data and the block renders.

3. **WR-02 (circular dep):** Consider the WR-02 remediation (handler-registration pattern) for a future cleanup sprint. The `forwardRef` escape hatch works but violates project policy. Not urgent.

4. **WR-04 (override role gates):** Add `@Roles('admin', 'manager', 'super-admin')` to `POST /ai/triage-overrides` and `DELETE /ai/triage-overrides/:id` before Phase 147 goes to production with real users who could otherwise create/delete tenant-wide triage policies.

The phase is structurally complete at the plumbing level. All 3 roadmap success criteria are wired. Human verification of the smoke test and browser UI is the remaining gate before the phase can be fully signed off.

---

_Verified: 2026-04-19T23:00:00Z_
_Verifier: Claude (gsd-verifier)_
