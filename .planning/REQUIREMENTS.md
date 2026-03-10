# Requirements: PMSync v5.0

**Defined:** 2026-03-06
**Core Value:** The best professional AI mail client -- fast, intelligent, and secure

## v5.0 Requirements

Requirements for better-auth migration. Each maps to roadmap phases.

### Core Auth

- [x] **CORE-01**: User can sign up with email and password via better-auth
- [x] **CORE-02**: User can sign in with email and password
- [x] **CORE-03**: User can sign in with Google OAuth
- [x] **CORE-04**: User receives email verification after signup
- [x] **CORE-05**: User can reset password via email link
- [x] **CORE-06**: User session persists via httpOnly cookie (DB-backed, no JWT)
- [x] **CORE-07**: Compromised passwords blocked via HIBP check on signup/change

### NestJS Integration

- [x] **NEST-01**: NestJS validates better-auth sessions via shared DB (AuthGuard)
- [x] **NEST-02**: TenantGuard reads tenantId from better-auth session user
- [x] **NEST-03**: RolesGuard enforces role-based access from better-auth session
- [x] **NEST-04**: bodyParser selectively disabled for auth routes only
- [x] **NEST-05**: WebSocket handshake validates better-auth session tokens
- [x] **NEST-06**: BullMQ jobs retain correct tenantId from new auth context

### Frontend Auth

- [x] **FEUI-01**: User sees login/signup pages built with custom MUI auth forms
- [x] **FEUI-02**: User session managed via better-auth/react hooks (useSession)
- [x] **FEUI-03**: Auth context replaced with better-auth client (no Zustand auth store)
- [ ] **FEUI-04**: Protected routes redirect unauthenticated users to login

### Security

- [x] **SEC-01**: User can enable TOTP 2FA with QR code setup
- [x] **SEC-02**: User can use backup codes when TOTP device unavailable
- [x] **SEC-03**: User can register and authenticate with passkeys (WebAuthn)
- [x] **SEC-04**: User can manage security settings (2FA, passkeys, sessions)

### Organizations & Roles

- [x] **ORG-01**: User can create an organization
- [x] **ORG-02**: Organization owner can invite members by email
- [x] **ORG-03**: Organization owner/admin can assign roles (owner/admin/member)
- [x] **ORG-04**: User can switch between organizations
- [x] **ORG-05**: Organization permissions enforced on API endpoints

### Admin

- [x] **ADM-01**: Admin can list and search all users
- [x] **ADM-02**: Admin can ban/unban users with reason and expiry
- [x] **ADM-03**: Admin can impersonate users for support
- [x] **ADM-04**: Admin can revoke user sessions

### Compliance & Cleanup

- [x] **CLN-01**: Auth events (login, logout, signup, password change) logged to audit trail
- [x] **CLN-02**: GDPR data export includes better-auth tables (account, verification)
- [x] **CLN-03**: Right to erasure cascades into better-auth tables
- [x] **CLN-04**: Old auth code deleted (~17 services, 5 npm packages, 7 Prisma models)
- [x] **CLN-05**: Auth test suite rewritten for better-auth

### Safety Hardening

- [x] **SAF-01**: All Prisma.raw() vector injections validated via shared utility before SQL construction
- [x] **SAF-02**: DTOs have proper string length bounds (deviation: auth module deleted in Phase 58, better-auth handles validation)
- [x] **SAF-03**: Auth-related database models (Account, Verification, PasswordResetToken) have indexed lookup columns
- [x] **SAF-04**: Zero @SkipThrottle decorators on non-webhook endpoints; tiered rate limits enforced
- [x] **SAF-05**: AI health endpoint restricts detailed info to admin role; public probe returns only status
- [x] **SAF-06**: JWT code fully removed (strategy, guard, token service, config, env vars)
- [x] **SAF-07**: Email verification required for new signups via better-auth config
- [x] **SAF-08**: Swagger inaccessible in production (hard-blocked, no env override)
- [x] **SAF-09**: .env files purged from git history via BFG Repo-Cleaner
- [x] **SAF-10**: All secrets rotated with documented rotation checklist

## Future Requirements

### Advanced Security

- **ASEC-01**: Sentinel plugin (credential stuffing, impossible travel, bot detection)
- **ASEC-02**: Captcha on signup for bot protection
- **ASEC-03**: Session concurrency limits (max sessions per user)

### Enterprise

- **ENT-01**: SSO/SAML for enterprise customers
- **ENT-02**: SCIM directory sync

## Out of Scope

| Feature | Reason |
|---------|--------|
| Magic link auth | Adds complexity without value; email/password + Google sufficient |
| Anonymous auth | No use case in PMSync |
| OIDC Provider | We consume OAuth, do not provide it |
| Custom JWT layer on better-auth | DB sessions are simpler and more secure; cookie cache gives same perf |
| __Host- cookie prefix | Accept better-auth cookie defaults; fighting the framework is fragile |
| Bearer/API key auth | No API-only clients yet; add as plugin later if needed |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | Phase 51 | Complete |
| CORE-02 | Phase 51 | Complete |
| CORE-03 | Phase 55 | Complete |
| CORE-04 | Phase 51 | Complete |
| CORE-05 | Phase 51 | Complete |
| CORE-06 | Phase 50 | Complete |
| CORE-07 | Phase 50 | Complete |
| NEST-01 | Phase 52 | Complete |
| NEST-02 | Phase 52 | Complete |
| NEST-03 | Phase 52 | Complete |
| NEST-04 | Phase 52 | Complete |
| NEST-05 | Phase 54 | Complete |
| NEST-06 | Phase 52 | Complete |
| FEUI-01 | Phase 53 | Complete |
| FEUI-02 | Phase 53 | Complete |
| FEUI-03 | Phase 53 | Complete |
| FEUI-04 | Phase 65 | Pending |
| SEC-01 | Phase 55 | Complete |
| SEC-02 | Phase 55 | Complete |
| SEC-03 | Phase 55 | Complete |
| SEC-04 | Phase 55 | Complete |
| ORG-01 | Phase 56 | Complete |
| ORG-02 | Phase 63 | Complete |
| ORG-03 | Phase 56 | Complete |
| ORG-04 | Phase 64 | Complete |
| ORG-05 | Phase 56 | Complete |
| ADM-01 | Phase 57 | Complete |
| ADM-02 | Phase 57 | Complete |
| ADM-03 | Phase 57 | Complete |
| ADM-04 | Phase 57 | Complete |
| CLN-01 | Phase 58 | Complete |
| CLN-02 | Phase 61 | Complete |
| CLN-03 | Phase 61 | Complete |
| CLN-04 | Phase 58 | Complete |
| CLN-05 | Phase 58 | Complete |
| SAF-01 | Phase 59 | Complete |
| SAF-02 | Phase 59 | Complete |
| SAF-03 | Phase 59 | Complete |
| SAF-04 | Phase 59 | Complete |
| SAF-05 | Phase 59 | Complete |
| SAF-06 | Phase 59 | Complete |
| SAF-07 | Phase 59 | Complete |
| SAF-08 | Phase 59 | Complete |
| SAF-09 | Phase 59 | Complete |
| SAF-10 | Phase 59 | Complete |
| P62-01 | Phase 62 | Complete |
| P62-02 | Phase 62 | Complete |
| P62-03 | Phase 62 | Complete |
| P62-04 | Phase 64 | Complete |
| P62-05 | Phase 62 | Complete |
| P62-06 | Phase 62 | Complete |

**Coverage:**
- v5.0 requirements: 51 total (45 original + 6 P62-*)
- Mapped to phases: 51
- Unmapped: 0
- Pending (gap closure): 1 (FEUI-04)

---
*Requirements defined: 2026-03-06*
*Last updated: 2026-03-10 after Phase 59 gap closure (SAF-01 through SAF-10 added)*
