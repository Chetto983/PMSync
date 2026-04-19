---
status: partial
phase: 147-feedback-loop
source: [147-VERIFICATION.md]
started: 2026-04-19T19:49:10Z
updated: 2026-04-19T19:49:10Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Railway smoke test — CORRECTIONS block appears in real LLM prompt
expected: After submitting one explicit correction via `POST /emails/:id/correct-triage` (or the frontend Pencil affordance) for a sender, wait for the 5-min debounce, then trigger a new triage of another email from the same sender. With backend debug-level prompt logging enabled, the next `buildAnalyzeSystemPrompt` call for that sender emits a `<CORRECTIONS>` block listing the prior correction. Verify the block appears AFTER label-rules and BEFORE the user-override hint (RoPE recency ordering — D-09d).
result: [pending]

### 2. Frontend affordance — Pencil chip renders and fires mutation in live browser
expected: On a thread's ExpandedMessage in a Chromium-based browser (Edge Default profile via CDP, per PMSync Playwright debug setup), each AI-label Chip renders with a visible pencil icon. Clicking the pencil opens an MUI Menu of user-defined labels. Selecting one fires `POST /emails/:id/correct-triage` with the correct `{ type: 'label_correction', oldValue, newValue }` body, the mutation resolves 200, and the "Correction recorded" toast appears. No console errors. Plan 04 SUMMARY explicitly notes this was verified via `tsc --noEmit` only — this is the missing browser-rendering check.
result: [pending]

### 3. RolesGuard — POST /promote-suggestions rejects non-super-admin with 403
expected: Against a running backend, a request to `POST /api/ai/triage-overrides/promote-suggestions` with a session cookie for a user whose role is `'admin'` (not `'super-admin'`) receives HTTP 403 Forbidden. A request with role=`'super-admin'` receives HTTP 200 with `{ promoted, skipped }` body. Verifier confirmed the class-level `@UseGuards(TenantGuard, RolesGuard)` pattern statically; runtime behavior depends on `roles.guard.ts` allow-unless-decorated semantics which were code-read only.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

### CR-01 — Muting override wipes user-corrected labels (partial, from 147-VERIFICATION.md)

status: partial
artifact: `backend/src/modules/ai/services/email-triage.service.ts:293-331`
issue: The muting-override short-circuit's `email.updateMany` payload unconditionally clears `aiLabels: []`, destroying labels a user previously set via `POST /emails/:id/correct-triage`. On the next triage pass, `captureLabelDiff` compares `[]` vs the restored labels and emits spurious `added_back_correction` rows, polluting the feedback signal. It does NOT break the phase-goal chain for new emails, but it corrupts signal quality for muted-sender emails and should be fixed before Phase 148 drift-detection consumes `signal='edit'` rows.

remediation:
- Remove `aiLabels: []` from the muting `updateMany` payload (let prior labels survive mute)
- Remove `summary: null, keyPoints: [], suggestedActions: []` from the EmailAnalysis upsert update branch
- Or: guard the clear behind a check for "no prior user correction exists for this email"

Resolved by: `/gsd-code-review-fix 147` (auto-fix) or a targeted gap-closure plan.
