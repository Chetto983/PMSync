---
phase: 55-social-login-mfa
plan: 03
subsystem: ui
tags: [next.js, middleware, onboarding, stepper, mui, better-auth]

requires:
  - phase: 55-social-login-mfa/01
    provides: "better-auth social login plugins, SessionUser with onboardingComplete field"
provides:
  - "Next.js middleware enforcing onboarding for unauthenticated/incomplete users"
  - "OnboardingWizard container with 5-step MUI Stepper"
  - "StepProps interface for step components"
  - "Placeholder step components for type safety"
  - "Onboarding translations (en + it)"
affects: [55-social-login-mfa/04]

tech-stack:
  added: []
  patterns: ["Cookie-based onboarding gate in Edge middleware", "StepProps interface for wizard step components"]

key-files:
  created:
    - frontend/middleware.ts
    - frontend/pages/onboarding.tsx
    - frontend/components/onboarding/OnboardingWizard.tsx
    - frontend/components/onboarding/StepEmailProvider.tsx
    - frontend/components/onboarding/StepAvatar.tsx
    - frontend/components/onboarding/StepMfaSetup.tsx
  modified:
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts

key-decisions:
  - "Cookie-based onboarding check in middleware (no DB calls at Edge)"
  - "StepProps defined in types.ts, re-exported from OnboardingWizard"
  - "Cast session.user as SessionUser at page level for type safety"

patterns-established:
  - "Onboarding enforcement: middleware cookie check + page-level session validation"
  - "Wizard step pattern: StepProps interface with onComplete/onBack callbacks"

requirements-completed: [SEC-01, SEC-04]

duration: 6min
completed: 2026-03-09
---

# Phase 55 Plan 03: Onboarding Wizard & Middleware Summary

**Next.js middleware enforcing onboarding flow with MUI 5-step wizard container and cookie-based Edge redirect**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-09T14:47:32Z
- **Completed:** 2026-03-09T14:53:45Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Next.js middleware redirects unauthenticated users to login, non-onboarded users to /onboarding
- OnboardingWizard container with MUI Stepper (5 steps), navigation, completion logic
- StepProps interface exported for Plan 04 step component consumption
- Placeholder step components (EmailProvider, Avatar, MfaSetup) ensure clean TypeScript compilation
- Onboarding translations in English and Italian

## Task Commits

Each task was committed atomically:

1. **Task 1: Next.js middleware for onboarding enforcement** - `81b06238` (feat)
2. **Task 2: Onboarding page + OnboardingWizard container with stepper** - `ad0d6b21` (feat)

## Files Created/Modified
- `frontend/middleware.ts` - Edge middleware for auth and onboarding redirect
- `frontend/pages/onboarding.tsx` - Onboarding page with session check and wizard rendering
- `frontend/components/onboarding/OnboardingWizard.tsx` - Wizard container with stepper and step routing
- `frontend/components/onboarding/StepEmailProvider.tsx` - Placeholder step component
- `frontend/components/onboarding/StepAvatar.tsx` - Placeholder step component
- `frontend/components/onboarding/StepMfaSetup.tsx` - Placeholder step component
- `frontend/locales/en.ts` - English onboarding translations
- `frontend/locales/it.ts` - Italian onboarding translations
- `frontend/locales/index.ts` - AppTranslations type updated with onboarding section

## Decisions Made
- Cookie-based onboarding check in Edge middleware avoids DB calls; real validation happens in page via useSession()
- StepProps interface lives in `types.ts` and is re-exported from OnboardingWizard for convenience
- Session user cast to SessionUser at page level since better-auth client types don't include additionalFields

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed TS6133 unused stepData variable**
- **Found during:** Task 2 (OnboardingWizard)
- **Issue:** `stepData` declared but getter never read (only setter used)
- **Fix:** Renamed to `_stepData` to signal intentional unused getter
- **Files modified:** frontend/components/onboarding/OnboardingWizard.tsx
- **Verification:** `npx tsc --noEmit` passes for this file
- **Committed in:** ad0d6b21

**2. [Rule 3 - Blocking] Fixed TS2322 type mismatch on session.user**
- **Found during:** Task 2 (onboarding page)
- **Issue:** better-auth useSession() returns stripped type, not full SessionUser
- **Fix:** Added explicit cast `session.user as SessionUser`
- **Files modified:** frontend/pages/onboarding.tsx
- **Verification:** `npx tsc --noEmit` passes for this file
- **Committed in:** ad0d6b21

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for TypeScript compilation. No scope creep.

## Issues Encountered
- Pre-existing TS errors in `pages/api/onboarding/create-workspace.ts` and `locales/en.ts` (settings securityPanel) -- not caused by this plan, not fixed.
- Plan 02 had already created StepNameConfirm, StepWorkspace, and types.ts files in the onboarding directory; these were committed alongside Task 2 via git staging.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Wizard container ready for Plan 04 step component implementations
- StepProps interface available at `@/components/onboarding/types`
- Middleware enforces onboarding flow end-to-end

---
*Phase: 55-social-login-mfa*
*Completed: 2026-03-09*
