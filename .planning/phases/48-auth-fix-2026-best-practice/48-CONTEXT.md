# Phase 48: Auth Fix 2026 Best Practice - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Upgrade auth security to 2026 best practices: migrate password hashing from bcrypt to Argon2id, switch JWT signing from symmetric HS256 to asymmetric algorithm, enforce password policy with breach checking, and harden all auth endpoints against user/email enumeration.

</domain>

<decisions>
## Implementation Decisions

### Argon2id Migration
- Rehash on login: when user authenticates successfully against bcrypt hash, transparently re-hash with Argon2id and save
- Memory cost: 64 MiB (OWASP 2024 recommended), parallelism and iterations per library defaults
- Hash format detection by prefix: `$2b$` = bcrypt, `$argon2id$` = Argon2id — no schema changes needed
- Telemetry: structured log event on rehash + Prometheus counter for migration progress tracking
- bcrypt support remains indefinitely until counter shows full migration, then removable

### JWT Signing Model
- Algorithm: ES256 (ECDSA P-256) — compact tokens, fast verification, IETF recommended
- Key storage: inline env vars (PEM strings in environment variables) — Docker/K8s-friendly, no file mounts
- JWKS endpoint: not now — add `/.well-known/jwks.json` later when multi-service architecture arrives
- Migration: grace period accepting both HS256 and ES256 for 15-30 minutes after deploy. Access tokens are 15min TTL, so natural expiry handles migration. Dual-verification in JwtStrategy during grace window.
- AuthConfigService gets new fields: `jwtPrivateKey`, `jwtPublicKey`, algorithm switches to ES256

### Password Policy
- Minimum length: 12 characters (enterprise-grade baseline)
- Maximum length: 128 characters
- No complexity rules (NIST SP 800-63B 2024: length-only, no forced uppercase/number/special)
- Breach check: HaveIBeenPwned k-anonymity API on registration + password change. Block passwords found in >3 breaches.
- HIBP check is best-effort: if API unreachable, allow password (don't block user for external service failure)
- Existing user enforcement: soft — show warning banner on login if password fails new policy, don't block access
- Password policy service: standalone injectable, reusable by registration + password-reset + future change-password

### Enumeration Hardening
- Login: unified "Invalid credentials" error for all failure reasons (bad tenant, bad email, bad password). Run dummy Argon2id hash when user not found to prevent timing side-channel.
- Registration: current behavior verified sufficient — returns constant "Registration initiated" message for existing users. Ensure timing is constant.
- Password reset: already hardened (constant message). No changes needed.
- OTP send: add fake delay (~100-300ms random) when user not found to match real OTP creation timing
- Rate limiting: add per-email dimension alongside existing per-IP. Both dimensions enforced on login, register, send-otp endpoints.

### Claude's Discretion
- Argon2id library choice (argon2 vs @node-rs/argon2 vs built-in crypto.hash)
- Exact Prometheus metric names for migration counters
- Grace period duration for HS256→ES256 transition (15 or 30 min)
- Key generation script approach (openssl vs node crypto)
- HIBP API timeout and fallback behavior details
- Password policy error message wording

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AuthConfigService` (auth-config.service.ts): centralized config with fail-fast validation — extend for ES256 keys, Argon2id params, password policy config
- `RedisRateLimiterService`: existing rate limiter supports per-key dimensions — extend for per-email rate limiting
- `AuthService` facade pattern: delegates to 4 sub-services — new password-policy.service.ts fits this pattern
- Structured logging with PII redaction (`redactEmail`) already standardized across all sub-services

### Established Patterns
- `withoutTenantScopingAsync()` wrapper on all auth operations (pre-login, no tenant context)
- Function-passing pattern for cross-sub-service calls (e.g., `createRefreshTokenFn`) avoids circular DI
- Cookie helpers (`setAuthCookie`, `setRefreshCookie`) centralized in `helpers/cookie.helper.ts`
- bcrypt used in 3 files: `auth-login.service.ts` (compare), `auth-registration.service.ts` (hash), `auth-password-reset.service.ts` (compare + hash)

### Integration Points
- `auth-login.service.ts:258`: bcrypt.compare — primary migration point for Argon2id verify + rehash
- `auth-registration.service.ts:102`: bcrypt.hash — replace with Argon2id for new users
- `auth-password-reset.service.ts:197`: bcrypt.hash — replace with Argon2id for password resets
- `auth-password-reset.service.ts:190`: bcrypt.compare — needs dual-algo support during migration
- `jwt.strategy.ts:69-79`: PassportStrategy config — needs ES256 + public key instead of shared secret
- `auth-config.service.ts:22-23`: `jwtAlgorithm: 'HS256'` — change to ES256
- `auth-login.service.ts:68,286`: `jwtService.sign()` — needs private key for ES256
- `auth-token.service.ts:129`: `jwtService.sign()` in refresh rotation — same ES256 change
- Login rate limiter key: `login:${ipAddress}` — add parallel `login:email:${email}` key

</code_context>

<specifics>
## Specific Ideas

- Argon2id params should be configurable via env vars so they can be tuned per deployment without code changes
- The dual HS256/ES256 grace period should leverage the existing 15min access token TTL — after one TTL cycle, all active tokens will be ES256
- Password policy should be a pure validation function (no side effects) so it can be used in DTOs and service layer

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 48-auth-fix-2026-best-practice*
*Context gathered: 2026-03-05*
