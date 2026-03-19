---
phase: 87
slug: ai-chat-module-fix
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-19
---

# Phase 87 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (*.test.ts files) |
| **Config file** | backend/vitest.config.ts |
| **Quick run command** | `cd backend && npx vitest run --testPathPattern="ai-chat" --reporter=verbose` |
| **Full suite command** | `cd backend && npx vitest run` |
| **Estimated runtime** | ~15 seconds (ai-chat only), ~60 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx tsc --noEmit`
- **After every plan wave:** Run `cd backend && npx vitest run --testPathPattern="ai-chat" --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 87-00-01 | 00 | 0 | BUG-2, RULE-1 | test-first | `npx vitest run src/modules/ai-chat/__tests__/security-isolation.test.ts` | Wave 0 creates | ⬜ pending |
| 87-00-02 | 00 | 0 | BUG-1, BUG-5, RACE-1, RACE-4 | test-first | `npx vitest run src/modules/ai-chat/__tests__/bug-fixes.test.ts` | Wave 0 creates | ⬜ pending |
| 87-01-01 | 01 | 1 | BUG-2 | unit | `npx vitest run src/modules/ai-chat/__tests__/security-isolation.test.ts -t "userId"` | ✅ (from Wave 0) | ⬜ pending |
| 87-01-02 | 01 | 1 | RULE-1 | unit | `npx vitest run src/modules/ai-chat/__tests__/security-isolation.test.ts -t "tenantId"` | ✅ (from Wave 0) | ⬜ pending |
| 87-02-01 | 02 | 2 | BUG-1 | unit | `npx vitest run src/modules/ai-chat/__tests__/bug-fixes.test.ts -t "replyAll"` | ✅ (from Wave 0) | ⬜ pending |
| 87-02-02 | 02 | 2 | BUG-5 | unit | `npx vitest run src/modules/ai-chat/__tests__/bug-fixes.test.ts -t "summary"` | ✅ (from Wave 0) | ⬜ pending |
| 87-02-03 | 02 | 2 | RACE-1 | unit | `npx vitest run src/modules/ai-chat/__tests__/bug-fixes.test.ts -t "RACE-1"` | ✅ (from Wave 0) | ⬜ pending |
| 87-03-01 | 03 | 3 | BUG-3 | unit | `npx vitest run src/modules/ai-chat/__tests__/ --reporter=verbose` | ✅ | ⬜ pending |
| 87-03-02 | 03 | 3 | BUG-6 | unit | `npx vitest run src/modules/ai-chat/__tests__/ --reporter=verbose` | ✅ | ⬜ pending |
| 87-03-03 | 03 | 3 | BUG-7 | unit | `npx vitest run src/modules/ai-chat/__tests__/tools-rag-e2e.test.ts` | ✅ | ⬜ pending |
| 87-03-04 | 03 | 3 | BUG-8 | unit | `npx vitest run src/modules/ai-chat/__tests__/tools-rag-e2e.test.ts` | ✅ | ⬜ pending |
| 87-03-05 | 03 | 3 | RACE-4 | unit | `npx vitest run src/modules/ai-chat/__tests__/bug-fixes.test.ts -t "RACE-4"` | ✅ (from Wave 0) | ⬜ pending |
| 87-04-01 | 04 | 4 | DEAD-1-5 | tsc + vitest | `npx tsc --noEmit && npx vitest run src/modules/ai-chat/` | ✅ | ⬜ pending |
| 87-04-02 | 04 | 4 | RULE-3 | tsc + vitest | `npx tsc --noEmit && npx vitest run src/modules/ai-chat/` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Plan 87-00 creates two test files BEFORE implementation:
- `backend/src/modules/ai-chat/__tests__/security-isolation.test.ts` — BUG-2 (userId check) + RULE-1 (tenantId filter)
- `backend/src/modules/ai-chat/__tests__/bug-fixes.test.ts` — BUG-1 (replyAll CC), BUG-5 (summary trigger), RACE-1 (retry), RACE-4 (batched persistence)

These tests are written in RED state (failing) and turn GREEN as Plans 01-03 implement fixes.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-user read blocked | BUG-2 | Needs 2 authenticated users in same tenant | Create 2 users, verify User A cannot GET User B's conversation |
| Reply All includes CC | BUG-1 | Needs email service integration | Send replyAll=true, verify CC recipients in queued email |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
