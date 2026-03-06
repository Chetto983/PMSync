# Phase 47: Infrastructure & Cleanup - Research

**Researched:** 2026-03-06
**Domain:** WebSocket horizontal scaling, CSRF error handling, dependency cleanup, cryptographic migration
**Confidence:** HIGH

## Summary

Phase 47 covers four distinct workstreams: (1) WebSocket horizontal scaling via `@socket.io/redis-adapter`, (2) CSRF error surfacing with auto-retry, (3) dependency cleanup + CI bundle budget via Knip, and (4) CBC-to-GCM re-encryption migration. All four are well-understood problems with established tooling.

The codebase is already well-positioned. Socket.IO 4.8.3 and ioredis 5.9.2 are installed. The `api-client.ts` already has a CSRF 403 retry interceptor (lines 217-225) -- it just needs to distinguish CSRF failures from other 403s and the backend needs to return a structured error. The `crypto.service.ts` already has the `gcm:` prefix convention making re-encryption idempotent by design. Dead filter files are already gone (CLN-03 pre-satisfied).

**Primary recommendation:** Wire `@socket.io/redis-adapter` via a custom NestJS `IoAdapter`, enhance CSRF middleware to catch and re-throw as `HttpException(403, CSRF_TOKEN_INVALID)`, run Knip for dependency audit, and build a standalone re-encryption CLI script.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Backend returns structured JSON error in API envelope format: `{"error": "CSRF_TOKEN_INVALID", "message": "Security token expired. Please retry."}` with HTTP 403
- Frontend uses silent auto-retry: intercepts CSRF error, fetches fresh token from /auth/csrf-token, retries original request automatically
- 1 retry max -- if retry also fails, surface error to user
- CSRF token pre-fetched on app load (during initialization), so first mutation never fails due to missing token
- Error flows through existing ApiExceptionFilter for consistent response shape
- Standalone CLI script (`scripts/re-encrypt-cbc-to-gcm.ts`) -- not a Prisma migration
- Batch processing: 100 records per transaction with progress logging
- Script is idempotent -- safe to re-run if interrupted (checks for `gcm:` prefix before re-encrypting)
- Supports dry-run mode to preview affected records without writing
- After verified migration (zero CBC records), remove CBC fallback code from `crypto.service.ts`
- CI bundle budget: 10MB total JS ceiling (current ~8.1MB, ~25% headroom)
- Enforced via CI step that checks `.next/static/chunks/` total size after `next build`
- Dependency audit: use Knip (not depcheck)
- Manual verification of each flagged package before removal
- Dead filter files (all-exceptions, http-exception, throttler-exception): already deleted -- CLN-03 is pre-satisfied, just verify absence
- Use `@socket.io/redis-adapter` with `createShardedAdapter()` or standard adapter
- Transport: WebSocket only -- remove `'polling'` from `transports` array
- No sticky sessions needed (WebSocket-only transport)
- Same Redis instance as BullMQ/rate limiter, but dedicated pub/sub connection pair (`pubClient.duplicate()`)
- Replace in-memory `activeTenantConnections` Map with Redis INCR/DECR counters per tenant
- Cookie-based auth on WebSocket handshake (already partially implemented)
- Pub/sub channels scoped per tenant (room names already tenant-prefixed via `buildTenantScopedRoom()`)

### Claude's Discretion
- Exact Redis key naming for tenant connection counters
- Socket.IO adapter version selection (standard vs sharded)
- CSRF retry implementation details (axios interceptor vs fetch wrapper)
- Knip configuration file contents
- CI script implementation (shell script vs Node.js)
- Re-encryption script error handling and logging format
- Bundle budget CI step placement in workflow

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | WebSocket Redis adapter configured | RedisIoAdapter pattern (NestJS IoAdapter + @socket.io/redis-adapter) with ioredis pub/sub pair |
| INFRA-02 | Pub/sub channels scoped per tenant | Already done via `buildTenantScopedRoom()` -- Redis adapter preserves Socket.IO room semantics |
| INFRA-03 | Verified working with 2 backend instances | Test pattern: spin up 2 Socket.IO servers sharing same Redis, emit on one, assert receipt on other |
| CLN-01 | CSRF error properly surfaced | Wrap `doubleCsrfProtection` callback to catch `invalidCsrfTokenError` and throw HttpException(403, CSRF_TOKEN_INVALID) |
| CLN-02 | CSRF token refresh retry logic | Frontend `api-client.ts` already has 403 retry (line 217) -- needs CSRF-specific error code detection |
| CLN-03 | Dead filter files deleted | Pre-satisfied -- no files matching `all-exceptions`, `http-exception`, `throttler-exception` in `backend/src/common/filters/` |
| CLN-04 | Frontend dependency audit | Knip with Next.js plugin -- run `npx knip` in frontend, manually verify each flagged dep |
| CLN-05 | Bundle size budget in CI | CI step after `next build` checking `du -sb .next/static/chunks/` against 10MB ceiling |
| CLN-06 | CBC->GCM re-encryption backfill verified | CLI script targeting `ProviderConfig` (tokens) + `MfaSecret` (TOTP) tables |
| TEST-10 | WebSocket Redis adapter cross-instance test | Integration test with 2 HTTP servers + shared Redis adapter |
| TEST-11 | CSRF error surfacing test | Backend: POST with invalid X-CSRF-Token returns `{error: {code: "CSRF_TOKEN_INVALID"}}` |
| TEST-12 | Bundle size CI gate | CI step exits non-zero when `.next/static/chunks/` exceeds 10MB |
| TEST-13 | CBC->GCM migration verification | Query for records without `gcm:` prefix after running script = zero |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @socket.io/redis-adapter | ^8.x | Redis pub/sub adapter for Socket.IO | Official Socket.IO adapter; works with ioredis already in project |
| ioredis | 5.9.2 (installed) | Redis client for pub/sub pair | Already used throughout backend; `.duplicate()` for sub client |
| socket.io | 4.8.3 (installed) | WebSocket server | Already installed and configured |
| knip | ^5.x | Unused dependency/export detection | Native Next.js + TypeScript plugin support; actively maintained (depcheck is stale) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| csrf-csrf | 4.0.3 (installed) | CSRF double-submit cookie | Already in use; just need error handling enhancement |
| @next/bundle-analyzer | (installed) | Bundle analysis | Already configured in next.config.js; CI step reads raw chunk sizes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @socket.io/redis-adapter | @socket.io/redis-streams-adapter | Streams adapter requires Redis 6.2+, more complex; standard adapter is simpler and sufficient |
| Knip | depcheck | depcheck is unmaintained, misses config-only deps, no Next.js plugin |
| Standard adapter | Sharded adapter | Sharded requires Redis 7.0+ for SPUBLISH; use standard unless Redis 7+ confirmed |

**Installation:**
```bash
cd backend && npm install @socket.io/redis-adapter
cd frontend && npm install -D knip
```

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
├── common/
│   └── adapters/
│       └── redis-io.adapter.ts        # NEW: Custom IoAdapter with Redis
├── common/middleware/
│   └── csrf.middleware.ts             # MODIFY: Structured CSRF error
├── common/services/
│   └── crypto.service.ts             # MODIFY: Remove CBC after migration
├── modules/realtime/
│   └── gateways/realtime.gateway.ts  # MODIFY: Remove polling, Redis counters
│
scripts/
└── re-encrypt-cbc-to-gcm.ts          # NEW: CLI migration script

frontend/
├── lib/api-client.ts                  # MODIFY: CSRF-specific retry logic
├── knip.json                          # NEW: Knip configuration
│
.github/workflows/
└── ci.yml                             # MODIFY: Add bundle budget step
```

### Pattern 1: NestJS Redis IO Adapter
**What:** Custom IoAdapter extending NestJS's IoAdapter, wiring `@socket.io/redis-adapter` with ioredis pub/sub clients
**When to use:** Always for horizontal WebSocket scaling in NestJS

```typescript
// backend/src/common/adapters/redis-io.adapter.ts
import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { getRedisConnectionOptions } from '../../config/configuration';
import { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(app: INestApplication) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const options = getRedisConnectionOptions();
    const pubClient = new Redis({ ...options, connectionName: 'ws-pub' });
    const subClient = pubClient.duplicate({ connectionName: 'ws-sub' });

    // ioredis auto-connects; no explicit .connect() needed
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
```

**Wiring in main.ts:**
```typescript
const redisIoAdapter = new RedisIoAdapter(app);
await redisIoAdapter.connectToRedis();
app.useWebSocketAdapter(redisIoAdapter);
```

### Pattern 2: Redis Tenant Connection Counters
**What:** Replace in-memory Map with Redis INCR/DECR for tenant connection tracking
**When to use:** Multi-instance deployments where in-memory counters are instance-local

```typescript
// Key naming convention
const TENANT_CONN_KEY = (tenantId: string) => `ws:tenant:${tenantId}:conns`;

// On connect
await redis.incr(TENANT_CONN_KEY(tenantId));

// On disconnect
const count = await redis.decr(TENANT_CONN_KEY(tenantId));
if (count <= 0) await redis.del(TENANT_CONN_KEY(tenantId));

// Check
const count = await redis.get(TENANT_CONN_KEY(tenantId));
return parseInt(count || '0', 10) > 0;
```

### Pattern 3: CSRF Error Interception
**What:** Catch csrf-csrf's thrown error in middleware, convert to structured HttpException
**When to use:** To surface meaningful CSRF errors through ApiExceptionFilter

```typescript
// In csrf.middleware.ts -- wrap doubleCsrfProtection to catch and re-throw
export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  if (shouldSkipCsrf(req)) return next();

  doubleCsrfProtection(req, res, (err?: unknown) => {
    if (err && err === invalidCsrfTokenError) {
      // Re-throw as a proper error that ApiExceptionFilter can handle
      // with CSRF-specific code for frontend detection
      const csrfError: any = new Error('Security token expired. Please retry.');
      csrfError.statusCode = 403;
      csrfError.csrfError = true;
      return next(csrfError);
    }
    next(err);
  });
}
```

Then in ApiExceptionFilter, detect `csrfError` flag and set code to `CSRF_TOKEN_INVALID`.

### Pattern 4: Frontend CSRF-Specific Retry
**What:** Distinguish CSRF 403 from authorization 403 in retry interceptor
**When to use:** To avoid retrying non-CSRF 403s (auth failures)

```typescript
// In api-client.ts -- enhanced 403 handling
if (error.response?.status === 403 && !error.config._csrfRetried) {
  const errorCode = error.response?.data?.error?.code;
  if (errorCode === 'CSRF_TOKEN_INVALID') {
    clearCsrfToken();
    error.config._csrfRetried = true;
    const freshToken = await getCsrfToken();
    if (freshToken) {
      error.config.headers['X-CSRF-Token'] = freshToken;
    }
    return apiClient.request(error.config);
  }
}
```

### Anti-Patterns to Avoid
- **Using redis npm client instead of ioredis for pub/sub:** The project uses ioredis everywhere; mixing clients creates connection management complexity
- **Sticky sessions with WebSocket-only transport:** Not needed when polling is removed; adds unnecessary infrastructure complexity
- **Querying encrypted fields by prefix with raw SQL:** Use Prisma `startsWith` filter for `gcm:` prefix checks
- **Running re-encryption in a migration:** Migrations should be schema changes only; data transformations belong in standalone scripts

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-instance WS pub/sub | Custom Redis pub/sub message routing | `@socket.io/redis-adapter` | Handles serialization, room scoping, acknowledgments; 1 line vs 200+ |
| Unused dependency detection | Manual `grep` through imports | Knip | Understands dynamic imports, config-only deps, Next.js entry points |
| Bundle size tracking | Custom webpack stats parser | `du -sb .next/static/chunks/` in CI | Next.js outputs final chunks in predictable location |
| CSRF token management | Custom token rotation logic | `csrf-csrf` (already used) | Handles HMAC signing, cookie management, token validation |

## Common Pitfalls

### Pitfall 1: Redis Pub/Sub Connection Reuse
**What goes wrong:** Using the same Redis connection for pub/sub and commands causes blocking. BullMQ also needs its own connections.
**Why it happens:** Pub/sub subscribers enter a special mode where only SUBSCRIBE/UNSUBSCRIBE commands work.
**How to avoid:** Always use `pubClient.duplicate()` for the sub client. Never share with BullMQ or command connections.
**Warning signs:** "Connection is in subscriber mode" errors, BullMQ jobs stalling.

### Pitfall 2: CSRF Error Swallowed by Generic 403
**What goes wrong:** Frontend retries ALL 403 errors as if CSRF, causing infinite retry loops on actual authorization failures.
**Why it happens:** Current code (line 217) catches any 403 and retries with CSRF token refresh.
**How to avoid:** Backend must return `CSRF_TOKEN_INVALID` error code; frontend checks this code before retrying.
**Warning signs:** Retry loops when user lacks permission, not just when CSRF expires.

### Pitfall 3: Re-encryption Script Corrupts Data
**What goes wrong:** Decrypting CBC and re-encrypting GCM with wrong IV sizes or missing error handling corrupts tokens.
**Why it happens:** CBC uses 16-byte IV, GCM uses 12-byte IV. Mixing them up silently corrupts.
**How to avoid:** The existing `CryptoService.encrypt()` already handles GCM IV correctly. Use it directly -- decrypt with `decrypt()` (handles CBC), re-encrypt with `encrypt()` (always GCM).
**Warning signs:** OAuth token refresh failures after migration.

### Pitfall 4: Knip False Positives
**What goes wrong:** Knip flags dependencies that are used only in configs, runtime-loaded, or peer deps.
**Why it happens:** Knip cannot trace all dynamic require/import patterns.
**How to avoid:** Manual verification of each flagged package. Use Knip's `ignoreDependencies` for false positives.
**Warning signs:** Build breaks after removing a "unused" dependency that was actually needed.

### Pitfall 5: Bundle Budget Too Tight
**What goes wrong:** CI blocks legitimate PRs because bundle grew slightly over budget.
**Why it happens:** New features naturally grow the bundle; 10MB is headroom but could be hit.
**How to avoid:** Use two thresholds: warning at 9MB, failure at 10MB. Log current size always for visibility.
**Warning signs:** Multiple PRs failing CI with bundle size errors.

### Pitfall 6: Redis Adapter + @nestjs/platform-socket.io Compatibility
**What goes wrong:** NestJS's `IoAdapter` creates the Socket.IO server internally; applying the Redis adapter at the wrong lifecycle stage means it's ignored.
**Why it happens:** `createIOServer` must be overridden, not `afterInit`.
**How to avoid:** Override `createIOServer` in the custom adapter, call `super.createIOServer()`, then `server.adapter(this.adapterConstructor)`.
**Warning signs:** Events work on single instance but not across instances.

## Code Examples

### Redis IO Adapter for NestJS (main.ts wiring)
```typescript
// Source: NestJS official sample + Socket.IO docs
// In main.ts, BEFORE app.listen():
const redisIoAdapter = new RedisIoAdapter(app);
await redisIoAdapter.connectToRedis();
app.useWebSocketAdapter(redisIoAdapter);
```

### CSRF Middleware Enhancement
```typescript
// Source: csrf-csrf docs + existing csrf.middleware.ts
export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  if (shouldSkipCsrf(req)) return next();

  doubleCsrfProtection(req, res, (err?: unknown) => {
    if (err) {
      // Check if it's the csrf-csrf specific error
      if (err === invalidCsrfTokenError || (err as any)?.code === 'EBADCSRFTOKEN') {
        const csrfErr: any = new Error('Security token expired. Please retry.');
        csrfErr.statusCode = 403;
        csrfErr.code = 'CSRF_TOKEN_INVALID';
        return next(csrfErr);
      }
      return next(err);
    }
    next();
  });
}
```

### ApiExceptionFilter CSRF Enhancement
```typescript
// In resolveException(), add before the generic Error handler:
// Check for CSRF-specific errors
if (exception instanceof Error && (exception as any).code === 'CSRF_TOKEN_INVALID') {
  return {
    status: 403,
    code: 'CSRF_TOKEN_INVALID',
    message: (exception as any).message || 'Security token expired. Please retry.',
    details: null,
  };
}
```

### Re-encryption CLI Script Pattern
```typescript
// scripts/re-encrypt-cbc-to-gcm.ts
const BATCH_SIZE = 100;

async function reEncryptProviderTokens(prisma: PrismaClient, crypto: CryptoService, dryRun: boolean) {
  let offset = 0;
  let totalProcessed = 0;
  let cbcFound = 0;

  while (true) {
    const providers = await prisma.providerConfig.findMany({
      where: {
        accessToken: { not: { startsWith: 'gcm:' } },
      },
      take: BATCH_SIZE,
      select: { id: true, accessToken: true, tokenEncryptionIv: true, /* ... all encrypted fields */ },
    });

    if (providers.length === 0) break;

    if (!dryRun) {
      await prisma.$transaction(
        providers.map((p) => {
          const plainAccess = crypto.decrypt(p.accessToken, p.tokenEncryptionIv!);
          const { encrypted, iv } = crypto.encrypt(plainAccess);
          return prisma.providerConfig.update({
            where: { id: p.id },
            data: { accessToken: encrypted, tokenEncryptionIv: iv },
          });
        }),
      );
    }

    cbcFound += providers.length;
    totalProcessed += providers.length;
    console.log(`Processed ${totalProcessed} records (${cbcFound} CBC found)`);
    offset += BATCH_SIZE;
  }

  return { totalProcessed, cbcFound };
}
```

### Knip Configuration
```json
// frontend/knip.json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": ["pages/**/*.{ts,tsx}", "lib/**/*.ts"],
  "project": ["**/*.{ts,tsx}"],
  "ignoreDependencies": [
    "@next/bundle-analyzer"
  ]
}
```

### CI Bundle Budget Step
```yaml
# In .github/workflows/ci.yml, under frontend job, after build
- name: Bundle size budget check
  run: |
    SIZE=$(du -sb .next/static/chunks/ | cut -f1)
    SIZE_MB=$(echo "scale=2; $SIZE / 1048576" | bc)
    echo "Bundle size: ${SIZE_MB}MB"
    WARN_LIMIT=9437184   # 9MB in bytes
    FAIL_LIMIT=10485760  # 10MB in bytes
    if [ "$SIZE" -gt "$FAIL_LIMIT" ]; then
      echo "::error::Bundle size ${SIZE_MB}MB exceeds 10MB budget"
      exit 1
    elif [ "$SIZE" -gt "$WARN_LIMIT" ]; then
      echo "::warning::Bundle size ${SIZE_MB}MB approaching 10MB budget"
    fi
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| socket.io-redis (deprecated) | @socket.io/redis-adapter | 2022 | Direct replacement, same API |
| depcheck | Knip | 2023+ | Knip understands modern tooling (Next.js, Vite, etc.) |
| AES-256-CBC without HMAC | AES-256-GCM (authenticated) | NIST guidance | GCM provides built-in integrity; CBC without HMAC is vulnerable to padding oracle |
| Sticky sessions for Socket.IO | WebSocket-only transport (no polling) | Socket.IO v3+ | Eliminates need for sticky sessions entirely |

**Deprecated/outdated:**
- `socket.io-redis`: Replaced by `@socket.io/redis-adapter`
- `depcheck`: Unmaintained since 2023, misses Next.js/config-only deps
- AES-256-CBC without HMAC: Vulnerable to padding oracle attacks; NIST recommends GCM

## Open Questions

1. **Redis version in production (standard vs sharded adapter)**
   - What we know: Standard adapter works with Redis 2.0+, sharded requires Redis 7.0+
   - What's unclear: Which Redis version is deployed in production/Railway
   - Recommendation: Use standard `createAdapter` (not sharded) -- works everywhere, sufficient for PMSync scale

2. **Encrypted field count for re-encryption**
   - What we know: `ProviderConfig` has 5 encrypted field pairs (accessToken, refreshToken, imapPassword, smtpPassword, caldavPassword, carddavPassword -- 6 fields) + `MfaSecret` has 1 (secret)
   - What's unclear: Whether all ProviderConfig records have CBC data (depends on when GCM was deployed)
   - Recommendation: Script should handle each field independently; some may already be GCM

3. **Frontend build step in CI**
   - What we know: Current CI runs type-check + lint + jest but does NOT run `next build`
   - What's unclear: Whether adding `next build` to CI is acceptable (adds ~2-3 min)
   - Recommendation: Add `next build` step since bundle budget requires it; cache `.next` between runs

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (backend), Jest (frontend) |
| Config file | `backend/jest.config.js`, `frontend/jest.config.js` |
| Quick run command | `cd backend && npx jest --testPathPattern=<pattern> --forceExit` |
| Full suite command | `cd backend && npx jest --passWithNoTests --ci --forceExit` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-10 | WS message cross-instance delivery | integration | `npx jest tests/realtime-redis-adapter.spec.ts --forceExit` | Wave 0 |
| TEST-11 | CSRF invalid token returns structured error + retry | unit + integration | `npx jest --testPathPattern=csrf --forceExit` | Wave 0 |
| TEST-12 | Bundle size CI gate fails on exceeding budget | CI script | Shell script in CI workflow | Wave 0 |
| TEST-13 | Zero CBC records after migration | script output | `npx ts-node scripts/re-encrypt-cbc-to-gcm.ts --dry-run` | Wave 0 |
| INFRA-01 | Redis adapter configured | smoke | Verified by TEST-10 | - |
| INFRA-02 | Tenant-scoped pub/sub | unit | Room names already prefixed; covered by TEST-10 | - |
| INFRA-03 | 2-instance verification | integration | Same as TEST-10 | - |
| CLN-01 | CSRF error surfaced | unit | Covered by TEST-11 | - |
| CLN-02 | CSRF retry logic | unit | Covered by TEST-11 | - |
| CLN-03 | Dead filter files gone | assertion | `test ! -f backend/src/common/filters/all-exceptions*` | Pre-satisfied |
| CLN-04 | Unused deps removed | manual + CI | `cd frontend && npx knip` | Wave 0 |
| CLN-05 | Bundle budget | CI | Covered by TEST-12 | - |
| CLN-06 | CBC->GCM verified | script | Covered by TEST-13 | - |

### Sampling Rate
- **Per task commit:** `npx jest --testPathPattern=<relevant> --forceExit`
- **Per wave merge:** `npx jest --passWithNoTests --ci --forceExit` (backend) + `npx tsc --noEmit` (frontend)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/common/adapters/redis-io.adapter.ts` -- RedisIoAdapter class
- [ ] `backend/test/realtime-redis-adapter.spec.ts` -- TEST-10 cross-instance test
- [ ] `backend/test/csrf-error.spec.ts` -- TEST-11 CSRF error test
- [ ] `scripts/re-encrypt-cbc-to-gcm.ts` -- TEST-13 migration script
- [ ] `frontend/knip.json` -- Knip configuration
- [ ] CI workflow update for bundle budget step (TEST-12)

## Sources

### Primary (HIGH confidence)
- [Socket.IO Redis Adapter docs](https://socket.io/docs/v4/redis-adapter/) -- createAdapter API, pub/sub client setup
- [NestJS WebSocket Adapter docs](https://docs.nestjs.com/websockets/adapter) -- IoAdapter extension pattern
- [NestJS official Redis IO adapter sample](https://github.com/nestjs/nest/blob/master/sample/02-gateways/src/adapters/redis-io.adapter.ts) -- Reference implementation
- [@socket.io/redis-adapter npm](https://www.npmjs.com/package/@socket.io/redis-adapter) -- Version, ioredis compatibility
- [Knip docs](https://knip.dev/) -- Next.js plugin, unused dependency detection
- Codebase analysis: `realtime.gateway.ts`, `csrf.middleware.ts`, `crypto.service.ts`, `api-client.ts`, `main.ts`, `ci.yml` -- all read directly

### Secondary (MEDIUM confidence)
- [LogRocket: Scalable WebSockets with NestJS and Redis](https://blog.logrocket.com/scalable-websockets-with-nestjs-and-redis/) -- Verified NestJS + Redis adapter pattern
- [Medium: NestJS ioredis socket adapter](https://medium.com/@gizemseverr/nestjs-ioredis-socket-adapter-integration-for-horizontal-scaling-0b605a9dadbf) -- Confirmed ioredis .duplicate() pattern

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed or well-documented, APIs verified
- Architecture: HIGH -- NestJS IoAdapter pattern is official, codebase patterns clear
- Pitfalls: HIGH -- CSRF retry loop and Redis pub/sub connection issues are well-known
- Re-encryption: HIGH -- crypto.service.ts already has GCM prefix convention; decrypt/encrypt cycle is straightforward

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable domain, 30-day validity)
