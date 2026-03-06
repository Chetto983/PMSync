---
phase: 51-core-email-password-auth
plan: 01
subsystem: auth
tags: [better-auth, nodemailer, smtp, hibp, email-verification, password-reset]

requires:
  - phase: 50-schema-infrastructure
    provides: better-auth server config with HIBP hook, Prisma schema with User/Session tables
provides:
  - sendTransactionalEmail utility for SMTP email delivery
  - better-auth React client (authClient) for auth pages
  - Email verification callback on signup
  - Password reset callback via email
  - HIBP check on password reset path
affects: [51-02-page-rewiring, 52-oauth-providers]

tech-stack:
  added: [nodemailer, "@types/nodemailer"]
  patterns: [fire-and-forget email sending via void, SMTP env var configuration]

key-files:
  created:
    - frontend/lib/mail.ts
    - frontend/lib/auth-client.ts
  modified:
    - frontend/lib/auth.ts
    - frontend/.env.example
    - frontend/package.json

key-decisions:
  - "void before sendTransactionalEmail to avoid timing attacks (fire-and-forget per better-auth docs)"
  - "No baseURL on authClient -- same-origin Next.js avoids cookie handling issues"
  - "HIBP hook checks both password and newPassword fields via nullish coalescing for reset-password compatibility"

patterns-established:
  - "Fire-and-forget email pattern: void sendTransactionalEmail() in auth callbacks"
  - "SMTP configuration via env vars with sensible defaults (localhost:587, noreply@pmsync.local)"

requirements-completed: [CORE-01, CORE-02, CORE-04, CORE-05]

duration: 2min
completed: 2026-03-06
---

# Phase 51 Plan 01: Auth Server Wiring Summary

**Nodemailer SMTP transport + better-auth email verification/reset callbacks + HIBP on password reset + React auth client**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-06T20:46:45Z
- **Completed:** 2026-03-06T20:49:02Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Installed nodemailer and created sendTransactionalEmail utility with SMTP env var configuration
- Created better-auth React client (authClient) for use in auth pages
- Wired email verification and password reset callbacks into auth.ts using mail.ts
- Extended HIBP hook to intercept /reset-password path (checks both password and newPassword)
- Added SMTP env vars to .env.example

## Task Commits

Each task was committed atomically:

1. **Task 1: Install nodemailer + create mail utility + auth-client** - `bd5f4d64` (feat)
2. **Task 2: Wire email callbacks + HIBP reset-password into auth.ts** - `31610ad3` (feat)

## Files Created/Modified
- `frontend/lib/mail.ts` - Nodemailer transporter + sendTransactionalEmail function
- `frontend/lib/auth-client.ts` - better-auth React client for auth pages
- `frontend/lib/auth.ts` - Added emailVerification, sendResetPassword, requireEmailVerification, extended HIBP hook
- `frontend/.env.example` - Added SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL, SMTP_FROM_DOMAIN
- `frontend/package.json` - Added nodemailer + @types/nodemailer dependencies

## Decisions Made
- Used `void` before sendTransactionalEmail to avoid timing attacks (fire-and-forget per better-auth docs)
- No baseURL on authClient -- same-origin Next.js setup avoids cookie handling issues
- HIBP hook checks both `password` and `newPassword` fields via nullish coalescing for reset-password compatibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

SMTP configuration required for email delivery. Users must set in `frontend/.env.local`:
- `SMTP_HOST` - SMTP provider hostname
- `SMTP_PORT` - Usually 587 (TLS) or 465 (SSL)
- `SMTP_USER` - SMTP username
- `SMTP_PASSWORD` - SMTP password or app-specific password
- `SMTP_FROM_EMAIL` - Sender email prefix (default: noreply)
- `SMTP_FROM_DOMAIN` - Sender domain (default: pmsync.local)

## Next Phase Readiness
- auth.ts fully wired with email callbacks, ready for Plan 02 (page rewiring)
- authClient exported for React pages to call signIn, signUp, resetPassword
- No blockers

---
*Phase: 51-core-email-password-auth*
*Completed: 2026-03-06*
