---
phase: 108
slug: hitl-approval-routing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 108 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (backend), vitest (frontend) |
| **Config file** | `backend/jest.config.ts`, `frontend/vitest.config.ts` |
| **Quick run command** | `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit` |
| **Full suite command** | `cd backend && npx tsc --noEmit && cd ../frontend && npm run type-check` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit` in affected workspace
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 108-01-01 | 01 | 1 | HITL-01 | type-check + manual | `cd backend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 108-01-02 | 01 | 1 | HITL-02 | type-check + manual | `cd backend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 108-02-01 | 02 | 1 | HITL-01 | type-check + manual | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 108-02-02 | 02 | 1 | HITL-02 | type-check + manual | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 108-03-01 | 03 | 2 | HITL-03 | type-check + manual | `cd backend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 108-03-02 | 03 | 2 | HITL-03 | type-check + manual | `cd frontend && npx tsc --noEmit` | ✅ | ⬜ pending |
| 108-04-01 | 04 | 2 | HITL-04 | type-check + manual | `cd backend && npx tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Approve/reject buttons appear for destructive actions | HITL-01 | Visual UI behavior requiring browser interaction | 1. Send AI chat "send email to X" 2. Verify HitlApprovalCard renders with approve/reject buttons 3. Click approve, verify action executes |
| Destructive vs informational visual distinction | HITL-02 | Visual styling difference | 1. Trigger HIGH-risk tool call 2. Verify amber/warning styling 3. Trigger info tool call 4. Verify neutral styling |
| Sensitivity toggle persists | HITL-03 | User preference persistence across sessions | 1. Open AI settings 2. Change sensitivity to ALL_MUTATIONS 3. Refresh page 4. Verify setting persisted |
| Audit trail entries created | HITL-04 | Database verification | 1. Approve a HITL action 2. Query audit_logs table 3. Verify entry with action=hitl_approval |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
