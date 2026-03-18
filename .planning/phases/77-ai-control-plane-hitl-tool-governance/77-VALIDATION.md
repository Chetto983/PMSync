---
phase: 77
slug: ai-control-plane-hitl-tool-governance
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 77 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (integration .test.ts) + jest (unit .spec.ts) |
| **Config file** | backend/vitest.config.ts + backend/jest.config.js |
| **Quick run command** | `cd backend && npx vitest run src/modules/ai-chat/__tests__/hitl-contract.test.ts && npx jest src/modules/ai-chat/tools/tool-registry-governance.spec.ts` |
| **Full suite command** | `cd backend && npx vitest run && npx jest` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx vitest run src/modules/ai-chat/__tests__/hitl-contract.test.ts && npx jest src/modules/ai-chat/tools/tool-registry-governance.spec.ts`
- **After every plan wave:** Run `cd backend && npx vitest run && npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 77-01-01 | 01 | 0 | AICP-01, AICP-02, AICP-12 | contract | `cd backend && npx vitest run src/modules/ai-chat/__tests__/hitl-contract.test.ts` | ❌ W0 | ⬜ pending |
| 77-01-02 | 01 | 0 | AICP-03, AICP-04 | unit | `cd backend && npx jest src/modules/ai-chat/tools/tool-registry-governance.spec.ts` | ❌ W0 | ⬜ pending |
| 77-01-03 | 01 | 0 | AICP-14 | e2e | `cd backend && npx vitest run src/modules/ai-chat/__tests__/hitl-e2e.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/modules/ai-chat/__tests__/hitl-contract.test.ts` — stubs for AICP-01, AICP-02, AICP-12
- [ ] `backend/src/modules/ai-chat/tools/tool-registry-governance.spec.ts` — stubs for AICP-03, AICP-04
- [ ] `backend/src/modules/ai-chat/__tests__/hitl-e2e.test.ts` — stubs for AICP-14

*Existing test infrastructure (vitest + jest) covers framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Frontend HitlApprovalCard renders new DTO shape | AICP-01 | Visual UI verification | 1. Trigger mutating tool in chat, 2. Verify approval card shows riskLevel badge + domain tag, 3. Approve and verify outcome toast |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
