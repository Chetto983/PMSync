# Phase 48: Auth Fix 2026 Best Practice - Research

**Researched:** 2026-03-05
**Domain:** Authentication security hardening (Argon2id, ES256 JWT, password policy, enumeration hardening)
**Confidence:** HIGH

## Summary

This phase upgrades four distinct security domains in the existing NestJS auth module. The codebase is well-structured after Phase 43's god-file split: bcrypt usage is isolated to 3 files (`auth-login.service.ts`, `auth-registration.service.ts`, `auth-password-reset.service.ts`), JWT configuration is centralized in `AuthConfigService` + `auth.module.ts` JwtModule config, and rate limiting already exists via `RedisRateLimiterService`. The auth facade pattern means new services (password-policy) slot in cleanly.

The riskiest change is ES256 JWT migration because it touches token signing (3 call sites), token verification (JwtStrategy + JwtModule config), and requires a dual-algorithm grace period. Argon2id migration is straightforward with the transparent-rehash-on-login pattern. Password policy and enumeration hardening are additive changes with minimal blast radius.

**Primary recommendation:** Use `@node-rs/argon2` for Argon2id (no native C compilation, prebuilt binaries), configure `@nestjs/jwt` with `privateKey`/`publicKey` PEM strings for ES256, implement HIBP k-anonymity check inline (no library needed, ~30 lines), and create a standalone `PasswordPolicyService`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Argon2id rehash on login: when user authenticates successfully against bcrypt hash, transparently re-hash with Argon2id and save
- Memory cost: 64 MiB (OWASP 2024 recommended), parallelism and iterations per library defaults
- Hash format detection by prefix: `$2b$` = bcrypt, `$argon2id$` = Argon2id -- no schema changes needed
- Telemetry: structured log event on rehash + Prometheus counter for migration progress tracking
- bcrypt support remains indefinitely until counter shows full migration, then removable
- Algorithm: ES256 (ECDSA P-256) -- compact tokens, fast verification, IETF recommended
- Key storage: inline env vars (PEM strings in environment variables) -- Docker/K8s-friendly, no file mounts
- JWKS endpoint: not now -- add later when multi-service architecture arrives
- Migration: grace period accepting both HS256 and ES256 for 15-30 minutes after deploy. Access tokens are 15min TTL, so natural expiry handles migration. Dual-verification in JwtStrategy during grace window.
- AuthConfigService gets new fields: `jwtPrivateKey`, `jwtPublicKey`, algorithm switches to ES256
- Minimum length: 12 characters, Maximum length: 128 characters
- No complexity rules (NIST SP 800-63B 2024: length-only, no forced uppercase/number/special)
- Breach check: HaveIBeenPwned k-anonymity API on registration + password change. Block passwords found in >3 breaches.
- HIBP check is best-effort: if API unreachable, allow password
- Existing user enforcement: soft -- show warning banner on login if password fails new policy, don't block access
- Password policy service: standalone injectable, reusable by registration + password-reset + future change-password
- Login: unified "Invalid credentials" error for all failure reasons. Run dummy Argon2id hash when user not found to prevent timing side-channel.
- Registration: current behavior verified sufficient -- constant "Registration initiated" message
- Password reset: already hardened. No changes needed.
- OTP send: add fake delay (~100-300ms random) when user not found
- Rate limiting: add per-email dimension alongside existing per-IP

### Claude's Discretion
- Argon2id library choice (argon2 vs @node-rs/argon2 vs built-in crypto.hash)
- Exact Prometheus metric names for migration counters
- Grace period duration for HS256->ES256 transition (15 or 30 min)
- Key generation script approach (openssl vs node crypto)
- HIBP API timeout and fallback behavior details
- Password policy error message wording

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@node-rs/argon2` | ^2.0.0 | Argon2id password hashing | No node-gyp, prebuilt binaries for all platforms, ~30% faster than `argon2` npm, 132K weekly downloads |
| `@nestjs/jwt` | ^11.0.2 | JWT signing/verification (ES256) | Already in project, supports asymmetric keys via `privateKey`/`publicKey` options |
| `passport-jwt` | ^4.0.1 | JWT strategy for Passport | Already in project, `secretOrKey` accepts PEM-encoded public key for asymmetric verification |
| `bcrypt` | ^6.0.0 | Legacy password verification (migration period) | Already in project, keep for verifying existing `$2b$` hashes |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `crypto` | built-in | SHA-1 for HIBP k-anonymity, EC key generation | HIBP check + key gen script |
| Node.js `https`/`fetch` | built-in | HIBP API calls | Password breach check (no external HTTP lib needed) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@node-rs/argon2` | `argon2` (npm) | More downloads (334K/wk) but requires node-gyp native compilation, slower |
| `@node-rs/argon2` | `crypto.subtle.deriveKey` with Argon2id | Web Crypto API does key derivation, not password hashing -- would need manual salt/output handling, no `$argon2id$` formatted output |
| Inline HIBP check | `hibp` or `pwned.js` npm | Unnecessary dependency for ~30 lines of SHA-1 + HTTP fetch |

**Installation:**
```bash
cd backend && npm install @node-rs/argon2
```

No other new dependencies required. `@nestjs/jwt` and `passport-jwt` already support ES256. bcrypt stays for migration period.

## Architecture Patterns

### Recommended Project Structure
```
backend/src/modules/auth/
├── services/
│   ├── auth-config.service.ts      # MODIFY: add jwtPrivateKey, jwtPublicKey, argon2 params, password policy config
│   ├── auth-login.service.ts       # MODIFY: dual-algo verify, rehash on login, dummy hash, per-email rate limit
│   ├── auth-registration.service.ts # MODIFY: argon2id hash, password policy validation, HIBP check
│   ├── auth-password-reset.service.ts # MODIFY: argon2id hash, dual-algo compare, password policy
│   ├── auth-token.service.ts       # MODIFY: ES256 signing with private key
│   ├── auth.service.ts             # MINIMAL: pass-through, maybe expose policy check
│   ├── password-policy.service.ts  # NEW: length validation, HIBP k-anonymity check
│   └── password-hashing.service.ts # NEW: argon2id/bcrypt dual-algo hash/verify, rehash logic
├── strategies/
│   └── jwt.strategy.ts             # MODIFY: ES256 public key verification, dual-algo grace period
├── helpers/
│   └── cookie.helper.ts            # NO CHANGE
├── auth.module.ts                  # MODIFY: JwtModule config for ES256, register new services
└── dtos/
    ├── register.dto.ts             # MODIFY: MinLength(12), MaxLength(128)
    └── reset-password.dto.ts       # MODIFY: MinLength(12), MaxLength(128)
```

### Pattern 1: Transparent Argon2id Rehash on Login
**What:** When user logs in with valid bcrypt password, silently rehash to Argon2id and update DB
**When to use:** Every successful password verification during migration period

```typescript
// password-hashing.service.ts
import { hash, verify } from '@node-rs/argon2';

@Injectable()
export class PasswordHashingService {
  private readonly logger = new Logger(PasswordHashingService.name);

  async hashPassword(password: string): Promise<string> {
    return hash(password, {
      memoryCost: 65536, // 64 MiB
      timeCost: 3,       // iterations (library default)
      parallelism: 1,    // parallelism (library default)
      algorithm: 2,      // Argon2id
    });
  }

  async verifyPassword(password: string, storedHash: string): Promise<{ valid: boolean; needsRehash: boolean }> {
    if (storedHash.startsWith('$argon2id$')) {
      const valid = await verify(storedHash, password);
      return { valid, needsRehash: false };
    }
    if (storedHash.startsWith('$2b$') || storedHash.startsWith('$2a$')) {
      const bcrypt = await import('bcrypt');
      const valid = await bcrypt.compare(password, storedHash);
      return { valid, needsRehash: valid }; // rehash only if password is correct
    }
    return { valid: false, needsRehash: false };
  }

  /** Run a dummy hash to prevent timing side-channel when user not found */
  async dummyHash(): Promise<void> {
    await hash('dummy-password-for-timing');
  }
}
```

### Pattern 2: ES256 JWT Signing with @nestjs/jwt
**What:** Configure JwtModule with PEM-encoded EC private/public keys
**When to use:** All JWT signing and verification

```typescript
// auth.module.ts - JwtModule configuration
JwtModule.registerAsync({
  imports: [ConfigModule],
  useFactory: (config: ConfigService): JwtModuleOptions => {
    const privateKeyPem = config.get<string>('JWT_PRIVATE_KEY');
    const publicKeyPem = config.get<string>('JWT_PUBLIC_KEY');

    if (!privateKeyPem || !publicKeyPem) {
      throw new Error('FATAL: JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be set for ES256 signing.');
    }

    return {
      privateKey: privateKeyPem,
      publicKey: publicKeyPem,
      signOptions: {
        algorithm: 'ES256',
        expiresIn: config.get<string>('ACCESS_TOKEN_EXPIRES_IN') || '15m',
        issuer: 'pmsync-auth',
        audience: 'pmsync-api',
      },
    };
  },
  inject: [ConfigService],
}),
```

### Pattern 3: Dual-Algorithm JWT Verification (Grace Period)
**What:** During deployment, accept both HS256 (old) and ES256 (new) tokens
**When to use:** JwtStrategy during migration window

```typescript
// jwt.strategy.ts - dual verification approach
// Option: use secretOrKeyProvider to dynamically select key based on token header
super({
  jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor, ExtractJwt.fromAuthHeaderAsBearerToken()]),
  ignoreExpiration: false,
  // Dynamic key provider for dual-algo grace period
  secretOrKeyProvider: (request, rawJwtToken, done) => {
    try {
      // Decode header without verification to check algorithm
      const header = JSON.parse(Buffer.from(rawJwtToken.split('.')[0], 'base64url').toString());
      if (header.alg === 'HS256' && gracePeriodActive) {
        done(null, hmacSecret);
      } else {
        done(null, publicKey);
      }
    } catch (err) {
      done(err);
    }
  },
  algorithms: ['ES256', 'HS256'], // Accept both during grace period
});
```

### Pattern 4: HIBP k-Anonymity Check
**What:** Check password against HaveIBeenPwned without sending full hash
**When to use:** Registration, password reset, future password change

```typescript
// password-policy.service.ts
async checkBreached(password: string): Promise<{ breached: boolean; count: number }> {
  const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = sha1.substring(0, 5);
  const suffix = sha1.substring(5);

  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: AbortSignal.timeout(3000), // 3s timeout
      headers: { 'Add-Padding': 'true' }, // k-anonymity padding
    });
    if (!response.ok) return { breached: false, count: 0 }; // best-effort

    const text = await response.text();
    const match = text.split('\n').find(line => line.startsWith(suffix));
    if (!match) return { breached: false, count: 0 };

    const count = parseInt(match.split(':')[1].trim(), 10);
    return { breached: count > 3, count }; // Block only if >3 breaches per user decision
  } catch {
    return { breached: false, count: 0 }; // best-effort: API failure = allow
  }
}
```

### Anti-Patterns to Avoid
- **Checking full password hash against HIBP:** Never send the full SHA-1 hash. Only send 5-char prefix (k-anonymity).
- **Blocking login on bcrypt hash:** During migration, bcrypt verification MUST remain functional. Never reject a valid bcrypt password.
- **Storing algorithm type in a DB column:** The `$argon2id$` and `$2b$` prefixes ARE the algorithm indicator. No schema changes.
- **Using `jwtSecret` for ES256:** ES256 requires asymmetric keys. The old `JWT_SECRET` env var is for HS256 only -- kept only for grace period.
- **Accepting HS256 permanently:** The `secretOrKeyProvider` with dual-algo support MUST be removed after grace period. Use a config flag like `JWT_LEGACY_HMAC_SECRET` that gets unset post-migration.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Argon2id hashing | Custom C bindings or WebCrypto wrappers | `@node-rs/argon2` | Produces standard `$argon2id$` format strings, handles salt generation, tuned defaults |
| JWT ES256 key management | Manual ECDSA sign/verify with node crypto | `@nestjs/jwt` + `jsonwebtoken` | Already wired into Passport strategy, handles key format conversion |
| Password breach check API | Full HIBP client library | ~30 lines inline with `fetch` + `crypto.createHash` | k-anonymity is simple: SHA-1 prefix lookup, parse response, done |
| Rate limiting per-email | Custom Redis script | Existing `RedisRateLimiterService` with different key pattern | Already battle-tested in codebase, just needs `login:email:${email}` key alongside `login:${ip}` |

**Key insight:** The existing `RedisRateLimiterService` already supports arbitrary key strings. Adding per-email rate limiting is literally passing a different key, not building new infrastructure.

## Common Pitfalls

### Pitfall 1: Timing Side-Channel on User Lookup
**What goes wrong:** Login returns faster when user doesn't exist (no hash comparison) vs when user exists (hash comparison takes ~20ms for Argon2id)
**Why it happens:** Argon2id is intentionally slow; skipping it when user not found leaks user existence
**How to avoid:** Call `dummyHash()` when user not found before returning "Invalid credentials"
**Warning signs:** Login endpoint responds in <5ms for non-existent users vs ~100ms for existing users

### Pitfall 2: JwtModule Global Config Conflicts with ES256
**What goes wrong:** `JwtModule.registerAsync` sets `secret` (for HS256) but ES256 needs `privateKey`/`publicKey` -- if both are set, behavior is undefined
**Why it happens:** The existing config passes `secret: jwtSecret` to JwtModule. When switching to ES256, you must replace `secret` with `privateKey`/`publicKey` and set `algorithm: 'ES256'` in signOptions.
**How to avoid:** Remove the `secret` property entirely from JwtModule config when using asymmetric keys. The `secretOrKeyProvider` in JwtStrategy handles dual-algo during grace period.
**Warning signs:** "secretOrPrivateKey must be an asymmetric key when using ES256" error from jsonwebtoken

### Pitfall 3: PEM String Multiline in Environment Variables
**What goes wrong:** EC private keys are multi-line PEM strings. Putting them in `.env` files or Docker env vars loses newlines.
**Why it happens:** Most env var parsers strip newlines or treat them as value terminators
**How to avoid:** Use `\n` literal in env vars and replace at parse time: `pemString.replace(/\\n/g, '\n')`. Or base64-encode the PEM and decode at startup.
**Warning signs:** "error:0909006C:PEM routines" or "Invalid key type" errors on startup

### Pitfall 4: Argon2id Memory Cost in Containers
**What goes wrong:** 64 MiB memory cost per hash operation. Under load with 10 concurrent logins = 640 MiB just for hashing.
**Why it happens:** Argon2id's security comes from memory hardness
**How to avoid:** Ensure container memory limits account for peak concurrent auth operations. The `parallelism: 1` setting helps limit per-hash memory.
**Warning signs:** OOM kills in Docker/K8s during auth load spikes

### Pitfall 5: Grace Period Cleanup Forgotten
**What goes wrong:** Dual HS256/ES256 verification stays active permanently, allowing downgrade attacks
**Why it happens:** No automated removal mechanism for the grace period code
**How to avoid:** Add `JWT_LEGACY_HMAC_SECRET` env var. When it's unset/empty, JwtStrategy only accepts ES256. Log a warning if it's still set after 24 hours.
**Warning signs:** HS256-signed tokens still accepted weeks after migration

### Pitfall 6: bcrypt.compare During Password Reset Check
**What goes wrong:** `auth-password-reset.service.ts` line 190 uses `bcrypt.compare` to check "new password != old password". After Argon2id migration, old hash might be Argon2id, and `bcrypt.compare` will fail.
**How to avoid:** Use the new `PasswordHashingService.verifyPassword()` which handles both algorithms.
**Warning signs:** Password reset always allows same password after migration to Argon2id

## Code Examples

### EC Key Pair Generation Script
```bash
# Generate ES256 (P-256) key pair
openssl ecparam -genkey -name prime256v1 -noout -out ec-private.pem
openssl ec -in ec-private.pem -pubout -out ec-public.pem

# Or with Node.js:
node -e "
const { generateKeyPairSync } = require('crypto');
const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
console.log('JWT_PRIVATE_KEY=' + JSON.stringify(privateKey));
console.log('JWT_PUBLIC_KEY=' + JSON.stringify(publicKey));
"
```

### PasswordPolicyService Structure
```typescript
// Source: NIST SP 800-63B + OWASP 2024 guidelines
@Injectable()
export class PasswordPolicyService {
  constructor(private readonly configService: AuthConfigService) {}

  async validate(password: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (password.length < 12) errors.push('Password must be at least 12 characters');
    if (password.length > 128) errors.push('Password must be at most 128 characters');

    if (errors.length === 0) {
      const breach = await this.checkBreached(password);
      if (breach.breached) {
        errors.push('This password has appeared in data breaches and cannot be used');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ... checkBreached implementation (see Pattern 4 above)
}
```

### AuthConfigService New Fields
```typescript
// New fields to add to auth-config.service.ts
readonly jwtPrivateKey: string;     // PEM string for ES256 signing
readonly jwtPublicKey: string;      // PEM string for ES256 verification
readonly jwtLegacyHmacSecret?: string; // Old HS256 secret for grace period (optional)

// Argon2id configuration
readonly argon2MemoryCost: number;  // 65536 (64 MiB) default
readonly argon2TimeCost: number;    // 3 default
readonly argon2Parallelism: number; // 1 default
```

### Per-Email Rate Limiting Addition
```typescript
// In auth-login.service.ts, alongside existing IP-based rate limiting:
const ipKey = `login:${ipAddress || 'unknown'}`;
const emailKey = `login:email:${normalizedEmail}`;

// Check both dimensions
const [ipLockout, emailLockout] = await Promise.all([
  this.rateLimiter.isLockedOut(ipKey),
  this.rateLimiter.isLockedOut(emailKey),
]);

if (ipLockout.isLockedOut || emailLockout.isLockedOut) {
  throw new ForbiddenException('Account temporarily locked.');
}

// On failure, record on both dimensions
await Promise.all([
  this.rateLimiter.recordFailedAttempt(ipKey, 5, 900),
  this.rateLimiter.recordFailedAttempt(emailKey, 10, 900), // slightly higher per-email threshold
]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| bcrypt with salt rounds 10-12 | Argon2id with 64 MiB memory cost | OWASP 2024 recommendation | Memory-hard, GPU/ASIC resistant |
| HS256 (symmetric JWT) | ES256 (ECDSA P-256) | IETF RFC 7518, widely adopted by 2024 | Verifiers don't need signing secret, smaller tokens |
| Password complexity rules | Length-only + breach check | NIST SP 800-63B rev 4 (2024) | Better UX, equal or better security |
| No breach checking | HaveIBeenPwned k-anonymity API | Standard practice since 2019 | Prevents known-compromised passwords |

**Deprecated/outdated:**
- bcrypt: Still functional but not recommended for new deployments. Argon2id is the 2024+ standard.
- HS256 JWT: Works but leaks signing secret to all verifiers. ES256 is asymmetric (sign with private, verify with public).
- Password complexity (uppercase + number + special): NIST explicitly recommends against this since 2017 revision.

## Open Questions

1. **Prometheus Counter Implementation**
   - What we know: Telemetry for Argon2id rehash progress is required
   - What's unclear: Phase 46 (OBS-01) adds prom-client to the project. If Phase 48 executes before Phase 46, there's no prom-client available.
   - Recommendation: Use structured log events (already in codebase pattern) for rehash tracking. Add Prometheus counter in Phase 46 or later. Don't add prom-client dependency in this phase.

2. **Grace Period Duration: 15 vs 30 Minutes**
   - What we know: Access tokens have 15min TTL. After one TTL cycle, all new tokens are ES256.
   - What's unclear: Refresh token rotation creates new access tokens -- these will already be ES256.
   - Recommendation: 15 minutes is sufficient. The only HS256 tokens that survive are those issued before deploy, and they expire within 15 minutes naturally. Use a config flag `JWT_LEGACY_HMAC_SECRET` that operators unset after deploy.

3. **Password Reset Token Signing Algorithm**
   - What we know: Password reset tokens use a separate secret (`PASSWORD_RESET_SECRET`) with HS256 via `jwtService.sign(..., { secret: ... })`
   - What's unclear: Should reset tokens also migrate to ES256?
   - Recommendation: Keep reset tokens on HS256 with their dedicated secret. They're short-lived (15min), single-use, and not sent to third parties. The migration complexity isn't justified.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + ts-jest |
| Config file | `backend/jest.config.ts` |
| Quick run command | `cd backend && npx jest --testPathPattern auth --no-coverage -t "PATTERN" --forceExit` |
| Full suite command | `cd backend && npx jest --testPathPattern auth --no-coverage --forceExit` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P48-01 | Argon2id hashing produces valid `$argon2id$` prefix | unit | `npx jest --testPathPattern password-hashing.spec -x` | No -- Wave 0 |
| P48-02 | bcrypt hash verified and rehashed to Argon2id on login | unit | `npx jest --testPathPattern password-hashing.spec -x` | No -- Wave 0 |
| P48-03 | Dummy hash executed when user not found (timing protection) | unit | `npx jest --testPathPattern auth-login.spec -x` | No -- Wave 0 |
| P48-04 | ES256 JWT signed with private key, verified with public key | unit | `npx jest --testPathPattern jwt-es256.spec -x` | No -- Wave 0 |
| P48-05 | Dual-algo grace period accepts both HS256 and ES256 | unit | `npx jest --testPathPattern jwt-strategy.spec -x` | No -- Wave 0 |
| P48-06 | Password policy rejects <12 chars, >128 chars | unit | `npx jest --testPathPattern password-policy.spec -x` | No -- Wave 0 |
| P48-07 | HIBP check blocks breached passwords (>3 occurrences) | unit | `npx jest --testPathPattern password-policy.spec -x` | No -- Wave 0 |
| P48-08 | HIBP check allows password when API unreachable | unit | `npx jest --testPathPattern password-policy.spec -x` | No -- Wave 0 |
| P48-09 | Per-email rate limiting enforced on login | unit | `npx jest --testPathPattern auth-login.spec -x` | No -- Wave 0 |
| P48-10 | OTP send has fake delay when user not found | unit | `npx jest --testPathPattern auth-registration.spec -x` | No -- Wave 0 |
| P48-11 | RegisterDto and ResetPasswordDto enforce 12-char minimum | unit | `npx jest --testPathPattern dto-validation.spec -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx jest --testPathPattern auth --no-coverage --forceExit`
- **Per wave merge:** `cd backend && npx jest --no-coverage --forceExit`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/modules/auth/__tests__/password-hashing.spec.ts` -- covers P48-01, P48-02
- [ ] `backend/src/modules/auth/__tests__/password-policy.spec.ts` -- covers P48-06, P48-07, P48-08
- [ ] `backend/src/modules/auth/__tests__/jwt-es256.spec.ts` -- covers P48-04, P48-05
- [ ] `backend/src/modules/auth/__tests__/auth-login-hardening.spec.ts` -- covers P48-03, P48-09
- [ ] `backend/src/modules/auth/__tests__/auth-registration-hardening.spec.ts` -- covers P48-10, P48-11
- [ ] Install: `cd backend && npm install @node-rs/argon2`

## Sources

### Primary (HIGH confidence)
- Existing codebase: `auth-config.service.ts`, `auth-login.service.ts`, `auth-registration.service.ts`, `auth-password-reset.service.ts`, `auth-token.service.ts`, `jwt.strategy.ts`, `auth.module.ts` -- read in full
- [@nestjs/jwt GitHub](https://github.com/nestjs/jwt) -- privateKey/publicKey support, secretOrKeyProvider, KeyObject optimization
- [@node-rs/argon2 npm](https://www.npmjs.com/package/@node-rs/argon2) -- API surface, prebuilt binary support, performance benchmarks
- [passport-jwt docs](https://www.passportjs.org/packages/passport-jwt/) -- secretOrKey accepts PEM public key, secretOrKeyProvider for dynamic selection
- [HaveIBeenPwned API v3](https://haveibeenpwned.com/API/v3) -- k-anonymity range endpoint, padding support, no API key needed for password check

### Secondary (MEDIUM confidence)
- [jsonwebtoken ES256 issue #898](https://github.com/auth0/node-jsonwebtoken/issues/898) -- confirms "secretOrPrivateKey must be an asymmetric key" error when misconfigured
- [Cloudflare k-anonymity blog](https://blog.cloudflare.com/validating-leaked-passwords-with-k-anonymity/) -- validates HIBP k-anonymity approach
- [NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html) -- password policy: length-only, no complexity, breach checking

### Tertiary (LOW confidence)
- Node.js 22 Argon2id via Web Crypto API -- exists but for key derivation, not password hashing format. Not suitable for this use case.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - libraries verified against existing codebase, APIs confirmed via docs
- Architecture: HIGH - patterns derived from reading actual codebase structure, all integration points identified with line numbers
- Pitfalls: HIGH - pitfalls derived from known API behaviors and code inspection, not speculation
- Validation: MEDIUM - test structure proposed but not yet validated with actual test runs

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable domain, 30-day validity)
