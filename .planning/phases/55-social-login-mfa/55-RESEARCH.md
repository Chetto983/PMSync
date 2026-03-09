# Phase 55: Social Login & MFA - Research

**Researched:** 2026-03-09
**Domain:** OAuth Social Login, TOTP 2FA, WebAuthn/Passkeys, better-auth plugins
**Confidence:** HIGH

## Summary

Phase 55 adds Google/Microsoft social login and MFA (TOTP + passkeys) to the existing better-auth v1.5.4 setup. The project already has a dual-instance architecture: NestJS backend holds the authoritative better-auth instance (handles all auth mutations via catch-all controller at `/api/auth/*`), while the frontend has a client-only instance. All three features -- social providers, twoFactor, and passkey -- are official better-auth plugins with well-documented APIs.

The schema situation is mixed: the User model lacks `twoFactorEnabled` (better-auth's twoFactor plugin requires it), no `twoFactor` table exists yet, and the existing `WebAuthnCredential` model uses a custom schema that won't match better-auth's `passkey` plugin expectations. Old custom MFA code (4 backend files, 6 frontend components, 1 API module) must be deleted and replaced with plugin-based implementations. A Prisma migration is required to add `twoFactorEnabled` to User, create a `twoFactor` table, and create a `passkey` table (or rename/restructure `WebAuthnCredential`).

The onboarding wizard is the most complex UI piece -- a multi-step blocking flow for all new users (name, tenant, email provider, avatar, mandatory MFA). This requires a new Next.js middleware to redirect incomplete users, a wizard page, and state tracking (likely a field on User or a separate onboarding table).

**Primary recommendation:** Add better-auth plugins (socialProviders, twoFactor, passkey) to the NestJS backend instance first, run schema migration, then build frontend features layer by layer: social buttons, TOTP setup, passkey registration, security settings, onboarding wizard.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Support Google and Microsoft OAuth (both client IDs already in .env)
- Reuse existing OAuth credentials (GMAIL_CLIENT_ID, MICROSOFT_CLIENT_ID) -- same app for login and mail sync, combined scopes
- Social buttons placed ABOVE email/password form with "or" divider on both login and register pages
- Auto-link accounts: if social email matches verified existing account, link automatically (better-auth trustedProviders)
- Social-only users can enable MFA (TOTP or passkey) like any other user
- ALL new users (social and email/password) go through a blocking setup wizard immediately after signup/first login
- Wizard steps: 1. Name confirmation 2. Tenant/workspace setup 3. Email provider connection 4. Optional avatar 5. Mandatory MFA setup
- Wizard lives at a dedicated route, middleware redirects incomplete users there
- If user logged in with Google, auto-offer Gmail sync; Microsoft -> Outlook sync
- MFA is mandatory for all users (GDPR Article 32)
- Either TOTP or passkey satisfies the requirement -- user chooses during wizard
- TOTP setup via QR code (qrcode package already installed)
- 10 backup codes generated after TOTP setup, shown once + downloadable as .txt
- Passkeys work as both primary login (passwordless) AND second factor
- Full fallback chain: Passkey (Conditional UI) -> Cross-device QR -> Email/password + TOTP -> Recovery codes
- Auto-name passkeys from device/browser info, editable from settings
- Maximum 5 passkeys per user
- Security settings at `/dashboard/settings?section=security`
- Rewrite security settings from scratch using better-auth client APIs
- Delete all old MFA components (MfaSettings, TotpSetupWizard, BackupCodesCard, PasskeyCard, TrustedDevicesList, mfaApi)
- Delete old custom MFA backend code (totp.service.ts, webauthn.service.ts, mfa.controller.ts, mfa.dto.ts)
- Four sections: MFA methods, Active sessions, Connected accounts, Password change
- Built with MUI components

### Claude's Discretion
- Exact wizard step UI/layout design
- better-auth plugin configuration details (twoFactor, passkey, socialProviders)
- IP-to-location service choice for session geolocation (MaxMind GeoLite2 or similar)
- Conditional UI implementation details for passkey autofill
- Cross-device QR code implementation approach
- Session list pagination/sorting

### Deferred Ideas (OUT OF SCOPE)
- GitHub as third social provider
- Magic link auth
- SMS OTP
- Progressive passkey enrollment nudge post-login
- Onboarding wizard for existing users who need MFA migration
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CORE-03 | User can sign in with Google OAuth | better-auth socialProviders.google config, signIn.social client method |
| SEC-01 | User can enable TOTP 2FA with QR code setup | better-auth twoFactor plugin, twoFactor.enable + getTotpUri client methods |
| SEC-02 | User can use backup codes when TOTP device unavailable | twoFactor.generateBackupCodes + verifyBackupCode client methods |
| SEC-03 | User can register and authenticate with passkeys (WebAuthn) | @better-auth/passkey plugin, passkey.addPasskey + signIn.passkey client methods |
| SEC-04 | User can manage security settings (2FA, passkeys, sessions) | listSessions, revokeSession, unlinkAccount, twoFactor.disable client APIs |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-auth | 1.5.4 (installed) | Auth framework -- social, 2FA, sessions | Already the project's auth foundation |
| @better-auth/passkey | latest | WebAuthn/passkey plugin (separate package since v1.4) | Official better-auth passkey support |
| twoFactor (built-in) | 1.5.4 | TOTP 2FA + backup codes plugin | Built into better-auth, no extra install |
| qrcode | 1.5.4 (installed) | Generate TOTP QR codes | Already installed in backend |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ua-parser-js | ^2.x | Parse user-agent strings for session display | Session list -- extract device/browser/OS |
| @simplewebauthn/browser | 13.2.2 (installed) | WebAuthn browser API (used by @better-auth/passkey) | Passkey registration/authentication on client |
| @simplewebauthn/server | 13.2.2 (installed) | WebAuthn server verification (used by @better-auth/passkey) | Passkey verification on server |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ua-parser-js | bowser | ua-parser-js is more widely used, better maintained |
| MaxMind GeoLite2 for IP geolocation | ip-api.com, ipinfo.io | MaxMind is offline (no external API calls), but requires DB download. For MVP, skip geolocation or use a lightweight free API. Claude's discretion. |

### New Packages to Install

**Frontend:**
```bash
cd frontend && npm install @better-auth/passkey ua-parser-js && npm install -D @types/ua-parser-js
```

**Backend:**
```bash
cd backend && npm install @better-auth/passkey ua-parser-js && npm install -D @types/ua-parser-js
```

Note: `@simplewebauthn/browser` and `@simplewebauthn/server` are already installed. The `@better-auth/passkey` plugin uses SimpleWebAuthn under the hood.

## Architecture Patterns

### Where Auth Lives (Dual-Instance Pattern)

```
NestJS Backend (port 3000)             Frontend (port 3001)
================================       ==============================
better-auth instance (AUTHORITATIVE)   better-auth client (CONSUMER)
  - socialProviders config               - signIn.social()
  - twoFactor() plugin                   - twoFactor.enable/verify()
  - passkey() plugin                     - passkey.addPasskey()
  - databaseHooks (workspace provision)  - useSession()
  - HIBP middleware                       - listSessions()
  - Prisma adapter                        - etc.

BetterAuthController @All('api/auth/*')  authClient -> baseURL: backend
  catches all auth routes
```

**CRITICAL INSIGHT:** The NestJS backend instance (`better-auth.instance.ts`) is where ALL plugins must be added. The frontend `auth.ts` file is a SECONDARY instance used only for Next.js API routes (which currently only serve email attachments). The frontend `auth-client.ts` is the React client that talks to the backend.

Both instances need matching plugin configuration:
- **Backend `better-auth.instance.ts`:** Add `socialProviders`, `twoFactor()`, `passkey()` plugins + `accountLinking` config
- **Frontend `auth-client.ts`:** Add `twoFactorClient()`, `passkeyClient()` client plugins
- **Frontend `auth.ts`:** Add matching plugins (this instance may be needed for middleware/SSR session checks)

### Recommended File Structure

```
backend/src/
  common/auth/
    better-auth.instance.ts    # ADD: socialProviders, twoFactor, passkey plugins
    better-auth.controller.ts  # NO CHANGES (catch-all already handles new routes)
    better-auth.guard.ts       # NO CHANGES
    better-auth.module.ts      # NO CHANGES

backend/prisma/
  schema.prisma                # ADD: twoFactor model, passkey model, twoFactorEnabled on User
  migrations/                  # NEW migration for schema changes

frontend/lib/
  auth.ts                      # ADD: socialProviders, twoFactor, passkey plugins (mirror backend)
  auth-client.ts               # ADD: twoFactorClient(), passkeyClient() client plugins

frontend/pages/auth/
  login.tsx                    # MODIFY: add social login buttons
  register.tsx                 # MODIFY: add social login buttons

frontend/pages/
  onboarding.tsx               # NEW: setup wizard page

frontend/middleware.ts         # NEW: redirect incomplete users to wizard

frontend/components/settings/
  SecuritySettings.tsx         # NEW: main security settings component
  SecurityMfaSection.tsx       # NEW: TOTP + passkey management
  SecuritySessionsSection.tsx  # NEW: active sessions list
  SecurityAccountsSection.tsx  # NEW: connected social accounts
  SecurityPasswordSection.tsx  # NEW: change/set password

frontend/components/onboarding/
  OnboardingWizard.tsx         # NEW: multi-step wizard container
  StepNameConfirm.tsx          # NEW: step 1
  StepWorkspace.tsx            # NEW: step 2
  StepEmailProvider.tsx        # NEW: step 3
  StepAvatar.tsx               # NEW: step 4
  StepMfaSetup.tsx             # NEW: step 5

frontend/components/auth/
  SocialLoginButtons.tsx       # NEW: Google + Microsoft buttons (shared login/register)
  TwoFactorVerify.tsx          # NEW: TOTP/backup code entry after login

frontend/pages/auth/
  two-factor.tsx               # NEW: 2FA verification page (redirect target)
```

### Pattern 1: Social Login with better-auth

**Server config (backend better-auth.instance.ts):**
```typescript
import { twoFactor } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';

export function createBetterAuthInstance(prisma, emailService) {
  return betterAuth({
    // ... existing config ...

    appName: 'PMSync',  // Used as TOTP issuer in authenticator apps

    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        accessType: 'offline',           // Get refresh token for mail sync
        prompt: 'select_account consent', // Always show account picker
        scope: [
          'email', 'profile',
          'https://www.googleapis.com/auth/gmail.modify',  // Mail sync scopes
          'https://www.googleapis.com/auth/gmail.send',
        ],
      },
      microsoft: {
        clientId: process.env.MICROSOFT_CLIENT_ID!,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
        tenantId: 'common',
        prompt: 'select_account',
        scope: [
          'openid', 'email', 'profile', 'offline_access',
          'https://outlook.office365.com/IMAP.AccessAsUser.All',
          'https://outlook.office365.com/SMTP.Send',
        ],
      },
    },

    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'microsoft'],
      },
    },

    plugins: [
      twoFactor({
        issuer: 'PMSync',
        backupCodeOptions: { amount: 10, length: 8 },
        totpOptions: { digits: 6, period: 30 },
      }),
      passkey({
        rpID: process.env.PASSKEY_RP_ID || 'localhost',
        rpName: 'PMSync',
        origin: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
      }),
    ],
  });
}
```

**Client config (frontend auth-client.ts):**
```typescript
import { twoFactorClient } from 'better-auth/client/plugins';
import { passkeyClient } from '@better-auth/passkey/client';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  plugins: [
    inferAdditionalFields({ /* existing */ }),
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = '/auth/two-factor';
      },
    }),
    passkeyClient(),
  ],
});
```

### Pattern 2: Social Login Button Flow

```typescript
// Client-side social sign-in
const handleGoogleLogin = () => {
  authClient.signIn.social({
    provider: 'google',
    callbackURL: '/dashboard',  // or '/onboarding' for new users
  });
};
```

Callback URL: `http://localhost:3000/api/auth/callback/google` (handled automatically by better-auth via the NestJS catch-all controller).

### Pattern 3: TOTP 2FA Flow

```
Enable TOTP:
1. authClient.twoFactor.enable({ password }) -> returns { totpURI, backupCodes }
2. Generate QR code from totpURI using 'qrcode' package
3. User scans QR, enters code
4. authClient.twoFactor.verifyTotp({ code }) -> completes setup

Login with 2FA:
1. authClient.signIn.email({ email, password })
2. Response has twoFactorRedirect: true
3. Redirect to /auth/two-factor
4. authClient.twoFactor.verifyTotp({ code, trustDevice: true })
```

### Pattern 4: Passkey Flow

```
Register passkey:
1. authClient.passkey.addPasskey({ name: 'Chrome on Windows' })
   (triggers browser WebAuthn dialog automatically)

Login with passkey:
1. authClient.signIn.passkey({ autoFill: true })  // Conditional UI
   OR
2. authClient.signIn.passkey()  // Manual trigger
```

### Pattern 5: Onboarding Wizard State

The wizard needs to track completion. Options:
- **Recommended:** Add `onboardingComplete` boolean field to User (additionalFields in better-auth config). Middleware checks this field.
- Alternative: Use a separate `onboarding` table with step completion tracking.

The simpler approach (boolean flag) is sufficient since the wizard is all-or-nothing -- user must complete all steps before accessing dashboard.

### Pattern 6: Next.js Middleware for Wizard Redirect

```typescript
// frontend/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('better-auth.session_token');
  const pathname = request.nextUrl.pathname;

  // Skip auth routes, static files, API routes
  if (pathname.startsWith('/auth') || pathname.startsWith('/_next') || pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // No session -> redirect to login
  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // Onboarding page itself should be accessible
  if (pathname === '/onboarding') {
    return NextResponse.next();
  }

  // Check onboarding completion via cookie or header
  // (lightweight check -- real validation happens in page component)
  // The cookie cache includes user fields; decode to check onboardingComplete

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding'],
};
```

**Note:** Middleware in Next.js Pages Router runs on the Edge. It cannot make DB calls. The onboarding redirect should use a lightweight signal (cookie value, session cache field). The actual enforcement happens in the onboarding page component using `useSession()`.

### Anti-Patterns to Avoid

- **Building custom TOTP/WebAuthn logic:** better-auth handles all of this via plugins. Delete old custom code.
- **Calling old MFA API endpoints:** All MFA goes through better-auth's built-in routes (`/api/auth/two-factor/*`, `/api/auth/passkey/*`).
- **Storing TOTP secrets manually:** The twoFactor plugin manages encryption and storage.
- **Using @simplewebauthn directly:** The passkey plugin wraps it. Don't call SimpleWebAuthn APIs directly.
- **Adding plugins to frontend auth.ts but not backend:** The backend instance is authoritative. Both must match.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOTP generation/verification | Custom otplib/speakeasy integration | `twoFactor()` plugin | Plugin handles secrets, encryption, QR URI, verification, backup codes |
| WebAuthn registration/auth | Custom @simplewebauthn wiring | `passkey()` plugin + `@better-auth/passkey` | Plugin handles challenges, credential storage, counter updates |
| OAuth redirect flow | Custom OAuth state machine | `socialProviders` config + `signIn.social()` | better-auth handles PKCE, state, callback, token exchange |
| Session management UI data | Custom session tracking | `listSessions()` + `revokeSession()` | Built-in session table already has IP/userAgent |
| Backup code generation | Custom random code generator | `twoFactor.generateBackupCodes()` | Plugin encrypts and stores codes |
| Account linking | Custom email-matching logic | `accountLinking.trustedProviders` | better-auth auto-links when email matches |

**Key insight:** better-auth's plugin architecture handles all the crypto, storage, and protocol complexity. The implementation work is UI/UX, not auth logic.

## Common Pitfalls

### Pitfall 1: Dual Instance Plugin Mismatch
**What goes wrong:** Adding plugins to frontend `auth.ts` but forgetting the backend `better-auth.instance.ts` (or vice versa). Routes return 404 or type errors.
**Why it happens:** Two separate better-auth instances exist in this project.
**How to avoid:** Add plugins to BOTH instances. Backend is authoritative (handles requests), frontend mirrors for type inference and SSR.
**Warning signs:** 404 on `/api/auth/two-factor/*` routes, client type errors.

### Pitfall 2: Social Provider Callback URL Mismatch
**What goes wrong:** Google/Microsoft OAuth redirects fail with "redirect_uri_mismatch".
**Why it happens:** The callback URL in Google/Microsoft console doesn't match what better-auth generates.
**How to avoid:** Configure callback URLs exactly as `{BETTER_AUTH_URL}/api/auth/callback/google` and `{BETTER_AUTH_URL}/api/auth/callback/microsoft`. For local dev: `http://localhost:3000/api/auth/callback/google`.
**Warning signs:** OAuth error page, "redirect_uri_mismatch" in error params.

### Pitfall 3: Workspace Provisioning for Social Users
**What goes wrong:** Social login users don't get a workspace/tenant created because `databaseHooks.user.create.after` only fires for `/sign-up/email`.
**Why it happens:** The current hook checks `context?.path !== '/sign-up/email'` and returns early for other paths.
**How to avoid:** Extend the hook to also handle social signup paths, OR move workspace provisioning to the onboarding wizard (which is the planned approach -- wizard step 2 handles tenant setup).
**Warning signs:** Social login users have `tenantId: null`, can't access dashboard features.

### Pitfall 4: Passkey rpID Must Match Domain
**What goes wrong:** Passkey registration fails silently or throws "SecurityError".
**Why it happens:** `rpID` must be a valid domain that matches the origin. `localhost` works for dev but must be updated for production.
**How to avoid:** Use environment variable: `rpID: process.env.PASSKEY_RP_ID || 'localhost'`.
**Warning signs:** Browser WebAuthn dialog doesn't appear, or appears then immediately fails.

### Pitfall 5: Old Schema vs. Plugin Schema Conflict
**What goes wrong:** Prisma migration fails or better-auth can't find expected tables/columns.
**Why it happens:** Old `MfaSecret`, `MfaBackupCode`, `WebAuthnCredential`, `TrustedDevice` models exist. better-auth expects `twoFactor` and `passkey` tables with specific column names.
**How to avoid:** Create new tables matching better-auth's expectations. Don't try to rename old tables -- create clean new ones and drop old ones in Phase 58 cleanup.
**Warning signs:** Prisma errors about missing columns, better-auth 500 errors on 2FA routes.

### Pitfall 6: twoFactorRedirect Not Handled
**What goes wrong:** User with 2FA enabled signs in, gets a successful response but no session (stuck).
**Why it happens:** `signIn.email` returns `{ twoFactorRedirect: true }` instead of a session. If the client doesn't handle this, user appears logged in but isn't.
**How to avoid:** Use `twoFactorClient({ onTwoFactorRedirect() { ... } })` in client config. This automatically intercepts and redirects to the 2FA verification page.
**Warning signs:** Login appears to succeed but dashboard shows "unauthorized".

### Pitfall 7: Social Login Combined Scopes
**What goes wrong:** User logs in with Google but email sync doesn't work because mail scopes weren't requested.
**Why it happens:** Default Google OAuth only requests `email` and `profile` scopes.
**How to avoid:** Request mail sync scopes (gmail.modify, gmail.send) during social login. The access token and refresh token stored in the Account table can then be reused for IMAP/SMTP sync.
**Warning signs:** Social login works but "Connect Gmail" in wizard fails or requires re-auth.

### Pitfall 8: @better-auth/passkey is a Separate Package
**What goes wrong:** Import error: `Cannot find module '@better-auth/passkey'`.
**Why it happens:** Since better-auth v1.4, passkey moved to a separate npm package.
**How to avoid:** Install `@better-auth/passkey` explicitly in both frontend and backend.
**Warning signs:** Build/import errors referencing passkey.

## Code Examples

### Social Login Buttons Component
```typescript
// Source: better-auth docs - signIn.social()
import { authClient } from '@/lib/auth-client';
import { Button, Divider, Box, Typography } from '@mui/material';

export function SocialLoginButtons() {
  const handleSocial = (provider: 'google' | 'microsoft') => {
    authClient.signIn.social({
      provider,
      callbackURL: '/dashboard',
    });
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Button fullWidth variant="outlined" onClick={() => handleSocial('google')} sx={{ mb: 1.5 }}>
        {/* Google icon */} Continue with Google
      </Button>
      <Button fullWidth variant="outlined" onClick={() => handleSocial('microsoft')} sx={{ mb: 2 }}>
        {/* Microsoft icon */} Continue with Microsoft
      </Button>
      <Divider><Typography variant="caption" color="text.secondary">or</Typography></Divider>
    </Box>
  );
}
```

### TOTP Enable + QR Code
```typescript
// Source: better-auth docs - twoFactor.enable + twoFactor.getTotpUri
import QRCode from 'qrcode';

const enableTotp = async (password: string) => {
  const { data, error } = await authClient.twoFactor.enable({ password });
  if (error) throw error;

  // data contains: totpURI, backupCodes
  const qrDataUrl = await QRCode.toDataURL(data.totpURI);
  return { qrDataUrl, backupCodes: data.backupCodes };
};

// After user scans QR and enters code:
const verifyTotp = async (code: string) => {
  const { data, error } = await authClient.twoFactor.verifyTotp({ code });
  if (error) throw error;
  // 2FA is now fully enabled
};
```

### Session List with Device Info
```typescript
// Source: better-auth docs - listSessions + ua-parser-js
import UAParser from 'ua-parser-js';

const sessions = await authClient.listSessions();

const enrichedSessions = sessions.data?.map(session => {
  const parser = new UAParser(session.userAgent || '');
  return {
    ...session,
    browser: parser.getBrowser().name || 'Unknown',
    os: parser.getOS().name || 'Unknown',
    device: parser.getDevice().type || 'desktop',
  };
});

// Revoke a session:
await authClient.revokeSession({ token: session.token });

// Revoke all others:
await authClient.revokeOtherSessions();
```

### Account Linking/Unlinking
```typescript
// Source: better-auth docs - linkSocial, unlinkAccount
// Link additional social account:
await authClient.linkSocial({
  provider: 'google',
  callbackURL: '/dashboard/settings?section=security',
});

// Unlink social account:
await authClient.unlinkAccount({ providerId: 'google' });
```

## Schema Changes Required

### New/Modified Models for Prisma

```prisma
// ADD to User model:
twoFactorEnabled  Boolean  @default(false)

// NEW model (better-auth twoFactor plugin):
model TwoFactor {
  id          String  @id @default(cuid())
  secret      String
  backupCodes String
  userId      String
  user        User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("two_factor")  // better-auth convention
}

// NEW model (better-auth passkey plugin):
model Passkey {
  id           String   @id @default(cuid())
  name         String?
  publicKey    String
  userId       String
  credentialID String
  counter      Int      @default(0)
  deviceType   String
  backedUp     Boolean  @default(false)
  transports   String?
  aaguid       String?
  createdAt    DateTime @default(now())
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([credentialID])
  @@map("passkeys")
}

// ADD to User model for onboarding tracking:
onboardingComplete  Boolean  @default(false)
```

**Strategy for old models:** Keep `MfaSecret`, `MfaBackupCode`, `TrustedDevice`, `WebAuthnCredential` in schema during this phase (they have FK relations to User). Mark them `@deprecated`. Delete in Phase 58 (CLN-04).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom TOTP via otplib/speakeasy | better-auth twoFactor plugin | better-auth 1.0+ | No custom crypto code needed |
| Custom WebAuthn via @simplewebauthn | @better-auth/passkey plugin | better-auth 1.4+ (separate package) | Plugin wraps SimpleWebAuthn, manages DB |
| Custom OAuth state machine | better-auth socialProviders | better-auth 1.0+ | Zero custom OAuth code |
| `isMfaEnabled` custom field | `twoFactorEnabled` managed by plugin | This phase | Plugin auto-manages the field |

**Deprecated/outdated:**
- `MfaSecret` model: replaced by `TwoFactor` table (plugin-managed)
- `MfaBackupCode` model: backup codes now stored as encrypted string in `TwoFactor.backupCodes`
- `WebAuthnCredential` model: replaced by `Passkey` table (plugin-managed)
- `TrustedDevice` model: replaced by better-auth's built-in `trustDevice` option on verify
- All files in `backend/src/modules/auth/services/totp.service.ts`, `webauthn.service.ts`, `controllers/mfa.controller.ts`, `dtos/mfa.dto.ts`
- All files in `frontend/components/mfa/*`
- `frontend/lib/api/mfa.ts`

## Files to Delete

### Backend (4 files)
- `backend/src/modules/auth/services/totp.service.ts`
- `backend/src/modules/auth/services/webauthn.service.ts`
- `backend/src/modules/auth/controllers/mfa.controller.ts`
- `backend/src/modules/auth/dtos/mfa.dto.ts`

### Frontend (7 files)
- `frontend/components/mfa/MfaSettings.tsx`
- `frontend/components/mfa/TotpSetupWizard.tsx`
- `frontend/components/mfa/BackupCodesCard.tsx`
- `frontend/components/mfa/PasskeyCard.tsx`
- `frontend/components/mfa/TrustedDevicesList.tsx`
- `frontend/components/mfa/index.ts`
- `frontend/lib/api/mfa.ts`

## Open Questions

1. **Workspace provisioning for social users**
   - What we know: Current `databaseHooks.user.create.after` only provisions workspace for `/sign-up/email` path. Social login creates users via different paths.
   - What's unclear: Whether to extend the hook OR defer workspace creation entirely to the wizard (step 2).
   - Recommendation: Defer to wizard. Social login creates user WITHOUT tenant. Wizard step 2 creates tenant. This is cleaner and works for all user types.

2. **OAuth token reuse for email sync**
   - What we know: Social login stores `accessToken` and `refreshToken` in the `Account` table. The same credentials could power email sync.
   - What's unclear: Whether the existing email provider connection flow can read from the Account table, or if it needs adaptation.
   - Recommendation: During wizard step 3, detect social provider account, read tokens from Account table, auto-configure email provider. May require a backend endpoint to bridge the Account table to the email provider setup.

3. **Onboarding state tracking**
   - What we know: Need a way to track wizard completion for middleware redirect.
   - What's unclear: Whether to use User.onboardingComplete field or a separate tracking mechanism.
   - Recommendation: Add `onboardingComplete` boolean to User additionalFields. Simple, queryable, works with session cookie cache.

4. **better-auth passkey table naming**
   - What we know: Plugin expects a `passkey` table. Existing `WebAuthnCredential` uses `webauthn_credentials` mapping.
   - What's unclear: Whether better-auth's Prisma adapter respects custom table names via `@@map`.
   - Recommendation: Create a new `Passkey` model with `@@map("passkeys")`. Keep old `WebAuthnCredential` deprecated until Phase 58. Run `npx @better-auth/cli generate` to verify expected schema.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual + Playwright (existing) |
| Config file | N/A -- auth flows require browser interaction |
| Quick run command | `cd frontend && npm run type-check && npm run lint` |
| Full suite command | `cd frontend && npm run type-check && npm run lint && cd ../backend && npm run lint` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CORE-03 | Google OAuth sign-in lands on dashboard | e2e/manual | Playwright or manual browser test | No -- Wave 0 |
| SEC-01 | TOTP enable + QR scan + verify | e2e/manual | Manual browser test (TOTP requires authenticator app) | No -- Wave 0 |
| SEC-02 | Backup code login bypass | integration | Can script via API calls to twoFactor.verifyBackupCode | No -- Wave 0 |
| SEC-03 | Passkey register + authenticate | e2e/manual | Manual browser test (WebAuthn requires browser dialog) | No -- Wave 0 |
| SEC-04 | Security settings CRUD | smoke | Manual verification of settings page sections | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npm run type-check && npm run lint`
- **Per wave merge:** Full type-check + lint + manual smoke test of modified flows
- **Phase gate:** Manual walkthrough of all 5 success criteria before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/tests/auth/social-login.spec.ts` -- Playwright test for Google OAuth redirect (mock)
- [ ] `frontend/tests/auth/two-factor.spec.ts` -- Playwright test for TOTP setup flow
- [ ] `backend/src/common/auth/__tests__/better-auth-plugins.spec.ts` -- Unit test verifying plugin registration
- [ ] Type-check and lint must pass with new plugin types

Note: Most auth flows (OAuth redirect, WebAuthn browser dialog, TOTP QR scan) are inherently manual or require complex e2e setup. The primary automated validation is **type-check + lint** ensuring no build breakage. Full verification is manual walkthrough.

## Sources

### Primary (HIGH confidence)
- [better-auth official docs - Google OAuth](https://better-auth.com/docs/authentication/google)
- [better-auth official docs - Microsoft OAuth](https://better-auth.com/docs/authentication/microsoft)
- [better-auth official docs - Two-Factor Auth](https://better-auth.com/docs/plugins/2fa)
- [better-auth official docs - Passkey](https://better-auth.com/docs/plugins/passkey)
- [better-auth official docs - Session Management](https://better-auth.com/docs/concepts/session-management)
- [better-auth official docs - Account Linking](https://better-auth.com/docs/concepts/users-accounts)
- better-auth v1.5.4 source code (installed in node_modules) -- schema definitions verified

### Secondary (MEDIUM confidence)
- [DeepWiki - better-auth Two-Factor Authentication](https://deepwiki.com/better-auth/better-auth/4.6-two-factor-authentication)
- [DeepWiki - better-auth Passkey & WebAuthn](https://deepwiki.com/better-auth/better-auth/4.6-passkey-and-webauthn)
- [@better-auth/passkey npm](https://www.npmjs.com/package/@better-auth/passkey)

### Tertiary (LOW confidence)
- IP geolocation approach for session display (not researched deeply -- Claude's discretion per CONTEXT.md)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed or official better-auth plugins with verified docs
- Architecture: HIGH -- dual-instance pattern established in prior phases, plugin integration is additive
- Pitfalls: HIGH -- verified against actual codebase (schema conflicts, hook paths, callback URLs)
- Onboarding wizard: MEDIUM -- UI patterns are Claude's discretion, no prior wizard pattern in codebase
- OAuth scope reuse for mail sync: MEDIUM -- needs validation during implementation

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable -- better-auth v1.5.x is mature)
