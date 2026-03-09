# Phase 55: Social Login & MFA - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can sign in with Google or Microsoft OAuth and protect their accounts with TOTP 2FA or passkeys (WebAuthn). MFA is mandatory for GDPR compliance — every user must configure at least one MFA method (TOTP or passkey) before accessing the dashboard. A security settings page lets users manage MFA methods, passkeys, active sessions, connected social accounts, and password. A setup wizard guides all new users (social and email/password) through profile completion, tenant setup, email provider connection, and mandatory MFA enrollment.

Requirements: CORE-03, SEC-01, SEC-02, SEC-03, SEC-04

</domain>

<decisions>
## Implementation Decisions

### Social Login Providers
- Support Google and Microsoft OAuth (both client IDs already in .env)
- Reuse existing OAuth credentials (GMAIL_CLIENT_ID, MICROSOFT_CLIENT_ID) — same app for login and mail sync, combined scopes
- Social buttons placed ABOVE email/password form with "or" divider on both login and register pages
- Auto-link accounts: if social email matches verified existing account, link automatically (better-auth trustedProviders)
- Social-only users can enable MFA (TOTP or passkey) like any other user

### Onboarding Wizard (All New Users)
- ALL new users (social and email/password) go through a blocking setup wizard immediately after signup/first login
- Wizard is mandatory — user cannot access dashboard until complete
- Wizard steps:
  1. Name confirmation (pre-filled from OAuth profile or registration, editable)
  2. Tenant/workspace setup (create or join)
  3. Email provider connection (if logged in with Google → auto-offer Gmail sync; Microsoft → Outlook sync)
  4. Optional avatar (pull from OAuth profile or upload)
  5. Mandatory MFA setup (TOTP or passkey — user picks at least one)
- Wizard lives at a dedicated route, middleware redirects incomplete users there

### Email Provider Auto-Sync
- If user logged in with Google, auto-offer Gmail sync using same OAuth token during wizard
- If user logged in with Microsoft, auto-offer Outlook sync using same OAuth token during wizard
- No need to re-authenticate for email separately when social provider matches

### MFA Enforcement (GDPR Mandatory)
- MFA is mandatory for all users (GDPR Article 32 — "state of the art" security for SaaS handling confidential email data)
- Either TOTP or passkey satisfies the requirement — user chooses during wizard
- Users can add both methods for extra security
- Enforced immediately at signup (mandatory wizard step), not after a grace period

### TOTP 2FA
- TOTP setup via QR code (qrcode package already installed)
- 10 backup codes generated after TOTP setup
- Backup codes shown once + downloadable as .txt file
- Warning: "Save these — you won't see them again"
- Backup codes can be regenerated from security settings (invalidates old ones)
- Enable/disable TOTP from security settings page

### Passkey Experience
- Passkeys work as both primary login (passwordless) AND second factor — user's choice
- Full fallback chain: Passkey (Conditional UI) → Cross-device QR → Email/password + TOTP → Recovery codes
- Auto-name passkeys from device/browser info (e.g., "Chrome on Windows"), editable from settings
- Maximum 5 passkeys per user
- Registration and management from security settings page

### Security Settings Page
- Route: `/dashboard/settings?section=security` (existing settings page with security section)
- Rewrite from scratch using better-auth client APIs — delete all old MFA components (MfaSettings, TotpSetupWizard, BackupCodesCard, PasskeyCard, TrustedDevicesList, mfaApi)
- Four sections:
  1. **MFA methods** — Enable/disable TOTP, manage passkeys (add/remove/rename), backup codes status, regenerate codes
  2. **Active sessions** — List with device, browser, OS, location (city/country from IP geo), last active time. Individual session revoke + "Revoke all other sessions" button
  3. **Connected accounts** — Linked social providers (Google, Microsoft), link/unlink capability
  4. **Password change** — Change password form (current + new). "Set password" option for social-only users
- Built with MUI components (consistent with existing settings page)

### Old Code Cleanup
- Delete old custom MFA backend code: totp.service.ts, webauthn.service.ts, mfa.controller.ts, mfa.dto.ts
- Delete old frontend MFA components: MfaSettings.tsx, TotpSetupWizard, BackupCodesCard, PasskeyCard, TrustedDevicesList
- Delete old mfaApi client module
- Replace with better-auth plugins (twoFactor, passkey) on server and client

### Claude's Discretion
- Exact wizard step UI/layout design
- better-auth plugin configuration details (twoFactor, passkey, socialProviders)
- IP-to-location service choice for session geolocation (MaxMind GeoLite2 or similar)
- Conditional UI implementation details for passkey autofill
- Cross-device QR code implementation approach
- Session list pagination/sorting

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/lib/auth.ts`: better-auth server config — needs socialProviders + twoFactor + passkey plugins added
- `frontend/lib/auth-client.ts`: better-auth React client — needs matching client plugins added
- `frontend/components/dashboard/Settings.tsx`: Main settings page with sidebar navigation, already has "security" section slot (renders MfaSettings)
- `frontend/components/settings/`: Settings component pattern (GeneralSettings, AiSettings, etc.)
- `frontend/components/auth/PasswordField.tsx`: Password input with visibility toggle — reusable
- `frontend/components/auth/AuthLayout.tsx`: Auth page layout wrapper
- `@simplewebauthn/server` already installed (old passkey support — may conflict with better-auth's built-in passkey plugin)
- `qrcode` package already installed (for TOTP QR code generation)
- GOOGLE_CLIENT_ID and MICROSOFT_CLIENT_ID already configured in .env

### Established Patterns
- Settings page: sidebar + content area with section switching via URL query param (`?section=security`)
- Auth pages: custom MUI forms in `pages/auth/` with AuthLayout wrapper
- API client: `lib/api-client.ts` with axios interceptors (withCredentials: true)
- NestJS is session consumer only — all auth mutations happen in Next.js (better-auth)
- i18n: translations in `locales/en.ts` and `locales/it.ts` via useTranslations hook

### Integration Points
- `frontend/lib/auth.ts`: Add socialProviders, twoFactor, passkey plugins to better-auth server config
- `frontend/lib/auth-client.ts`: Add matching client plugins
- `frontend/pages/auth/login.tsx` and `register.tsx`: Add social login buttons above form
- `frontend/components/dashboard/Settings.tsx` line 116: Replace `<MfaSettings />` with new security settings component
- `frontend/middleware.ts`: Add wizard redirect logic for incomplete users
- NestJS BetterAuthModule: May need consumer-side awareness of 2FA status for session validation

</code_context>

<specifics>
## Specific Ideas

- Social login buttons above email form, "or" divider — like Linear/Vercel login pages
- Wizard must be blocking — no dashboard access until tenant + email provider + MFA are configured
- Smart email sync: if you logged in with Google, the wizard auto-offers Gmail sync using the same OAuth token
- GDPR justification: CNIL (France) starting MFA enforcement investigations in 2026; multiple EU fines (£3.1M, €3M) cited lack of MFA as Article 32 violation
- ENISA hierarchy: Passkeys (phishing-resistant) > TOTP > Email OTP > SMS (last resort)
- Passkey fallback chain follows Google/GitHub/Microsoft patterns: Conditional UI → Cross-device QR → Password + TOTP → Recovery codes

</specifics>

<deferred>
## Deferred Ideas

- GitHub as third social provider — add when developer-oriented user base grows
- Magic link auth — out of scope per REQUIREMENTS.md
- SMS OTP — avoid per ENISA guidance (SIM swap vulnerable)
- Progressive passkey enrollment nudge post-login (for existing users who haven't set up passkeys)
- Onboarding wizard for existing users who need to set up MFA (migration prompt)

</deferred>

---

*Phase: 55-social-login-mfa*
*Context gathered: 2026-03-09*
