# Technology Stack

**Project:** PMSync v11.0 -- Legacy Cleanup, Scalability & Billing Hardening
**Researched:** 2026-03-31

## Scope

This document covers ONLY new stack additions/changes for v11.0. The existing validated stack (NestJS 11, Prisma 7, PostgreSQL, Redis, BullMQ, Next.js 16, React 19, TanStack Query, MUI, better-auth, AI SDK v6, Serwist, Prometheus, Railway/Vercel, Autumn billing) is not re-evaluated.

---

## Recommended Stack Additions

### Railway Horizontal Scaling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Railway Replicas (config) | N/A | Multi-instance backend | Railway has built-in horizontal scaling via replica count in service settings. No library needed -- configure in dashboard. Load balancing is automatic (random distribution). **No sticky sessions** supported, which is fine because PMSync uses Redis-backed sessions (better-auth + cookie) and Redis-backed WebSocket adapter (already implemented). |
| PgBouncer | 1.23+ (Railway template) | DB connection pooling | Railway offers a one-click PgBouncer template that sits between app and PostgreSQL. Required because: each Prisma instance opens `connection_limit` connections (currently 20). With 3 replicas, that's 60 direct connections competing for Railway PostgreSQL's default 97 max. PgBouncer in transaction mode multiplexes these efficiently. |

**What NOT to add:**
- **Node.js cluster module** -- Railway replicas are separate containers. Do not use `cluster.fork()` inside Railway; it wastes container resources and complicates debugging. Let Railway handle process replication.
- **@nestjs/terminus** for health checks -- Railway does not use HTTP health checks for replica routing (it uses process liveness). The existing `/health` endpoint is sufficient for monitoring.
- **Sticky sessions library** -- Railway explicitly does not support sticky sessions. The app already handles this correctly: Redis-backed sessions, Redis WebSocket adapter, Redis BullMQ coordination.

### Database Connection Pooling (PgBouncer)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PgBouncer (Railway template) | 1.23+ | Connection pooling proxy | Deploy via `railway.com/deploy/postgres-pgbouncer`. Sits on port 6432, same credentials as PostgreSQL. Transaction mode required for Prisma compatibility. |
| `DIRECT_URL` env var | N/A | Prisma CLI migrations | PgBouncer breaks `prisma migrate` (Schema Engine needs a single persistent connection). Add `DIRECT_URL` pointing to raw PostgreSQL for CLI commands. Runtime traffic goes through PgBouncer URL. |

**Configuration changes needed:**

1. **`prisma.config.ts`** -- Add `directUrl` for migrations:
   ```typescript
   datasource: {
     url: process.env.DATABASE_URL,        // PgBouncer URL (port 6432)
     directUrl: process.env.DIRECT_URL,    // Raw PostgreSQL URL (port 5432)
   }
   ```

2. **`prisma-client.factory.ts`** -- Remove the `connection_limit=20` append logic. PgBouncer manages the pool; Prisma should NOT open its own pool on top. Set `connection_limit=1` per instance (Prisma opens 1 connection to PgBouncer, which handles pooling).

3. **PgBouncer config:**
   - `pool_mode = transaction` (required for Prisma)
   - `max_client_conn = 200` (supports ~10 replicas with room)
   - `default_pool_size = 20` (actual connections to PostgreSQL)
   - `max_prepared_statements = 100` (Prisma uses prepared statements; PgBouncer 1.21+ supports this)
   - `server_idle_timeout = 300` (reap idle server connections)

4. **No `?pgbouncer=true`** in connection string -- Not needed for PgBouncer 1.21+. The old flag disabled prepared statements; modern PgBouncer handles them natively via `max_prepared_statements`.

**Confidence:** HIGH -- Prisma docs explicitly document PgBouncer transaction mode as the supported configuration. Railway has a dedicated deploy template.

### BullMQ Multi-Instance Tuning

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| BullMQ (existing) | 5.67.3 | Job queue | No version change needed. BullMQ inherently supports multi-instance via Redis coordination. Each replica runs its own workers against the same Redis queues -- Redis prevents duplicate job processing automatically. |

**Configuration changes needed (no new dependencies):**

1. **Reduce per-instance concurrency** -- Currently `DEFAULT.concurrency = 5`, `HIGH_THROUGHPUT.concurrency = 10`. With 3 replicas, effective concurrency triples. Reduce per-instance values to avoid overwhelming downstream services:
   - `DEFAULT.concurrency`: 5 -> 3
   - `HIGH_THROUGHPUT.concurrency`: 10 -> 5
   - `EMAIL_SYNC.concurrency`: 3 -> 2
   - Scale via `WORKER_CONCURRENCY` env var to tune per deployment size

2. **`maxRetriesPerRequest: null`** on Redis connections -- Already set in `getSharedRedisConnection()` via ioredis defaults for BullMQ. Verify this is explicitly set; it's critical for blocking operations across distributed workers.

3. **Scheduled job deduplication** -- The `SCHEDULED_*` queues use repeatable jobs. BullMQ handles repeatable job deduplication via Redis keys, so multiple replicas adding the same repeatable job is safe (idempotent). No code change needed.

4. **Queue metrics for scaling decisions** -- Already have `prom-client` Prometheus metrics for BullMQ depth. Add gauge for active worker count per instance to inform scaling decisions.

**What NOT to add:**
- **BullBoard / Arena** -- UI dashboards for BullMQ. Nice-to-have but not v11.0 scope.
- **Auto-scaling logic** -- Premature. Start with manual replica count; add auto-scaling only after observing production load patterns.

**Confidence:** HIGH -- BullMQ's distributed coordination via Redis is core architecture, not an add-on. The existing shared Redis connection pattern already handles this correctly.

### Frontend Performance Optimization

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@next/bundle-analyzer` (existing) | 16.1.6 | Bundle visualization | Already installed and wired in `next.config.js`. Run `ANALYZE=true npm run build` to generate treemap. No change needed. |
| `optimizePackageImports` (existing) | N/A (Next.js built-in) | Tree-shaking barrel files | Already configured for `@mui/material`, `@mui/icons-material`, `lucide-react`. These are the three largest barrel-export libraries in the project. |

**Configuration changes needed (no new dependencies):**

1. **Add more packages to `optimizePackageImports`:**
   ```javascript
   optimizePackageImports: [
     '@mui/material',
     '@mui/icons-material',
     'lucide-react',
     'recharts',           // Chart library, barrel exports
     'lodash-es',          // Utility library, many exports
     '@xyflow/react',      // Graph rendering, large
   ]
   ```

2. **Dynamic imports for heavy routes** -- Already partially done (TipTap, @dnd-kit per v2.1). Extend to:
   - `recharts` (only needed on analytics/dashboard pages)
   - `@xyflow/react` (only needed on graph visualization)
   - `@rive-app/react-webgl2` (only needed where Rive animations exist)
   - `FullCalendar` bundle (only on calendar page)

3. **Lighthouse CI budget enforcement** -- Already exists per v2.1. Tighten budgets:
   - Total JS: target < 350KB gzipped (measure current baseline first)
   - LCP: < 2.5s
   - TTI: < 3.5s

**What NOT to add:**
- **source-map-explorer** -- `@next/bundle-analyzer` already provides equivalent visualization. Adding both is redundant.
- **Partytown / web workers for third-party scripts** -- PMSync has no third-party analytics/marketing scripts to offload.
- **Module federation** -- Overkill for a single-team monorepo. Code splitting via dynamic imports is sufficient.
- **Tailwind CSS removal** -- Listed as v11.0 legacy cleanup (removing `tailwindcss` package and `@tailwind base` injection), but this is a deletion, not a stack addition.

**Confidence:** HIGH -- `@next/bundle-analyzer` and `optimizePackageImports` are already installed and working. Changes are configuration-only.

### Billing Hardening

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `autumn-js` (existing) | 0.1.75 | Billing SDK | No version change. Autumn's architecture explicitly eliminates webhook complexity -- it uses a "pull" model (check/track API calls) rather than "push" (webhooks). The current `AutumnService` correctly implements this pattern. |

**Key architectural insight: Autumn does NOT use webhooks for billing state.**

Unlike Stripe-based billing where you must handle `invoice.paid`, `customer.subscription.updated`, etc. via webhooks, Autumn's SDK works differently:
- `check()` -- Query feature access in real-time (synchronous)
- `track()` -- Record usage events (fire-and-forget with local fallback)
- `attach()` -- Initiate subscription (returns checkout URL)
- `cancel()` -- Cancel subscription

The local fallback in `AutumnService.localFeatureCheck()` already provides resilience when Autumn's API is unavailable. This is the correct pattern.

**Hardening changes needed (no new dependencies):**

1. **Idempotency on `track()` calls** -- Currently fire-and-forget. Add a Redis-based dedup key (`track:{tenantId}:{featureId}:{jobId}`) with short TTL (60s) to prevent double-counting during retries. Use existing `ioredis` instance.

2. **Circuit breaker on Autumn API calls** -- If Autumn is down, fall back to local limits immediately instead of waiting for timeout. Pattern already exists in the codebase (AI circuit breaker). Apply same pattern: 5 failures -> open circuit -> local fallback for 60s -> half-open probe.

3. **Reconciliation job** -- Add a scheduled BullMQ job (daily) that compares local `SubscriptionUsage` records with Autumn's API response. Log discrepancies but don't auto-correct (human review).

4. **`attach()` return URL validation** -- The `returnUrl` in `billingPortal()` should be validated against a whitelist of allowed domains (current `FRONTEND_URL` + production domains). Prevents open redirect if `returnUrl` is user-supplied.

5. **better-auth Autumn plugin** -- Autumn has a dedicated better-auth plugin that auto-creates customers on signup. The current implementation manually calls `createCustomer()`. Consider migrating to the plugin for cleaner integration, but this is optional (current approach works).

**What NOT to add:**
- **Stripe SDK** -- Autumn wraps Stripe internally. Do not add `stripe` package; interact only through Autumn's API.
- **Webhook endpoint for Autumn** -- Autumn's architecture does not require one. The current proxy-style controller is correct.
- **Complex event sourcing for billing** -- Overkill. The check/track model with local fallback is sufficient for the current scale.

**Confidence:** MEDIUM -- Autumn is a younger product (SDK at 0.1.x). The "no webhooks" model is well-documented but the SDK may add webhook support later. Monitor Autumn changelog. The local fallback pattern provides good resilience regardless.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Connection pooling | PgBouncer (Railway template) | Prisma Accelerate | Adds cloud dependency + cost. PgBouncer is self-hosted, free, and Railway has a template. |
| Connection pooling | PgBouncer (Railway template) | pgpool-II | Heavier, more complex. PgBouncer is lightweight and purpose-built for connection pooling. pgpool-II adds query caching and load balancing features not needed here. |
| Bundle analysis | `@next/bundle-analyzer` (existing) | `source-map-explorer` | Already have bundle analyzer. Adding a second tool provides marginal value. |
| Bundle analysis | `@next/bundle-analyzer` (existing) | `webpack-bundle-analyzer` standalone | `@next/bundle-analyzer` wraps this already. Turbopack integration in Next.js 16 makes it even better. |
| Process scaling | Railway replicas | Node.js `cluster` module | Railway manages container replication. Using `cluster` inside a container wastes the orchestrator's capabilities and doubles complexity. |
| Billing hardening | Circuit breaker pattern (custom) | `opossum` npm package | Dedicated circuit breaker library. The codebase already has a pattern for this (AI module). Adding a package for 30 lines of code is unnecessary. |
| Job queue scaling | BullMQ concurrency tuning | Separate worker service | Could deploy a dedicated "worker" Railway service that only processes queues (no HTTP). Useful at scale but premature for v11.0. Revisit if queue backlog grows. |

---

## Summary of Changes

### New Dependencies: NONE

v11.0 requires **zero new npm packages**. All changes are:
- Configuration adjustments to existing tools
- Railway infrastructure setup (PgBouncer template, replica count)
- Code patterns using existing libraries (ioredis for dedup, prom-client for metrics)

### Infrastructure Changes

| Change | Type | Effort |
|--------|------|--------|
| Railway replica count: 1 -> 3 | Dashboard config | Trivial |
| Deploy PgBouncer template on Railway | Infrastructure | Low |
| Add `DIRECT_URL` env var | Config | Trivial |
| Update `prisma.config.ts` for `directUrl` | Code | Trivial |
| Update `prisma-client.factory.ts` pool settings | Code | Low |
| Reduce BullMQ worker concurrency per instance | Code | Low |
| Add circuit breaker to AutumnService | Code | Medium |
| Add track() idempotency via Redis | Code | Low |
| Add billing reconciliation scheduled job | Code | Medium |
| Extend `optimizePackageImports` list | Config | Trivial |
| Add dynamic imports for heavy components | Code | Medium |
| Remove Tailwind CSS package + config | Code | Low |
| Remove JWT dual-stack auth code | Code | Medium |
| Remove deprecated API aliases | Code | Low |

---

## Installation

```bash
# No new packages to install.
# v11.0 is configuration and code changes only.

# Verify current versions are sufficient:
cd backend && npm ls autumn-js bullmq ioredis @prisma/client pg prom-client
cd frontend && npm ls @next/bundle-analyzer @serwist/next
```

---

## Sources

- [Railway Scaling Documentation](https://docs.railway.com/reference/scaling) -- HIGH confidence
- [Railway PgBouncer Deploy Template](https://railway.com/deploy/postgres-pgbouncer) -- HIGH confidence
- [Prisma PgBouncer Configuration](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer) -- HIGH confidence
- [Prisma Connection Pool Documentation](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool) -- HIGH confidence
- [BullMQ Horizontal Scaling Guide](https://oneuptime.com/blog/post/2026-01-21-bullmq-horizontal-scaling/view) -- MEDIUM confidence
- [BullMQ Concurrency Documentation](https://docs.bullmq.io/guide/workers/concurrency) -- HIGH confidence
- [Next.js optimizePackageImports](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports) -- HIGH confidence
- [Next.js Package Bundling Guide](https://nextjs.org/docs/app/guides/package-bundling) -- HIGH confidence
- [Autumn SDK (autumn-js)](https://www.npmjs.com/package/autumn-js) -- MEDIUM confidence
- [Autumn Documentation](https://docs.useautumn.com/documentation/getting-started/gating) -- MEDIUM confidence
- [Autumn better-auth Plugin](https://better-auth.com/docs/plugins/autumn) -- MEDIUM confidence
- [Railway Blog: Horizontal Scaling](https://blog.railway.com/p/launch-week-01-horizontal-scaling) -- HIGH confidence
- [PgBouncer Configuration Reference](https://www.pgbouncer.org/config.html) -- HIGH confidence
