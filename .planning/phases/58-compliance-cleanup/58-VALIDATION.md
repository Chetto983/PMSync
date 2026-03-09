---
phase: 58
slug: compliance-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 58 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.2.0 + ts-jest 29.4.6 |
| **Config file** | `backend/jest.config.js` |
| **Quick run command** | `cd backend && npx jest --testPathPattern="common/auth" --forceExit` |
| **Full suite command** | `cd backend && npx jest --forceExit` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npm run type-check`
- **After every plan wave:** Run `cd backend && npx jest --forceExit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 58-01-01 | 01 | 1 | CLN-01 | unit | `cd backend && npx jest --testPathPattern="audit-hooks" --forceExit` | ❌ W0 | ⬜ pending |
| 58-02-01 | 02 | 2 | CLN-04 | smoke | `cd backend && npm run build && npm run type-check` | ✅ | ⬜ pending |
| 58-02-02 | 02 | 2 | CLN-04 | smoke | `cd backend && npm run build` | ✅ | ⬜ pending |
| 58-03-01 | 03 | 3 | CLN-05 | integration | `cd backend && npx jest --testPathPattern="better-auth-flows" --forceExit` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/common/auth/__tests__/audit-hooks.spec.ts` — stubs for CLN-01
- [ ] `backend/src/common/auth/__tests__/better-auth-flows.spec.ts` — stubs for CLN-05
- [ ] No new framework install needed — Jest already configured

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Login failure audit logging | CLN-01 | hooks.after may not fire on failed logins — needs runtime check | Attempt wrong password, check AuditLog table |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
