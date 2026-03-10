---
phase: 63
slug: email-invitation-accept
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 63 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest + @testing-library/react |
| **Config file** | `frontend/jest.config.js` |
| **Quick run command** | `cd frontend && npx jest __tests__/pages/dashboard/invitations/accept.test.tsx -x` |
| **Full suite command** | `cd frontend && npx jest` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx jest __tests__/pages/dashboard/invitations/accept.test.tsx -x`
- **After every plan wave:** Run `cd frontend && npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 63-01-01 | 01 | 1 | ORG-02 | unit | `cd frontend && npx jest __tests__/pages/dashboard/invitations/accept.test.tsx -x` | ❌ W0 | ⬜ pending |
| 63-01-02 | 01 | 1 | ORG-02 | unit | same | ❌ W0 | ⬜ pending |
| 63-01-03 | 01 | 1 | ORG-02 | unit | same | ❌ W0 | ⬜ pending |
| 63-01-04 | 01 | 1 | ORG-02 | unit | same | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/__tests__/pages/dashboard/invitations/accept.test.tsx` — stubs for ORG-02 accept page behavior (reads ?id=, calls acceptInvitation, error/success states)
- Pattern: follows existing `frontend/__tests__/pages/auth/login.test.tsx` structure (mock router, mock auth-client, mock translations)

*Existing infrastructure covers test framework and config.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Unauthenticated email link → login → accept redirect flow | ORG-02 | Full middleware redirect chain with real auth cookies | 1. Log out 2. Open invitation email link 3. Verify login page shows 4. Log in 5. Verify accept page loads with ?id= preserved |
| Onboarding intercept exemption | ORG-02 | Requires real onboarding cookie state | 1. Create fresh user 2. Follow invitation link 3. Verify accept page loads (not onboarding redirect) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
