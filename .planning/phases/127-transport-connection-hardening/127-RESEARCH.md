# Phase 127: Transport & Connection Hardening - Research

**Researched:** 2026-03-31
**Domain:** WebSocket transport, PostgreSQL connection pooling, multi-replica deployment
**Confidence:** HIGH

## Summary

Phase 127 addresses two independent scaling concerns: (1) forcing Socket.IO to websocket-only transport so Railway multi-replica works without sticky sessions, and (2) making the database connection pool configurable per-replica to avoid exhausting Railway PostgreSQL's `max_connections`.

The codebase is already well-positioned. The server-side gateway (`realtime.gateway.ts`) already sets `transports: ['websocket']`, and a Redis adapter is already wired for cross-instance event propagation. However, the frontend client (`frontend/lib/websocket-client.ts`) still includes `'polling'` in its transports array, which is the primary mismatch to fix. The DB pool situation is more critical: the current `prisma-client.factory.ts` appends `connection_limit=20` to the URL string, but `pg.Pool` (used by `@prisma/adapter-pg`) does NOT parse this parameter from the URL -- it silently defaults to `max: 10`. This is a live bug.

**Primary recommendation:** Fix the frontend transport array to match server (websocket-only), and rewrite `prisma-client.factory.ts` to pass explicit `max` / `idleTimeoutMillis` to `PrismaPg` constructor instead of relying on URL parameters that are ignored.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCAL-01 | Socket.IO transport forced to websocket-only on both server and client (HTTP long-polling disabled) | Server already correct; client needs `transports: ['websocket']`; see Architecture Patterns and Code Examples |
| SCAL-02 | DB connection pool sized per-replica with env var override (total connections < Railway PostgreSQL max) | Current URL-based pool config is broken; must use explicit `max` on `PrismaPg`; see Common Pitfalls and Code Examples |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Post-edit validation mandatory: `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit`
- Follow existing patterns -- never invent new approaches when codebase patterns exist
- Multi-tenant rule: every query MUST include tenantId
- Max 500 lines per file
- Never hardcode secrets
- Backend stack: NestJS 11, Prisma 7 + PostgreSQL, BullMQ + Redis, Socket.IO
- Frontend stack: Next.js 16 + React 19
- Scope control: do exactly what was asked, nothing more

## Standard Stack

### Core (already installed -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| socket.io | 4.8.3 | WebSocket server | Already installed |
| socket.io-client | 4.8.3 | WebSocket client | Already installed |
| @socket.io/redis-adapter | 8.3.0 | Cross-instance event propagation | Already installed and wired |
| @prisma/adapter-pg | 7.5.0 (npm latest: 7.6.0) | Prisma PostgreSQL driver adapter | Already installed |
| @prisma/client | 7.5.0 | ORM | Already installed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pg | (transitive via @prisma/adapter-pg) | Node.js PostgreSQL driver | Pool configuration |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct pg.Pool config | PgBouncer service | Out of scope per REQUIREMENTS.md |
| URL params for pool | Explicit constructor options | URL params are IGNORED by pg.Pool -- must use constructor |

**Installation:** No new packages needed.

## Architecture Patterns

### SCAL-01: WebSocket Transport

**Current state analysis:**

| Component | File | Current Config | Correct? |
|-----------|------|----------------|----------|
| Server gateway | `backend/src/modules/realtime/gateways/realtime.gateway.ts:84` | `transports: ['websocket']` | YES |
| Redis adapter | `backend/src/common/adapters/redis-io.adapter.ts` | Fully wired, pub/sub ready | YES |
| Main bootstrap | `backend/src/main.ts:635-639` | `RedisIoAdapter` connected before listen | YES |
| Frontend client | `frontend/lib/websocket-client.ts:401` | `transports: ['websocket', 'polling']` | **NO -- includes polling** |
| E2E test script | `frontend/scripts/test-websocket.ts:134` | `transports: ['websocket']` | YES |

**Action required:** Change line 401 in `frontend/lib/websocket-client.ts` from `['websocket', 'polling']` to `['websocket']`.

**Why this matters on Railway:** Railway load balancer does NOT support sticky sessions. HTTP long-polling sends multiple HTTP requests during a Socket.IO session. Without sticky sessions, sequential polling requests hit different replicas, causing "Session ID unknown" (HTTP 400) errors. WebSocket transport uses a single persistent TCP connection, so no sticky sessions are needed.

The Redis adapter (`@socket.io/redis-adapter`) is already configured, which handles cross-instance event propagation via Redis pub/sub. Combined with websocket-only transport, this is the complete multi-replica Socket.IO setup.

### SCAL-02: Database Connection Pool

**Current state analysis (CRITICAL BUG):**

The current `prisma-client.factory.ts` appends `connection_limit=20&pool_timeout=20` to the `DATABASE_URL` string. This parameter is a Prisma v5/v6 concept that was parsed by Prisma's built-in query engine. In Prisma 7 with `@prisma/adapter-pg`, the connection string is passed directly to `pg.Pool`, which does NOT recognize `connection_limit`. Verified empirically:

```
pg.Pool({ connectionString: '...?connection_limit=20' })
// pool.options.max === 10  (pg default, NOT 20)
```

**This means production is running with max=10 connections per instance, not the intended 20.**

**Correct approach:** Pass `max` and `idleTimeoutMillis` as explicit constructor options to `PrismaPg`:

```typescript
const DB_POOL_MAX = parseInt(process.env.DB_POOL_MAX || '10', 10);
const DB_POOL_TIMEOUT = parseInt(process.env.DB_POOL_TIMEOUT_MS || '20000', 10);

return new PrismaPg({
  connectionString,   // URL without connection_limit/pool_timeout params
  max: DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: DB_POOL_TIMEOUT,
});
```

**Pool sizing formula for Railway:**

```
DB_POOL_MAX = floor(max_connections / N_replicas) - safety_margin

Railway PostgreSQL default: max_connections = 100
Formula for 2 replicas: floor(100 / 2) - 5 = 45
Formula for 3 replicas: floor(100 / 3) - 5 = 28
```

Conservative recommendation: `DB_POOL_MAX=20` for up to 4 replicas (20 * 4 = 80, leaving 20 for admin/migration connections).

**Rolling deploy concern:** During a rolling deploy, old + new instances co-exist briefly. With N replicas, up to N+1 instances may run simultaneously. The formula must account for this:

```
DB_POOL_MAX = floor(max_connections / (N_replicas + 1)) - safety_margin
```

For 2 replicas: floor(100 / 3) - 3 = 30. Recommend `DB_POOL_MAX=20` as a safe default that works for 2-4 replicas without tuning.

### Anti-Patterns to Avoid
- **URL-based pool params with driver adapters:** `connection_limit` and `pool_timeout` in DATABASE_URL are silently ignored by pg.Pool. Always use explicit constructor options.
- **Polling fallback "just in case":** Including `'polling'` in transports list defeats the entire purpose. If WebSocket fails, it should fail visibly -- not silently degrade to a mode that breaks multi-replica.
- **Hardcoding pool size:** Pool size must be environment-configurable. Different Railway plans have different `max_connections`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-instance WebSocket events | Custom Redis pub/sub | `@socket.io/redis-adapter` (already wired) | Handles serialization, room semantics, broadcast |
| Connection pooling | Custom pool manager | `pg.Pool` via `PrismaPg` constructor options | Battle-tested, handles idle timeout, connection lifecycle |
| Sticky sessions workaround | Session affinity middleware | WebSocket-only transport | Eliminates the need entirely |

## Common Pitfalls

### Pitfall 1: connection_limit URL param silently ignored in Prisma 7
**What goes wrong:** Pool runs at pg default (max=10) regardless of URL setting
**Why it happens:** Prisma 7 driver adapters delegate pooling to the native driver. pg.Pool does not parse `connection_limit` from URLs.
**How to avoid:** Pass `max` explicitly in `PrismaPg` constructor config
**Warning signs:** "Connection pool timeout" errors under load; `SELECT count(*) FROM pg_stat_activity` shows only ~10 connections per instance

### Pitfall 2: Frontend transport mismatch causes intermittent disconnects
**What goes wrong:** Client tries polling first, succeeds on initial handshake, then subsequent polls hit different replica, get 400 error
**Why it happens:** Socket.IO default behavior: connect with first transport in list, upgrade later. `['websocket', 'polling']` tries websocket first but falls back to polling on any hiccup.
**How to avoid:** Set `transports: ['websocket']` on client -- must match server exactly
**Warning signs:** Intermittent "transport close" or "Session ID unknown" in browser console when >1 replica

### Pitfall 3: Rolling deploy connection storm
**What goes wrong:** During deploy, N+1 instances open N+1 pools, exceeding max_connections
**Why it happens:** Railway does rolling deploys -- new instance starts before old one stops
**How to avoid:** Size pool for N+1 instances; use `idleTimeoutMillis` (30s) so old instance connections drain quickly
**Warning signs:** `FATAL: too many connections for role "postgres"` in Railway logs during deploy

### Pitfall 4: Forgetting to strip connection_limit from URL
**What goes wrong:** connection_limit stays in URL, `max` is also set explicitly, confusing future developers about which controls the pool
**Why it happens:** URL was correct for Prisma v5/v6, never updated for v7
**How to avoid:** Remove `connection_limit` and `pool_timeout` from URL construction; document that pool is controlled via env vars
**Warning signs:** Code comments reference URL params that don't do anything

## Code Examples

### Fix 1: Frontend transport (SCAL-01)

```typescript
// frontend/lib/websocket-client.ts line ~400
// BEFORE (broken for multi-replica):
this.socket = io(`${backendUrl}/realtime`, {
  transports: ['websocket', 'polling'],
  // ...
});

// AFTER (correct for multi-replica):
this.socket = io(`${backendUrl}/realtime`, {
  transports: ['websocket'],
  // ...
});
```

### Fix 2: Prisma pool configuration (SCAL-02)

```typescript
// backend/src/prisma/prisma-client.factory.ts
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Default pool size per replica. Override via DB_POOL_MAX env var.
 * Formula: floor(max_connections / (replicas + 1)) - safety_margin
 * Safe for 2-4 Railway replicas with default max_connections=100.
 */
const DEFAULT_POOL_MAX = 20;
const DEFAULT_POOL_TIMEOUT_MS = 20_000;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;

export function createPrismaAdapter() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set for Prisma client');
  }

  // Pool size is controlled via explicit pg.Pool options, NOT URL params.
  // connection_limit/pool_timeout in URL are ignored by pg.Pool (Prisma 7).
  const max = parseInt(process.env.DB_POOL_MAX || String(DEFAULT_POOL_MAX), 10);
  const connectionTimeoutMillis = parseInt(
    process.env.DB_POOL_TIMEOUT_MS || String(DEFAULT_POOL_TIMEOUT_MS),
    10,
  );
  const idleTimeoutMillis = parseInt(
    process.env.DB_POOL_IDLE_TIMEOUT_MS || String(DEFAULT_IDLE_TIMEOUT_MS),
    10,
  );

  return new PrismaPg({
    connectionString,
    max,
    connectionTimeoutMillis,
    idleTimeoutMillis,
  });
}
```

### Fix 3: Env var documentation

```bash
# .env.example / .env.railway.template
# DB Connection Pool (per-replica, used by pg.Pool via @prisma/adapter-pg)
# Formula: floor(max_connections / (replicas + 1)) - safety_margin
# Railway default: max_connections=100, 2 replicas -> DB_POOL_MAX=30
DB_POOL_MAX=20
DB_POOL_TIMEOUT_MS=20000
DB_POOL_IDLE_TIMEOUT_MS=30000
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `connection_limit` in URL | `max` in pg.Pool constructor | Prisma 7 (2025) | URL param silently ignored |
| Prisma query engine pool | pg.Pool via driver adapter | Prisma 7 (2025) | Pool config moved to driver |
| Polling + websocket transport | Websocket-only for multi-node | Socket.IO v4 recommendation | Eliminates sticky session requirement |

## Open Questions

1. **Railway max_connections value**
   - What we know: PostgreSQL default is 100. Railway does not modify this by default.
   - What's unclear: Whether the user has run `ALTER SYSTEM SET max_connections` to change it.
   - Recommendation: Add a startup log that queries `SHOW max_connections` so the pool sizing can be verified in Railway logs.

2. **PrismaPg accepting pool params directly**
   - What we know: Empirically verified PrismaPg constructor passes config to `pg.Pool`. `max`, `idleTimeoutMillis`, `connectionTimeoutMillis` work.
   - What's unclear: Whether PrismaPg documentation officially guarantees this pass-through.
   - Recommendation: HIGH confidence based on source inspection of PrismaPg constructor, which directly passes config to `new pg.Pool(this.config)`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (via `npx vitest`) |
| Config file | `backend/vitest.config.ts` |
| Quick run command | `cd backend && npx vitest run --reporter=verbose` |
| Full suite command | `cd backend && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCAL-01 | Server gateway has websocket-only transport | unit | `cd backend && npx vitest run src/modules/realtime --reporter=verbose` | Partial (handshake tests exist) |
| SCAL-01 | Frontend client has websocket-only transport | manual-only | Verify `transports: ['websocket']` in source | N/A |
| SCAL-02 | PrismaPg receives explicit max pool option | unit | `cd backend && npx vitest run src/prisma --reporter=verbose` | No - Wave 0 |
| SCAL-02 | DB_POOL_MAX env var overrides default | unit | `cd backend && npx vitest run src/prisma --reporter=verbose` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
- **Per wave merge:** `cd backend && npx vitest run`
- **Phase gate:** Full suite green + manual Railway deploy smoke test

### Wave 0 Gaps
- [ ] `backend/src/prisma/__tests__/prisma-client.factory.spec.ts` -- covers SCAL-02 pool config
- [ ] Source inspection verification for SCAL-01 (no runtime test needed, just code review)

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `backend/src/common/adapters/redis-io.adapter.ts` - Redis adapter already wired
- Codebase inspection: `backend/src/modules/realtime/gateways/realtime.gateway.ts:84` - Server already websocket-only
- Codebase inspection: `frontend/lib/websocket-client.ts:401` - Client includes polling (BUG)
- Codebase inspection: `backend/src/prisma/prisma-client.factory.ts` - connection_limit in URL (BUG)
- Empirical verification: `pg.Pool` ignores `connection_limit` URL param, defaults to `max: 10`
- Empirical verification: `PrismaPg` constructor passes config directly to `new pg.Pool(config)`

### Secondary (MEDIUM confidence)
- [Socket.IO multi-node docs](https://socket.io/docs/v4/using-multiple-nodes/) - Sticky sessions not needed with websocket-only
- [Prisma connection pool docs](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool) - Driver adapter pool config
- [Railway PostgreSQL max_connections](https://station.railway.com/questions/postgre-sql-max-connections-limit-76df3d31) - Default 100

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed, versions verified via npm ls
- Architecture: HIGH - Both bugs empirically verified, fixes are straightforward config changes
- Pitfalls: HIGH - Based on direct codebase analysis and pg.Pool behavior verification

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (stable libraries, no fast-moving dependencies)
