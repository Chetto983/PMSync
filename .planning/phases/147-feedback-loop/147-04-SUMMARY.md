---
phase: 147-feedback-loop
plan: 04
plan_number: 04
name: Wire Consumers — Auto-Diff Capture + Explicit Endpoint + Override Application
status: complete
completed_at: 2026-04-19
wave: 4
---

# Plan 147-04 Summary

## What was built

Wave 4 closed the feedback loop by wiring every Wave 3 consumer into live call sites. After Plan 04, the three roadmap success criteria are TRUE: user corrections feed future triage, `getSuggestions()` output drives the debounced promotion path, few-shot correction examples actually appear in the system prompt because data now exists.

## Task 1 — Auto-diff capture + debounced promotion enqueue in `EmailCrudService.updateEmail()`

Commit: `d3c21aee`.

- `EmailCrudService` gained two `@Optional()` injections: `TriageFeedbackService`, `TriagePromotionQueueService`.
- Raw `SELECT FOR UPDATE` in the `updateEmail` transaction now includes `"aiLabels"` so the pre-update value can be snapshotted inside the row-lock.
- AFTER the transaction commits AND AFTER `syncChangesToProvider`, a post-commit block fires two fire-and-forget calls when `data.aiLabels !== undefined`:
  - `captureLabelDiff(tenantId, id, oldAiLabels, newLabels)` — D-01 auto-diff classifier writes `signal='edit'` rows.
  - `enqueueDebounced(tenantId)` — D-06 trigger 1, 5min BullMQ dedup collapses bursts.
- Both wrapped in `.catch(err => logger.warn(...))` — never await, never bubble up to the API response, never run inside the transaction.
- No `forwardRef` needed: `EmailModule` already imports `AiModule`, and `AiModule` does not import `EmailModule` (comment on line 96 of ai.module.ts: "Provides STORAGE_SERVICE without pulling EmailModule into AI graph").

**Tests:** jest 5/5 green — fires on aiLabels change; not fired when aiLabels absent; errors swallowed; enqueue fires after aiLabels PATCH; not enqueued otherwise.

## Task 2 — Explicit `POST /emails/:id/correct-triage` endpoint + frontend "Should be…" Chip

Commit: `9c83556d`.

**Backend:**
- `CorrectTriageDto` class-validator DTO: `@IsIn(['label_correction'])`, `@MaxLength(200)` on oldValue/newValue.
- Endpoint `POST /emails/:id/correct-triage` with same guards as `PATCH :id` — `TenantGuard` + `RolesGuard` + `@Roles('admin','manager','super-admin')` + `@RateTierDecorator('safe-write')` + `@HttpCode(200)`.
- `EmailCrudService.correctTriage(id, tenantId, dto)`: defense-in-depth tenant `findFirst` → `recordFeedback({signal: 'correction'})` → awaited `enqueueDebounced(tenantId)`. Returns `{ ok: true }`. Throws `NotFoundException` when email missing.
- `EmailsService` facade adds `correctTriage()` delegating to `EmailCrudService`.

**Frontend:**
- Translations added to `en.ts`, `it.ts`, `index.ts`: `correctTo` ("Should be…" / "Dovrebbe essere…"), `correctTriagePopoverTitle`, `correctTriageSuccess`.
- `emailsApi.correctTriage(id, body)` wraps the POST.
- `useCorrectTriageMutation()` TanStack Query hook invalidates `emailKeys.detail(id)` + `emailKeys.list()` on success.
- `ExpandedMessage.tsx`: each AI-label Chip now has an adjacent `<Pencil size={11} />` `IconButton` **only inside the `message.aiLabels.map` block** (NOT user-added `message.labels`). Clicking opens an MUI `<Menu>` with the user's labels; selecting one fires the mutation and calls `onDismissAiLabel` on success. Disabled during mutation. All text from translations.

**Caveat:** the Chip UX was verified via `tsc --noEmit` only — not in a live browser. If the Menu positioning or pencil-button alignment looks off, fix in a follow-up commit.

**Tests:** jest 7/7 green total in `email-crud.service.spec.ts` (5 from Task 1 + 2 for `correctTriage` — records signal=correction + enqueues; throws when email missing).

## Task 3 — Pre-LLM override short-circuit + post-LLM lane enforcement + `triageSource` persistence

Commit: `246271b1`.

**`triage-override.service.ts`:**
- `export const ACTION_TO_LANE` (was private; Task 3 consumers import).
- `export const MUTING_ACTIONS = new Set(['always-system-alert', 'never-follow-up'])`.

**`email-triage.service.ts` — pre-LLM gate in `triageEmail()`:**
- `@Optional()` inject `TriageOverrideService`.
- Fetch minimal email shape (`from`, `threadId`, `subject`) → call `applyOverrides(tenantId, emailShape)`.
- **Muting match** (`always-system-alert`, `never-follow-up`):
  - `Email.updateMany` sets `aiLane=ACTION_TO_LANE[action]`, `aiLabels=[]`, `isAutoTriaged=true`, `autoTriagedAt=now`.
  - `EmailAnalysis.upsert` writes `triageSource='rule'`, `modelUsed='rule'`, `lane=mutingLane`, nulls out `summary`, `keyPoints=[]`, `suggestedActions=[]`.
  - Skip LLM entirely. Early return with `{success: true, aiPriority: undefined, aiLabels: [], lane: mutingLane}`.
  - `never-follow-up` also suppresses `processTriageSignals` via new `!suppressFollowUp` guard.
- **Visible match** (`always-important`, `always-review-later`, `always-customer-vip`):
  - Compute `overrideHint = "From {pattern}: user has marked as {action} — honor this"`.
  - Pass `{ overrideHint, matchedOverrideAction }` into `analyzeEmailUnified(...)`. LLM runs normally.
- **No match**: unchanged pure-LLM path.

**`email-analysis.service.ts` — post-LLM lane enforcement + `triageSource` tagging:**
- `AnalyzeEmailUnifiedOptions.matchedOverrideAction?: string | null` (new).
- After LLM parse, before upsert: if `matchedOverrideAction` set AND NOT in `MUTING_ACTIONS`, force `result.lane = ACTION_TO_LANE[action]` and tag `triageSource='llm+rule'`. Default `triageSource='llm'`.
- `analysisData.triageSource` persisted on every upsert.

**MAX_ANALYZE_SYSTEM_PROMPT_LENGTH = 4600 UNCHANGED** — W3 prompt-budget invariant preserved (vitest re-run confirms).

**W1 schema check (acceptance criterion):** `EmailAnalysis` required-no-default fields = exactly `{emailId, tenantId}` — verified via `awk '/^model EmailAnalysis \{/,/^\}/' schema.prisma | grep -vE ...`. The muting `create:` payload supplies both + Phase-147 provenance columns; every other required column falls back to `@default(...)`.

**Tests:** jest 4/4 green in new `email-triage.service.spec.ts` — muting short-circuits LLM + writes triageSource=rule; visible passes overrideHint + matchedOverrideAction into LLM; never-follow-up suppresses follow-up creation; no-match path has null hint/action.

## Verification (all green)

```
cd backend
npx tsc --noEmit                                                        → exit 0
npx madge --circular --extensions ts src/modules/ai src/modules/email   → 1 cycle (expected Nest forwardRef: TriagePromotionQueueService ↔ TriagePromotionService); no new cross-module cycles
npx jest src/modules/email/services/__tests__/email-crud.service.spec.ts → 7/7 pass
npx jest src/modules/ai/services/__tests__/email-triage.service.spec.ts → 4/4 pass
npx jest [all Phase 147 specs]                                           → 42/42 pass across 6 suites
npx vitest run src/modules/ai/services/__tests__/triage-prompt-budget.test.ts → 5/5 pass (4600 invariant)

cd ../frontend
npm run type-check                                                       → exit 0
```

Total Phase 147: **42 Jest + 5 Vitest = 47 tests green**.

## Circular-dependency verdict

Madge reports one cycle: `TriagePromotionQueueService ↔ TriagePromotionService`. This is **expected and documented** — resolved at Nest DI-resolution time via `forwardRef()` on both sides (the canonical Nest escape hatch). No new cycles introduced by Plan 04. `AiModule ↔ EmailModule` is clean: `AiModule` no longer imports `EmailModule` (confirmed via grep).

## `triageSource` persistence coverage

Three code paths, three values:
- **Muting short-circuit** in `EmailTriageService`: `triageSource='rule'`.
- **Visible override** in `EmailAnalysisService`: `triageSource='llm+rule'`.
- **Pure-LLM path** (no override matched): `triageSource='llm'`.

Every `EmailAnalysis` upsert now writes this column. Phase 148 stratified-accuracy eval can `WHERE triageSource = 'llm'` for model-only performance metrics.

## Live prod impact on deploy

- Every label PATCH generates a `signal='edit'` feedback row + schedules a debounced promotion job.
- New endpoint `POST /emails/:id/correct-triage` lets users mark explicit corrections (`signal='correction'`).
- Frontend "Should be…" pencil affordance ships on every AI-label Chip.
- **Muting overrides now actually mute** — emails matching `always-system-alert` / `never-follow-up` rules skip the LLM and get routed straight to `system-alerts` lane with empty `aiLabels`.
- **Visible overrides now force the lane** — e.g., `boss@acme.com` marked `always-important` always lands in `action-now` regardless of what the LLM says.
- Tenants **without existing `TriageOverride` rows** see zero behavior change in triage decisions. The only new thing written is `triageSource='llm'` on `EmailAnalysis`.

## ExpandedMessage UX pattern

Adjacent `<IconButton><Pencil size={11} /></IconButton>` placed next to each AI-label `<Chip>` inside a `<Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>`. Clicking opens a single shared MUI `<Menu>` anchored to the clicked button (`correctMenuAnchor` state + `correctingAiLabel` tracking which label is being replaced). The Menu lists user labels from `useLabels()`. Selecting one fires `useCorrectTriageMutation` + dismisses the AI-label visually. Disabled during mutation. Translations at `t.email.labels.correctTo` / `correctTriagePopoverTitle` / `correctTriageSuccess`.

The pencil icon is `text.disabled` at rest, `primary.main` on hover — matches the existing chip-dismiss-icon affordance pattern. Not visually-tested in a live browser.

## Commits in Plan 04

- `d3c21aee` — Task 1: wire auto-diff capture + debounced promotion into EmailCrudService
- `9c83556d` — Task 2: explicit POST /emails/:id/correct-triage + frontend "Should be…" Chip
- `246271b1` — Task 3: pre-LLM override short-circuit + lane enforcement + triageSource persistence
- (this SUMMARY commit follows)
