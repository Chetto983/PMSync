# Auth Module Roadmap

Scope: `backend/src/modules/auth` (registration, login + MFA/OTP, JWT strategy/guards, password reset, tenant guard, WebAuthn/passkeys). Audience: auth/backend owners, security.

## Current Progress (2025-12-05)

### ✅ Completed

- [DONE] **JWT Secret Validation**: Fail-fast on missing/weak JWT_SECRET (no fallback to 'secret')
- [DONE] **Separate Secrets**: Different secrets for access tokens and password reset tokens
- [DONE] **Session Validation**: JWT strategy validates session existence, expiry, and revocation
- [DONE] **User/Tenant Active Checks**: Login and JWT validation check isActive status
- [DONE] **Role Change Detection**: Tokens rejected if role changed since issuance
- [DONE] **OTP Hashing**: OTP codes hashed with HMAC-SHA256 via OtpSecurityService
- [DONE] **Rate Limiting**: Per-user OTP rate limiting with lockout after failed attempts
- [DONE] **Tenant Enumeration Prevention**: Generic responses prevent tenant/user disclosure
- [DONE] **No Auto-Tenant Creation**: Registration requires existing tenant
- [DONE] **PII Redaction**: Structured logging with email redaction
- [DONE] **NaN-Safe Config**: Safe integer parsing for all expiration values
- [DONE] **WebAuthn/Passkeys**: Passwordless biometric login (Windows Hello, Face ID, Touch ID)

### 🔄 Remaining

- [x] Hash password reset tokens in DB (HMAC-SHA256 hashed before storage)
- [x] Single active reset token per user (previous tokens deleted on new request)
- [x] Session invalidation on password reset (all sessions deleted)
- [x] Fix deprecated OAuth callback messaging (English messages)
- [ ] Refresh token rotation implementation
- [ ] Prometheus/OpenTelemetry integration for auth metrics

## Key Findings (2025-12-02) - **ADDRESSED**

- High - Weak JWT/config defaults: `auth.module.ts` and `strategies/jwt.strategy.ts` fall back to `secret`; same secret is reused for access and password-reset tokens. Tokens stay valid even if env misconfigured. **[FIXED]**
- High - Logout/session ineffective: `jwt.strategy.ts` does not check the `session` table or expiry, so deleted/expired sessions and role changes are ignored; stolen tokens remain valid until JWT expiry. **[FIXED]**
- High - OTP handling: codes are stored plaintext, no per-user retry counters beyond controller throttles, and expiry uses `parseInt(process.env.OTP_EXPIRATION || '900000')` which can become `NaN` (non-expiring codes). **[FIXED]**
- High - Tenant disclosure/creation model: `register/login/send-otp` auto-derive tenant slug from email and return `Tenant not found`, which leaks tenant existence and allows anyone to mint new active tenants and self-admin accounts. **[FIXED]**
- High - Password reset tokens: stored unhashed, not limited per user, no `type` check beyond JWT decode, and use the same secret as access tokens; compromised DB or shared secret enables resets. **[FIXED - hashed tokens, single active token, separate secret, type validation, session invalidation]**
- Medium - User/tenant status not enforced: login/JWT validation does not check `isActive`, email verification, or tenant active state (outside `TenantGuard`-protected routes). **[FIXED]**
- Medium - PII in logs: warnings log emails/tenant ids; no redaction guidelines. **[FIXED]**
- Medium - Deprecated OAuth callbacks contain mojibake text; UX/documentation gap. **[FIXED - English messages]**
- Low - Unused provider: `CryptoService` is provided but unused in auth paths. **[FIXED - removed]**

## Roadmap

### Phase 1 - Config and Token Safety ✅ COMPLETE

- [DONE] Fail-fast on missing/weak JWT_SECRET in `auth.module.ts` and `jwt.strategy.ts`
- [DONE] Separate PASSWORD_RESET_SECRET from JWT_SECRET
- [DONE] NaN-safe config parsing for all expiration values
- [DONE] AuthConfigService with validated configuration

**Files created:**

- `services/auth-config.service.ts`: Centralized config with fail-fast validation

### Phase 2 - Session Truth and Revocation ✅ COMPLETE

- [DONE] JWT strategy validates session existence, expiry, and user consistency
- [DONE] Reject tokens for deleted/expired sessions
- [DONE] Role change detection (reject if role changed since token issuance)
- [DONE] Structured logging for token rejection reasons

**Files modified:**

- `strategies/jwt.strategy.ts`: Full session validation with 10 rejection reasons

### Phase 3 - MFA/OTP Hardening ✅ COMPLETE

- [DONE] OTP codes hashed with HMAC-SHA256 before storage
- [DONE] Per-user rate limiting (configurable via OTP_RATE_LIMIT_*)
- [DONE] Lockout after N failed attempts (OTP_MAX_ATTEMPTS, OTP_LOCKOUT_DURATION)
- [DONE] Generic responses prevent tenant/user enumeration

**Files created:**

- `services/otp-security.service.ts`: Hashed OTP storage, rate limiting, lockout

### Phase 4 - Password Reset Safety ✅ COMPLETE

- [DONE] Separate secret (PASSWORD_RESET_SECRET) from access tokens
- [DONE] Hash reset tokens in DB (HMAC-SHA256 before storage)
- [DONE] Single active token per user (previous tokens deleted on new request)
- [DONE] Invalidate sessions on password reset (all user sessions deleted)

### Phase 5 - Tenant and Identity Model ✅ COMPLETE

- [DONE] No auto-tenant creation from email
- [DONE] Generic responses prevent tenant enumeration
- [DONE] Check `user.isActive` and `tenant.isActive` on all auth flows
- [DONE] Role included in JWT for change detection

**Files modified:**

- `services/auth.service.ts`: All security fixes applied

### Phase 6 - Observability and Tests ✅ COMPLETE

- [DONE] Structured JSON logging for all auth events
- [DONE] PII redaction (emails show first 2 chars + domain)
- [DONE] Updated tests for new security behavior (77 tests passing)

### Phase 7 - Cleanup and UX ✅ COMPLETE

- [DONE] Removed unused `CryptoService` from auth.module.ts
- [DONE] Fix deprecated OAuth callback messaging (English messages with @deprecated JSDoc)

### Phase 8 - WebAuthn/Passkey Authentication ✅ COMPLETE (2025-12-05)

- [DONE] Install `@simplewebauthn/server` v10+ and `@simplewebauthn/browser` v10+
- [DONE] Add `WebAuthnCredential` Prisma model
- [DONE] Create `webauthn.service.ts` with registration/authentication flows
- [DONE] Add MFA controller endpoints for passkey management
- [DONE] Add public endpoints for passwordless login (`/auth/webauthn/login/*`)
- [DONE] Frontend PasskeyCard component for security settings
- [DONE] Login page "Sign in with Passkey" button
- [DONE] i18n translations (EN/IT)

**See [MFA_ENHANCEMENT_ROADMAP.md](./MFA_ENHANCEMENT_ROADMAP.md) for full WebAuthn details.**

## Architecture Summary

```text
auth.module.ts
├── AuthService              # Main auth logic with security fixes
├── AuthConfigService        # Fail-fast configuration validation
├── OtpSecurityService       # Hashed OTP with rate limiting
├── JwtStrategy              # Session-validated JWT verification
├── EmailService             # OTP and password reset emails
├── TotpService              # TOTP (authenticator app) MFA
├── BackupCodesService       # Backup/recovery codes
├── TrustedDeviceService     # "Keep me signed in" device trust
└── WebAuthnService          # Passkey/biometric authentication
```

## Best Practices Applied

1. **Fail-fast configuration** per [NestJS security guide](https://docs.nestjs.com/security/authentication)
2. **Session-based revocation** for token invalidation (hybrid JWT + session)
3. **HMAC-SHA256 OTP hashing** per [OWASP MFA Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
4. **Rate limiting** per [NIST 800-63b](https://pages.nist.gov/800-63-3/sp800-63b.html)
5. **Generic responses** to prevent user/tenant enumeration
6. **PII redaction** in all logs per GDPR best practices
