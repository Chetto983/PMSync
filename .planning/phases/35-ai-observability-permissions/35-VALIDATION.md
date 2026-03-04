---
phase: 35
slug: ai-observability-permissions
status: draft
nyquist_compliant: false
wave_0_complete: false
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

- **After every task commit:** Run `cd backend && npx vitest run src/modules/ai/services/__tests__/ai-run-ledger.test.ts`
- **After every plan wave:** Run `cd backend && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 35-01-01 | 01 | 1 | AIOBS-01 | unit | `cd backend && npx vitest run src/modules/ai/services/__tests__/ai-run-ledger.test.ts -t "creates ledger entry"` | ❌ W0 | ⬜ pending |
| 35-01-02 | 01 | 1 | AIOBS-01 | unit | `cd backend && npx vitest run src/modules/ai/services/__tests__/ai-run-ledger.test.ts -t "estimates cost"` | ❌ W0 | ⬜ pending |
| 35-01-03 | 01 | 1 | AIOBS-02 | integration | `cd backend && npx vitest run src/modules/ai-chat/__tests__/chat-ledger.test.ts` | ❌ W0 | ⬜ pending |
| 35-01-04 | 01 | 1 | AIOBS-02 | integration | `cd backend && npx vitest run src/modules/ai/services/__tests__/briefing-ledger.test.ts` | ❌ W0 | ⬜ pending |
| 35-02-01 | 02 | 2 | AIOBS-03 | integration | `cd backend && npx vitest run src/modules/ai/__tests__/ai-observability.controller.test.ts -t "list runs"` | ❌ W0 | ⬜ pending |
| 35-02-02 | 02 | 2 | AIOBS-03 | integration | `cd backend && npx vitest run src/modules/ai/__tests__/ai-observability.controller.test.ts -t "cost summary"` | ❌ W0 | ⬜ pending |
| 35-02-03 | 02 | 2 | AIOBS-04 | unit | `cd backend && npx vitest run src/common/__tests__/policy-service.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/modules/ai/services/__tests__/ai-run-ledger.test.ts` — stubs for AIOBS-01 (service unit tests)
- [ ] `backend/src/modules/ai-chat/__tests__/chat-ledger.test.ts` — stubs for AIOBS-02 (chat integration)
- [ ] `backend/src/modules/ai/services/__tests__/briefing-ledger.test.ts` — stubs for AIOBS-02 (briefing integration)
- [ ] `backend/src/modules/ai/__tests__/ai-observability.controller.test.ts` — stubs for AIOBS-03 (endpoint tests)
- [ ] `backend/src/common/__tests__/policy-service.test.ts` — stubs for AIOBS-04 (interface validation)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chat streaming latency not regressed (<50ms) | AIOBS-02 | Requires real LLM streaming | 1. Measure first-token-time before changes. 2. Deploy ledger wiring. 3. Re-measure. 4. Diff must be <50ms |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
