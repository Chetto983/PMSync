---
phase: 55
slug: social-login-mfa
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 55 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript type-check + ESLint + Playwright (existing) |
| **Config file** | `frontend/tsconfig.json`, `backend/tsconfig.json` |
| **Quick run command** | `cd frontend && npm run type-check && npm run lint` |
| **Full suite command** | `cd frontend && npm run type-check && npm run lint && cd ../backend && npm run lint` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm run type-check && npm run lint`
- **After every plan wave:** Run `cd frontend && npm run type-check && npm run lint && cd ../backend && npm run lint`
- **Before `/gsd:verify-work`:** Full suite must be green + manual walkthrough of 5 success criteria
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 55-01-01 | 01 | 1 | CORE-03 | e2e/manual | `cd frontend && npm run type-check` | ❌ W0 | ⬜ pending |
| 55-01-02 | 01 | 1 | CORE-03 | integration | `cd backend && npm run lint` | ❌ W0 | ⬜ pending |
| 55-02-01 | 02 | 1 | SEC-01 | e2e/manual | Manual TOTP QR scan flow | ❌ W0 | ⬜ pending |
| 55-02-02 | 02 | 1 | SEC-02 | integration | API call to twoFactor.verifyBackupCode | ❌ W0 | ⬜ pending |
| 55-03-01 | 03 | 2 | SEC-03 | e2e/manual | Manual WebAuthn browser dialog | ❌ W0 | ⬜ pending |
| 55-03-02 | 03 | 2 | SEC-04 | smoke | Manual settings page walkthrough | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/tests/auth/social-login.spec.ts` — Playwright test for Google OAuth redirect (mock)
- [ ] `frontend/tests/auth/two-factor.spec.ts` — Playwright test for TOTP setup flow
- [ ] `backend/src/common/auth/__tests__/better-auth-plugins.spec.ts` — Unit test verifying plugin registration
- [ ] Type-check and lint must pass with new plugin types

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Google OAuth sign-in lands on dashboard | CORE-03 | OAuth redirect requires real Google consent screen | 1. Click "Sign in with Google" 2. Complete Google consent 3. Verify redirect to /dashboard with valid session |
| Microsoft OAuth sign-in lands on dashboard | CORE-03 | OAuth redirect requires real Microsoft consent screen | 1. Click "Sign in with Microsoft" 2. Complete Microsoft consent 3. Verify redirect to /dashboard with valid session |
| TOTP enable + QR scan + verify | SEC-01 | TOTP requires authenticator app to scan QR code | 1. Go to Security settings 2. Enable TOTP 3. Scan QR with authenticator 4. Enter code 5. Verify enabled |
| Backup code login bypass | SEC-02 | Requires TOTP to be active first | 1. Enable TOTP 2. Log out 3. Log in 4. Use backup code instead of TOTP 5. Verify login succeeds |
| Passkey register + authenticate | SEC-03 | WebAuthn requires browser biometric/security key dialog | 1. Go to Security settings 2. Register passkey 3. Log out 4. Sign in with passkey 5. Verify login succeeds |
| Security settings page | SEC-04 | Visual verification of all sections present | 1. Navigate to /settings/security 2. Verify: 2FA methods section, passkeys section, active sessions section |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
