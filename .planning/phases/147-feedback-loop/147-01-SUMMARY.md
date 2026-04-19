---
phase: 147-feedback-loop
plan: 01
plan_number: 01
name: Schema Edits, Translations, and Pre-staged Helpers
status: complete
completed_at: 2026-04-19
wave: 1
---

# Plan 147-01 Summary

## What was built

Wave 1 of Phase 147 landed four pure-additions artifacts with **zero consumers**. Nothing in the runtime call graph changed. Wave 2 (migration) and Wave 3 (prompt rebalance + promotion math + service consumers) now have stable schema, translation template slots, and injectable service skeletons ready to import.

## Artifacts

### 1. Prisma schema additions (not migrated yet)

- `EmailTriageFeedback.signal String @default("edit")` — D-01 discriminator between auto-diff (`'edit'`) and explicit (`'correction'`) feedback paths. Default `'edit'` auto-populates existing rows.
- `EmailAnalysis.triageSource String?` — D-08 provenance for UI chip (`'llm' | 'rule' | 'llm+rule'`). Nullable, no default — pre-migration rows stay null until Wave 3 starts writing.
- `@@index([tenantId, signal, createdAt])` — supports D-03 concentration-ratio query (filter on `signal='correction'` in 30-day window).

**Diff size:** 27 lines, additions only. Zero DROP / RENAME / type changes.
**Migration NOT generated** — Plan 02 owns that step.

### 2. Translation template widened to 5 args (en / it / types)

- `t.insights.analyzeUnified.systemPrompt` now accepts `(allowedLabels, labelRules?, triageRules?, correctionsBlock?, overrideHint?)` in both en.ts and it.ts.
- Interpolation order preserved per D-09d: `LABEL_RULES → triage_context → CORRECTIONS → USER_OVERRIDE` (rightmost = RoPE recency amplification).
- Existing 3-arg callers still compile (trailing params optional).

### 3. `weightCorrection` helper + 6-case spec (Phase 149 pre-stage)

- `backend/src/modules/ai/utils/triage-correction-weight.ts`
- Contract: `ageDays <= 30 ? 1 : 0` (D-12).
- Spec covers 0, 30, 31, 100, negative, fractional. **6/6 pass.**
- Phase 149 will swap body for exponential decay without touching call sites.

### 4. `TriageCorrectionService.getFewShotExamples(tenantId, senderFrom)` + 5-case spec

- `backend/src/modules/ai/services/triage-correction.service.ts`
- Sender-first, domain-fallback (D-09a). `Math.exp(-ageDays / 14)` decay (D-09b — intentional divergence from `weightCorrection` per D-12). Hard cap 3 (D-09c). `tenantId` on every Prisma query. Only `signal='correction'` rows counted (D-03).
- Registered in `AiModule` providers + exports.
- Spec: **5/5 pass** — covers empty result, cap-3, sender-preferred, domain-fallback, signal=correction filter.

## Verification

- `npx prisma validate` → ✅ valid
- `npx tsc --noEmit` → ✅ exit 0
- `npx jest triage-correction-weight.spec.ts triage-correction.service.spec.ts` → ✅ 11/11 tests pass

## Not done in this plan (by design)

- Prisma migration generation — Plan 02.
- Wiring any call sites — Plans 03/04.
- `prisma format --check` on the whole file — schema has pre-existing formatting drift (1593-line reformat if applied). Out of scope for Plan 01.

## Next

Plan 02: generate Prisma migration via `npx prisma migrate dev --name 147_feedback_loop_signal_and_triagesource`. Review SQL for DROP statements (must be zero). Commit migration file so Railway `migrate deploy` can apply on prod DB.
