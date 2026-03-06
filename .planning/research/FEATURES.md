# Feature Landscape: better-auth Migration (v5.0)

**Domain:** Authentication framework migration (custom NestJS auth -> better-auth)
**Researched:** 2026-03-06
**Overall confidence:** HIGH (official docs verified via WebFetch)

## Plugin-to-Need Mapping

PMSync needs mapped to better-auth capabilities:

| PMSync Need | better-auth Solution | Type | Confidence |
|-------------|---------------------|------|------------|
| Email/password auth | Built-in (core) | Built-in | HIGH |
| Argon2id hashing | Built-in (configurable) | Built-in | HIGH |
| Google OAuth | Built-in social provider | Built-in | HIGH |
| 2FA (TOTP) | `twoFactor()` plugin | Official plugin | HIGH |
| Passkeys/WebAuthn | `passkey()` plugin | Official plugin | HIGH |
| Organizations/roles | `organization()` plugin | Official plugin | HIGH |
| Admin panel | `admin()` plugin + better-auth-ui or community dashboard | Plugin + community | HIGH |
| HIBP password policy | `haveIBeenPwned()` plugin | Official plugin | HIGH |
| Session management | Built-in | Built-in | HIGH |
| Session concurrency | Not built-in; needs custom hook or Sentinel | Custom | MEDIUM |
| Idle timeout | Built-in session expiry config | Built-in | MEDIUM |
| JWT tokens | `jwt()` plugin (optional; default is session-based) | Official plugin | HIGH |
| __Host- cookie prefix | Not configurable; better-auth manages its own cookies | Gap | MEDIUM |
| Enumeration hardening | Built-in (configurable) | Built-in | MEDIUM |
| Rate limiting | Built-in (production default) | Built-in | HIGH |
| NestJS integration | `@thallesp/nestjs-better-auth` community package | Community | HIGH |

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | better-auth Coverage | Notes |
|---------|--------------|------------|---------------------|-------|
| Email/password sign-up and sign-in | Core auth flow | Low | **Built-in** | Includes password hashing, email verification, password reset |
| Google OAuth login | Users expect "Sign in with Google" | Low | **Built-in** social provider | `socialProviders.google` config with clientId/clientSecret. Callback URL: `/api/auth/callback/google` |
| Email verification | Prevent fake accounts | Low | **Built-in** | Requires email sending config (Resend, nodemailer, etc.) |
| Password reset | Users forget passwords | Low | **Built-in** | Email-based reset flow |
| Session management | Track who is logged in | Low | **Built-in** | Cookie-based sessions, configurable expiry |
| HIBP password check | Block compromised passwords | Low | **`haveIBeenPwned()` plugin** | Drop-in replacement for our custom implementation. Only sends first 5 chars of hash. Returns `PASSWORD_COMPROMISED` error code |
| Rate limiting on auth endpoints | Brute force protection | Low | **Built-in** | Enabled by default in production. Per-IP tracking. 429 responses with Retry-After header |
| NestJS session validation | Backend verifies auth | Med | **`@thallesp/nestjs-better-auth`** | Global AuthGuard, `@Session()` decorator, `@AllowAnonymous()`, `@OptionalAuth()`. Requires `bodyParser: false` in NestJS bootstrap |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | better-auth Coverage | Notes |
|---------|-------------------|------------|---------------------|-------|
| TOTP 2FA | Enterprise security expectation | Med | **`twoFactor()` plugin** | TOTP + OTP email. Backup codes auto-generated. Trusted device (30-day). Adds `twoFactor` table + `twoFactorEnabled` field on user |
| Passkey/WebAuthn | Passwordless future, phishing-resistant | Med | **`passkey()` plugin** | Uses SimpleWebAuthn. Adds `passkey` table. Supports conditional UI (autofill). Platform + cross-platform authenticators |
| Organizations and roles | Multi-tenant workspaces | High | **`organization()` plugin** | 3 default roles (owner/admin/member). Custom permissions. Invitations with expiry. Teams (optional). Adds `organization`, `member`, `invitation` tables. Extensive hooks (before/after for all CRUD) |
| Admin panel (user management) | Internal ops, user support | Med | **`admin()` plugin** | Create/list/update/remove users. Ban/unban with reason+expiry. Impersonation. Session revocation. Role assignment. Adds `role`, `banned`, `banReason`, `banExpires` to user table |
| Admin dashboard UI | Visual admin interface | Med | **Community: `better-auth-dashboard`** | shadcn/ui based. Works with admin plugin dynamically. Alternative: build custom with admin API |
| Pre-built auth UI components | Fast implementation, consistent UX | Low | **`better-auth-ui` (@daveyplate)** | Full component library: `<AuthView>`, `<UserButton>`, `<SignedIn/Out>`, `<TwoFactorCard>`, `<PasskeysCard>`, `<OrganizationSwitcher>`, `<SessionsCard>`, etc. Requires shadcn/ui + Tailwind v4 |
| Sentinel (advanced security) | Credential stuffing, impossible travel, bot blocking | Med | **`sentinel()` plugin** (infrastructure) | Device fingerprinting, geo-blocking, impossible travel detection, dormant account detection, PoW challenges |
| Audit logging | Compliance (GDPR already in PMSync) | Low | **`auditLog()` plugin** | Track auth events. Complements PMSync existing audit logging |

## Anti-Features

Features to explicitly NOT build. better-auth handles them, or they are unnecessary.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Custom JWT infrastructure (ES256, refresh rotation, family theft detection) | better-auth handles sessions natively with httpOnly cookies. Our custom JWT code is the thing that is broken. | Use better-auth built-in session management. If JWT needed for API clients, use `jwt()` or `bearer()` plugin |
| Custom Argon2id hashing code | better-auth handles password hashing internally | Remove custom hashing code |
| Custom HIBP integration | `haveIBeenPwned()` plugin does exactly this | Drop our custom implementation |
| Custom rate limiting on auth routes | better-auth has built-in rate limiting | Remove custom rate limiting on auth endpoints. Keep app-level rate limiting for non-auth routes |
| Custom session concurrency management | Complex custom code that is fragile | Investigate if session hooks can enforce limits. May need one custom hook |
| Custom enumeration hardening | better-auth has configurable responses for sign-in/sign-up | Configure better-auth built-in security options |
| __Host- cookie prefix management | better-auth manages its own cookies. Fighting the framework for cookie naming is fragile | Accept better-auth cookie format. Our custom __Host- prefix was a nice-to-have, not a requirement |
| Custom OAuth callback handling | better-auth manages the full OAuth flow | Remove custom Google OAuth code entirely |
| OIDC Provider plugin | We are not an OAuth provider, we are a consumer | Do not add `oidcProvider()` |
| SSO/SAML | Enterprise B2B feature we do not need yet | Out of scope for v5.0. Can add later as plugin |
| Anonymous auth | No use case in PMSync | Do not add `anonymous()` plugin |
| Magic link auth | Adds complexity without value for our users | Do not add `magicLink()` -- email/password + Google is sufficient |

## Feature Dependencies

```
Email/Password (built-in) ──────────────────────────> ALL other features
                                                       |
Google OAuth (built-in) ────────────────────────────> Account linking
                                                       |
NestJS integration (@thallesp/nestjs-better-auth) ──> Backend route protection
  |
  +-- Requires: bodyParser: false in NestJS bootstrap
  +-- Requires: better-auth instance shared or importable
                                                       |
2FA plugin (twoFactor) ─────────────────────────────> Requires: email/password working
  |
  +-- TOTP setup -----> QR code generation
  +-- Backup codes ---> Auto-generated on enable
  +-- Trusted device -> 30-day cookie
                                                       |
Passkey plugin ─────────────────────────────────────> Requires: WebAuthn browser support
  |
  +-- Can work standalone OR as 2FA method
                                                       |
Organization plugin ────────────────────────────────> Requires: working auth
  |
  +-- Roles/permissions ----> Custom permission definitions
  +-- Invitations ----------> Email sending configured
  +-- Teams (optional) -----> Adds another hierarchy level
                                                       |
Admin plugin ───────────────────────────────────────> Requires: role field on user
  |
  +-- Ban/unban ---------> banReason, banExpires fields
  +-- Impersonation -----> impersonatedBy on session
  +-- User CRUD ---------> Full user lifecycle management
                                                       |
better-auth-ui ─────────────────────────────────────> Requires: shadcn/ui + Tailwind v4
  |                                                    (PMSync already has shadcn/ui + Tailwind)
  +-- AuthView ----------> Sign-in, sign-up, forgot password
  +-- UserButton --------> Profile dropdown
  +-- SecuritySettings --> 2FA + passkeys management
  +-- OrgSwitcher -------> Org selection UI
```

## Complete Official Plugin Catalog (for reference)

### Authentication Methods (built-in social providers)
Apple, Atlassian, Cognito, Discord, Dropbox, Facebook, Figma, GitHub, GitLab, **Google**, Hugging Face, Kakao, Kick, LINE, Linear, LinkedIn, Microsoft, Naver, Notion, PayPal, Polar, Railway, Reddit, Roblox, Salesforce, Slack, Spotify, TikTok, Twitch, Twitter/X, Vercel, VK, Zoom

### Core Auth Plugins

| Plugin | Relevant to PMSync? | Why/Why Not |
|--------|---------------------|-------------|
| `twoFactor()` | **YES** | TOTP + OTP + backup codes |
| `passkey()` | **YES** | WebAuthn/FIDO2 |
| `organization()` | **YES** | Multi-tenant roles/permissions |
| `admin()` | **YES** | User management, ban, impersonation |
| `haveIBeenPwned()` | **YES** | Password breach checking |
| `bearer()` | **MAYBE** | API token auth for non-browser clients |
| `jwt()` | **MAYBE** | Only if NestJS needs JWT instead of session cookies |
| `multiSession()` | NO | Single active session per device is fine |
| `username()` | NO | PMSync uses email-based auth |
| `anonymous()` | NO | No anonymous access needed |
| `magicLink()` | NO | Unnecessary complexity |
| `emailOTP()` | NO | Covered by twoFactor plugin OTP method |
| `oneTap()` | **MAYBE** | Google One Tap sign-in -- nice UX but not critical |
| `apiKey()` | NO | No API key auth needed yet |
| `genericOAuth()` | NO | Named providers (Google) are better |
| `captcha()` | **MAYBE** | Bot protection on sign-up. Consider for hardening |

### Infrastructure Plugins

| Plugin | Relevant? | Notes |
|--------|-----------|-------|
| `sentinel()` | **MAYBE** | Advanced security. Credential stuffing, impossible travel, bot detection. Consider for Phase 2 |
| `auditLog()` | **MAYBE** | PMSync already has audit logging. Could unify or keep separate |
| `dashboard()` | NO | Better Auth Infrastructure cloud service -- we self-host |
| `i18n()` | **MAYBE** | PMSync already has i18n (en/it). Could localize auth error messages |

### Payment/Billing Plugins
All NO -- PMSync does not have billing.

### Enterprise Plugins

| Plugin | Relevant? | Notes |
|--------|-----------|-------|
| `sso()` | NO (v5.0) | Future consideration for enterprise customers |
| `scim()` | NO | Directory sync, enterprise-only |
| `oAuth2Provider()` | NO | We consume OAuth, do not provide it |

## better-auth-ui Component Inventory

Pre-built shadcn/ui components from `@daveyplate/better-auth-ui`:

### Core Auth Components
- `<AuthView />` -- Main auth interface (sign-in, sign-up, forgot password views)
- `<AuthUIProvider />` -- Configuration wrapper (required)
- `<RedirectToSignIn />` / `<RedirectToSignUp />` -- Auto-redirect helpers
- `<SignedIn />` / `<SignedOut />` / `<AuthLoading />` -- Conditional rendering

### User Components
- `<UserButton />` -- Profile dropdown menu
- `<UserAvatar />` -- Avatar display

### Account Settings Cards
- `<AccountSettingsCards />` -- All settings grouped
- `<ChangeEmailCard />` -- Email change form
- `<ChangePasswordCard />` -- Password change form
- `<DeleteAccountCard />` -- Account deletion
- `<UpdateAvatarCard />` -- Avatar upload
- `<UpdateUsernameCard />` -- Username change
- `<UpdateNameCard />` -- Name change
- `<UpdateFieldCard />` -- Generic field update

### Security Cards
- `<SecuritySettingsCards />` -- All security settings grouped
- `<SessionsCard />` -- Active session management
- `<TwoFactorCard />` -- 2FA setup/management
- `<PasskeysCard />` -- Passkey management
- `<ProvidersCard />` -- Social provider linking
- `<AccountsCard />` -- Linked accounts

### Organization Components
- `<OrganizationSwitcher />` -- Org selection dropdown
- `<OrganizationSettingsCards />` -- Org settings
- `<OrganizationMembersCard />` -- Member management
- `<AcceptInvitationCard />` -- Invitation acceptance

### Other
- `<ApiKeysCard />` -- API key management
- `<EmailTemplate />` -- Email template preview

## MVP Recommendation

### Phase 1: Core Auth (must ship first)
1. **Email/password** (built-in) -- basic registration and login
2. **Google OAuth** (built-in) -- social login
3. **HIBP** (`haveIBeenPwned()` plugin) -- password security
4. **NestJS integration** (`@thallesp/nestjs-better-auth`) -- backend session validation
5. **better-auth-ui components** -- sign-in/sign-up/forgot-password UI

### Phase 2: Security Layer
6. **2FA/TOTP** (`twoFactor()` plugin) -- second factor
7. **Passkeys** (`passkey()` plugin) -- passwordless option
8. **SecuritySettingsCards** from better-auth-ui -- user self-service 2FA management

### Phase 3: Multi-Tenancy and Admin
9. **Organizations** (`organization()` plugin) -- roles, permissions, invitations
10. **Admin** (`admin()` plugin) -- user management, ban/unban, impersonation
11. **Admin dashboard** (community `better-auth-dashboard` or custom) -- visual management

### Defer
- **Sentinel**: Nice-to-have advanced security. Add after core auth is stable.
- **SSO/SAML**: No enterprise B2B need yet.
- **Bearer/JWT plugins**: Only if API-only clients need token auth.
- **Audit log plugin**: PMSync already has audit logging. Evaluate unification later.

## What We DROP from Custom Auth

These features exist in PMSync v4.1 but will be replaced or dropped:

| Current Custom Feature | better-auth Replacement | Action |
|------------------------|------------------------|--------|
| Argon2id hashing (custom) | better-auth internal hashing | DELETE custom code |
| ES256 JWT with refresh rotation | better-auth session cookies | DELETE JWT infrastructure |
| Family-based theft detection | better-auth session management | DELETE custom code |
| HIBP password policy (custom) | `haveIBeenPwned()` plugin | DELETE custom HIBP code |
| Session concurrency limits | Custom hook on better-auth session creation | MIGRATE logic |
| Idle timeout | better-auth session expiry config | CONFIGURE |
| __Host- cookie prefix | better-auth cookie management | DROP (accept framework defaults) |
| Enumeration hardening | better-auth built-in security config | CONFIGURE |
| Custom OAuth handling | better-auth social providers | DELETE custom code |
| Custom rate limiting (auth) | better-auth built-in rate limiting | DELETE auth-specific rate limiting |

## Database Schema Impact

better-auth manages its own tables. With all recommended plugins, these tables are added:

| Table | Plugin | Purpose |
|-------|--------|---------|
| `user` | Core | Extended with `role`, `banned`, `banReason`, `banExpires`, `twoFactorEnabled` |
| `session` | Core | Extended with `activeOrganizationId`, `impersonatedBy` |
| `account` | Core | OAuth provider accounts linked to users |
| `verification` | Core | Email verification + password reset tokens |
| `twoFactor` | twoFactor | TOTP secrets, backup codes |
| `passkey` | passkey | WebAuthn credentials |
| `organization` | organization | Org data (name, slug, logo, metadata) |
| `member` | organization | User-org relationships with roles |
| `invitation` | organization | Pending org invitations |

**Critical consideration:** PMSync already has a `User` table with extensive relations (emails, folders, contacts, calendar, AI data). better-auth will create its own user table. The migration must either:
1. Map better-auth user table to PMSync existing user schema (custom adapter), OR
2. Use better-auth user table and add FK relations from PMSync domain tables

This is the single hardest integration challenge. See PITFALLS.md for details.

## Organization Plugin Deep Dive

### Default Roles and Permissions

| Role | Organization | Member | Invitation |
|------|-------------|--------|------------|
| **Owner** | update, delete | create, update, delete | create, cancel |
| **Admin** | update | create, update, delete | create, cancel |
| **Member** | (none) | (none) | (none) |

### Custom Permissions Syntax
```typescript
// Define custom resources and actions
const ac = createAccessControl({
  project: ["create", "read", "update", "delete", "share"],
  document: ["create", "read", "update", "delete"],
});

// Create custom roles
const roles = {
  editor: ac.newRole({ project: ["read", "update"], document: ["create", "read", "update"] }),
  viewer: ac.newRole({ project: ["read"], document: ["read"] }),
};
```

### Lifecycle Hooks (22 hooks total)
- Organization: beforeCreate, afterCreate, beforeUpdate, afterUpdate, beforeDelete, afterDelete
- Member: beforeAdd, afterAdd, beforeRemove, afterRemove, beforeUpdateRole, afterUpdateRole
- Invitation: beforeCreate, afterCreate, beforeAccept, afterAccept, beforeReject, afterReject, beforeCancel, afterCancel
- Team: full CRUD hooks + member hooks

### Configuration Options
- `allowUserToCreateOrganization` -- Restrict creation capability
- `organizationLimit` -- Cap organizations per user
- `creatorRole` -- Default role for org creator
- `membershipLimit` -- Maximum members per organization
- `invitationExpiresIn` -- Validity window (default: 48 hours)
- `cancelPendingInvitationsOnReInvite` -- Auto-cancel previous invites

## Sources

- [better-auth Official Documentation](https://better-auth.com/docs/introduction) - HIGH confidence
- [Organization Plugin](https://better-auth.com/docs/plugins/organization) - HIGH confidence
- [Admin Plugin](https://better-auth.com/docs/plugins/admin) - HIGH confidence
- [2FA Plugin](https://better-auth.com/docs/plugins/2fa) - HIGH confidence
- [Passkey Plugin](https://better-auth.com/docs/plugins/passkey) - HIGH confidence
- [Have I Been Pwned Plugin](https://www.better-auth.com/docs/plugins/have-i-been-pwned) - HIGH confidence
- [Google OAuth](https://better-auth.com/docs/authentication/google) - HIGH confidence
- [NestJS Integration](https://better-auth.com/docs/integrations/nestjs) - HIGH confidence
- [better-auth-ui](https://better-auth-ui.com/) - HIGH confidence
- [@thallesp/nestjs-better-auth](https://github.com/ThallesP/nestjs-better-auth) - HIGH confidence
- [better-auth-dashboard (community)](https://github.com/ping-maxwell/better-auth-dashboard) - MEDIUM confidence
- [Sentinel Plugin](https://better-auth.com/docs/infrastructure/plugins/sentinel) - HIGH confidence
- [better-auth llms.txt (full plugin list)](https://www.better-auth.com/llms.txt) - HIGH confidence
- [Community Plugins](https://better-auth.com/docs/plugins/community-plugins) - HIGH confidence
- [NestJS + BetterAuth tutorial series (Feb 2026)](https://medium.com/@andysenclave/nestjs-betterauth-part-1-from-zero-to-login-prisma-cookies-cfcc3e7ecec0) - MEDIUM confidence

---
*Feature research for: PMSync v5.0 better-auth Migration*
*Researched: 2026-03-06*
