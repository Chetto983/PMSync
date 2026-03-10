# Phase 60: Middleware & Auth Cleanup - Research

**Researched:** 2026-03-10
**Domain:** Next.js middleware, better-auth session cookies, auth instance consolidation
**Confidence:** HIGH

## Summary

This phase has four tightly-scoped tasks: (1) rename `proxy.ts` to `middleware.ts` with correct export name, (2) delete the duplicate frontend `auth.ts` server instance and rewire its single consumer, (3) align `cookieCache` config on the backend instance, and (4) add E2E Playwright tests validating redirect behavior against staging.

The existing `proxy.ts` already contains correct redirect logic -- the only reason it does not work is that Next.js requires the file to be named `middleware.ts` (or `.js`) at the project root and export a function named `middleware`. The current file exports `proxy()` which Next.js ignores entirely. This is a naming-only fix with zero logic changes beyond expanding the route matcher.

**Primary recommendation:** Rename file, rename export, expand matcher, delete auth.ts, enable cookieCache, write 4 E2E tests. No architectural changes needed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Enable `strategy: "compact"` on BOTH frontend and backend instances
- `maxAge: 300` (5 minutes) on both -- consistent behavior
- Backend `better-auth.instance.ts` currently has `enabled: false` -- change to `{ enabled: true, maxAge: 300, strategy: "compact" }`
- 5min session revocation delay is acceptable for a mail client
- Verify backend `better-auth.instance.ts` has feature parity (HIBP hooks, email verification sending) BEFORE deleting frontend `auth.ts`
- Delete `frontend/lib/auth.ts` entirely -- no re-export shim
- Grep all imports of `frontend/lib/auth.ts` and rewire to `auth-client.ts` or remove
- The catch-all API route `pages/api/auth/[...all].ts` is a pure proxy -- doesn't import auth.ts, no changes needed
- Rename `frontend/proxy.ts` to `frontend/middleware.ts`
- Rename exported function `proxy()` to `middleware()`
- Keep all three redirect behaviors (dashboard->login, dashboard->onboarding, auth->dashboard)
- Add `/onboarding` to route matcher -- protect with session check
- `returnTo` param set for ALL protected route redirects (dashboard + onboarding)
- Matcher becomes: `["/dashboard/:path*", "/auth/:path*", "/onboarding"]`
- Automated Playwright E2E test against deployed staging URL (Vercel + Railway)
- Four test scenarios specified in CONTEXT.md

### Claude's Discretion
- Playwright test file location and naming
- How to handle the no-content-flash assertion (timing vs DOM check)
- Whether to add staging URL as env var or hardcode in test config

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FEUI-04 | Protected routes redirect unauthenticated users to login | Middleware rename + correct export makes Next.js activate route protection; E2E tests validate redirect behavior |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | (project version) | Middleware runtime (Edge) | Next.js middleware auto-discovery requires `middleware.ts` at project root |
| better-auth | (project version) | Session cookies, cookieCache | `getSessionCookie` from `better-auth/cookies` for Edge-compatible cookie reading |
| @playwright/test | ^1.58.2 | E2E redirect validation | Already installed in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| better-auth/cookies | (bundled) | `getSessionCookie()` for Edge runtime | In middleware.ts only -- no DB access in Edge |

### Alternatives Considered
None -- all decisions are locked. No new libraries needed.

**Installation:**
```bash
# No new packages required -- all already installed
```

## Architecture Patterns

### Next.js Middleware Convention (CRITICAL)
**What:** Next.js auto-discovers `middleware.ts` (or `.js`) at the project root (same level as `pages/` or `app/`). The file MUST export a function named `middleware` (not `proxy`, not anything else). An optional `config` export with `matcher` array controls which routes trigger it.

**Why current setup is broken:** The file is named `proxy.ts` and exports `proxy()`. Next.js never loads it. Zero middleware runs. All `/dashboard/*` routes are unprotected at the server level.

**Fix:**
```
frontend/
  proxy.ts           --> DELETE (after rename)
  middleware.ts       --> NEW (renamed from proxy.ts)
  pages/
  lib/
    auth.ts           --> DELETE
    auth-client.ts    --> KEEP (no changes)
```

### Middleware Edge Runtime Constraints
**What:** Next.js middleware runs in the Edge Runtime, which has limited APIs (no Node.js `fs`, `crypto.createHash`, `PrismaClient`, etc.).

**Why it matters:** The middleware can ONLY do optimistic cookie-existence checks. No DB calls, no `auth.api.getSession()`. This is already correctly implemented in `proxy.ts` -- it uses `getSessionCookie(request)` which is a pure cookie parser.

**Key constraint for auth.ts deletion:** `frontend/lib/auth.ts` imports `PrismaClient`, `crypto`, and `nodemailer` -- all Node.js-only. It cannot run in Edge. The middleware correctly avoids importing it.

### cookieCache Alignment Pattern
**What:** better-auth's `cookieCache` stores session data in a signed cookie to avoid DB lookups on every request. The `strategy: "compact"` option minimizes cookie size by storing only essential fields.

**Backend current config:**
```typescript
cookieCache: {
  enabled: false,  // CHANGE TO: enabled: true, maxAge: 300, strategy: "compact"
}
```

**Frontend auth.ts current config (being deleted):**
```typescript
cookieCache: {
  enabled: true,
  maxAge: 5 * 60, // 5 min
  strategy: "compact",
}
```

**After this phase:** Only the backend instance exists, with `cookieCache: { enabled: true, maxAge: 300, strategy: "compact" }`.

### create-workspace.ts Rewiring
**What:** The only file importing `frontend/lib/auth.ts` (besides auth.ts itself) is `frontend/pages/api/onboarding/create-workspace.ts`. It uses `auth.api.getSession()` to validate the session server-side.

**Problem:** After deleting `auth.ts`, this import breaks.

**Solution:** This API route is a Next.js API route (runs on Node.js, not Edge). It can call the backend API directly to validate sessions. Two options:
1. Use `fetch` to call the backend `/api/auth/get-session` endpoint
2. Use the existing proxy pattern -- forward the request cookies to the backend and validate there

**Recommended approach:** Since `pages/api/auth/[...all].ts` already proxies to the backend, `create-workspace.ts` should validate the session by calling the backend's better-auth instance via HTTP. This avoids creating a second PrismaClient or importing server-only auth code in the frontend.

```typescript
// Instead of: import { auth } from '@/lib/auth';
// Use: fetch backend to validate session
const sessionRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/get-session`, {
  headers: { cookie: req.headers.cookie || '' },
});
const session = await sessionRes.json();
```

**Alternative (simpler):** The workspace creation itself could be moved to a backend endpoint. But that is out of scope -- the CONTEXT.md says to rewire imports, not restructure.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session cookie parsing in Edge | Custom cookie parsing | `getSessionCookie()` from `better-auth/cookies` | Handles signed cookies, domain matching |
| Session validation in middleware | DB query in Edge | Optimistic cookie check | Edge runtime cannot access DB |
| Content flash detection in E2E | Manual timing | `page.waitForURL()` + DOM absence check | Playwright's built-in navigation assertions handle this |

## Common Pitfalls

### Pitfall 1: Next.js Middleware File Must Be at Project Root
**What goes wrong:** Placing `middleware.ts` inside `pages/` or `src/` -- Next.js won't find it.
**Why it happens:** Confusion about Next.js file conventions.
**How to avoid:** File MUST be at `frontend/middleware.ts` (same level as `frontend/pages/`).
**Warning signs:** No redirect happening, middleware function never called.

### Pitfall 2: Edge Runtime Import Restrictions
**What goes wrong:** Importing Node.js modules (PrismaClient, crypto, nodemailer) in middleware.
**Why it happens:** After rewiring, someone might accidentally import the wrong module.
**How to avoid:** `middleware.ts` should ONLY import from `better-auth/cookies` and `next/server`. Nothing else.
**Warning signs:** Build error: "Module not found" or "X is not available in Edge Runtime".

### Pitfall 3: cookieCache Strategy Mismatch
**What goes wrong:** Frontend and backend use different cookieCache strategies, causing session deserialization failures.
**Why it happens:** Updating one but not the other.
**How to avoid:** After this phase, only one instance exists (backend). The frontend `auth.ts` is deleted entirely.

### Pitfall 4: Onboarding Cookie Not Set for Social Login Users
**What goes wrong:** Social login users who complete onboarding don't have `pmsync:onboarding-complete` cookie, causing redirect loops.
**Why it happens:** The onboarding cookie is set by the onboarding wizard, not by the auth flow.
**How to avoid:** Verify that the onboarding wizard sets this cookie. The middleware checks for it AFTER checking for a session cookie.
**Warning signs:** Infinite redirect between `/dashboard` and `/onboarding`.

### Pitfall 5: E2E Tests Against Staging Require No Auth State
**What goes wrong:** Tests use stored auth state from local setup, which doesn't work against staging.
**Why it happens:** Playwright config has a `setup` project that creates local auth state.
**How to avoid:** The middleware redirect tests should run WITHOUT stored auth state (unauthenticated). Override `storageState: { cookies: [], origins: [] }` for these specific tests.

## Code Examples

### Middleware Rename (the core fix)
```typescript
// frontend/middleware.ts
// Source: Next.js middleware docs + existing proxy.ts logic
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = getSessionCookie(request);
  const onboardingCookie = request.cookies.get("pmsync:onboarding-complete");

  // Protected routes: require session cookie
  if (pathname.startsWith("/dashboard") || pathname === "/onboarding") {
    if (!sessionCookie) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("returnTo", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Dashboard requires onboarding complete
    if (pathname.startsWith("/dashboard") && !onboardingCookie) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  // Auth routes: redirect authenticated users to dashboard
  if (pathname.startsWith("/auth/") && sessionCookie) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth/:path*", "/onboarding"],
};
```

### cookieCache Backend Update
```typescript
// In backend/src/common/auth/better-auth.instance.ts
// Change session.cookieCache from:
cookieCache: {
  enabled: false,
}
// To:
cookieCache: {
  enabled: true,
  maxAge: 300,
  strategy: "compact",
}
```

### create-workspace.ts Rewiring
```typescript
// frontend/pages/api/onboarding/create-workspace.ts
// Replace: import { auth } from '@/lib/auth';
// With: direct backend session validation via HTTP

const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const sessionRes = await fetch(`${backendUrl}/api/auth/get-session`, {
  headers: {
    cookie: req.headers.cookie || '',
  },
});

if (!sessionRes.ok) {
  return res.status(401).json({ error: 'Unauthorized' });
}

const { session, user } = await sessionRes.json();
if (!user) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

### E2E Test Pattern (Unauthenticated Redirect)
```typescript
// Recommended: frontend/e2e/middleware-redirects.spec.ts
import { test, expect } from '@playwright/test';

// No auth state for these tests
test.use({ storageState: { cookies: [], origins: [] } });

const stagingUrl = process.env.E2E_STAGING_URL;

test.describe('Middleware Redirects', () => {
  test('unauthenticated /dashboard redirects to /auth/login', async ({ page }) => {
    const targetUrl = stagingUrl || '';
    await page.goto(`${targetUrl}/dashboard`);
    await page.waitForURL(/\/auth\/login/);
    expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/dashboard');
  });

  test('no content flash on protected redirect', async ({ page }) => {
    const targetUrl = stagingUrl || '';
    // Navigate and immediately check -- server redirect means no dashboard content renders
    const response = await page.goto(`${targetUrl}/dashboard`);
    // Server-side redirect returns 307 status
    expect(page.url()).toContain('/auth/login');
    // Dashboard content should never have appeared
    await expect(page.locator('[data-testid="dashboard"]')).not.toBeVisible();
  });
});
```

## Feature Parity Verification (auth.ts vs backend instance)

Before deleting `frontend/lib/auth.ts`, confirmed the backend `better-auth.instance.ts` has full parity:

| Feature | frontend/lib/auth.ts | backend/better-auth.instance.ts | Parity |
|---------|---------------------|--------------------------------|--------|
| HIBP hooks (before middleware) | Lines 118-134 | Lines 372-393 | YES |
| Email verification sending | Lines 83-93 | Lines 275-280 | YES |
| Password reset sending | Lines 74-80 | Lines 270-273 | YES |
| Social providers (Google, Microsoft) | Lines 21-48 | Lines 211-243 | YES (backend has wider scopes) |
| twoFactor plugin | Lines 58-62 | Lines 253-257 | YES |
| passkey plugin | Lines 63-67 | Lines 258-262 | YES |
| additionalFields | Lines 106-114 | Lines 292-319 | YES |
| cookieCache | Lines 98-102 (enabled) | Lines 286-288 (disabled -- TO FIX) | After fix: YES |
| Workspace provisioning | Not present | Lines 50-122 (databaseHooks) | Backend is superior |
| Audit logging | Not present | Lines 362-371 (after hooks) | Backend is superior |
| Terms enforcement | Not present | Lines 388-393 (before hooks) | Backend is superior |

**Conclusion:** Backend instance is a strict superset. Safe to delete frontend auth.ts.

### Imports to Rewire After Deletion

| File | Current Import | Action |
|------|---------------|--------|
| `frontend/lib/auth.ts` | N/A (the file itself) | DELETE |
| `frontend/pages/api/onboarding/create-workspace.ts` | `import { auth } from '@/lib/auth'` | Rewire to HTTP call to backend |
| `frontend/lib/hibp.ts` | No import from auth.ts | No change needed (standalone utility) |
| `frontend/lib/mail.ts` | No import from auth.ts | DELETE (only used by auth.ts) |

**Note:** `frontend/lib/mail.ts` is ONLY used by `frontend/lib/auth.ts` (for `sendTransactionalEmail`). After auth.ts deletion, mail.ts becomes dead code and should also be deleted. Similarly, `frontend/lib/hibp.ts` is only imported by auth.ts -- it too becomes dead code.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.58.2 |
| Config file | `frontend/playwright.config.ts` |
| Quick run command | `cd frontend && npx playwright test e2e/middleware-redirects.spec.ts --project=chromium` |
| Full suite command | `cd frontend && npx playwright test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FEUI-04a | Unauth /dashboard -> /auth/login?returnTo=/dashboard | E2E | `npx playwright test e2e/middleware-redirects.spec.ts -g "unauthenticated /dashboard"` | Wave 0 |
| FEUI-04b | Authed /auth/login -> /dashboard | E2E | `npx playwright test e2e/middleware-redirects.spec.ts -g "authenticated /auth/login"` | Wave 0 |
| FEUI-04c | No content flash on redirect | E2E | `npx playwright test e2e/middleware-redirects.spec.ts -g "no content flash"` | Wave 0 |
| FEUI-04d | Unauth /onboarding -> /auth/login?returnTo=/onboarding | E2E | `npx playwright test e2e/middleware-redirects.spec.ts -g "unauthenticated /onboarding"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx playwright test e2e/middleware-redirects.spec.ts --project=chromium`
- **Per wave merge:** Full Playwright suite
- **Phase gate:** All 4 redirect scenarios pass against staging

### Wave 0 Gaps
- [ ] `frontend/e2e/middleware-redirects.spec.ts` -- covers FEUI-04 (all 4 scenarios)
- [ ] `E2E_STAGING_URL` env var -- needed for staging validation

## Open Questions

1. **create-workspace.ts: HTTP call vs restructure**
   - What we know: The file uses `auth.api.getSession()` from the frontend auth instance. After deletion, it needs a different session validation method.
   - What's unclear: Whether `fetch` to backend `/api/auth/get-session` is the cleanest approach, or if the entire workspace creation should move to a backend NestJS endpoint.
   - Recommendation: Use HTTP call to backend for session validation (minimal change, stays in scope). Moving the endpoint to NestJS is a larger refactor for a future phase.

2. **Dead code after auth.ts deletion: hibp.ts and mail.ts**
   - What we know: Both `frontend/lib/hibp.ts` and `frontend/lib/mail.ts` are only imported by `frontend/lib/auth.ts`. After deletion, they become orphaned.
   - Recommendation: Delete both as part of the cleanup. No other consumers exist.

3. **E2E staging URL configuration**
   - What we know: Playwright config already uses `E2E_BASE_URL` env var. Staging tests need a different URL.
   - Recommendation: Use `E2E_STAGING_URL` env var for staging-specific tests. Fall back to `E2E_BASE_URL` or `baseURL` from config. Do not hardcode.

## Sources

### Primary (HIGH confidence)
- `frontend/proxy.ts` -- current middleware code (read directly)
- `frontend/lib/auth.ts` -- duplicate auth instance to delete (read directly)
- `frontend/lib/auth-client.ts` -- client auth that stays (read directly)
- `backend/src/common/auth/better-auth.instance.ts` -- canonical backend instance (read directly)
- `frontend/pages/api/onboarding/create-workspace.ts` -- only consumer of auth.ts (read directly)
- `frontend/playwright.config.ts` -- existing E2E config (read directly)
- `frontend/e2e/auth.spec.ts` -- existing auth E2E patterns (read directly)
- Next.js middleware docs (well-known convention: file must be `middleware.ts` at project root with `middleware()` export)

### Secondary (MEDIUM confidence)
- better-auth cookieCache `strategy: "compact"` -- documented in CONTEXT.md as "2026 recommended default"
- `getSessionCookie` from `better-auth/cookies` -- used in existing code, verified Edge-compatible

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, all existing
- Architecture: HIGH - rename file + delete file + config change, all verified against source
- Pitfalls: HIGH - well-understood Next.js middleware conventions
- E2E patterns: MEDIUM - staging URL testing needs env config, content flash assertion approach TBD

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable domain, no fast-moving dependencies)
