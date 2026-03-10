# Phase 65: Fix Next.js Middleware - Research

**Researched:** 2026-03-10
**Domain:** Next.js middleware convention (Pages Router)
**Confidence:** HIGH

## Summary

Next.js requires a file named `middleware.ts` (or `.js`) at the project root (next to `pages/`) exporting a function named `middleware` for server-side route interception. The project currently has the file named `proxy.ts` with an exported function `proxy()` -- Next.js silently ignores this entirely.

The correct file existed briefly (commit `2e905366` from Phase 60-01 renamed it properly), but commit `d01e981f` accidentally reverted it back to `proxy.ts` with `proxy()` export as part of an unrelated `.env.example` update. The logic inside the file is already correct and tested -- only the filename and export name are wrong.

**Primary recommendation:** Rename `frontend/proxy.ts` to `frontend/middleware.ts` and rename the exported function from `proxy()` to `middleware()`. No logic changes needed.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FEUI-04 | Protected routes redirect unauthenticated users to login | File rename + function rename activates existing redirect logic that Next.js currently ignores |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | ^16.1.6 | Framework -- middleware convention | Already installed |
| better-auth | ^1.5.4 | `getSessionCookie` for cookie check | Already used in proxy.ts |

No new dependencies needed. This is purely a rename operation.

## Architecture Patterns

### Next.js Middleware Convention (Pages Router)

**What:** Next.js auto-discovers `middleware.ts` at the project root (same level as `pages/`). The file MUST:
1. Be named exactly `middleware.ts` (or `.js`)
2. Export a function named `middleware` (named export, not default)
3. Optionally export a `config` object with a `matcher` array

**Current state (broken):**
```
frontend/
  proxy.ts          <-- WRONG: Next.js ignores this filename
  pages/
    dashboard/
    auth/
    ...
```

**Target state (working):**
```
frontend/
  middleware.ts     <-- CORRECT: Next.js auto-discovers this
  pages/
    dashboard/
    auth/
    ...
```

### The Exact Change Required

**File:** `frontend/proxy.ts` -> `frontend/middleware.ts`
**Function:** `export async function proxy(request)` -> `export async function middleware(request)`

The `config` export with `matcher` is already correct and needs no changes:
```typescript
export const config = {
  matcher: ["/dashboard/:path*", "/auth/:path*", "/onboarding"],
};
```

### Anti-Patterns to Avoid
- **Do NOT change any middleware logic** -- the redirect rules, cookie checks, and onboarding gate are all correct and tested.
- **Do NOT move the file to `src/`** -- this project uses Pages Router with `pages/` at frontend root, so middleware must also be at frontend root.
- **Do NOT add `default` export** -- Next.js expects a named `middleware` export.

## Don't Hand-Roll

Not applicable -- this phase is a trivial rename, no custom solutions involved.

## Common Pitfalls

### Pitfall 1: Changing Logic During Rename
**What goes wrong:** Temptation to "improve" the middleware while renaming leads to regressions.
**Why it happens:** The file is open, changes look harmless.
**How to avoid:** The logic was already reviewed and tested in Phases 55 and 60. Only change the filename and function name.

### Pitfall 2: Git Rename Detection
**What goes wrong:** Git may not detect the rename if content changes too much simultaneously.
**How to avoid:** Use `git mv` for the rename, then change the function name in a separate step (or same commit -- git handles small diffs fine).

### Pitfall 3: E2E Tests Assume Middleware Is Working
**What goes wrong:** The E2E tests in `frontend/e2e/middleware-redirects.spec.ts` test redirect behavior that currently does NOT work because middleware is dead code.
**How to avoid:** After the rename, these tests should pass. They are the verification mechanism.

## Code Examples

### Current File (proxy.ts) -- Only Two Lines Change

```typescript
// Line 11: rename function
export async function middleware(request: NextRequest) {  // was: proxy()
```

Everything else stays identical. The `config` export is already correct.

## Existing Test Coverage

### E2E Tests (frontend/e2e/middleware-redirects.spec.ts)
Already written and covers all success criteria:
1. Unauthenticated `/dashboard` -> redirect to `/auth/login?returnTo=/dashboard`
2. Unauthenticated `/onboarding` -> redirect to `/auth/login?returnTo=/onboarding`
3. No content flash on protected route redirect
4. Authenticated `/auth/login` -> redirect to `/dashboard`

### What Tests Don't Cover (manual verification needed)
- Non-onboarded user redirect from `/dashboard` to `/onboarding` (no E2E test for this case)
- `/dashboard/invitations/accept` exemption from onboarding redirect

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright |
| Config file | `frontend/playwright.config.ts` |
| Quick run command | `cd frontend && npx playwright test e2e/middleware-redirects.spec.ts` |
| Full suite command | `cd frontend && npx playwright test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FEUI-04a | Unauthenticated /dashboard redirects to /auth/login with returnTo | e2e | `cd frontend && npx playwright test e2e/middleware-redirects.spec.ts` | Yes |
| FEUI-04b | Non-onboarded users redirected from /dashboard to /onboarding | manual | Manual verification (no E2E test) | No |
| FEUI-04c | /dashboard/invitations/accept exempted from onboarding redirect | manual | Manual verification (no E2E test) | No |

### Sampling Rate
- **Per task commit:** `cd frontend && npx tsc --noEmit` (type-check)
- **Per wave merge:** `cd frontend && npx playwright test e2e/middleware-redirects.spec.ts`
- **Phase gate:** Type-check green + E2E middleware tests pass

### Wave 0 Gaps
None -- existing test infrastructure covers the primary requirement. The onboarding redirect and invitation exemption are logic that already exists in the file; they just need the file to be activated by Next.js.

## Open Questions

None. This is a well-understood, atomic fix with clear root cause (accidental revert in commit `d01e981f`).

## Sources

### Primary (HIGH confidence)
- **Codebase analysis:** `frontend/proxy.ts` -- current file contents verified
- **Git history:** Commits `2e905366` (correct rename) and `d01e981f` (accidental revert) traced
- **Next.js convention:** Pages Router middleware must be `middleware.ts` at project root with named `middleware` export -- established convention since Next.js 12, unchanged through v16

### Secondary (MEDIUM confidence)
- **E2E tests:** `frontend/e2e/middleware-redirects.spec.ts` -- test expectations match success criteria

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, pure rename
- Architecture: HIGH - Next.js middleware convention is well-established and unchanged
- Pitfalls: HIGH - root cause is clear (accidental git revert), fix is mechanical

**Research date:** 2026-03-10
**Valid until:** indefinite (Next.js middleware convention is stable)
