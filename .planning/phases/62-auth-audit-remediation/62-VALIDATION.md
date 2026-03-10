---
phase: 62
slug: auth-audit-remediation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 62 - Validation Strategy

> Per-phase validation contract for the auth-audit remediation work.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Backend framework** | Jest 30.2.0 |
| **Frontend framework** | Jest 30.2.0 |
| **Browser E2E** | Playwright |
| **Backend quick run** | `cd backend && npx jest --testPathPatterns "auto-connect-social|social-login-provisioning|active-org-guard|realtime-handshake" --forceExit` |
| **Frontend quick run** | `cd frontend && npx jest --runInBand` |
| **E2E quick run** | `cd frontend && npx playwright test --grep "auth|organization|onboarding"` |
| **Type-check gate** | `cd backend && npm run type-check` and `cd frontend && npm run type-check` |

---

## Sampling Rate

- After every backend auth change: `cd backend && npm run type-check`
- After every frontend auth/proxy/UI change: `cd frontend && npm run type-check`
- After each completed workstream: run the targeted Jest suites for that workstream
- Before phase verification: run backend targeted suites, frontend targeted suites, and Playwright auth/org/onboarding coverage
- Before sign-off: perform manual Google and Microsoft provider smoke checks

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 62-01-01 | 01 | 0 | P62-01 | integration | `cd backend && npx jest --testPathPatterns "auto-connect-social|social-login-provisioning" --forceExit` | yes | pending |
| 62-01-02 | 01 | 1 | P62-02 | integration | `cd backend && npx jest --testPathPatterns "auto-connect-social|social-login-provisioning" --forceExit` | yes | pending |
| 62-01-03 | 01 | 0 | P62-03 | unit | `cd frontend && npx jest --runInBand auth-proxy` | no - W0 | pending |
| 62-01-04 | 01 | 1 | P62-04 | unit | `cd backend && npx jest --testPathPatterns "active-org-guard|realtime-handshake" --forceExit` | yes | pending |
| 62-01-05 | 01 | 1 | P62-04 | unit/e2e | `cd frontend && npx jest --runInBand "OrgSwitcher|organization" && npx playwright test --grep "organization"` | no - W0 | pending |
| 62-01-06 | 01 | 1 | P62-05 | unit/e2e | `cd frontend && npx jest --runInBand "register|verify-email|onboarding" && npx playwright test --grep "verification|onboarding"` | partial | pending |
| 62-01-07 | 01 | 1 | P62-06 | type-check | `cd backend && npm run type-check && cd ../frontend && npm run type-check` | yes | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] Add or extend backend characterization coverage for encrypted-token-safe social auto-connect:
  `backend/test/integration/auto-connect-social.spec.ts`
- [ ] Add or extend backend social provisioning coverage:
  `backend/test/integration/social-login-provisioning.spec.ts`
- [ ] Add frontend auth proxy test file for multi-cookie forwarding and log redaction:
  recommended `frontend/pages/api/auth/[...all].test.ts`
- [ ] Add frontend org-switcher/session selection coverage:
  recommended `frontend/components/organizations/OrgSwitcher.test.tsx`
- [ ] Add frontend verification-aware signup coverage:
  recommended `frontend/pages/auth/register.test.tsx`
- [ ] Add Playwright scenarios for organization switching and verification-aware onboarding:
  recommended `frontend/e2e/organization-switching.spec.ts`
  recommended `frontend/e2e/verification-onboarding.spec.ts`

---

## Requirement Descriptions

| Req ID | Behavior | Test Coverage Target |
|--------|----------|----------------------|
| P62-01 | Better Auth `Account` rows are not a plaintext OAuth token dependency | `auto-connect-social.spec.ts` and `social-login-provisioning.spec.ts` characterize the replacement handoff |
| P62-02 | Google and Microsoft social login still auto-connect provider configs | backend integration tests plus manual Google/Microsoft verification |
| P62-03 | `/api/auth/*` proxy preserves all cookies and avoids secret logging | new frontend route tests around `frontend/pages/api/auth/[...all].ts` |
| P62-04 | HTTP, WebSocket, and org switcher agree on active organization | `active-org-guard.spec.ts`, `realtime-handshake.cookie.spec.ts`, new org switcher tests, Playwright org switching |
| P62-05 | Signup and onboarding behave correctly when verification is required | new register/verify/onboarding tests plus Playwright verification flow |
| P62-06 | Full remediation is type-safe and regression-checked | backend + frontend type-check, targeted suites, manual provider smoke checks |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Google social login still provisions provider config | P62-01, P62-02 | Requires real OAuth callback + cookies | Sign in with Google on 2026-03-10 build, complete onboarding, verify provider appears connected and sync can start |
| Microsoft social login still provisions provider config | P62-01, P62-02 | Requires real OAuth callback + cookies | Sign in with Microsoft, complete onboarding, verify provider appears connected and Graph-backed features are available |
| OAuth callback proxy forwards all cookies | P62-03 | Browser cookie handling differs from mocked fetch headers | Run Google/Microsoft callback through frontend proxy and inspect response cookies in browser devtools |
| Organization switch affects realtime context | P62-04 | Requires live websocket room reassignment | Switch org in UI, trigger a tenant-scoped realtime event, confirm only the active org receives updates |
| Unverified signup lands in verification-aware flow | P62-05 | Needs real cookie/session behavior | Sign up with email/password, confirm no dashboard redirect before email verification, then verify email and finish onboarding |

---

## Validation Sign-Off

- [ ] All tasks have automated coverage or explicit Wave 0 coverage tasks
- [ ] No auth proxy change ships without multi-cookie route tests
- [ ] No org-context change ships without both backend and browser validation
- [ ] No token-encryption change ships without social login characterization coverage
- [ ] Manual Google and Microsoft checks completed
- [ ] `nyquist_compliant: true` set in frontmatter once the matrix is complete

**Approval:** pending
