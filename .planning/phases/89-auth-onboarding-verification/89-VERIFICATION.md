---
phase: 89-auth-onboarding-verification
verified: 2026-03-20T11:00:00Z
status: human_needed
score: 16/16 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 14/16
  gaps_closed:
    - "Registration shows error for weak password — auth-register.spec.ts now contains 6 tests including 'shows error for weak password' at line 74 with backend health skip guard, '123' password, and .MuiAlert-colorError assertion"
    - "Onboarding MFA divergence — acknowledged as documentation gap; no code fix required; existing test correctly validates mandatory MFA behavior"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Run full auth E2E suite against Railway backend"
    expected: "All 47 tests pass (37 currently verified offline, 10 skip-guarded will run including new weak-password test)"
    why_human: "Tests require a live backend with seeded users (admin@pmsync.local) and working database. Cannot verify execution without live infrastructure."
  - test: "Verify onboarding wizard MFA mandatory behavior is intentional product decision"
    expected: "New user completing onboarding cannot click 'Get Started' without configuring at least one MFA method. Button remains disabled."
    why_human: "Plan-02 originally described step 6 as 'can skip and finish' but actual component code (canFinish = totpConfigured || passkeyConfigured) makes MFA mandatory. Needs product owner confirmation this is intentional, not a regression."
---

# Phase 89: Auth Onboarding Verification — Re-Verification Report

**Phase Goal:** E2E Playwright tests covering auth flows (login, register, forgot/reset password, verify email, 2FA, OAuth buttons) and onboarding wizard steps, plus API-level profile endpoint tests. Gap closure for weak-password test.
**Verified:** 2026-03-20T11:00:00Z
**Status:** human_needed (all automated checks pass; 2 items require live infrastructure or product owner confirmation)
**Re-verification:** Yes — after gap closure via Plan 03

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Login with valid credentials redirects to /dashboard | VERIFIED | `auth-login.spec.ts` L49-62: backend-skip guarded, waitForURL(/\/(dashboard\|onboarding)/) |
| 2 | Login with invalid credentials shows error message | VERIFIED | `auth-login.spec.ts` L30-41: asserts `.MuiAlert-colorError` visible |
| 3 | Registration creates user and shows verification pending UI | VERIFIED | `auth-register.spec.ts` now has 6 tests including weak-password test at L74 |
| 4 | Forgot password form submits and shows success state | VERIFIED | `auth-forgot-password.spec.ts` L22-35: asserts back-to-login link visible |
| 5 | Reset password page shows error for missing token | VERIFIED | `auth-reset-password.spec.ts` L15-29: asserts `.MuiAlert-colorError` + /missing reset token/i |
| 6 | Verify email page shows resend form when no token provided | VERIFIED | `auth-verify-email.spec.ts` L15-23: asserts email input + send button visible |
| 7 | 2FA setup captures TOTP secret and verifies code successfully | VERIFIED | `auth-2fa.spec.ts` L59-149: registers fresh user, extracts totpURI, generates TOTP via otplib |
| 8 | OAuth login buttons (Google, Microsoft) render on login page | VERIFIED | `auth-login.spec.ts` L23-28: getByRole buttons for /google/i and /microsoft/i |
| 9 | GET /api/v1/users/me returns user profile with email field | VERIFIED | `auth-profile-api.spec.ts` L22-28: asserts body.id and body.email present |
| 10 | PUT /api/v1/users/me updates firstName successfully | VERIFIED | `auth-profile-api.spec.ts` L30-50: PUT with firstName, asserts updated value, restores |
| 11 | GET /api/v1/users/me/preferences returns preferences object | VERIFIED | `auth-profile-api.spec.ts` L52-58: asserts typeof body === 'object' |
| 12 | PATCH /api/v1/users/me/preferences updates preference values | VERIFIED | `auth-profile-api.spec.ts` L60-78: PATCH with { language: 'it' }, CSRF header |
| 13 | GET /api/v1/users/me/dashboard-preferences returns dashboard layout | VERIFIED | `auth-profile-api.spec.ts` L80-83: response.ok() asserted |
| 14 | DELETE /api/v1/users/me/ai-memory returns success | VERIFIED | `auth-profile-api.spec.ts` L126-134: DELETE with CSRF, asserts status 200-299 |
| 15 | Onboarding wizard completes all 6 steps and redirects to /dashboard | VERIFIED | `onboarding.spec.ts` L360-447: full wizard walkthrough including TOTP setup, waitForURL('**/dashboard**') |
| 16 | Onboarding wizard shows validation errors when required fields are skipped | VERIFIED | Legal consent: submit disabled without checkboxes. Name: submit disabled when empty. MFA: finish disabled without method. All present and correct. |

**Score: 16/16 truths verified**

---

## Gap Closure Verification (Plan 03)

### Gap 1: Missing weak-password validation test

**Previous status:** FAILED — auth-register.spec.ts had 5 tests; plan required 6.

**Current status:** CLOSED

Verification performed against `frontend/e2e/auth-register.spec.ts`:

- `npx playwright test e2e/auth-register.spec.ts --list` shows 6 tests in chromium project (confirmed)
- "shows error for weak password" present at line 74
- Backend health skip guard present: `test.skip(!probe?.ok, 'Backend API not reachable -- skipping weak password test')`
- Password value `'123'` used for both password and confirm fields
- Assertion: `await expect(page.locator('.MuiAlert-colorError')).toBeVisible({ timeout: 15_000 })`
- No `page.waitForTimeout()` calls
- Original 5 tests unchanged (lines 15, 29, 60, 92, 113 match previous verification)
- All acceptance criteria from Plan 03 satisfied

### Gap 2: Plan-reality divergence on MFA mandatory requirement

**Previous status:** PARTIAL — plan truth said "can skip and finish"; actual code makes MFA mandatory.

**Current status:** ACKNOWLEDGED (no code fix warranted)

The existing test at `onboarding.spec.ts` correctly validates that `canFinish = totpConfigured || passkeyConfigured`. The plan truth wording was inaccurate to production behavior. No regression; behavior is consistent with previous verification findings. Confirmation of intentionality remains a human verification item.

---

## Required Artifacts

| Artifact | Min Lines | Actual Lines | Status | Details |
|----------|-----------|--------------|--------|---------|
| `frontend/e2e/auth-login.spec.ts` | 50 | 80 | VERIFIED | 8 tests (was 7 — regression check: count grew; all original tests intact) |
| `frontend/e2e/auth-register.spec.ts` | 120 | 136 | VERIFIED | 6 tests, weak-password test at L74, contains "weak password" string |
| `frontend/e2e/auth-forgot-password.spec.ts` | 30 | 59 | VERIFIED | 4 tests |
| `frontend/e2e/auth-reset-password.spec.ts` | 30 | 75 | VERIFIED | 4 tests |
| `frontend/e2e/auth-verify-email.spec.ts` | 30 | 55 | VERIFIED | 3 tests |
| `frontend/e2e/auth-2fa.spec.ts` | 60 | 150 | VERIFIED | 5 tests (regression check: count grew; original tests intact) |
| `frontend/e2e/auth-profile-api.spec.ts` | 80 | 148 | VERIFIED | 10 tests, getCsrfToken helper, X-CSRF-Token on mutations |
| `frontend/e2e/onboarding.spec.ts` | 100 | 551 | VERIFIED | 11 tests, rewritten without execSync/prisma seed |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `auth-register.spec.ts` | `/auth/register` weak-password path | `page.goto('/auth/register')` + fill '123' + `.MuiAlert-colorError` | WIRED | L79-89: navigates, fills, submits, asserts error |
| `auth-login.spec.ts` | `/auth/login` page | `page.goto('/auth/login')` | WIRED | All tests navigate to /auth/login |
| `auth-2fa.spec.ts` | `otplib` | `import { TOTP, NobleCryptoPlugin, ScureBase32Plugin }` + `generateTotpCode()` | WIRED | Import at L2, function at L10-17, used at L139 |
| `auth-profile-api.spec.ts` | `/api/v1/users/me` endpoints | `request.get/put/patch/delete(...)` | WIRED | 16 direct API calls across 10 tests |
| `onboarding.spec.ts` | `/onboarding` wizard | `registerAndLogin()` → `waitForURL(/onboarding/)` | WIRED | Navigation via login redirect to /onboarding for fresh users |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BAPI-01 | Plans 01 + 03 | All auth flows (login, register, forgot-password, reset-password, verify-email, 2FA, OAuth) | SATISFIED | 6 spec files cover all flows; weak-password test closes final gap in registration coverage |
| FE-01 | Plans 01 + 03 | Auth pages render and function | SATISFIED | All 6 auth page specs present with navigation, form interaction, and assertion coverage |
| BAPI-24 | Plan 02 | Profile operations (get/update/avatar/preferences/dashboard-prefs/ai-memory) | SATISFIED | auth-profile-api.spec.ts covers all 10 endpoints |
| FE-02 | Plan 02 | Onboarding wizard completes all steps | SATISFIED | onboarding.spec.ts covers all 6 steps with validation, back-nav, and full TOTP happy path |

No orphaned requirements: REQUIREMENTS.md maps only BAPI-01, BAPI-24, FE-01, FE-02 to Phase 89 (confirmed at lines 128, 151, 153, 154). All four are marked complete.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `auth-register.spec.ts` | — | Weak-password test uses server-side validation (better-auth rejects '123') — requires live backend to execute | Info | Test is skip-guarded; deliberate design for offline environments. Not a blocker. |
| All auth specs | multiple | 10 tests use `test.skip()` backend health probe guard | Info | Deliberate offline-safe design. Tests execute against live backend. Not a blocker. |
| `onboarding.spec.ts` | 30 | Module-level `const timestamp = Date.now()` shared across all tests | Warning | Shared FRESH_USER_EMAIL across tests acceptable with `workers: 1` config. Not a blocker. |

---

## Human Verification Required

### 1. Execute Full Suite Against Live Backend

**Test:** Set `E2E_API_URL=https://<railway-backend>` and `E2E_BASE_URL=https://<railway-frontend>`, then run:
```bash
cd frontend && npx playwright test e2e/auth-login.spec.ts e2e/auth-register.spec.ts e2e/auth-forgot-password.spec.ts e2e/auth-reset-password.spec.ts e2e/auth-verify-email.spec.ts e2e/auth-2fa.spec.ts e2e/auth-profile-api.spec.ts e2e/onboarding.spec.ts --project=chromium
```
**Expected:** All tests pass; the new weak-password test (test 4 of 6 in auth-register.spec.ts) executes and the backend returns a validation error for password '123'.
**Why human:** Requires live Railway backend with seeded users (admin@pmsync.local) and working database + Redis. Cannot verify skip-guarded tests without live infrastructure.

### 2. Verify Onboarding MFA Mandatory Behavior is Intentional

**Test:** Start onboarding as a fresh user. Attempt to click "Get Started" on step 6 (MFA) without setting up any MFA method.
**Expected:** Button remains disabled; warning "must configure at least one method" or similar is visible. This is the current code behavior (`canFinish = totpConfigured || passkeyConfigured`).
**Why human:** Plan-02 truth originally described step 6 as "can skip and finish". The actual component makes MFA mandatory. Needs product owner confirmation this is intentional product behavior and not a regression from a previous sprint.

---

## Gaps Summary

No gaps remaining. Both gaps from the initial verification have been resolved:

- Gap 1 (missing weak-password test): Closed by Plan 03. `auth-register.spec.ts` now contains exactly 6 tests matching all acceptance criteria.
- Gap 2 (MFA plan-reality divergence): Acknowledged as a plan truth wording issue. The existing test correctly reflects application behavior. No code change warranted.

Two items remain as human verification requirements due to infrastructure constraints, not code defects.

---

_Verified: 2026-03-20T11:00:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification: Yes (initial: gaps_found 14/16 → re-verification: human_needed 16/16)_
