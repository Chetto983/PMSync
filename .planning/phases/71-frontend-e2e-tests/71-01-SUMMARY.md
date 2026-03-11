---
phase: 71-frontend-e2e-tests
plan: "01"
subsystem: e2e-infrastructure
tags: [playwright, seed, auth-setup, otplib, e2e]
dependency_graph:
  requires: []
  provides: [member-auth-state, seed-super-admin, seed-member-user, otplib-installed]
  affects: [71-02, 71-03, 71-04, 71-05]
tech_stack:
  added: [otplib@13.3.0]
  patterns: [playwright-storage-state, prisma-upsert-seed]
key_files:
  created:
    - frontend/e2e/auth.setup.member.ts
  modified:
    - backend/prisma/seed.ts
    - frontend/playwright.config.ts
    - frontend/package.json
decisions:
  - "memberRole param added to seedUser so admin keeps 'admin' org role while member gets 'member'"
  - "Setup testMatch narrowed to auth.setup.ts$ (exact) to prevent auth.setup.member.ts being picked up by the generic pattern"
  - "onboardingComplete defaults to false via ?? false — all existing callers unaffected without passing the param"
metrics:
  duration: "7min"
  completed_date: "2026-03-11"
  tasks_completed: 2
  files_modified: 4
---

# Phase 71 Plan 01: E2E Test Infrastructure Setup Summary

Seed + Playwright foundation for all Phase 71 E2E specs: super-admin role fix, member seed user, onboardingComplete pinning, member auth state, and otplib.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Fix seed.ts — super-admin role + member user + onboardingComplete | f7e5486c | backend/prisma/seed.ts |
| 2 | Create auth.setup.member.ts + update playwright.config.ts + install otplib | d6f0fd9f | frontend/e2e/auth.setup.member.ts, frontend/playwright.config.ts, frontend/package.json |

## What Was Built

**backend/prisma/seed.ts** — Three targeted changes:
- `admin@pmsync.local` role changed from `'admin'` to `'super-admin'` (admin panel pages gate on this exact value)
- `member@pmsync.local` added: role `'user'`, onboardingComplete `true`, org memberRole `'member'`
- `test@pmsync.local` now explicitly sets `onboardingComplete: false` in every upsert run
- `seedUser` params extended with `onboardingComplete?: boolean` (default `false`) and `memberRole?: string` (default `'member'`)

**frontend/e2e/auth.setup.member.ts** — Mirror of `auth.setup.ts` for `member@pmsync.local`. Saves storageState to `playwright/.auth/member.json`. Uses same cookie-consent initScript, same fill selectors, same dashboard URL assertion.

**frontend/playwright.config.ts** — `setup` testMatch narrowed to `/auth\.setup\.ts$/` (exact) to prevent the new member file being matched. New `setup-member` project added. All five browser/device projects (`chromium`, `firefox`, `webkit`, `mobile-chrome`, `mobile-safari`) updated to `dependencies: ['setup', 'setup-member']`.

**frontend/package.json** — `otplib@^13.3.0` added to devDependencies for TOTP code generation in security E2E tests.

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

- `backend/prisma/seed.ts`: `grep "super-admin"` returns admin user line
- `backend/prisma/seed.ts`: `grep "member@pmsync.local"` returns seed call + console log
- `backend/prisma/seed.ts`: `grep "onboardingComplete.*false"` returns default constant + test user explicit value + console note
- `frontend/playwright.config.ts`: `grep "setup-member"` returns project definition + 5 dependency declarations
- `frontend/package.json`: `grep "otplib"` returns `"otplib": "^13.3.0"`
- Backend TypeScript: clean (no errors)
- Frontend TypeScript: clean (no errors)

## Self-Check: PASSED

All files confirmed present. Both task commits confirmed in git history.
