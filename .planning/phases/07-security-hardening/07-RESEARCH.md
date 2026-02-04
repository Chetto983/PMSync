# Phase 07: Security Hardening - Research Findings

**Project:** MailAgent
**Phase:** Security Hardening (SEC-01 through SEC-05)
**Researched:** 2026-02-04
**Overall Confidence:** HIGH (verified via official docs and existing codebase)

---

## 1. Executive Summary

Phase 07 addresses critical security requirements for production deployment. The good news: **the codebase already has foundational infrastructure** for most requirements:

| Requirement | Current State | Effort |
|-------------|---------------|--------|
| SEC-01: S3 Encryption | Not configured; uses `@aws-sdk/client-s3` | LOW - config change |
| SEC-02: OAuth Revocation | Missing revocation calls | MEDIUM - API integration |
| SEC-03: Log Redaction | `LogSanitizerService` exists but unused | LOW - wire it up |
| SEC-04: CSRF Protection | None; `csurf` deprecated | MEDIUM - new middleware |
| SEC-05: Rate Limiting | `@nestjs/throttler` + custom Redis limiter exist | LOW - configure properly |

**Key Risk:** CSRF protection requires the most design work because the existing SPA architecture (Next.js + NestJS) needs the Double Submit Cookie pattern, not the deprecated `csurf` package.

**Bonus:** The `.continue-here.md` mentions GDPR tenant-level encryption. This is a separate concern that should be Phase 08+ work, not Phase 07.

---

## 2. SEC-01: S3 Server-Side Encryption

### Current State

The `StorageService` (`backend/src/modules/email/services/storage.service.ts`) already uses `@aws-sdk/client-s3` but does **not** specify encryption:

```typescript
// Current code - NO encryption specified
const command = new PutObjectCommand({
  Bucket: this.bucket,
  Key: key,
  Body: body,
  ContentType: contentType,
  // Missing: ServerSideEncryption
});
```

### Recommendation: Use SSE-S3 (AES-256)

**Why SSE-S3 over SSE-KMS:**

| Factor | SSE-S3 | SSE-KMS |
|--------|--------|---------|
| Cost | Free | $1/10k requests |
| Complexity | Zero | Key management overhead |
| Audit trail | Basic S3 logs | CloudTrail per-key |
| Use case | General encryption | Compliance (HIPAA, PCI) |

For email attachments in a multi-tenant SaaS, **SSE-S3 is sufficient**. It provides:
- AES-256 encryption at rest
- AWS manages keys automatically
- No application changes beyond config
- Since Jan 2023, S3 encrypts all new objects by default with SSE-S3

**Implementation:**

```typescript
// Option A: Per-request (explicit)
const command = new PutObjectCommand({
  Bucket: this.bucket,
  Key: key,
  Body: body,
  ContentType: contentType,
  ServerSideEncryption: 'AES256', // SSE-S3
});

// Option B: Bucket default (recommended)
// Set via AWS Console or Terraform - then all uploads are encrypted automatically
```

**Bucket Policy Enforcement:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyUnencryptedUploads",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::mailagent-attachments/*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-server-side-encryption": "AES256"
        }
      }
    }
  ]
}
```

### Confidence: HIGH

- Source: [AWS S3 Encryption Best Practices](https://docs.aws.amazon.com/prescriptive-guidance/latest/encryption-best-practices/s3.html)
- Source: [Using SSE-S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingServerSideEncryption.html)

### Implementation Tasks

1. Add `ServerSideEncryption: 'AES256'` to `PutObjectCommand` in `storage.service.ts`
2. (Optional) Configure bucket default encryption via AWS Console/Terraform
3. Add bucket policy to deny unencrypted uploads
4. Verify with `HeadObjectCommand` that uploads have `ServerSideEncryption` header

---

## 3. SEC-02: OAuth Token Revocation

### Current State

Both OAuth services exist but **neither calls revocation endpoints on disconnect**:

- `GoogleOAuthService` - No `revokeToken()` method
- `MicrosoftOAuthService` - No `revokeToken()` method
- `ProvidersController.deleteProvider()` - Deletes DB record, does NOT revoke tokens

### Google Token Revocation

**Endpoint:**
```
POST https://oauth2.googleapis.com/revoke
Content-Type: application/x-www-form-urlencoded

token={access_token_or_refresh_token}
```

**Behavior:**
- Revoking refresh token also revokes associated access tokens
- Returns HTTP 200 on success (empty response)
- Returns HTTP 400 if token is invalid/expired (ignore this - token is already invalid)

**Implementation:**

```typescript
// GoogleOAuthService
async revokeToken(token: string): Promise<void> {
  try {
    await axios.post(
      'https://oauth2.googleapis.com/revoke',
      `token=${encodeURIComponent(token)}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    this.logger.log('Google token revoked successfully');
  } catch (error) {
    // 400 = token already invalid - not an error for us
    if ((error as AxiosError)?.response?.status !== 400) {
      this.logger.warn(`Google token revocation failed: ${error}`);
    }
  }
}
```

### Microsoft Token Revocation

**Critical Limitation:** Microsoft does **NOT** provide a token revocation endpoint for OAuth apps to call.

**What's available:**
- `POST /me/revokeSignInSessions` - User-initiated, requires delegated permissions
- `POST /users/{id}/revokeSignInSessions` - Admin-only, requires `User.ReadWrite.All`

**Practical approach for Microsoft:**
1. Delete the token from DB (already done)
2. Optionally call `revokeSignInSessions` if you have `User.RevokeSessions.All` permission
3. Accept that Microsoft access tokens remain valid for up to 1 hour (by design)

```typescript
// MicrosoftOAuthService
async revokeToken(tenantId: string, providerId: string): Promise<void> {
  try {
    const { accessToken } = await this.getProviderWithTokens(tenantId, providerId);
    const graphClient = this.getGraphClient(accessToken);

    // This invalidates refresh tokens but NOT current access tokens
    await graphClient.api('/me/revokeSignInSessions').post({});
    this.logger.log('Microsoft sign-in sessions revoked');
  } catch (error) {
    // Best effort - don't fail disconnect if revocation fails
    this.logger.warn(`Microsoft session revocation failed: ${error}`);
  }
}
```

### Call Site: ProviderConfigService.deleteProviderConfig()

```typescript
async deleteProviderConfig(tenantId: string, providerId: string): Promise<void> {
  const provider = await this.getProviderConfig(tenantId, providerId);

  // Revoke tokens before deleting
  if (provider.type === 'google') {
    const refreshToken = this.cryptoService.decrypt(
      provider.refreshToken!,
      provider.refreshTokenEncryptionIv!
    );
    await this.googleOAuth.revokeToken(refreshToken);
  } else if (provider.type === 'microsoft') {
    await this.microsoftOAuth.revokeToken(tenantId, providerId);
  }

  // Then delete from DB
  await this.prisma.providerConfig.delete({ where: { id: providerId, tenantId } });
}
```

### Confidence

| Provider | Confidence | Notes |
|----------|------------|-------|
| Google | HIGH | Well-documented endpoint |
| Microsoft | MEDIUM | No true revocation API; best-effort only |

### Sources

- [Google OAuth Web Server](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Microsoft Graph revokeSignInSessions](https://learn.microsoft.com/en-us/graph/api/user-revokesigninsessions)
- [Microsoft Q&A on token revocation](https://learn.microsoft.com/en-us/answers/questions/892262/how-to-revoke-azure-ad-oauth-token)

---

## 4. SEC-03: Log Redaction

### Current State

**Good news:** `LogSanitizerService` already exists at `backend/src/common/services/log-sanitizer.service.ts`!

It already redacts:
- `password`, `accessToken`, `access_token`, `refreshToken`, `refresh_token`
- `token`, `apiKey`, `api_key`, `secret`, `authorization`, `cookie`
- All encryption IVs (`tokenEncryptionIv`, `refreshTokenEncryptionIv`, etc.)
- IMAP/SMTP/CalDAV passwords
- Email body content (`body`, `htmlBody`, `textBody`, `snippet`)
- PII (`ssn`, `creditCard`, `cvv`, `pin`)

**Problem:** It's not wired into the logging pipeline! The Pino logger in `main.ts` doesn't use it.

### OWASP Recommendations

From [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html):
- Never log credentials, tokens, or secrets
- Sanitize all event data to prevent log injection
- Consider de-identification (deletion, scrambling, pseudonymization)
- Hash or mask PII before analytics

### Implementation Options

**Option A: Pino Redaction (Built-in)**

Pino has native redaction support:

```typescript
// In LoggerModule configuration
const pinoConfig = {
  pinoHttp: {
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.accessToken',
        'req.body.refreshToken',
        '*.password',
        '*.accessToken',
        '*.refreshToken',
        '*.token',
        '*.apiKey',
        '*.secret',
      ],
      censor: '[REDACTED]',
    },
  },
};
```

**Option B: Use Existing LogSanitizerService**

Wrap Pino's `write` function:

```typescript
import { LogSanitizerService } from './common/services/log-sanitizer.service';

// Custom Pino destination that sanitizes
const sanitizedDestination = (logSanitizer: LogSanitizerService) => {
  return build(async function (source) {
    for await (const obj of source) {
      const sanitized = logSanitizer.sanitize(obj);
      console.log(JSON.stringify(sanitized));
    }
  });
};
```

**Recommendation: Option A (Pino native redaction)**

- Less code
- Better performance (done at write time, not after)
- Easier to maintain
- The `LogSanitizerService` can still be used for manual sanitization before logging complex objects

### Additional Patterns to Add

From OWASP, also redact:
- IP addresses in certain contexts (GDPR)
- Email addresses in logs (use hashed version)
- Request IDs that could be correlated

### Confidence: HIGH

- Source: [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- Source: [OWASP Top 10:2025 A09](https://owasp.org/Top10/2025/A09_2025-Security_Logging_and_Alerting_Failures/)
- Source: [Pino Redaction Docs](https://getpino.io/#/docs/redaction)

---

## 5. SEC-04: CSRF Protection

### Current State

**No CSRF protection exists.** The `main.ts` uses:
- `helmet` (CSP, headers)
- `cookie-parser` (parses cookies)
- CORS configuration (origin whitelist)

But no CSRF middleware.

### The Problem with `csurf`

The NestJS docs still reference `csurf`, but it's **deprecated** since 2022:
- Vulnerable to cookie tossing attacks
- Not maintained
- npm shows security advisories

### Recommended: `csrf-csrf` Package (Double Submit Cookie Pattern)

This is the modern replacement, specifically designed for SPAs:

**How it works:**
1. Server generates HMAC-based token, stores in cookie
2. Server sends token value in response body/header
3. Frontend includes token in subsequent requests (header or body)
4. Server verifies: token in request matches HMAC(cookie value)

**Why Double Submit Cookie for SPA:**
- Stateless (no server-side session storage)
- Works with JWT auth
- Cookie is HttpOnly + SameSite (can't be read by XSS)
- Token sent separately proves same-origin

### Implementation

```typescript
// backend/src/common/middleware/csrf.middleware.ts
import { doubleCsrf } from 'csrf-csrf';
import { Request, Response, NextFunction } from 'express';

const {
  generateToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET!, // Different from JWT_SECRET
  cookieName: '__Host-csrf', // __Host- prefix for extra security
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  },
  getTokenFromRequest: (req) => req.headers['x-csrf-token'] as string,
});

export { generateToken, doubleCsrfProtection };
```

```typescript
// main.ts
import { doubleCsrfProtection } from './common/middleware/csrf.middleware';

// After cookie-parser, before routes
app.use(doubleCsrfProtection);
```

```typescript
// CSRF token endpoint
@Controller('auth')
export class AuthController {
  @Get('csrf-token')
  getCsrfToken(@Req() req: Request, @Res() res: Response) {
    const token = generateToken(req, res);
    return res.json({ csrfToken: token });
  }
}
```

### Frontend Integration (Next.js)

```typescript
// lib/api/csrf.ts
let csrfToken: string | null = null;

export async function getCsrfToken(): Promise<string> {
  if (!csrfToken) {
    const res = await apiClient.get('/auth/csrf-token');
    csrfToken = res.data.csrfToken;
  }
  return csrfToken!;
}

// Axios interceptor
apiClient.interceptors.request.use(async (config) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(config.method?.toUpperCase() || '')) {
    const token = await getCsrfToken();
    config.headers['X-CSRF-Token'] = token;
  }
  return config;
});
```

### Which Endpoints Need CSRF?

| Method | Needs CSRF | Reason |
|--------|------------|--------|
| GET | NO | Idempotent, no side effects |
| HEAD/OPTIONS | NO | Same |
| POST | YES | Creates resources |
| PUT | YES | Updates resources |
| PATCH | YES | Updates resources |
| DELETE | YES | Deletes resources |

### Confidence: MEDIUM

- `csrf-csrf` is well-maintained and designed for SPAs
- But: NestJS doesn't have official support, requires manual Express middleware
- Alternative: `@tekuconcept/nestjs-csrf` for NestJS-native approach

### Sources

- [csrf-csrf npm](https://www.npmjs.com/package/csrf-csrf)
- [NestJS CSRF Docs](https://docs.nestjs.com/security/csrf)
- [GitHub: csrf-csrf](https://github.com/Psifi-Solutions/csrf-csrf)

---

## 6. SEC-05: Rate Limiting

### Current State

**Excellent news:** The codebase has BOTH rate limiting systems:

1. **`@nestjs/throttler`** (v6.5.0) - Installed, decorators in use (`@SkipThrottle()`)
2. **`RedisRateLimiterService`** - Custom Lua-script-based limiter with lockout support

**Problem:** The throttler appears configured but the Redis storage isn't wired up for multi-instance support.

### Current Throttler Usage

Looking at `providers.controller.ts`:
```typescript
@SkipThrottle()  // Exempts GET endpoints from rate limiting
@Get()
async getProviders() { ... }
```

This implies throttler IS configured somewhere, but I didn't find `ThrottlerModule.forRoot()` in the codebase scan.

### Recommended Configuration

**For Multi-Instance (Horizontal Scaling):**

```typescript
// app.module.ts
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        throttlers: [
          // Read operations: 100/min
          { name: 'short', ttl: 60000, limit: 100 },
          // Write operations: 30/min (applied via decorator)
          { name: 'write', ttl: 60000, limit: 30 },
        ],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
```

**Recommended Package:** `@nestjs-redis/throttler-storage` for Redis-backed storage.

### Rate Limit Tiers (From Requirements)

| Type | Limit | TTL | Header |
|------|-------|-----|--------|
| Read (GET) | 100 req/min | 60s | `X-RateLimit-Limit: 100` |
| Write (POST/PUT/DELETE) | 30 req/min | 60s | `X-RateLimit-Limit: 30` |
| Exceeded | 0 | varies | `Retry-After: {seconds}` |

### Controller Decorators

```typescript
@Controller('emails')
export class EmailController {
  @Get()
  @Throttle({ short: { limit: 100, ttl: 60000 } })
  async listEmails() { ... }  // 100/min

  @Post()
  @Throttle({ write: { limit: 30, ttl: 60000 } })
  async sendEmail() { ... }   // 30/min

  @Get(':id')
  @SkipThrottle()  // Or inherit from class-level default
  async getEmail() { ... }
}
```

### 429 Response Format

```typescript
// Custom ThrottlerExceptionFilter
@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const retryAfter = exception.getResponse()['retryAfter'] || 60;

    response
      .status(HttpStatus.TOO_MANY_REQUESTS)
      .header('Retry-After', String(retryAfter))
      .json({
        statusCode: 429,
        message: 'Rate limit exceeded',
        retryAfter,
      });
  }
}
```

### Confidence: HIGH

- `@nestjs/throttler` is official NestJS package
- Redis storage is well-documented pattern
- Custom `RedisRateLimiterService` can be used as fallback or for lockout logic

### Sources

- [NestJS Throttler](https://docs.nestjs.com/security/rate-limiting)
- [Rate Limiting with Redis](https://wanago.io/2025/03/03/api-nestjs-rate-limiting-throttler/)
- [Implementing Redis-based Throttling](https://innosufiyan.hashnode.dev/implementing-redis-based-throttling-in-nestjs)

---

## 7. Bonus: GDPR Tenant-Level Encryption (Future Phase)

The `.continue-here.md` mentions:
> "we must audit database for GDPR compliance (crypted per tenant with best feature in 2026)"

This is **out of scope for Phase 07** but worth noting options:

### Options for Tenant-Level Encryption

| Approach | Complexity | When to Use |
|----------|------------|-------------|
| Column-level (pgcrypto) | Medium | Encrypt specific PII columns |
| TDE (Transparent Data Encryption) | Low | Full disk encryption, Postgres EE |
| Application-level | High | Encrypt before INSERT, decrypt after SELECT |
| Row-Level Security (RLS) | Medium | Access control, not encryption |

### Recommendation for Future Phase

1. **Immediate (Phase 08+):** Use pgcrypto for column-level encryption of email body, subject, attachments
2. **Key Management:** Store per-tenant keys in AWS Secrets Manager or HashiCorp Vault
3. **Avoid:** Storing encryption keys in the same database as encrypted data

### Confidence: LOW

- This is exploratory, not Phase 07 scope
- Requires deeper audit of Prisma schema for PII columns

### Sources

- [PostgreSQL GDPR Compliance](https://www.enterprisedb.com/postgresql-compliance-gdpr-soc-2-data-privacy-security)
- [pgcrypto Column Encryption](https://docs.vultr.com/how-to-encrypt-data-columns-in-postgresql)

---

## 8. Implementation Recommendations

### Task Ordering

```
SEC-03 (Log Redaction)     -> Lowest risk, highest value (debugging without leaks)
SEC-01 (S3 Encryption)     -> Config change only
SEC-05 (Rate Limiting)     -> Infrastructure already exists
SEC-02 (OAuth Revocation)  -> Medium complexity, provider-specific
SEC-04 (CSRF Protection)   -> Highest complexity, new middleware + frontend changes
```

### Estimated Effort

| Requirement | Tasks | Effort |
|-------------|-------|--------|
| SEC-01 | 1. Add ServerSideEncryption param<br>2. Bucket policy (optional) | 2h |
| SEC-02 | 1. Google revoke method<br>2. Microsoft revoke method<br>3. Wire into delete flow | 4h |
| SEC-03 | 1. Configure Pino redaction<br>2. Test with sample logs | 2h |
| SEC-04 | 1. Install csrf-csrf<br>2. Create middleware<br>3. Add token endpoint<br>4. Frontend interceptor | 8h |
| SEC-05 | 1. Add Redis storage to throttler<br>2. Configure tiers<br>3. Add 429 filter | 4h |

**Total Estimate:** ~20 hours

### Dependencies

```
SEC-04 depends on: cookie-parser (already installed)
SEC-05 depends on: Redis connection (already configured)
SEC-01 depends on: AWS credentials (already configured)
SEC-02 depends on: Axios (already installed)
SEC-03 depends on: Pino (already configured)
```

### Risk Assessment

| Risk | Mitigation |
|------|------------|
| CSRF breaks SPA auth | Test thoroughly with Next.js, ensure token flow works |
| Rate limiting too aggressive | Start with higher limits, tune down |
| OAuth revocation fails | Best-effort approach, log warnings but don't fail disconnect |
| Log redaction misses fields | Audit logs after deployment, iterate on redact list |

---

## 9. Open Questions

1. **CSRF Token Storage:** Should CSRF token be stored in localStorage (XSS risk) or memory (lost on refresh)?
   - Recommendation: Memory + fetch new on page load

2. **Rate Limit Scoping:** Per-user, per-tenant, or per-IP?
   - Recommendation: Per-user (authenticated) with IP fallback (unauthenticated)

3. **Microsoft Revocation Scope:** Do we need `User.RevokeSessions.All` permission?
   - Recommendation: Add to OAuth scopes if not present, but make revocation best-effort

4. **S3 Bucket:** Is this AWS S3 or MinIO (local development)?
   - Impact: MinIO may not support all SSE features; verify in dev

---

## 10. Sources (Full List)

### S3 Encryption
- [AWS S3 Encryption Best Practices](https://docs.aws.amazon.com/prescriptive-guidance/latest/encryption-best-practices/s3.html)
- [Using SSE-S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingServerSideEncryption.html)
- [SSE-KMS Documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html)

### OAuth Token Revocation
- [Google OAuth Web Server](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Microsoft Graph revokeSignInSessions](https://learn.microsoft.com/en-us/graph/api/user-revokesigninsessions)
- [Azure AD Token Revocation Q&A](https://learn.microsoft.com/en-us/answers/questions/892262/how-to-revoke-azure-ad-oauth-token)

### Log Redaction
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [OWASP Top 10:2025 A09](https://owasp.org/Top10/2025/A09_2025-Security_Logging_and_Alerting_Failures/)
- [Pino Logging Guide](https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/)
- [Safeguarding Sensitive Data in Logs](https://betterstack.com/community/guides/logging/sensitive-data/)

### CSRF Protection
- [NestJS CSRF Docs](https://docs.nestjs.com/security/csrf)
- [csrf-csrf npm](https://www.npmjs.com/package/csrf-csrf)
- [GitHub: csrf-csrf](https://github.com/Psifi-Solutions/csrf-csrf)
- [NestJS CSRF Implementation](https://github.com/nestjs/docs.nestjs.com/issues/2665)

### Rate Limiting
- [NestJS Throttler](https://docs.nestjs.com/security/rate-limiting)
- [API with NestJS: Rate Limiting](https://wanago.io/2025/03/03/api-nestjs-rate-limiting-throttler/)
- [Redis-based Throttling](https://innosufiyan.hashnode.dev/implementing-redis-based-throttling-in-nestjs)
- [@nestjs-redis/throttler-storage](https://www.npmjs.com/package/@nestjs-redis/throttler-storage)

### GDPR/Encryption (Bonus)
- [PostgreSQL GDPR Compliance](https://www.enterprisedb.com/postgresql-compliance-gdpr-soc-2-data-privacy-security)
- [PostgreSQL Column Encryption](https://docs.vultr.com/how-to-encrypt-data-columns-in-postgresql)
