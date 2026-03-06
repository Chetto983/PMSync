# Phase 51: Core Email/Password Auth - Research

**Researched:** 2026-03-06
**Domain:** better-auth email/password authentication, email verification, password reset, nodemailer integration in Next.js
**Confidence:** HIGH

## Summary

Phase 51 wires the better-auth instance (created in Phase 50) to actually handle signup, signin, email verification, and password reset. The infrastructure is already in place: `frontend/lib/auth.ts` has a working better-auth server instance with HIBP hook, `frontend/pages/api/auth/[...all].ts` catches all auth routes, and the Prisma schema has Account/Verification/Session models. What is missing:

1. **Email sending:** better-auth requires `sendVerificationEmail` and `sendResetPassword` callbacks in the server config. The frontend has no nodemailer -- it needs one. The backend already has `EmailService` (nodemailer wrapper in `TransactionalEmailModule`), but better-auth callbacks run in Next.js, not NestJS. We need nodemailer in the frontend or a shared transactional email utility.

2. **Auth client:** No `better-auth/react` client exists yet (`frontend/lib/auth-client.ts` does not exist). The existing auth pages (`login.tsx`, `register.tsx`, `forgot-password.tsx`, `reset-password.tsx`) all use `apiClient.post('/auth/...')` hitting the NestJS backend. They need to be rewired to use better-auth's client methods (`signUp.email`, `signIn.email`, `forgetPassword`, `resetPassword`).

3. **Email verification page:** No `verify-email.tsx` page exists. better-auth sends a verification URL; we need a page that receives the token and calls `authClient.verifyEmail()`.

4. **HIBP on password reset:** The current HIBP hook only intercepts `/sign-up/email`. Password reset (`/reset-password`) also needs HIBP checking to satisfy CORE-07 (already marked complete in Phase 50, but the reset path was not covered).

**Primary recommendation:** Split into two plans: (1) Server-side: add nodemailer to frontend, wire `sendVerificationEmail`/`sendResetPassword`/`requireEmailVerification` into `auth.ts`, extend HIBP hook to cover reset-password path, create auth-client.ts. (2) Client-side: rewire the 4 existing auth pages + create verify-email page to use better-auth client methods instead of `apiClient`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CORE-01 | User can sign up with email and password via better-auth | better-auth `signUp.email()` client method + server `emailAndPassword: { enabled: true }` (already configured). Page must call `authClient.signUp.email({ name, email, password })` with `name` computed from firstName+lastName. Auto-signin after signup sets session cookie. |
| CORE-02 | User can sign in with email and password | better-auth `signIn.email()` client method. Session cookie set automatically. Login page rewired from `apiClient.post('/auth/login')` to `authClient.signIn.email()`. |
| CORE-04 | User receives email verification after signup | Requires `emailVerification.sendVerificationEmail` callback in `auth.ts` + nodemailer in frontend. Also need `emailVerification.sendOnSignUp: true` and `emailAndPassword.requireEmailVerification: true`. Need verify-email page to handle callback URL. |
| CORE-05 | User can reset password via email link | Requires `emailAndPassword.sendResetPassword` callback in `auth.ts`. Client uses `authClient.forgetPassword({ email, redirectTo })` then `authClient.resetPassword({ newPassword, token })`. Existing pages rewired. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-auth` | ^1.5.4 | Auth server (already installed) | Handles signup, signin, session, verification, password reset |
| `better-auth/react` | (bundled) | Client-side auth hooks and methods | `createAuthClient`, `signUp.email`, `signIn.email`, `useSession` |
| `nodemailer` | ^6.x | Transactional email sending from Next.js | Same library as backend EmailService; proven pattern |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/nodemailer` | ^6.x | TypeScript types for nodemailer | Dev dependency for type safety |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| nodemailer in frontend | Resend / SendGrid SDK | Would require new service subscription + API key; project already has SMTP config. Use nodemailer for consistency with backend. |
| nodemailer in frontend | Call NestJS API from better-auth hook | Adds cross-service HTTP call during auth flow; increases latency and failure modes. Direct SMTP from Next.js is simpler. |
| Custom auth pages | better-auth-ui components | Phase 53 will evaluate better-auth-ui; Phase 51 rewires existing MUI pages to keep scope small. |

**Installation:**

```bash
cd frontend && npm install nodemailer && npm install -D @types/nodemailer
```

## Architecture Patterns

### Recommended Project Structure

```
frontend/
  lib/
    auth.ts              # better-auth server instance (UPDATE: add email callbacks)
    auth-client.ts       # NEW: better-auth React client
    mail.ts              # NEW: nodemailer transporter for transactional emails
    hibp.ts              # Existing HIBP utility (no changes)
  pages/
    api/
      auth/
        [...all].ts      # Existing catch-all (no changes)
    auth/
      login.tsx           # REWIRE: apiClient -> authClient.signIn.email
      register.tsx        # REWIRE: apiClient -> authClient.signUp.email
      forgot-password.tsx # REWIRE: apiClient -> authClient.forgetPassword
      reset-password.tsx  # REWIRE: apiClient -> authClient.resetPassword
      verify-email.tsx    # NEW: handles email verification callback
```

### Pattern 1: better-auth Client (frontend/lib/auth-client.ts)

**What:** Create the better-auth React client for use in auth pages.
**When to use:** All client-side auth operations.

```typescript
// frontend/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL
    ? undefined // Use default (same origin) if proxied
    : "http://localhost:3001", // Dev: Next.js origin
});
```

Note: `createAuthClient` does NOT need `NEXT_PUBLIC_` env vars for `baseURL` if the auth API is on the same origin as the frontend (which it is -- both on Next.js port 3001). The client defaults to the current origin. Only set `baseURL` if the auth server is on a different origin.

### Pattern 2: Nodemailer Transporter in Next.js

**What:** Lightweight nodemailer wrapper for sending verification and password reset emails from better-auth hooks.
**When to use:** `sendVerificationEmail` and `sendResetPassword` callbacks.

```typescript
// frontend/lib/mail.ts
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "localhost",
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: (process.env.SMTP_PORT || "587") === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

const fromAddress = `${process.env.SMTP_FROM_EMAIL || "noreply"}@${process.env.SMTP_FROM_DOMAIN || "pmsync.local"}`;

export async function sendTransactionalEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  await transporter.sendMail({ from: fromAddress, to, subject, html });
}
```

### Pattern 3: Wiring Email Callbacks into auth.ts

**What:** Add `emailVerification` and `sendResetPassword` to the existing better-auth config.
**When to use:** Server-side only (runs in Next.js API routes).

```typescript
// In frontend/lib/auth.ts -- additions to existing config
import { sendTransactionalEmail } from "./mail";

export const auth = betterAuth({
  // ... existing config ...

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      // Fire-and-forget (avoid timing attacks per better-auth docs)
      void sendTransactionalEmail(
        user.email,
        "Verify your email address",
        `<p>Click the link to verify your email:</p><a href="${url}">${url}</a>`,
      );
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      void sendTransactionalEmail(
        user.email,
        "Reset your password",
        `<p>Click the link to reset your password:</p><a href="${url}">${url}</a>`,
      );
    },
    autoSignIn: true,
  },
});
```

### Pattern 4: Signup Page Rewire

**What:** Replace `apiClient.post('/auth/register')` with `authClient.signUp.email()`.

```typescript
// Key change in register.tsx
import { authClient } from "@/lib/auth-client";

const { data, error } = await authClient.signUp.email({
  name: `${trimmed.firstName} ${trimmed.lastName}`.trim(),
  email: trimmed.email,
  password: trimmed.password,
  // Pass firstName/lastName if additionalFields accepts them on signup
  // NOTE: better-auth additionalFields with input:false (like tenantId) are excluded
  // firstName/lastName don't have input:false, so they should be passable
});

if (error) {
  setError(error.message || translations.common.genericError);
} else {
  // With requireEmailVerification, user gets verification email
  // Redirect to "check your email" page or show message
  router.push("/auth/verify-email?sent=1");
}
```

### Pattern 5: Login Page Rewire

```typescript
// Key change in login.tsx
import { authClient } from "@/lib/auth-client";

const { data, error } = await authClient.signIn.email({
  email: trimmedEmail,
  password: trimmedPassword,
});

if (error) {
  // If requireEmailVerification is on and user isn't verified,
  // better-auth returns a specific error
  setError(error.message);
} else {
  router.push("/dashboard");
}
```

### Anti-Patterns to Avoid

- **Calling NestJS backend for auth operations:** All auth mutations go through Next.js `/api/auth/*`. Do NOT call `apiClient.post('/auth/login')` anymore.
- **Setting tokens manually in Zustand:** better-auth uses httpOnly cookies. There is no `accessToken` to store client-side. The `useAuthStore().setToken()` pattern is dead. Session state comes from `authClient.useSession()` or `authClient.getSession()`.
- **Awaiting email sends in auth hooks:** better-auth docs explicitly warn against this (timing attacks). Use `void sendEmail()`.
- **Creating a verify-email API route:** better-auth handles verification internally via its catch-all route. The verify-email page only needs to call `authClient.verifyEmail({ query: { token } })` which hits the existing `[...all].ts`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Signup flow | Custom registration endpoint + password hashing | `authClient.signUp.email()` | Handles hashing, Account creation, session, verification email trigger |
| Signin flow | Custom login endpoint + JWT | `authClient.signIn.email()` | Cookie-based session, no tokens to manage |
| Email verification | Custom token generation + verification endpoint | `emailVerification` config + `authClient.verifyEmail()` | Token lifecycle managed by better-auth Verification table |
| Password reset | Custom reset token + endpoint | `sendResetPassword` config + `authClient.forgetPassword()` + `authClient.resetPassword()` | Token expiry, session revocation all handled |
| Session persistence | Zustand auth store + localStorage | better-auth httpOnly cookies + `useSession()` | Cookies managed server-side; XSS-safe |

**Key insight:** The entire auth lifecycle is now managed by better-auth. The frontend pages become thin wrappers that call client methods and display results. No more manual token management, no more auth store, no more custom endpoints.

## Common Pitfalls

### Pitfall 1: better-auth `name` Field is Required on Signup

**What goes wrong:** `signUp.email()` requires `name` as a string. Current register form has `firstName` and `lastName` separately. If you pass an empty `name`, signup fails.
**Why it happens:** better-auth's core User model requires `name`. It is not optional.
**How to avoid:** Compute `name` from `${firstName} ${lastName}`.trim()`. If both are empty, use the email prefix as fallback. Pass `firstName`/`lastName` as additional data if the API accepts them.
**Warning signs:** "name is required" error on signup.

### Pitfall 2: `requireEmailVerification` Blocks Signin Until Verified

**What goes wrong:** With `requireEmailVerification: true`, `signIn.email()` returns a 403 error if the user hasn't verified their email. This is by design but the error message may confuse users.
**Why it happens:** better-auth checks `emailVerified` on User before allowing login.
**How to avoid:** Detect this specific error and show a user-friendly message ("Please verify your email first. Check your inbox or request a new verification email."). Provide a "Resend verification email" button.
**Warning signs:** Users register, get verification email, ignore it, then complain they can't log in.

### Pitfall 3: MFA Code in Login Page is Dead Code for Phase 51

**What goes wrong:** The current `login.tsx` has extensive MFA handling (TOTP, email OTP, backup codes, passkeys). Phase 51 does NOT implement MFA -- that's Phase 55.
**Why it happens:** Legacy code from the old auth system.
**How to avoid:** Strip the MFA sections from the login page during rewire. Keep the page simple: email + password + submit. MFA will be re-added in Phase 55 using better-auth's 2FA plugin. Do NOT try to preserve the MFA UX from the old system.
**Warning signs:** Trying to make old MFA code work with better-auth wastes time and creates confusion.

### Pitfall 4: Old Auth Store (`useAuthStore`) Still Referenced Everywhere

**What goes wrong:** The login page calls `setToken()` and `setUser()` from `useAuthStore`. With better-auth, there are no tokens to store -- sessions are cookie-based.
**Why it happens:** Legacy JWT-based auth used Zustand for client-side token storage.
**How to avoid:** For Phase 51, remove `setToken`/`setUser` calls from the rewired auth pages. Do NOT delete `useAuthStore` itself yet -- other parts of the app may still reference it. Phase 53 handles full auth state migration. For now, just stop calling it from auth pages.
**Warning signs:** `setToken(undefined)` or `setToken(null)` after signin because there is no token.

### Pitfall 5: SMTP Env Vars Missing from Frontend `.env.local`

**What goes wrong:** `sendVerificationEmail` and `sendResetPassword` callbacks try to send email but SMTP is not configured. Emails silently fail or throw.
**Why it happens:** SMTP env vars exist only in backend `.env`. Frontend `.env.example` does not list them.
**How to avoid:** Add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_DOMAIN` to `frontend/.env.example`. Document that they must match the backend values.
**Warning signs:** Registration succeeds but no verification email arrives. Check Next.js console for nodemailer errors.

### Pitfall 6: Cookie Not Sent Cross-Port in Dev

**What goes wrong:** After signup/signin via better-auth (port 3001), NestJS (port 3000) does not see the session cookie. Users appear logged out to the backend.
**Why it happens:** Cookies are scoped by origin. Different ports on localhost may or may not share cookies depending on browser and sameSite policy.
**How to avoid:** This is a Phase 52 concern (NestJS session validation). For Phase 51, verify that auth operations work purely through Next.js. The session cookie is set by Next.js and can be read by Next.js -- cross-port cookie sharing is tested in Phase 52.
**Warning signs:** Ignore for now -- backend auth is not touched in Phase 51.

### Pitfall 7: `forgetPassword` vs `requestPasswordReset` API Naming

**What goes wrong:** Confusion between method names. The better-auth client uses `forgetPassword()` (not `requestPasswordReset()` or `forgotPassword()`). The reset step uses `resetPassword()`.
**Why it happens:** Non-obvious naming in better-auth's client API.
**How to avoid:** Use exactly: `authClient.forgetPassword({ email, redirectTo })` then `authClient.resetPassword({ newPassword, token })`. The `redirectTo` in `forgetPassword` determines where the reset link points.
**Warning signs:** "method not found" or 404 errors.

## Code Examples

### Verify Email Page

```typescript
// frontend/pages/auth/verify-email.tsx
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { authClient } from "@/lib/auth-client";

export default function VerifyEmailPage() {
  const router = useRouter();
  const { token, sent } = router.query;
  const [status, setStatus] = useState<"loading" | "success" | "error" | "sent">(
    sent ? "sent" : "loading"
  );

  useEffect(() => {
    if (!token || typeof token !== "string") return;
    authClient.verifyEmail({ query: { token } }).then(({ error }) => {
      if (error) {
        setStatus("error");
      } else {
        setStatus("success");
        // autoSignInAfterVerification handles the session
        setTimeout(() => router.push("/dashboard"), 2000);
      }
    });
  }, [token, router]);

  // Render status-appropriate UI
}

export const getServerSideProps = async () => ({ props: {} });
```

### Forgot Password Rewire

```typescript
// Key change in forgot-password.tsx
import { authClient } from "@/lib/auth-client";

const { data, error } = await authClient.forgetPassword({
  email: trimmedEmail,
  redirectTo: "/auth/reset-password", // Where the reset link goes
});
// Always show success (prevent email enumeration)
setSuccess(true);
```

### Reset Password Rewire

```typescript
// Key change in reset-password.tsx
import { authClient } from "@/lib/auth-client";

const { data, error } = await authClient.resetPassword({
  newPassword: trimmedPassword,
  token: token as string,
});
if (error) {
  setError(error.message);
} else {
  setSuccess(true);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `apiClient.post('/auth/register')` to NestJS | `authClient.signUp.email()` to Next.js better-auth | Phase 51 | Auth bypasses NestJS entirely |
| JWT `accessToken` stored in Zustand | httpOnly session cookie (no client-side token) | Phase 51 | `setToken()` is dead; use `useSession()` |
| Custom `EmailService` for password reset in NestJS | `sendResetPassword` callback in better-auth config | Phase 51 | Email sending moves to Next.js for auth flows |
| Custom OTP verification endpoint | `emailVerification` + `verifyEmail()` | Phase 51 | No custom verification logic needed |

**Deprecated/outdated:**
- `apiClient.post('/auth/login')` -- replaced by `authClient.signIn.email()`
- `apiClient.post('/auth/register')` -- replaced by `authClient.signUp.email()`
- `apiClient.post('/auth/forgot-password')` -- replaced by `authClient.forgetPassword()`
- `apiClient.post('/auth/reset-password')` -- replaced by `authClient.resetPassword()`
- `useAuthStore().setToken()` in auth pages -- no tokens to store
- `mfaApi` imports in login page -- Phase 55 handles MFA via better-auth plugin

## Open Questions

1. **additionalFields on signUp.email()**
   - What we know: `firstName` and `lastName` are declared as additionalFields without `input: false`. `tenantId` has `input: false` (correctly preventing client-side setting).
   - What's unclear: Does `signUp.email()` accept `firstName`/`lastName` as extra body fields? Or do they need to be set via a `hooks.after` on signup?
   - Recommendation: Test during implementation. If `signUp.email()` does not accept them, use an `after` hook on the `/sign-up/email` path to update the user with firstName/lastName from the request body.

2. **HIBP on Password Reset Path**
   - What we know: The current HIBP hook intercepts `/sign-up/email`. Password reset uses a different path (likely `/reset-password`).
   - What's unclear: The exact path better-auth uses for password reset endpoint.
   - Recommendation: Add the reset-password path to the HIBP hook. Test by logging `ctx.path` during a password reset to discover the exact path, then add it to the conditional. CORE-07 demands HIBP on both signup AND password change.

3. **better-auth Verification URL Structure**
   - What we know: `sendVerificationEmail` receives a `url` parameter -- a complete verification link. `sendResetPassword` also receives a `url`.
   - What's unclear: What does the URL look like? Does it point to `/api/auth/verify-email?token=xxx` (handled by the catch-all) or to a custom page?
   - Recommendation: Test during implementation. If the URL points to the catch-all API route, better-auth handles verification internally and redirects to `callbackURL`. If it points elsewhere, the verify-email page needs to extract the token and call `verifyEmail()`.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (frontend: `--testPathPatterns`) |
| Config file | `frontend/jest.config.js` |
| Quick run command | `cd frontend && npx jest --testPathPatterns="auth" --no-coverage` |
| Full suite command | `cd frontend && npm test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CORE-01 | signUp.email creates user + session cookie | integration | `cd frontend && npx jest --testPathPatterns="signup" --no-coverage` | No - Wave 0 |
| CORE-02 | signIn.email authenticates + session cookie | integration | `cd frontend && npx jest --testPathPatterns="signin" --no-coverage` | No - Wave 0 |
| CORE-04 | Verification email sent on signup; verify link works | integration | `cd frontend && npx jest --testPathPatterns="verify-email" --no-coverage` | No - Wave 0 |
| CORE-05 | forgetPassword sends reset email; resetPassword works | integration | `cd frontend && npx jest --testPathPatterns="reset-password" --no-coverage` | No - Wave 0 |

### Sampling Rate

- **Per task commit:** `cd frontend && npx jest --testPathPatterns="auth" --no-coverage`
- **Per wave merge:** `cd frontend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `frontend/lib/__tests__/auth-client.test.ts` -- covers auth-client creation and method availability
- [ ] `frontend/lib/__tests__/mail.test.ts` -- covers nodemailer transporter creation and sendTransactionalEmail
- [ ] Integration tests require a running database + better-auth instance; may need to be manual-only or E2E
- [ ] Verify `npx prisma validate` still passes (schema unchanged in Phase 51, but sanity check)

*Note: True integration tests for auth flows (signup -> verify -> signin -> reset) are E2E tests requiring browser + database. Unit tests can cover: auth-client config, mail transporter init, HIBP hook path matching. Full flow testing is manual or Playwright E2E.*

## Sources

### Primary (HIGH confidence)

- [better-auth Email Verification](https://better-auth.com/docs/concepts/email) -- sendVerificationEmail callback, autoSignInAfterVerification, requireEmailVerification behavior
- [better-auth Email & Password](https://better-auth.com/docs/authentication/email-password) -- sendResetPassword, resetPasswordTokenExpiresIn, client API methods, autoSignIn, requireEmailVerification
- [better-auth Next.js Integration](https://better-auth.com/docs/integrations/next) -- createAuthClient from better-auth/react, Pages Router setup
- [better-auth Hooks](https://better-auth.com/docs/concepts/hooks) -- createAuthMiddleware, ctx.path interception

### Secondary (MEDIUM confidence)

- Phase 50 RESEARCH.md and SUMMARYs -- existing better-auth config, schema, decisions
- Existing codebase analysis -- current auth pages, EmailService, env vars, auth store

### Tertiary (LOW confidence)

- `additionalFields` behavior during `signUp.email()` -- not explicitly documented whether extra fields are accepted in signup body. Needs implementation testing.
- Exact better-auth reset-password endpoint path for HIBP hook interception -- not documented; needs runtime discovery.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- better-auth client API well-documented, nodemailer is battle-tested
- Architecture: HIGH -- pattern is straightforward: add email callbacks to existing config, create auth-client, rewire pages
- Pitfalls: HIGH -- based on codebase analysis (existing pages, auth store, MFA code, env vars)
- Email verification flow: MEDIUM -- `sendVerificationEmail` is documented but exact URL structure needs runtime verification

**Research date:** 2026-03-06
**Valid until:** 2026-04-06
