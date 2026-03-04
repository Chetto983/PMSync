---
phase: 35
slug: ai-observability-permissions
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-04
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (primary) |
| **Config file** | `backend/vitest.config.ts` |
| **Quick run command** | `cd backend && npx vitest run src/modules/ai/services/__tests__/ai-run-ledger.test.ts` |
| **Full suite command** | `cd backend && npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run task-specific verify command
- **After every plan wave:** Run `cd backend && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Wave 0 Strategy: TDD Inline

All plans use `tdd="true"` on tasks. Tests are written as part of each task's RED-GREEN cycle -- no separate Wave 0 stub creation step is needed. Each task creates its own test file and writes failing tests before implementing.

**Rationale:** The TDD-inline approach is more efficient for this phase because:
1. Each task has clear `<behavior>` blocks defining test expectations
2. Test files are listed in each task's `<files>` section
3. The `<verify>` command for each task runs the specific tests it creates

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | TDD Inline | Status |
|---------|------|------|-------------|-----------|-------------------|------------|--------|
| 35-01-01 | 01 | 1 | AIOBS-01 | unit | `cd backend && npx vitest run src/modules/ai/services/__tests__/ai-run-ledger.test.ts` | yes | pending |
| 35-01-02 | 01 | 1 | AIOBS-02 | integration | `cd backend && npx vitest run src/modules/ai/services/__tests__/briefing-ledger.test.ts && npm run type-check` | yes | pending |
| 35-01-03 | 01 | 1 | AIOBS-02 | integration | `cd backend && npx vitest run src/modules/ai-chat/__tests__/chat-ledger.test.ts src/modules/ai/services/__tests__/mistral-ledger.test.ts && npm run type-check` | yes | pending |
| 35-02-01 | 02 | 2 | AIOBS-03 | integration | `cd backend && npx vitest run src/modules/ai/__tests__/ai-observability.controller.test.ts && npm run type-check` | yes | pending |
| 35-02-02 | 02 | 2 | AIOBS-04 | unit | `cd backend && npx vitest run src/common/__tests__/policy-service.test.ts && npm run type-check` | yes | pending |

*Status: pending · green · red · flaky*

---

## Test File Creation Map

Each task creates its own test file as part of TDD inline:

| Test File | Created By Task | Requirement |
|-----------|----------------|-------------|
| `backend/src/modules/ai/services/__tests__/ai-run-ledger.test.ts` | 35-01 Task 1 | AIOBS-01 |
| `backend/src/modules/ai/services/__tests__/briefing-ledger.test.ts` | 35-01 Task 2 | AIOBS-02 |
| `backend/src/modules/ai-chat/__tests__/chat-ledger.test.ts` | 35-01 Task 3 | AIOBS-02 |
| `backend/src/modules/ai/services/__tests__/mistral-ledger.test.ts` | 35-01 Task 3 | AIOBS-02 |
| `backend/src/modules/ai/__tests__/ai-observability.controller.test.ts` | 35-02 Task 1 | AIOBS-03 |
| `backend/src/common/__tests__/policy-service.test.ts` | 35-02 Task 2 | AIOBS-04 |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chat streaming latency not regressed (<50ms) | AIOBS-02 | Requires real LLM streaming | 1. Measure first-token-time before changes. 2. Deploy ledger wiring. 3. Re-measure. 4. Diff must be <50ms |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] TDD inline covers all test file creation (no Wave 0 stubs needed)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (TDD inline strategy)
