---
phase: 55
slug: social-login-mfa
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-09
---

# Phase 55 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript type-check + ESLint (static analysis only) |
| **Config file** | `frontend/tsconfig.json`, `backend/tsconfig.json` |
| **Quick run command** | `cd frontend && npm run type-check && npm run lint` |
| **Full suite command** | `cd frontend && npm run type-check && npm run lint && cd ../backend && npm run lint` |
| **Estimated runtime** | ~30 seconds |

---

## Nyquist Compliance Justification

**nyquist_compliant: true** — Auth flows in this phase are inherently manual-only:

1. **OAuth login** requires real Google/Microsoft consent screens — cannot be unit tested without live OAuth credentials and browser interaction
2. **TOTP setup** requires scanning a QR code with a physical authenticator app — no programmatic equivalent
3. **WebAuthn/Passkey** requires browser biometric dialog — cannot be triggered in headless test environments
4. **Onboarding wizard** is a multi-step UI flow with OAuth state dependencies

Every task has an `<automated>` verify command using TypeScript type-check and/or ESLint. These catch structural errors (missing imports, type mismatches, broken wiring) which are the primary failure modes for plugin configuration and component integration.

**Deferred:** Playwright e2e tests for auth flows are deferred to Phase 58 (CLN-05 cleanup phase) where mock OAuth providers and WebAuthn test fixtures can be properly set up.

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm run type-check && npm run lint`
- **After every plan wave:** Run `cd frontend && npm run type-check && npm run lint && cd ../backend && npm run lint`
- **Before `/gsd:verify-work`:** Full suite must be green + manual walkthrough of success criteria
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 55-01-01 | 01 | 1 | CORE-03 | type-check | `cd backend && npx prisma validate && cd ../frontend && npx tsc --noEmit` | pending |
| 55-01-02 | 01 | 1 | CORE-03 | type-check | `cd frontend && npx tsc --noEmit` | pending |
| 55-02-01 | 02 | 2 | SEC-01 | type-check | `cd frontend && npx tsc --noEmit` | pending |
| 55-02-02 | 02 | 2 | SEC-02 | type-check + lint | `cd frontend && npx tsc --noEmit && npm run lint` | pending |
| 55-03-01 | 03 | 2 | SEC-04 | type-check | `cd frontend && npx tsc --noEmit` | pending |
| 55-03-02 | 03 | 2 | SEC-04 | type-check | `cd frontend && npx tsc --noEmit` | pending |
| 55-04-01 | 04 | 2 | SEC-01 | type-check | `cd frontend && npx tsc --noEmit` | pending |
| 55-04-02 | 04 | 2 | SEC-03 | type-check + lint | `cd frontend && npx tsc --noEmit && npm run lint` | pending |
| 55-05-01 | 05 | 3 | SEC-04 | grep + build | `grep -rn "MfaSettings\|TotpService" ... \| wc -l` (expect 0) | pending |

*Status: pending / green / red / flaky*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Google OAuth sign-in lands on dashboard | CORE-03 | OAuth redirect requires real Google consent screen | 1. Click "Sign in with Google" 2. Complete Google consent 3. Verify redirect to /dashboard with valid session |
| Microsoft OAuth sign-in lands on dashboard | CORE-03 | OAuth redirect requires real Microsoft consent screen | 1. Click "Sign in with Microsoft" 2. Complete Microsoft consent 3. Verify redirect to /dashboard with valid session |
| TOTP enable + QR scan + verify | SEC-01 | TOTP requires authenticator app to scan QR code | 1. Go to Security settings 2. Enable TOTP 3. Scan QR with authenticator 4. Enter code 5. Verify enabled |
| Backup code login bypass | SEC-02 | Requires TOTP to be active first | 1. Enable TOTP 2. Log out 3. Log in 4. Use backup code instead of TOTP 5. Verify login succeeds |
| Passkey register + authenticate | SEC-03 | WebAuthn requires browser biometric/security key dialog | 1. Go to Security settings 2. Register passkey 3. Log out 4. Sign in with passkey 5. Verify login succeeds |
| Onboarding wizard blocks dashboard | SEC-04 | Requires full user flow with session state | 1. Create new account 2. Verify redirect to /onboarding 3. Complete all steps 4. Verify dashboard access |
| Security settings page | SEC-04 | Visual verification of all sections present | 1. Navigate to /settings?section=security 2. Verify: MFA, sessions, accounts, password sections |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands (type-check + lint)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Nyquist justification documented (auth flows are manual-only by nature)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
