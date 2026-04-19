---
phase: 147-feedback-loop
plan: 03
plan_number: 03
name: Promotion Rule + Prompt Rebalance + BullMQ Queue
status: complete
completed_at: 2026-04-19
wave: 3
---

# Plan 147-03 Summary

## What was built

Wave 3 delivered the three backend "machinery" sub-streams — promotion math, prompt rebalance, and the BullMQ promotion queue + safety-net cron. All three are **non-user-visible** and **no runtime consumer wiring** yet (Wave 4 owns that). All three land the sockets that Wave 4 plugs into.

## Task 1 — Promotion rule rewrite + captureLabelDiff

`backend/src/modules/ai/services/triage-feedback.service.ts` + new spec.

- `recordFeedback` signature → params object with **required** `signal: 'edit' | 'correction'` (D-01 discriminator).
- New `captureLabelDiff(tenantId, emailId, oldLabels, newLabels)` implements D-01 auto-diff classification:
  - `pure_reorder` / identical: no-op.
  - `removed_ai_label`: emits `signal=edit` + `oldValue`.
  - `added_back_correction` (label was AI-suggested for this sender historically): emits `signal=edit` + `newValue`.
  - `added_personal_label`: silent no-op — does NOT poison the learning signal (the Gmail/Notion anti-pattern).
- `getSuggestions` rewritten with D-03 concentration + D-04 role-account exclusion. Returns new `TriageSuggestion[]` shape.
- `signal='edit'` rows excluded from promotion math (D-03: they are drift-detection only).
- Constants: `MIN_CORRECTIONS_FOR_PROMOTION=3`, `CONCENTRATION_RATIO=0.8`, `MIN_CORRECTIONS_FOR_DOMAIN=8`, `MIN_DISTINCT_SENDERS_FOR_DOMAIN=3`.
- `ROLE_ACCOUNT_LOCAL_PARTS` Set (17 RFC 2142 + anti-SaneBox entries).
- Jest spec: **14/14** pass (recordFeedback signal persistence, captureLabelDiff 5 branches, getSuggestions 7 branches).

## Task 2 — Prompt rebalance 55/25/20 + CORRECTIONS injection

`backend/src/modules/ai/services/email-analysis.service.ts` + `triage-prompt-budget.test.ts`.

- `LABEL_RULES_BUDGET_RATIO`: 0.6 → **0.55** (D-10).
- New `CORRECTIONS_BUDGET_RATIO = 0.20` + new `TRIAGE_CONTEXT_BUDGET_RATIO = 0.25` + `CORRECTION_LINE_MAX_LENGTH = 80`.
- **`MAX_ANALYZE_SYSTEM_PROMPT_LENGTH = 4600` UNCHANGED** — prefix-cache invariant preserved.
- `TriageCorrectionService` injected `@Optional` into the constructor. Fetches few-shot examples from `email.from` before prompt build.
- `buildAnalyzeSystemPrompt` accepts new `corrections: FewShotExample[]` + `overrideHint: string | null` params.
- `<CORRECTIONS>` block: PII-redacted → `sanitizeForLLM` (80-char cap, stripCodeBlocks) → `buildTaggedPromptSection` (cap 3 lines per D-09c).
- `<USER_OVERRIDE>` block: single line via `buildTaggedPromptSection`. Wave 4 supplies the hint.
- `analyzeEmailUnified` option `overrideHint?: string | null` propagates to the prompt builder.
- Vitest: **5/5** pass — 2 preexisting invariants intact, 3 new (CORRECTIONS injected when examples exist, section ≤ 20% budget cap, total ≤ 4600 chars with all slices active).

**Live prod impact on deploy:**
- `TriageCorrectionService.getFewShotExamples` returns `[]` (no `signal='correction'` rows exist yet — Wave 4 writes them). No `<CORRECTIONS>` block renders.
- `overrideHint` always `null` in Plan 03. No `<USER_OVERRIDE>` block.
- Observable delta: LABEL_RULES allocated 55% instead of 60% of optional budget. A few hundred chars less of label-rules text. Triage_context explicit at 25% (was implicit residual ~40%).

## Task 3 — BullMQ queue + promotion service + safety-net cron

New files:
- `backend/src/modules/ai/services/triage-promotion.queue.ts` — clone of `reminder-notify.queue.ts` pattern, concurrency 2, lockDuration 60s, attempts 2, backoff exponential 10s. `enqueueDebounced(tenantId, options?)` with delay 5min + BullMQ `deduplication.id = 'promote:<tenantId>'` TTL 5min.
- `backend/src/modules/ai/services/triage-promotion.service.ts` — `promoteOverrides(tenantId)` (idempotency via Redis `triage:last-promoted:<tenantId>` key, TTL 1h, skip if < 5min ago) and `runSafetyNet()` (fans out one job per tenant with recent feedback, 0-60s jitter).
- `backend/src/modules/ai/services/__tests__/triage-promotion.service.spec.ts` — **6/6** tests pass.

Modified:
- `backend/src/common/config/queue.config.ts` — `QUEUE_NAMES.TRIAGE_PROMOTE_OVERRIDES = 'triage-promote-overrides'`.
- `backend/src/common/services/scheduled-jobs.queue.ts` — `ScheduledJobType.TRIAGE_PROMOTION_SAFETY_NET = 'triage-promotion-safety-net'` at cron `'17 4 * * *'`.
- `backend/src/modules/ai/ai.module.ts` — both new services registered in providers + exports.

**W6 compliance (constructor-based handler registration):**
- `scheduledJobs.registerHandler(TRIAGE_PROMOTION_SAFETY_NET, ...)` lives inside the `TriagePromotionService` **constructor body**, not `onModuleInit`.
- Spec includes a regression-guard test: `Test.createTestingModule().compile()` runs constructors but not lifecycle hooks, and the test asserts the mock was called — proves constructor-time registration at test time.
- Counts: `registerHandler` in constructor = 1, in onModuleInit = 0, `implements OnModuleInit` = 0.

**Chosen cron:** `'17 4 * * *'` — deliberately off the `'0 3 * * *'` cluster (thundering-herd avoidance per `147-PATTERNS.md`).

**Circular dependency:** madge reports one cycle between `TriagePromotionService ↔ TriagePromotionQueueService`. This is **expected and documented** — resolved via Nest's `forwardRef()` on both sides (the canonical escape hatch).

## Verification (all green)

```
cd backend
npx prisma validate                                                    → exit 0
npx tsc --noEmit                                                       → exit 0
npx jest triage-feedback.service.spec.ts                               → 14/14 pass
npx jest triage-correction.service.spec.ts                             → 5/5 pass
npx jest triage-promotion.service.spec.ts                              → 6/6 pass
npx jest triage-correction-weight.spec.ts                              → 6/6 pass
npx vitest run triage-prompt-budget.test.ts                            → 5/5 pass
npx madge --circular src/modules/ai                                    → 1 cycle (expected, forwardRef)
```

Total: **31 Jest + 5 Vitest = 36 tests green** across Phase 147 artifacts.

## Deploy status

Railway built commit `efaa5966` (which contains Task 3 backend work bundled with frontend changes under a misleading commit message — an external IDE auto-commit bundled the staged files; local history was later rewritten to `c1cdfe6c` frontend-only, then realigned to origin via `git reset origin/main`). Net effect: **Task 3 code is on prod via `efaa5966`**. Builds with the `railway.toml` fix from `379c4cf9` — Dockerfile CMD runs `prisma migrate deploy` (no-op, schema already aligned) then starts the server.

At prod runtime after this deploy:
- New queue `triage-promote-overrides` boots, worker idles (nobody enqueues yet — Wave 4 wires `recordFeedback` to call `enqueueDebounced`).
- Cron `TRIAGE_PROMOTION_SAFETY_NET` first firing: tomorrow 04:17 UTC. Handler fans out to tenants with feedback in last 24h — currently zero rows because Wave 4 capture is not live.
- `promoteOverrides` is a forward-compat placeholder in Phase 147 (D-05a): label_correction suggestions don't map to lane-shaped `TriageOverride.action`, so the loop no-ops. Real promotion activates when Wave 4+ ships lane_correction capture.

## Notice to Wave 4

- `TriageFeedbackService.captureLabelDiff(tenantId, emailId, oldLabels, newLabels)` — call from `EmailCrudService.updateEmail()` on label PATCH.
- `TriageFeedbackService.recordFeedback({ ..., signal: 'correction' })` — call from the new `POST /api/emails/:id/correct-triage` endpoint.
- `TriagePromotionQueueService.enqueueDebounced(tenantId)` — call after `recordFeedback` to schedule a debounced promotion run.
- `EmailAnalysisService.analyzeEmailUnified(..., { overrideHint: '<text>' })` — `EmailTriageService` passes the D-07 visible-override hint here.
