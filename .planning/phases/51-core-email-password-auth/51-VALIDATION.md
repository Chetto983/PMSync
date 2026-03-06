---
phase: 51
slug: core-email-password-auth
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 51 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x |
| **Config file** | `frontend/jest.config.js` |
| **Quick run command** | `cd frontend && npx jest --testPathPatterns="auth" --no-coverage` |
| **Full suite command** | `cd frontend && npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx jest --testPathPatterns="auth" --no-coverage`
- **After every plan wave:** Run `cd frontend && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 51-01-01 | 01 | 1 | CORE-01 | integration | `cd frontend && npx jest --testPathPatterns="signup" --no-coverage` | ❌ W0 | ⬜ pending |
| 51-01-02 | 01 | 1 | CORE-02 | integration | `cd frontend && npx jest --testPathPatterns="signin" --no-coverage` | ❌ W0 | ⬜ pending |
| 51-01-03 | 01 | 1 | CORE-04 | integration | `cd frontend && npx jest --testPathPatterns="verify-email" --no-coverage` | ❌ W0 | ⬜ pending |
| 51-01-04 | 01 | 1 | CORE-05 | integration | `cd frontend && npx jest --testPathPatterns="reset-password" --no-coverage` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/lib/__tests__/auth-client.test.ts` — auth-client creation and method availability
- [ ] `frontend/lib/__tests__/mail.test.ts` — nodemailer transporter creation and sendTransactionalEmail
- [ ] Verify `npx prisma validate` still passes (schema sanity check)

*Note: True integration tests for auth flows (signup -> verify -> signin -> reset) are E2E requiring browser + database. Unit tests cover: auth-client config, mail transporter init, HIBP hook path matching. Full flow testing is manual or Playwright E2E.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Signup sets session cookie in browser | CORE-01 | Requires real browser cookie jar | 1. Open /auth/register 2. Fill form, submit 3. Check DevTools > Application > Cookies for `better-auth.session_token` |
| Verification email arrives in inbox | CORE-04 | Requires real SMTP and email client | 1. Register new account 2. Check email inbox for verification link 3. Click link, verify redirect to dashboard |
| Password reset email arrives in inbox | CORE-05 | Requires real SMTP and email client | 1. Go to /auth/forgot-password 2. Enter registered email 3. Check inbox for reset link 4. Click link, set new password, verify signin |
| Unverified user sees helpful error on login | CORE-04 | UX validation requiring visual inspection | 1. Register but don't verify 2. Try to login 3. Verify friendly "verify your email" message appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
