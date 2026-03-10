---
phase: 57
slug: admin-panel
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 57 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x + ts-jest |
| **Config file** | `backend/jest.config.ts` |
| **Quick run command** | `cd backend && npx jest src/common/auth/__tests__/admin-plugin.spec.ts --forceExit` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest src/common/auth/__tests__/admin-plugin.spec.ts --forceExit`
- **After every plan wave:** Run `cd backend && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 57-01-01 | 01 | 1 | ADM-01 | unit | `cd backend && npx jest --testPathPattern admin -t "listUsers" --forceExit` | ❌ W0 | ⬜ pending |
| 57-01-02 | 01 | 1 | ADM-02 | unit | `cd backend && npx jest --testPathPattern admin -t "ban" --forceExit` | ❌ W0 | ⬜ pending |
| 57-01-03 | 01 | 1 | ADM-03 | unit | `cd backend && npx jest --testPathPattern admin -t "impersonate" --forceExit` | ❌ W0 | ⬜ pending |
| 57-01-04 | 01 | 1 | ADM-04 | unit | `cd backend && npx jest --testPathPattern admin -t "revoke" --forceExit` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/common/auth/__tests__/admin-plugin.spec.ts` — stubs for ADM-01 through ADM-04
- [ ] Frontend: type-check + lint validation (`cd frontend && npm run type-check && npm run lint`)

*Existing infrastructure covers test framework and config.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Impersonation banner visible during impersonation | ADM-03 | Visual UI element | 1. Login as super-admin 2. Impersonate a user 3. Verify banner appears on all pages 4. Click "Stop Impersonating" 5. Verify banner disappears |
| Banned user sees ban reason on login attempt | ADM-02 | UI error message display | 1. Ban a user with reason 2. Logout 3. Try to login as banned user 4. Verify ban reason shown |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
