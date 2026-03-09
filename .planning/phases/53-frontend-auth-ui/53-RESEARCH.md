# Phase 53: Frontend Auth UI - Research

**Researched:** 2026-03-09
**Domain:** better-auth React client, better-auth-ui shadcn components, Next.js Pages Router middleware
**Confidence:** HIGH

## Summary

Phase 53 replaces the custom auth layer (Zustand auth-store, AuthContext, /auth/me polling, hand-rolled login/register pages) with better-auth's React client (`useSession` hook) and better-auth-ui's pre-built shadcn components (`AuthView`). The existing `authClient` from `better-auth/react` is already created in `lib/auth-client.ts` with no baseURL (same-origin). The migration touches ~20 files that import `useAuth`, `useAuthStore`, or `AuthContext`.

Route protection moves from the client-side `RouteGuard` component (which flashes a spinner before redirecting) to Next.js middleware using `getSessionCookie` from `better-auth/cookies` for optimistic server-side redirects. This eliminates the protected-content flash entirely.

**Primary recommendation:** Install `@daveyplate/better-auth-ui`, wrap `_app.tsx` with `AuthUIProvider`, create a single dynamic `pages/auth/[authView].tsx` page, replace all `useAuth()`/`useAuthStore` consumers with `authClient.useSession()`, add `middleware.ts` for server-side route protection, then delete all old auth files.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use better-auth-ui pre-built shadcn components (`<SignIn />`, `<SignUp />`) -- no custom forms
- Centered card layout with PMSync logo above the card (current pattern preserved)
- Wrap better-auth-ui in MUI ThemeProvider so fonts and colors match dashboard
- Delete old MUI auth pages and replace with new better-auth-ui pages (clean start)
- Replace AuthContext + auth-store + /auth/me with `useSession()` from better-auth/react
- Session provider lives in `_app.tsx` top-level (replaces current AuthProvider in same spot)
- Full-page spinner/skeleton during session validation on page load (prevents flash of login for authenticated users)
- On session expiry mid-task: soft redirect with toast/modal "Session expired" + return URL preserved
- Next.js middleware (`middleware.ts`) checks for better-auth session cookie server-side -- no flash of protected content
- Protected: everything under `/dashboard/*` requires session
- Public: `/auth/*`, `/` (landing), API routes, `_next/` assets
- Return URL: redirect to `/auth/login?returnTo=/original/path` -- after login, redirect back
- Authenticated users hitting `/auth/*` pages auto-redirect to `/dashboard`
- Delete all old auth files: `auth-store.ts`, `auth-context.tsx`, `use-auth.ts`
- Delete old auth pages: `login.tsx`, `register.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `verify-email.tsx`, `oauth-callback.tsx`
- Replace apiClient 401 interceptor with better-auth aware handler (`authClient.signOut()` + redirect to `/auth/login?returnTo=...`)
- Update all consumers of old User type / useAuth / AuthContext to use better-auth useSession
- Update e2e tests (`auth.setup.ts`, `auth.spec.ts`) to use better-auth sign-in flow

### Claude's Discretion
- Exact spinner/skeleton design for session loading state
- Toast vs modal for session expiry notification
- better-auth-ui component configuration options (field order, social buttons, terms link)
- Middleware cookie validation approach (cookie existence check vs session verification)

### Deferred Ideas (OUT OF SCOPE)
- Google OAuth social login button on auth pages -- Phase 55 (CORE-03)
- 2FA/TOTP setup during login -- Phase 55 (SEC-01, SEC-02)
- Passkey authentication option -- Phase 55 (SEC-03)
- Organization selector after login -- Phase 56 (ORG-04)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FEUI-01 | User sees login/signup pages built with better-auth-ui components | `@daveyplate/better-auth-ui` provides `AuthView` component; dynamic route `pages/auth/[authView].tsx` renders sign-in/sign-up/forgot-password/reset-password |
| FEUI-02 | User session managed via better-auth/react hooks (useSession) | `authClient.useSession()` returns `{ data, isPending, error, refetch }`; replaces AuthContext+/auth/me pattern |
| FEUI-03 | Auth context replaced with better-auth client (no Zustand auth store) | Delete `auth-store.ts`, `auth-context.tsx`, `use-auth.ts`; all 20 consumers switch to `authClient.useSession()` |
| FEUI-04 | Protected routes redirect unauthenticated users to login | `middleware.ts` using `getSessionCookie()` from `better-auth/cookies` for server-side redirect |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-auth` | ^1.5.4 | Auth framework (already installed) | Already the project's auth backend |
| `@daveyplate/better-auth-ui` | latest | Pre-built shadcn auth components | Official better-auth UI companion; provides SignIn, SignUp, ForgotPassword, ResetPassword |
| `better-auth/react` | (part of better-auth) | React client with `useSession` hook | Framework-specific hooks with reactive session state |
| `better-auth/cookies` | (part of better-auth) | `getSessionCookie` for middleware | Verified available in installed version |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sonner` | latest | Toast notifications | Session expiry notification; better-auth-ui defaults to Sonner for toasts |

### Already Present (No Install)
| Library | Purpose |
|---------|---------|
| `next` ^16.1.6 | Framework, Pages Router + middleware |
| `tailwindcss` 4.1.18 | Styling (better-auth-ui requires it) |
| shadcn/ui components | Card, Button, Input etc already in `components/ui/` |
| MUI | ThemeProvider wrapping for consistent fonts/colors |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@daveyplate/better-auth-ui` | Hand-roll forms with shadcn primitives | More work, less maintained, CONTEXT.md locks to better-auth-ui |
| `getSessionCookie` in middleware | `auth.api.getSession()` full validation | Full validation requires HTTP call in middleware (slow); optimistic cookie check + server-side validation in pages is the recommended pattern |

**Installation:**
```bash
cd frontend && npm install @daveyplate/better-auth-ui@latest sonner
```

## Architecture Patterns

### Recommended File Changes
```
frontend/
├── middleware.ts                          # NEW: route protection
├── pages/
│   ├── _app.tsx                          # MODIFY: AuthUIProvider replaces AuthProvider
│   ├── auth/
│   │   ├── [authView].tsx                # NEW: dynamic route for all auth views
│   │   ├── login.tsx                     # DELETE
│   │   ├── register.tsx                  # DELETE
│   │   ├── forgot-password.tsx           # DELETE
│   │   ├── reset-password.tsx            # DELETE
│   │   ├── verify-email.tsx              # DELETE
│   │   └── oauth-callback.tsx            # DELETE
├── lib/
│   ├── auth-client.ts                    # MODIFY: export useSession, add type inference
│   ├── hooks/
│   │   └── use-auth.ts                   # DELETE
│   ├── context/
│   │   ├── auth-context.tsx              # DELETE
│   │   └── auth-context.test.tsx         # DELETE
│   └── api-client.ts                     # MODIFY: 401 interceptor uses authClient.signOut()
├── stores/
│   ├── auth-store.ts                     # DELETE
│   └── auth-store.test.ts               # DELETE
├── styles/
│   └── globals.css                       # MODIFY: add better-auth-ui import
├── tailwind.config.ts                    # MODIFY: add better-auth-ui content path (TW v4)
├── e2e/
│   ├── auth.setup.ts                     # MODIFY: use better-auth session cookie
│   ├── auth.spec.ts                      # MODIFY: update selectors for better-auth-ui forms
│   └── fixtures.ts                       # MODIFY: update cookie name, remove /auth/me mock
└── [20 consumer files]                   # MODIFY: useAuth() -> authClient.useSession()
```

### Pattern 1: AuthUIProvider in _app.tsx (Pages Router)

**What:** Wrap the app with `AuthUIProvider` from `@daveyplate/better-auth-ui`, passing the existing `authClient`, Next.js router navigation functions, and `Link` component.

**When to use:** Pages Router setup (this project uses Pages Router).

```tsx
// pages/_app.tsx
import { AuthUIProvider } from "@daveyplate/better-auth-ui"
import { useRouter } from "next/router"
import Link from "next/link"
import { authClient } from "@/lib/auth-client"

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()

  return (
    <QueryProvider>
      <NextThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <MaterialThemeWrapper>
          <ToastProvider>
            <AuthUIProvider
              authClient={authClient}
              navigate={router.push}
              replace={router.replace}
              Link={Link}
            >
              <Component {...pageProps} />
            </AuthUIProvider>
          </ToastProvider>
        </MaterialThemeWrapper>
      </NextThemeProvider>
    </QueryProvider>
  )
}
```

**Key:** AuthUIProvider replaces both `AuthProvider` and `RouteGuard`. Route protection is handled by middleware.ts now.

### Pattern 2: Dynamic Auth Route (Pages Router)

**What:** Single dynamic page handles all auth views (sign-in, sign-up, forgot-password, reset-password, etc.)

```tsx
// pages/auth/[authView].tsx
import { AuthView, authViewPaths } from "@daveyplate/better-auth-ui"
import { GetStaticPaths, GetStaticProps } from "next"
import Image from "next/image"
import { Box, Container } from "@mui/material"

export default function AuthPage({ path }: { path: string }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', py: 6 }}>
      <Container maxWidth="sm">
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
          <Image src="/Logo PMSync.svg" alt="PMSync logo" width={150} height={150} priority />
        </Box>
        <AuthView path={path} />
      </Container>
    </Box>
  )
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: Object.values(authViewPaths).map((path) => ({ params: { authView: path } })),
  fallback: false,
})

export const getStaticProps: GetStaticProps = async ({ params }) => ({
  props: { path: params?.authView as string },
})
```

**Note:** The default auth paths are: `sign-in`, `sign-up`, `forgot-password`, `reset-password`, `sign-out`, `callback`. The CONTEXT.md says URLs should be `/auth/login` -- use `viewPaths` prop on `AuthUIProvider` to remap: `viewPaths={{ "sign-in": "login", "sign-up": "register" }}`.

### Pattern 3: useSession Replacing useAuth

**What:** Replace all `useAuth()` calls with `authClient.useSession()`.

```tsx
// BEFORE (old pattern):
import { useAuth } from '@/lib/hooks/use-auth';
const { user, isAuthenticated, isLoading } = useAuth();
// user.firstName, user.email, user.tenantId, etc.

// AFTER (better-auth pattern):
import { authClient } from '@/lib/auth-client';
const { data: session, isPending } = authClient.useSession();
// session?.user.firstName, session?.user.email, session?.user.tenantId
// session?.user is the full user object with additionalFields (firstName, lastName, role, tenantId)
```

**Critical shape difference:** better-auth `useSession` returns `{ data: { user, session }, isPending, error }` where `data.user` has `name`, `email`, `image`, and any `additionalFields`. The old `User` type has `firstName`, `lastName`, `avatarUrl`, `role`, `tenantId`. Since `additionalFields` in `lib/auth.ts` defines `firstName`, `lastName`, `role`, `tenantId`, these should be available on `session.user`. The `avatarUrl` maps to `session.user.image` in better-auth.

### Pattern 4: Next.js Middleware for Route Protection

**What:** Server-side route protection using `getSessionCookie` from `better-auth/cookies`.

```ts
// frontend/middleware.ts
import { NextRequest, NextResponse } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const sessionCookie = getSessionCookie(request)

  // Protected routes: require session
  if (pathname.startsWith("/dashboard")) {
    if (!sessionCookie) {
      const loginUrl = new URL("/auth/login", request.url)
      loginUrl.searchParams.set("returnTo", pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // Auth routes: redirect authenticated users to dashboard
  if (pathname.startsWith("/auth/") && sessionCookie) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth/:path*"],
}
```

**Security note:** `getSessionCookie` only checks cookie existence, not validity. This is fine for UX redirects -- actual session validation happens in the React `useSession` hook on the client and in NestJS guards on the API.

### Pattern 5: 401 Interceptor Update

**What:** Replace Zustand-based logout with `authClient.signOut()` in the API client 401 handler.

```ts
// lib/api-client.ts -- updated 401 handler
import { authClient } from '@/lib/auth-client';

// In the 401 interceptor, replace:
//   useAuthStore.getState().logout();
// With:
authClient.signOut().then(() => {
  const returnTo = window.location.pathname;
  window.location.href = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
});
```

### Anti-Patterns to Avoid
- **Keeping /auth/me polling alongside useSession:** better-auth's useSession handles session state entirely. Don't also poll /auth/me.
- **Calling `auth.api.getSession()` in middleware:** This makes an HTTP call on every page load. Use optimistic cookie check instead.
- **Importing from `better-auth/client` instead of `better-auth/react`:** The React-specific import provides hooks; the vanilla client does not.
- **Setting `baseURL` on authClient:** Auth API is same-origin Next.js. Setting baseURL breaks cookie handling.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth forms (login, signup, forgot-password) | Custom MUI forms | `@daveyplate/better-auth-ui` `AuthView` | Handles validation, loading states, error display, field order; locked decision |
| Session state management | Zustand store + Context + /auth/me | `authClient.useSession()` | Reactive, automatic refetch, atomic signal updates |
| Route protection | Client-side RouteGuard component | `middleware.ts` + `getSessionCookie` | Eliminates flash of protected content |
| Auth page routing | Individual page files | Dynamic `[authView].tsx` route | Single file handles sign-in, sign-up, forgot-password, reset-password |

**Key insight:** The entire old auth layer (AuthProvider, AuthContext, auth-store, use-auth, /auth/me, RouteGuard, 6 auth pages) is replaced by 3 things: AuthUIProvider in _app.tsx, [authView].tsx dynamic page, and middleware.ts.

## Common Pitfalls

### Pitfall 1: User Type Shape Mismatch
**What goes wrong:** Old `User` type has `firstName`, `lastName`, `avatarUrl`. better-auth session user has `name`, `image` as base fields, with `firstName`, `lastName` as additionalFields.
**Why it happens:** better-auth uses `name` (full name) as its standard field, not separate first/last.
**How to avoid:** Since `additionalFields` in `lib/auth.ts` defines `firstName` and `lastName`, they ARE available on the session user. BUT `avatarUrl` is NOT defined as an additionalField -- better-auth uses `image` instead. Create a thin adapter or update all `user.avatarUrl` references to `user.image`.
**Warning signs:** TypeScript errors about `avatarUrl` not existing on session user type.

### Pitfall 2: better-auth-ui Default Paths vs Existing URLs
**What goes wrong:** better-auth-ui defaults to `/auth/sign-in` and `/auth/sign-up`. The project uses `/auth/login` and `/auth/register`.
**Why it happens:** Different URL conventions.
**How to avoid:** Configure `viewPaths` on `AuthUIProvider`: `viewPaths={{ "sign-in": "login", "sign-up": "register" }}`. Also update `getStaticPaths` to use the remapped values. Update all internal links and redirects.
**Warning signs:** 404 on `/auth/login` or redirect loops.

### Pitfall 3: Tailwind v4 CSS Import for better-auth-ui
**What goes wrong:** better-auth-ui styles don't load.
**Why it happens:** Tailwind v4 requires `@import` in CSS, not content array in config.
**How to avoid:** Add `@import "@daveyplate/better-auth-ui/css";` to `styles/globals.css`. Do NOT add content path to `tailwind.config.ts` -- that's the v3 approach.
**Warning signs:** Auth forms render with broken/missing styles.

### Pitfall 4: Cookie Name Mismatch in E2E Tests
**What goes wrong:** E2E tests inject `access_token` cookie but better-auth uses `better-auth.session_token`.
**Why it happens:** Old JWT system used `access_token`; better-auth has its own cookie naming.
**How to avoid:** Update `e2e/fixtures.ts` to inject `better-auth.session_token` cookie. Also remove the `/auth/me` mock -- it's no longer called.
**Warning signs:** E2E tests always redirect to login page.

### Pitfall 5: CSRF Token Endpoint Removal
**What goes wrong:** apiClient still tries to fetch CSRF token from `/auth/csrf-token` which may not exist in better-auth.
**Why it happens:** Old auth system had a custom CSRF endpoint.
**How to avoid:** Verify whether better-auth handles CSRF internally (it does via double-submit cookie pattern). The apiClient CSRF interceptor may need updating or removal if the old endpoint no longer exists. better-auth mutations go through `authClient` (not `apiClient`), so CSRF for auth is handled. CSRF for NestJS API calls is a separate concern -- verify if the old `/auth/csrf-token` endpoint still exists.
**Warning signs:** Console errors about failed CSRF token fetch.

### Pitfall 6: MUI + Tailwind Style Conflicts
**What goes wrong:** better-auth-ui uses Tailwind classes; wrapping in MUI ThemeProvider doesn't automatically apply MUI fonts/colors to Tailwind components.
**Why it happens:** Two different styling systems.
**How to avoid:** Set CSS variables in globals.css that match MUI theme values. better-auth-ui reads shadcn CSS variables (`--primary`, `--background`, etc.). Ensure these variables match the MUI theme's color palette. The existing `tailwind.config.ts` already maps these variables.
**Warning signs:** Auth pages look visually different from dashboard (different fonts, colors).

### Pitfall 7: Removing auth-store breaks non-auth consumers
**What goes wrong:** Components like `CommandPalette`, `ComposeEditor`, `use-ai-actions` import `useAuthStore` to read `user` or `token` -- they'll break when the store is deleted.
**Why it happens:** Auth state was used broadly, not just in auth flows.
**How to avoid:** Map every import site and convert to `authClient.useSession()`. The full list of files to update:
- `components/ai/CommandPalette/index.tsx` (useAuthStore)
- `components/dashboard/ProfileSettings.tsx` (useAuth)
- `components/dashboard/settings/useSettingsState.ts` (useAuth + useAuthStore)
- `components/email/compose/ComposeEditor.tsx` (useAuthStore)
- `components/layout/Header.tsx` (useAuth + useAuthStore)
- `components/layout/Layout.tsx` (useAuth)
- `hooks/ai/use-ai-actions.ts` (useAuthStore for token)
- `hooks/use-websocket.ts` (useAuth + useAuthStore)
- `hooks/use-theme-persistence.ts` (useAuth)
- `lib/api-client.ts` (useAuthStore for logout)
- `pages/_app.tsx` (useAuth + AuthProvider)
- `pages/index.tsx` (useAuth)
- `pages/auth/oauth-callback.tsx` (useAuth -- DELETE entire file)
- `pages/dashboard/ai/follow-ups.tsx` (useAuth)

**Warning signs:** Build fails with "Cannot find module" errors.

## Code Examples

### auth-client.ts with Type Inference
```typescript
// Source: better-auth docs (https://better-auth.com/docs/concepts/client)
import { createAuthClient } from "better-auth/react"
import type { auth } from "@/lib/auth"

/**
 * better-auth React client.
 * No baseURL -- same-origin Next.js.
 * Type inference from server auth config gives typed additionalFields.
 */
export const authClient = createAuthClient<typeof auth>()

// Convenience re-exports for consumers
export const { useSession, signIn, signUp, signOut } = authClient
```

### useSession Return Shape
```typescript
// What authClient.useSession() returns:
{
  data: {
    user: {
      id: string
      name: string        // better-auth standard
      email: string
      emailVerified: boolean
      image: string | null  // maps to old avatarUrl
      createdAt: Date
      updatedAt: Date
      // additionalFields from lib/auth.ts:
      firstName: string | null
      lastName: string | null
      role: string          // default "member"
      tenantId: string | null
      isActive: boolean     // default true
    }
    session: {
      id: string
      userId: string
      expiresAt: Date
      token: string
      // ...other session fields
    }
  } | null
  isPending: boolean
  error: Error | null
  refetch: () => void
}
```

### Middleware Cookie Check
```typescript
// Source: better-auth docs (https://better-auth.com/docs/integrations/next)
import { getSessionCookie } from "better-auth/cookies"
// getSessionCookie accepts NextRequest and returns the session token string or null
// Cookie name defaults to "better-auth.session_token"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom MUI auth forms | better-auth-ui shadcn components | better-auth-ui v1.0+ (2025) | No custom form code needed |
| /auth/me polling for session | `useSession()` reactive hook | better-auth v1.0+ (2024) | Eliminates manual session polling |
| Client-side RouteGuard | Next.js middleware + getSessionCookie | better-auth v1.5+ (2025) | No flash of protected content |
| Zustand + Context for auth state | Nanostore-based reactive hooks | better-auth v1.0+ | Simpler, auto-syncs on signOut |

## Open Questions

1. **viewPaths exact configuration for URL mapping**
   - What we know: better-auth-ui defaults to sign-in/sign-up; project uses login/register
   - What's unclear: Exact prop name -- docs mention both `viewPaths` and `authPaths`; need to verify in installed package
   - Recommendation: Check `@daveyplate/better-auth-ui` types after install; fall back to `viewPaths` as that's most recent docs

2. **Type inference with `createAuthClient<typeof auth>()`**
   - What we know: This should give typed additionalFields on session.user
   - What's unclear: Whether this works across the Next.js client/server boundary (auth.ts is server-only with PrismaClient)
   - Recommendation: Use `InferSessionFromClient<typeof authClient>` type helper if direct inference fails; or define the type manually

3. **Sonner toast integration**
   - What we know: better-auth-ui defaults to Sonner for toasts; project currently uses MUI-based ToastProvider
   - What's unclear: Whether passing the existing toast context to AuthUIProvider's `toast` prop avoids installing Sonner
   - Recommendation: Install Sonner (it's lightweight); use it for auth toasts, keep MUI toast for dashboard

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (e2e) |
| Config file | `frontend/playwright.config.ts` |
| Quick run command | `cd frontend && npx playwright test e2e/auth.spec.ts --headed` |
| Full suite command | `cd frontend && npx playwright test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FEUI-01 | Login/signup pages render with better-auth-ui components | e2e | `npx playwright test e2e/auth.spec.ts` | Exists but needs update |
| FEUI-02 | useSession provides session state | manual-only | Manual: verify dashboard loads with user data | N/A |
| FEUI-03 | Old auth store removed, no imports remain | build | `npm run type-check` (zero errors = pass) | N/A |
| FEUI-04 | Unauthenticated users redirected to login | e2e | `npx playwright test e2e/auth.spec.ts` | Exists but needs update |

### Sampling Rate
- **Per task commit:** `npm run type-check` (catches broken imports)
- **Per wave merge:** `cd frontend && npx playwright test e2e/auth.spec.ts`
- **Phase gate:** Full `npx playwright test` + `npm run type-check` + `npm run lint`

### Wave 0 Gaps
- [ ] `e2e/auth.setup.ts` -- needs update: inject `better-auth.session_token` cookie instead of `access_token`
- [ ] `e2e/auth.spec.ts` -- needs update: selectors for better-auth-ui forms (not MUI forms)
- [ ] `e2e/fixtures.ts` -- needs update: remove `/auth/me` mock, update cookie name
- [ ] Framework install: `npm install @daveyplate/better-auth-ui@latest sonner`

## Sources

### Primary (HIGH confidence)
- [better-auth.com/docs/concepts/client](https://better-auth.com/docs/concepts/client) - useSession hook API, createAuthClient, session shape
- [better-auth.com/docs/integrations/next](https://better-auth.com/docs/integrations/next) - Next.js middleware, getSessionCookie
- [better-auth.com/docs/concepts/session-management](https://better-auth.com/docs/concepts/session-management) - Cookie caching, session lifecycle
- [better-auth-ui.com](https://better-auth-ui.com/) - AuthUIProvider, AuthView, installation
- [better-auth-ui.com/integrations/next-js](https://better-auth-ui.com/integrations/next-js) - Pages Router setup, dynamic route pattern
- [better-auth-ui.com/components/auth-ui-provider](https://better-auth-ui.com/components/auth-ui-provider) - Full props API
- Codebase: `frontend/lib/auth.ts` - Server config with additionalFields
- Codebase: `frontend/lib/auth-client.ts` - Existing client (already correct)
- Codebase: verified `better-auth/cookies` exports include `getSessionCookie`

### Secondary (MEDIUM confidence)
- [github.com/daveyplate/better-auth-nextjs-pages-starter](https://github.com/daveyplate/better-auth-nextjs-pages-starter) - Reference Pages Router implementation
- [github.com/daveyplate/better-auth-ui](https://github.com/daveyplate/better-auth-ui) - Source repo for better-auth-ui

### Tertiary (LOW confidence)
- viewPaths vs authPaths naming -- docs inconsistent between versions; verify after install

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - libraries verified installed or documented with clear APIs
- Architecture: HIGH - Pages Router pattern documented in official starter template + docs
- Pitfalls: HIGH - derived from actual codebase analysis (20 consumer files mapped, type shapes compared)
- E2E updates: MEDIUM - cookie name assumption based on better-auth defaults, needs verification

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable libraries, 30-day validity)
