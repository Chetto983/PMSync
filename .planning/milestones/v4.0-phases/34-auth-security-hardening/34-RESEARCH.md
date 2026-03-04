# Phase 34: Auth Security Hardening - Research

**Researched:** 2026-03-04
**Domain:** Frontend auth credential storage, httpOnly cookies, AES encryption standardization
**Confidence:** HIGH

## Summary

Phase 34 addresses two distinct security requirements: (1) migrating frontend authentication from localStorage JWT tokens to httpOnly secure cookies (SEC-01), and (2) standardizing all encryption to AES-GCM, eliminating legacy AES-CBC usage (SEC-03).

The codebase is partially prepared for cookie auth -- the backend JwtStrategy already extracts tokens from cookies via `cookieExtractor` (line 10-17 of `jwt.strategy.ts`) and falls back to Bearer header. The CSRF middleware already sets httpOnly cookies. However, the frontend auth flow is fully localStorage-dependent: `auth-store.ts` uses Zustand persist with `createJSONStorage(() => localStorage)`, the `api-client.ts` request interceptor reads tokens from localStorage via `getAuthToken()`, and the WebSocket client passes tokens via `auth.token` in the Socket.IO handshake options. All login endpoints return `accessToken` in the response body which the frontend stores in localStorage.

For encryption, there are exactly two encryption implementations: `CryptoService` (AES-256-CBC, used by 30+ files for OAuth tokens, IMAP passwords, SMTP passwords) and `field-encryption.utils.ts` (AES-256-GCM, used by Prisma extension for email body encryption). The TOTP service also uses AES-256-GCM internally. The migration from CBC to GCM in CryptoService requires a dual-read approach since existing encrypted data in the database was encrypted with CBC.

**Primary recommendation:** Implement backend-first cookie-setting on all auth success paths, then migrate the frontend to stop using localStorage tokens. For AES-GCM, upgrade CryptoService in-place with CBC fallback decryption. Run both migrations as dual-mode transitions to avoid breaking existing sessions/data.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEC-01 | Frontend auth migrated from localStorage JWT to httpOnly secure cookies with dual-mode transition period | Backend JwtStrategy already supports cookie extraction. Backend needs to SET cookies on login/verify-otp/mfa-verify. Frontend auth-store must stop persisting tokens to localStorage. WebSocket handshake needs cookie-based auth. E2E fixtures need rewrite. |
| SEC-03 | All encryption paths standardized to AES-GCM, legacy AES-CBC usage audited and migrated | CryptoService uses AES-256-CBC (30+ consumers). field-encryption.utils.ts already uses AES-256-GCM. TotpService uses AES-256-GCM. CryptoService needs upgrade with CBC fallback read. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| NestJS @nestjs/jwt | existing | JWT signing/verification | Already in use, handles cookie-based JWT |
| cookie-parser | existing | Parse cookies on backend | Already registered in main.ts |
| passport-jwt | existing | JWT extraction strategy | Already supports cookie + Bearer dual extraction |
| Zustand | existing | Frontend state management | Auth store needs modification, not replacement |
| Socket.IO | existing | WebSocket transport | Supports cookie-based auth via handshake cookies |
| Node.js crypto | built-in | AES-256-GCM encryption | Already used in field-encryption.utils.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| csrf-csrf | existing | Double-submit CSRF | Already configured, no changes needed |
| Playwright | existing | E2E testing | Auth fixture migration |
| Jest | existing | Unit testing | Auth store tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual cookie setting | express-session | Overkill -- we only need to set one cookie per auth endpoint |
| Dual-read CBC/GCM | Batch migration script | Dual-read is zero-downtime; batch script requires maintenance window |

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
├── modules/auth/
│   ├── controllers/auth.controller.ts   # Modified: set cookie on response
│   ├── services/auth.service.ts         # Modified: return cookie data to controller
│   ├── strategies/jwt.strategy.ts       # Already supports cookie extraction
│   └── helpers/
│       └── cookie.helper.ts             # NEW: cookie configuration constants
├── modules/realtime/
│   └── services/realtime-handshake.service.ts  # Modified: extract from cookie
├── common/services/
│   └── crypto.service.ts                # Modified: AES-GCM with CBC fallback
frontend/
├── stores/auth-store.ts                 # Modified: remove localStorage persist
├── lib/api-client.ts                    # Modified: remove Bearer header injection
├── lib/utils/auth-token.ts             # Modified or deleted: no more localStorage read
├── lib/websocket-client.ts             # Modified: remove auth.token, rely on cookies
├── e2e/fixtures.ts                     # Modified: cookie-based auth
├── e2e/auth.setup.ts                   # Modified: cookie-based auth
└── src/components/chat/ChatRuntimeProvider.tsx  # Modified: remove Bearer header
```

### Pattern 1: Backend Sets httpOnly Cookie on Auth Success
**What:** Every auth endpoint that returns `accessToken` also sets an httpOnly cookie.
**When to use:** On all success paths: login, verify-otp, mfa/verify, passkey login.
**Example:**
```typescript
// In auth.controller.ts - all endpoints that produce tokens
@Post('login')
async login(
  @Body() body: LoginDto,
  @Req() req: ExpressRequest,
  @Res({ passthrough: true }) res: ExpressResponse,
) {
  const result = await this.authService.login(body.email, body.password, ...);

  // If login succeeded (not MFA challenge), set cookie
  if (result.accessToken) {
    this.setAuthCookie(res, result.accessToken);
  }
  return result;
}

private setAuthCookie(res: ExpressResponse, token: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('access_token', token, {
    httpOnly: true,
    secure: isProduction || this.isCrossSiteDev(),
    sameSite: this.isCrossSiteDev() ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (matches session TTL)
  });
}
```

### Pattern 2: Dual-Mode Cookie + Bearer (Transition Period)
**What:** Backend accepts both httpOnly cookie AND Bearer header. Frontend still sends Bearer for backward compatibility during rollout.
**When to use:** During the transition. JwtStrategy already implements this via `ExtractJwt.fromExtractors([cookieExtractor, ExtractJwt.fromAuthHeaderAsBearerToken()])`.
**Key insight:** The backend already does dual extraction. The transition is purely about:
1. Backend SETTING cookies (new)
2. Frontend STOPPING localStorage usage (removal)

### Pattern 3: AES-GCM with CBC Fallback Decryption
**What:** CryptoService encrypts with GCM only but can decrypt both GCM and CBC.
**When to use:** For the AES-CBC -> AES-GCM migration.
**Example:**
```typescript
// In crypto.service.ts
private algorithm = 'aes-256-gcm';
private readonly IV_GCM = 12;
private readonly AUTH_TAG_LENGTH = 16;
private readonly GCM_PREFIX = 'gcm:';

encrypt(text: string): { encrypted: string; iv: string } {
  const iv = crypto.randomBytes(this.IV_GCM);
  const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return {
    encrypted: this.GCM_PREFIX + encrypted + ':' + authTag,
    iv: iv.toString('hex'),
  };
}

decrypt(encrypted: string, ivHex: string): string {
  // New GCM format: "gcm:<ciphertext>:<authTag>"
  if (encrypted.startsWith(this.GCM_PREFIX)) {
    return this.decryptGcm(encrypted.slice(this.GCM_PREFIX.length), ivHex);
  }
  // Legacy CBC fallback
  return this.decryptCbc(encrypted, ivHex);
}
```

### Pattern 4: WebSocket Cookie Auth
**What:** Socket.IO extracts JWT from cookies instead of auth.token.
**When to use:** After cookie migration. Socket.IO passes cookies on initial handshake when `withCredentials: true`.
**Example:**
```typescript
// In realtime-handshake.service.ts
extractToken(client: AuthenticatedSocket): string | null {
  // 1. Check cookies first (httpOnly cookie set by login)
  const cookieHeader = client.handshake.headers?.cookie;
  if (cookieHeader) {
    const cookies = this.parseCookies(cookieHeader);
    if (cookies['access_token']) return cookies['access_token'];
  }
  // 2. Fallback: auth header or query param (backward compat)
  const headerToken =
    client.handshake.headers?.authorization?.replace(/Bearer\s+/i, '') ||
    client.handshake.auth?.token;
  if (headerToken) return headerToken;
  const queryToken = client.handshake.query?.token;
  if (!queryToken) return null;
  return Array.isArray(queryToken) ? queryToken[0] : String(queryToken);
}
```

### Anti-Patterns to Avoid
- **Setting non-httpOnly cookies for auth tokens:** The current `setAuthCookie()` in auth-store.ts sets a non-httpOnly cookie. This MUST be replaced by server-set httpOnly cookie.
- **Relying on `document.cookie` for auth tokens:** XSS-vulnerable. The whole point of httpOnly is that JS cannot read the cookie.
- **Removing Bearer header support immediately:** Breaking change. Keep dual extraction during transition.
- **Re-encrypting all CBC data in a migration script:** Fragile. Dual-read is safer. Data re-encrypts lazily when written next.
- **Using `SameSite=Strict` for the auth cookie:** Would break OAuth callback flows. Use `Lax` (or `None` for cross-site dev with ngrok).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cookie parsing in WS handshake | Custom regex | `cookie` npm package or simple split-based parser | Edge cases with encoded values, quoted strings |
| CSRF protection changes | New CSRF middleware | Existing csrf-csrf middleware | Already configured correctly with httpOnly cookies |
| JWT extraction from cookies | Custom middleware | passport-jwt `ExtractJwt.fromExtractors` | Already implemented in jwt.strategy.ts |
| Cookie flags (secure, sameSite) | Inline logic | Centralized cookie config helper | Same flags needed in auth controller, CSRF, logout |

**Key insight:** The backend already has 80% of cookie auth infrastructure. JwtStrategy already extracts from cookies. CSRF already uses httpOnly cookies. cookie-parser is already registered. The work is primarily about SETTING cookies on auth success and REMOVING localStorage on the frontend.

## Common Pitfalls

### Pitfall 1: Cookie Not Sent Cross-Origin
**What goes wrong:** In development, frontend (localhost:3001) and backend (localhost:3000) are different origins. Cookies won't be sent unless configured correctly.
**Why it happens:** `SameSite=Lax` cookies are only sent with top-level navigations, not cross-origin XHR. `SameSite=None` requires `Secure=true`.
**How to avoid:** The existing CSRF middleware already handles this with `isCrossSiteDev` detection. Apply the same logic to auth cookies. In dev with ngrok, use `sameSite: 'none', secure: true`. In pure localhost dev, `sameSite: 'lax'` works because same-site policy treats `localhost:3000` and `localhost:3001` as same-site (different port, same registrable domain).
**Warning signs:** Login succeeds but subsequent requests get 401. Check DevTools Network tab for `Set-Cookie` response header and `Cookie` request header.

### Pitfall 2: WebSocket Handshake Doesn't Send Cookies
**What goes wrong:** Socket.IO initial handshake doesn't include cookies, so WebSocket auth fails.
**Why it happens:** Socket.IO only sends cookies when the connection URL is same-origin OR `withCredentials: true` is set. Currently, the WebSocket client passes token via `auth.token`, not cookies.
**How to avoid:** Socket.IO with `withCredentials: true` (already set in the gateway CORS config `credentials: true`) will include cookies on handshake. The frontend Socket.IO client must also be created with `withCredentials: true`. Current code in `websocket-client.ts` does NOT set this -- it only passes `auth: { token }`. The fix: remove `auth.token`, add `withCredentials: true` to the Socket.IO client options.
**Warning signs:** HTTP requests work fine but WebSocket connections fail with "Missing token" or "Invalid token".

### Pitfall 3: Logout Doesn't Clear httpOnly Cookie
**What goes wrong:** User clicks logout but the cookie persists, so they appear still logged in.
**Why it happens:** JavaScript cannot clear httpOnly cookies. The backend logout endpoint must clear the cookie.
**How to avoid:** In the logout controller, call `res.clearCookie('access_token', { path: '/', httpOnly: true, ... })`. Must use identical options (path, domain, secure, sameSite) as when the cookie was set, or the browser won't clear it.
**Warning signs:** After logout, navigating to a protected page still works without re-login.

### Pitfall 4: E2E Tests Still Depend on localStorage
**What goes wrong:** E2E tests pass in old mode but fail after migration because they inject tokens into localStorage.
**Why it happens:** Both `fixtures.ts` and `auth.setup.ts` use `page.addInitScript(() => localStorage.setItem('auth-storage', ...))`. After migration, the app doesn't read from localStorage.
**How to avoid:** Replace localStorage injection with cookie injection: `await page.context().addCookies([{ name: 'access_token', value: 'test-jwt-token', domain: 'localhost', path: '/', httpOnly: true, secure: false }])`. Create a shared `authHelper` function used by all test fixtures.
**Warning signs:** All E2E tests fail with "unauthenticated" errors after the migration.

### Pitfall 5: ChatRuntimeProvider and Attachment Proxy Still Use Bearer
**What goes wrong:** Chat and inline image loading break after removing localStorage tokens.
**Why it happens:** `ChatRuntimeProvider.tsx` explicitly reads `getAuthToken()` from localStorage and sets `Authorization: Bearer ${token}` header. The attachment download proxy (`pages/api/email/attachments/[id]/download.ts`) reads from `auth-token` cookie (non-httpOnly) as fallback.
**How to avoid:**
- ChatRuntimeProvider: Remove explicit Authorization header. Use `credentials: 'include'` (already set). The cookie will be sent automatically.
- Attachment proxy: Read from `access_token` httpOnly cookie instead of `auth-token` non-httpOnly cookie. The Next.js API route has access to httpOnly cookies because it runs server-side.
**Warning signs:** Chat returns 401, inline images don't load.

### Pitfall 6: AES-GCM IV Length Mismatch
**What goes wrong:** Decryption fails after switching CryptoService from CBC to GCM.
**Why it happens:** AES-CBC uses 16-byte IV, AES-GCM uses 12-byte IV. If you try to decrypt CBC data with GCM IV size, or vice versa, it fails.
**How to avoid:** The GCM_PREFIX marker (`gcm:`) distinguishes new vs legacy format. Legacy decryption uses 16-byte IV (from stored `ivHex`), new decryption uses 12-byte IV. The `encrypt()` method always produces 12-byte IV for GCM. The IV size is inherent to the stored `ivHex` column (32 hex chars = 16 bytes for CBC, 24 hex chars = 12 bytes for GCM).
**Warning signs:** `Error: Unsupported state or unable to authenticate data` on decrypt.

### Pitfall 7: Session Cookie vs Short-Lived JWT
**What goes wrong:** Cookie has 7-day maxAge but JWT has 15m expiry. After 15m, the cookie contains an expired JWT.
**Why it happens:** The current JWT is configured with `expiresIn: '15m'` in auth.module.ts.
**How to avoid:** This is the existing behavior -- the JWT strategy validates session via database/Redis (session has 24h or 7-day TTL depending on auth method). The JWT short expiry forces re-validation. Two options: (1) extend JWT expiry to match session TTL (simpler, relies on session check), or (2) implement silent refresh endpoint that issues new JWT + cookie before expiry. Recommendation: extend JWT expiry to 7 days to match session/cookie TTL since session validation already provides revocation support.
**Warning signs:** Users get logged out after 15 minutes even though cookie persists.

## Code Examples

### Backend: Cookie Helper (centralized config)
```typescript
// backend/src/modules/auth/helpers/cookie.helper.ts
import { Response } from 'express';

const isProduction = process.env.NODE_ENV === 'production';
const isCrossSiteDev = !isProduction && (
  ['1', 'true', 'yes'].includes((process.env.CORS_ALLOW_ALL || '').toLowerCase())
  || (process.env.API_PUBLIC_URL || '').startsWith('https')
);

export const AUTH_COOKIE_NAME = 'access_token';
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction || isCrossSiteDev,
  sameSite: (isCrossSiteDev ? 'none' : 'lax') as 'none' | 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const;

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: AUTH_COOKIE_OPTIONS.httpOnly,
    secure: AUTH_COOKIE_OPTIONS.secure,
    sameSite: AUTH_COOKIE_OPTIONS.sameSite,
    path: AUTH_COOKIE_OPTIONS.path,
  });
}
```

### Backend: Auth Controller Cookie Setting
```typescript
// Modified auth.controller.ts -- login endpoint with cookie
@Post('login')
async login(
  @Body() body: LoginDto,
  @Req() req: ExpressRequest,
  @Res({ passthrough: true }) res: ExpressResponse,
) {
  const ipAddress = /* existing logic */;
  const userAgent = /* existing logic */;
  const deviceToken = req.cookies?.['mfa_device_token'] || req.headers['x-device-token'];
  const result = await this.authService.login(...);

  if (result.accessToken) {
    setAuthCookie(res, result.accessToken);
  }
  return result;
}
```

### Frontend: Auth Store Without localStorage
```typescript
// Modified auth-store.ts -- no persist middleware
export const useAuthStore = create<AuthState>()((set) => ({
  // user kept in memory only; token comes from cookie (not accessible to JS)
  token: null, // Kept for backward compat during transition, always null after migration
  user: null,
  setToken: (_token: string) => {
    // No-op after migration. Token is in httpOnly cookie.
    // Left as stub so callers don't break during transition.
  },
  setUser: (user: User | null) => {
    set({ user });
  },
  logout: () => {
    set({ token: null, user: null });
  },
}));
```

### Frontend: API Client Without Bearer Header
```typescript
// Modified api-client.ts interceptor
apiClient.interceptors.request.use(async (config) => {
  if (typeof window !== 'undefined') {
    // Token sent via httpOnly cookie automatically (withCredentials: true)
    // No need to set Authorization header

    // CSRF token for mutations (SEC-04)
    const method = config.method?.toUpperCase();
    if (method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      const csrf = await getCsrfToken();
      if (csrf) {
        config.headers['X-CSRF-Token'] = csrf;
      }
    }
  }
  return config;
});
```

### Frontend: WebSocket Client Without auth.token
```typescript
// Modified websocket-client.ts
this.socket = io(`${backendUrl}/realtime`, {
  // Cookies are sent automatically with withCredentials
  withCredentials: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: this.maxReconnectAttempts,
  // Remove auth.token -- cookie handles auth
});
```

### Backend: CryptoService AES-GCM Migration
```typescript
// Modified crypto.service.ts
private readonly GCM_PREFIX = 'gcm:';
private readonly GCM_IV_LENGTH = 12;
private readonly GCM_AUTH_TAG_LENGTH = 16;

encrypt(text: string): { encrypted: string; iv: string } {
  const iv = crypto.randomBytes(this.GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', this.secretKey, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return {
    encrypted: `${this.GCM_PREFIX}${encrypted}:${authTag}`,
    iv: iv.toString('hex'),
  };
}

decrypt(encrypted: string, ivHex: string): string {
  if (encrypted.startsWith(this.GCM_PREFIX)) {
    return this.decryptGcm(encrypted.slice(this.GCM_PREFIX.length), ivHex);
  }
  return this.decryptCbc(encrypted, ivHex); // Legacy fallback
}

private decryptGcm(data: string, ivHex: string): string {
  const [ciphertext, authTagHex] = data.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', this.secretKey, iv);
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

private decryptCbc(encrypted: string, ivHex: string): string {
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', this.secretKey, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| localStorage JWT | httpOnly secure cookie | Standard since ~2020 | Prevents XSS token theft |
| AES-256-CBC | AES-256-GCM | GCM preferred since ~2015 | Authenticated encryption prevents tampering |
| Bearer header for all requests | Cookie with `credentials: include` | Always available, gaining adoption | Simpler frontend, no token management in JS |
| Manual token management in WebSocket | Cookie-based WS auth | Socket.IO has always supported cookies | Eliminates token passing in handshake |

**Deprecated/outdated:**
- **localStorage for auth tokens:** XSS-vulnerable. Industry standard is httpOnly cookies since OWASP 2020 guidelines.
- **AES-256-CBC without HMAC:** CBC without authentication is vulnerable to padding oracle attacks. GCM provides built-in authentication.

## Open Questions

1. **JWT Expiry vs Cookie Expiry Alignment**
   - What we know: JWT is configured with 15m expiry, cookies will be set with 7d maxAge, sessions have 24h-7d TTL
   - What's unclear: Should JWT expiry be extended to match session TTL? Currently session validation provides the real expiry check.
   - Recommendation: Extend JWT `expiresIn` to `'7d'` in auth.module.ts to match session TTL. Session validation + cache already handles revocation. 15m JWT forces unnecessary re-auth friction.

2. **ICryptoService Interface (Phase 32)**
   - What we know: Phase 32 created `ICryptoService` interface with `encrypt(plaintext): Promise<string>` and `decrypt(ciphertext): Promise<string>` (no separate IV param). CryptoService has `encrypt(text): { encrypted, iv }` and `decrypt(encrypted, ivHex)`.
   - What's unclear: Whether to update ICryptoService to match the { encrypted, iv } pattern or keep the simplified interface.
   - Recommendation: The interface mismatch is a pre-existing issue. Don't change the interface in this phase -- focus on GCM migration. Document the mismatch for future cleanup.

3. **Lazy Re-encryption on Write**
   - What we know: CBC-encrypted data can be read by the fallback. New writes will use GCM.
   - What's unclear: Should we proactively re-encrypt existing CBC data? There are token refresh flows that write new encrypted tokens regularly.
   - Recommendation: No proactive re-encryption. OAuth tokens get refreshed hourly and will naturally re-encrypt to GCM. IMAP passwords stay CBC until the user edits the provider config, which is fine.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (backend unit) + Playwright (frontend E2E) |
| Config file | `backend/jest.config.js`, `frontend/playwright.config.ts` |
| Quick run command | `cd backend && npx jest --testPathPattern auth --no-coverage -t "cookie"` |
| Full suite command | `cd frontend && npx playwright test e2e/auth.spec.ts` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01a | Login sets httpOnly cookie | unit | `cd backend && npx jest --testPathPattern auth.controller --no-coverage` | No - Wave 0 |
| SEC-01b | No JWT in localStorage after login | e2e | `cd frontend && npx playwright test e2e/auth.spec.ts` | Yes (needs update) |
| SEC-01c | Cookie persists across sessions | e2e | `cd frontend && npx playwright test e2e/auth.spec.ts` | Yes (needs update) |
| SEC-01d | Logout clears httpOnly cookie | unit+e2e | `cd backend && npx jest --testPathPattern auth.controller` | No - Wave 0 |
| SEC-01e | WebSocket auth via cookie | unit | `cd backend && npx jest --testPathPattern handshake` | No - Wave 0 |
| SEC-01f | E2E authHelper uses cookie | e2e | `cd frontend && npx playwright test` | Yes (needs rewrite) |
| SEC-03a | CryptoService encrypts with GCM | unit | `cd backend && npx jest --testPathPattern crypto.service --no-coverage` | No - Wave 0 |
| SEC-03b | CryptoService decrypts legacy CBC | unit | `cd backend && npx jest --testPathPattern crypto.service --no-coverage` | No - Wave 0 |
| SEC-03c | Audit confirms no raw CBC usage | manual | `grep -r "aes-256-cbc" backend/src --include="*.ts"` | N/A |

### Sampling Rate
- **Per task commit:** `cd backend && npx jest --testPathPattern "(crypto|auth)" --no-coverage` and `cd frontend && npx playwright test e2e/auth.spec.ts`
- **Per wave merge:** Full backend jest + full frontend playwright
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/common/services/__tests__/crypto.service.spec.ts` -- covers SEC-03a/b (GCM encrypt, CBC fallback decrypt)
- [ ] `backend/src/modules/auth/controllers/__tests__/auth.controller.cookie.spec.ts` -- covers SEC-01a/d (cookie set/clear)
- [ ] `backend/src/modules/realtime/services/__tests__/realtime-handshake.cookie.spec.ts` -- covers SEC-01e (WS cookie auth)
- [ ] Update `frontend/e2e/fixtures.ts` -- authHelper with cookie injection instead of localStorage
- [ ] Update `frontend/e2e/auth.setup.ts` -- cookie-based storage state
- [ ] Update `frontend/stores/auth-store.test.ts` -- remove localStorage assertions

## Sources

### Primary (HIGH confidence)
- Codebase analysis of `backend/src/modules/auth/` -- auth controller, service, JWT strategy, auth module
- Codebase analysis of `backend/src/common/services/crypto.service.ts` -- AES-256-CBC implementation (53 lines)
- Codebase analysis of `backend/src/prisma/encryption/field-encryption.utils.ts` -- AES-256-GCM implementation (72 lines)
- Codebase analysis of `backend/src/modules/auth/services/totp.service.ts` -- AES-256-GCM for TOTP secrets
- Codebase analysis of `frontend/stores/auth-store.ts` -- Zustand persist with localStorage
- Codebase analysis of `frontend/lib/api-client.ts` -- Bearer header injection, CSRF handling
- Codebase analysis of `frontend/lib/websocket-client.ts` -- auth.token in Socket.IO handshake
- Codebase analysis of `frontend/src/components/chat/ChatRuntimeProvider.tsx` -- Bearer header in chat transport
- Codebase analysis of `backend/src/main.ts` -- cookie-parser, CORS, CSRF middleware registration
- Codebase analysis of `backend/src/common/middleware/csrf.middleware.ts` -- isCrossSiteDev cookie config pattern
- Codebase analysis of `frontend/e2e/fixtures.ts` and `frontend/e2e/auth.setup.ts` -- localStorage-based auth injection
- Codebase analysis of `frontend/pages/api/email/attachments/[id]/download.ts` -- auth-token cookie fallback

### Secondary (MEDIUM confidence)
- `backend/src/modules/realtime/services/realtime-handshake.service.ts` -- current WS token extraction (header + auth.token + query)
- `backend/src/modules/realtime/gateways/realtime.gateway.ts` -- CORS credentials: true for WS
- CryptoService usage audit via grep: 30+ files using `.encrypt()` / `.decrypt()` methods

### Tertiary (LOW confidence)
- JWT expiry alignment recommendation (7d to match session) -- needs team discussion on security posture

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- patterns verified against actual codebase, JwtStrategy already supports cookie extraction
- Pitfalls: HIGH -- identified from actual code analysis (7 specific pitfalls with file/line references)
- AES-GCM migration: HIGH -- both implementations already exist in codebase, dual-read pattern is well-understood
- JWT expiry alignment: MEDIUM -- recommendation based on architectural analysis, may need discussion

**Research date:** 2026-03-04
**Valid until:** 2026-04-03 (stable domain, no fast-moving dependencies)
