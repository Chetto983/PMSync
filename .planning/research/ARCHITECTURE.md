# Architecture Patterns

**Domain:** Legacy cleanup, horizontal scaling, and billing hardening for existing NestJS email platform
**Researched:** 2026-03-31
**Confidence:** HIGH (verified against codebase, Prisma docs, Railway docs, BullMQ docs)

## Scope

This document covers how Railway horizontal scaling (multi-instance NestJS, connection pooling, BullMQ worker distribution), legacy JWT removal, and billing webhook hardening integrate with the existing PMSync architecture. Focus is on integration points, new components, modified components, data flow changes, and build order.

---

## Recommended Architecture

### Overview

v11.0 modifies the existing monolith deployment model to support N replicas on Railway, hardens the billing webhook pipeline, and removes legacy auth/API dead code. No new modules are introduced -- this is structural hardening of existing components.

```
                    Railway Load Balancer (round-robin)
                    /           |           \
              [Instance 1] [Instance 2] [Instance N]
                    \           |           /
                     Redis (shared: pub/sub, BullMQ, cache, sessions)
                              |
                    PgBouncer (transaction mode, Railway service)
                              |
                      PostgreSQL (Railway TCP proxy)
```

### Component Boundaries

| Component | Responsibility | Changes in v11.0 |
|-----------|---------------|-------------------|
| `main.ts` | App bootstrap, middleware, Swagger | Remove `addBearerAuth()`, add `addCookieAuth()` |
| `prisma-client.factory.ts` | DB connection via `@prisma/adapter-pg` | Configure for PgBouncer transaction mode, dynamic pool size per replica |
| `BaseWorker` | BullMQ worker lifecycle, health, auto-pause | No change -- already multi-instance safe via Redis coordination |
| `ScheduledJobsQueueService` | BullMQ repeatable jobs (replaces @Cron) | No change -- BullMQ guarantees single execution |
| `RedisIoAdapter` | WebSocket cross-instance pub/sub | No change -- already wired with Redis adapter |
| `AutumnController` | Billing API proxy | No change to existing routes |
| `AutumnWebhookController` | **NEW** -- Receives Autumn webhook events | Signature verification, idempotent processing |
| `AutumnWebhookService` | **NEW** -- Processes billing events | Subscription state sync from webhook events |
| `HealthController` | Probes and metrics | Add instance identifier to responses |
| 84 controller files | Swagger auth docs | Remove `@ApiBearerAuth()`, add `@ApiCookieAuth()` |

### Data Flow Changes

**Before v11.0 (single instance):**
```
Client -> NestJS (1 instance) -> PostgreSQL (connection_limit=20)
                               -> Redis (shared connection singleton)
                               -> BullMQ workers (in-process)
```

**After v11.0 (N replicas):**
```
Client -> Railway LB -> NestJS (N instances)
  Each instance:
    -> PgBouncer (transaction mode) -> PostgreSQL
    -> Redis (shared BullMQ connection per instance)
    -> BullMQ workers (distributed across instances, Redis coordinates)
    -> WebSocket events broadcast via Redis adapter (already working)

Autumn -> POST /api/v1/autumn/webhooks -> Any instance (idempotent)
    -> Verify signature
    -> Check WebhookEvent table for dedup
    -> Update Subscription model
```

---

## Integration Analysis: What Changes vs What Stays

### Already Multi-Instance Safe (NO changes needed)

These components are already designed for horizontal scaling:

1. **BullMQ job processing** -- Redis is the single source of truth for job assignment. Multiple workers across instances safely compete for jobs. `BaseWorker` creates its own Redis connection per instance (`connectionName: '${this.workerName}-worker'`). The shared Redis connection singleton in `queue.config.ts` is per-process (correct).

2. **BullMQ scheduled/repeatable jobs** -- `ScheduledJobsQueueService` uses BullMQ repeatable jobs, which are inherently single-execution. BullMQ guarantees only one instance of a repeatable job runs at any time via Redis atomics. `SubscriptionLifecycleService` registers handlers through this system -- usage resets and expiry checks will NOT double-fire.

3. **WebSocket events** -- `RedisIoAdapter` uses `@socket.io/redis-adapter` with dedicated pub/sub clients. Events emitted on any instance propagate to all connected clients across all instances.

4. **Session auth** -- `BetterAuthGuard` validates sessions via `auth.api.getSession()` which hits the database (with `cookieCache` 300s maxAge). Sessions are stored in PostgreSQL, not in-memory. Cookie-based auth is stateless from the app perspective.

5. **Redis caching** -- `CacheModule` uses shared Redis. No in-memory caches that would go stale across instances.

6. **Rate limiting** -- `@nestjs/throttler` with Redis store provides distributed rate limiting.

7. **BullMQ worker health monitoring** -- `BaseWorker.registry` is a static per-process array. `HealthController.getWorkerHealth()` reports per-instance worker status. Each instance reports its own workers. This is correct behavior.

### Requires Changes

---

#### 1. Database Connection Pooling (CRITICAL)

**Current state:** `prisma-client.factory.ts` appends `connection_limit=20&pool_timeout=20` to `DATABASE_URL`. Each instance creates its own connection pool.

**Problem:** Railway PostgreSQL (via TCP proxy, no public domain) has a default `max_connections` around 100. With 3 replicas: 3 * 20 = 60 connections from Prisma alone. Each `BaseWorker` also creates its own Redis connection (fine for Redis, but each worker's `processJob()` goes through the same `PrismaService` pool). Connection exhaustion is the primary risk.

**Solution: PgBouncer sidecar + dynamic pool sizing**

**Option A (Recommended): PgBouncer as Railway service**
- Deploy PgBouncer container as a separate Railway service in the same project
- Point it at the PostgreSQL TCP proxy internal URL
- Configure transaction pooling mode (required for Prisma compatibility)
- Each NestJS instance connects to PgBouncer instead of PostgreSQL directly
- PgBouncer manages a smaller pool to PostgreSQL (e.g., 25 server connections)
- Each NestJS instance can use `connection_limit=30` safely because PgBouncer multiplexes

**Option B (Simpler, less optimal): Dynamic pool limits**
- Calculate per-instance limits at startup:
```typescript
// prisma-client.factory.ts
const maxDbConnections = parseInt(process.env.MAX_DB_CONNECTIONS || '100', 10);
const numReplicas = parseInt(process.env.NUM_REPLICAS || '1', 10);
const reservedConnections = 10; // migrations, admin, Railway health checks
const perInstanceLimit = Math.floor(
  (maxDbConnections - reservedConnections) / numReplicas
);
```

**Prisma 7 + PgBouncer specifics:**
- Prisma 7 uses driver adapters (`@prisma/adapter-pg`), so connection pooling is managed by the `pg` driver, NOT Prisma's internal pool
- PgBouncer MUST run in **transaction mode** for Prisma compatibility
- Do NOT add `?pgbouncer=true` to connection string if PgBouncer >= 1.21.0
- `prisma db push` / `prisma migrate deploy` need a DIRECT connection bypassing PgBouncer -- configure `directUrl` in `prisma.config.ts`
- Current `connectionTimeoutMillis: 15_000` in factory is fine for PgBouncer

**Confidence:** HIGH (Prisma official docs confirm transaction mode requirement)

---

#### 2. Railway numReplicas Configuration

**Current state:** `railway.toml` has `numReplicas = 1`, `healthcheckPath = "/health/live"`, `restartPolicyType = "ON_FAILURE"`.

**Changes:**
1. Increase `numReplicas = 2` (start conservative, scale to 3 after validation)
2. Add instance identification to health and log responses

**Railway behavior with replicas:**
- Load balancer is round-robin. Sticky sessions NOT needed because auth is cookie-based with DB-stored sessions.
- Health check at `/health/live` already returns 200. Railway removes unhealthy replicas from rotation.
- Downscaling sends SIGTERM. Current shutdown hooks handle this:
  - `BaseWorker.onModuleDestroy()` drains in-flight BullMQ jobs
  - `PrismaService.enableShutdownHooks()` disconnects on SIGTERM
  - `RedisIoAdapter.close()` quits pub/sub clients

**New: Instance identification**
- Railway injects `RAILWAY_REPLICA_ID` into each replica
- Add to health responses for debugging:
```typescript
@Get('live')
async getLiveness() {
  return {
    status: 'alive',
    instance: process.env.RAILWAY_REPLICA_ID || 'single',
    uptime: process.uptime(),
  };
}
```
- Add to Pino logger context so all structured logs include replica ID

**Confidence:** HIGH

---

#### 3. Legacy JWT Removal

**Current state analysis (verified by grep):**

| What | Status | Action |
|------|--------|--------|
| `passport-jwt`, `JwtStrategy`, `JwtAuthGuard` | **Already removed** from runtime code | None |
| `passport`, `jsonwebtoken` packages | Possibly still in `package.json` | Remove if no other code depends |
| `bcrypt` package | Possibly still in `package.json` (Argon2id is primary) | Remove if fully replaced |
| `@ApiBearerAuth()` decorators | **84 occurrences** across controllers | Remove all, replace with `@ApiCookieAuth()` |
| `.addBearerAuth()` in `main.ts` | Line 597 in Swagger DocumentBuilder | Replace with `.addCookieAuth()` |
| Comment references to "former JWT" | In guards (BetterAuthGuard, TenantGuard, RolesGuard) | Optionally clean up; harmless |
| Gmail Pub/Sub JWT verification | Uses `google-auth-library`, NOT `jsonwebtoken` | Safe -- independent of auth JWT |

**Swagger auth change detail:**
```typescript
// main.ts SwaggerModule setup
// REMOVE:
.addBearerAuth()
// ADD:
.addCookieAuth('pmsync.session_token', {
  type: 'apiKey',
  in: 'cookie',
  name: 'pmsync.session_token',
})
```

The 84 `@ApiBearerAuth()` occurrences are a mechanical find-and-replace with zero runtime risk. Controllers to modify:
- `ai/controllers/` (2 files)
- `ai-chat/controllers/` (1 file)  
- `calendar/controllers/` (1 file)
- `compliance/controllers/` (3+ files)
- `subscription/controllers/` (2 files)
- `contacts/`, `email/`, `crm/`, `providers/`, `labels/`, `push/`, `reminder/`, admin controllers

**Confidence:** HIGH (verified no runtime JWT code remains)

---

#### 4. Billing Webhook Hardening

**Current state:** `AutumnController` has proxy routes for customer management, attach, check, track, cancel, billing portal, and pricing table. `AutumnService` wraps the Autumn SDK. There is **NO webhook endpoint** for Autumn to push events.

The system relies on:
- Client-initiated API calls to `POST /autumn/check` for feature access
- Scheduled `SubscriptionLifecycleService` jobs for expiry checks (daily at 02:00) and usage resets (1st of month)
- Local fallback when Autumn API is unreachable (`localFeatureCheck()`)

**Gap analysis -- what the system cannot react to without webhooks:**
- Payment failures in real-time (currently waits for daily expiry check)
- Subscription upgrades/downgrades initiated from Autumn's billing portal (not reflected until next `check` call)
- Usage overage alerts from Autumn
- Renewal confirmations
- Trial conversions

**Solution: Add Autumn webhook endpoint with hardening**

New components:

| Component | File | Responsibility |
|-----------|------|----------------|
| `AutumnWebhookController` | `subscription/controllers/autumn-webhook.controller.ts` | **NEW** -- Raw body parsing, signature verification, event routing |
| `AutumnWebhookService` | `subscription/services/autumn-webhook.service.ts` | **NEW** -- Idempotent event handlers for subscription lifecycle |
| `WebhookEvent` model | `prisma/schema.prisma` | **NEW** -- Processed event ID store for deduplication |

**Webhook hardening patterns:**

1. **Raw body access for signature verification:**
   NestJS must preserve the raw body before JSON parsing. Configure `rawBody: true` in NestFactory (already needed for CSRF). In the controller, access via `@Req() req` where `req.rawBody` is available.

2. **Signature verification:**
   Autumn uses Stripe under the hood. Verify the `Stripe-Signature` header against the webhook signing secret using HMAC-SHA256. This MUST happen before any JSON parsing or event processing.

3. **Idempotency via event store:**
   ```prisma
   model WebhookEvent {
     id          String   @id @default(cuid())
     externalId  String   @unique  // Stripe/Autumn event.id
     eventType   String
     processedAt DateTime @default(now())
     payload     Json?    // Store for debugging
     @@index([externalId])
   }
   ```
   Check `WebhookEvent` before processing. Insert within the same transaction as the subscription update.

4. **Event ordering:**
   Autumn/Stripe may deliver events out of order. Use `event.created` timestamp and compare with `Subscription.updatedAt`. Skip events older than current state.

5. **Retry safety:**
   Return 200 immediately after signature verification succeeds and event is known/duplicate. Return 5xx only for transient failures (DB down). Process heavy work asynchronously via BullMQ if needed.

6. **Event handler mapping:**

| Autumn/Stripe Event | Handler Action |
|---------------------|----------------|
| `customer.subscription.created` | Create/update Subscription record, set plan |
| `customer.subscription.updated` | Update plan, limits, period dates |
| `customer.subscription.deleted` | Set status to CANCELED, schedule downgrade |
| `invoice.payment_failed` | Set status to PAST_DUE, trigger alert |
| `invoice.paid` | Clear PAST_DUE status, update period |
| `checkout.session.completed` | Link Autumn customer ID, activate subscription |

**Confidence:** MEDIUM (Autumn SDK webhook specifics need verification against their docs; Stripe patterns confirmed via multiple sources)

---

#### 5. Tailwind CSS Removal

**Current state:** Per CLAUDE.md memory: "tailwindcss package kept solely for `@tailwind base` CSS var injection." Grep confirms zero Tailwind utility classes in `.tsx`/`.ts` files.

**Assessment:** The `@tailwind base` directive injects CSS reset/normalization and custom property definitions. This can be replaced with:
1. A manual CSS reset (e.g., `normalize.css` or the subset actually used)
2. Explicit CSS custom property declarations in a global stylesheet

**Impact:** Removes `tailwindcss`, `tailwind-merge`, `postcss` (if only used for Tailwind), reducing frontend build dependencies.

**Confidence:** MEDIUM (need to verify exactly which CSS vars `@tailwind base` provides that the app depends on)

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: In-Memory State Across Requests
**What:** Storing request-scoped data in module-level variables.
**Why bad:** With multiple instances, each has its own memory. State diverges.
**Instead:** Use Redis for shared state, PostgreSQL for persistent state.
**Current risk assessment:** No in-memory state issues found. `sharedRedisConnection` singleton is per-process (correct). `BaseWorker.registry` is per-process health tracking (correct).

### Anti-Pattern 2: Direct PostgreSQL URL with Multiple Replicas
**What:** Each replica opens `connection_limit=20` to PostgreSQL directly.
**Why bad:** 3 replicas = 60 connections. PostgreSQL default max ~100. Leaves insufficient headroom.
**Instead:** Use PgBouncer in transaction mode, or calculate per-replica limits dynamically.

### Anti-Pattern 3: Webhook Processing Without Idempotency
**What:** Processing billing webhook events without deduplication.
**Why bad:** Webhook providers retry on timeout (Stripe retries up to 3 days). Processing a subscription downgrade twice corrupts state.
**Instead:** Store event IDs in `WebhookEvent` table before processing. Check before each handler invocation.

### Anti-Pattern 4: Removing @ApiBearerAuth Without Adding Cookie Auth
**What:** Just deleting the Swagger auth decorators.
**Why bad:** Swagger UI becomes unauthenticated -- developers cannot test endpoints interactively.
**Instead:** Replace with `@ApiCookieAuth()` so Swagger sends cookies with requests.

### Anti-Pattern 5: PgBouncer in Session Mode with Prisma
**What:** Configuring PgBouncer in session pooling mode.
**Why bad:** Prisma uses prepared statements which require transaction-scoped connections. Session mode holds connections longer, negating pooling benefits.
**Instead:** Always use transaction mode for Prisma compatibility (confirmed by Prisma official docs).

---

## New vs Modified Components Summary

| Component | Status | File(s) |
|-----------|--------|---------|
| `AutumnWebhookController` | **NEW** | `subscription/controllers/autumn-webhook.controller.ts` |
| `AutumnWebhookService` | **NEW** | `subscription/services/autumn-webhook.service.ts` |
| `WebhookEvent` model | **NEW** | `prisma/schema.prisma` |
| `prisma-client.factory.ts` | **MODIFY** | Connection pool sizing for multi-replica / PgBouncer |
| `prisma.config.ts` | **MODIFY** | Add `directUrl` for migrations bypassing PgBouncer |
| `railway.toml` | **MODIFY** | `numReplicas` increase |
| `main.ts` | **MODIFY** | Swagger auth config (remove Bearer, add Cookie) |
| `health.controller.ts` | **MODIFY** | Add instance ID to responses |
| 84 controller files | **MODIFY** | Remove `@ApiBearerAuth()`, add `@ApiCookieAuth()` |
| `package.json` | **MODIFY** | Remove unused auth packages |
| PgBouncer service | **NEW** (infra) | Railway service deployment (not app code) |

---

## Build Order (Dependency-Based)

```
Phase 1: Legacy Cleanup (no dependencies, zero runtime risk)
  1.1 Remove @ApiBearerAuth decorators + addBearerAuth() from Swagger
  1.2 Add @ApiCookieAuth() to Swagger config + controllers
  1.3 Remove unused npm packages (jsonwebtoken, passport-jwt, bcrypt)
  1.4 Remove Tailwind CSS package (if base injection replaceable)

Phase 2: Connection Pooling (prerequisite for Phase 3)
  2.1 Deploy PgBouncer service on Railway (or configure dynamic pool limits)
  2.2 Update prisma-client.factory.ts for PgBouncer transaction mode
  2.3 Configure directUrl in prisma.config.ts for migrations
  2.4 Validate single-replica deployment with PgBouncer

Phase 3: Horizontal Scaling (depends on Phase 2)
  3.1 Add instance ID to health responses and structured logs
  3.2 Update railway.toml numReplicas=2
  3.3 Validate BullMQ job distribution across instances
  3.4 Validate WebSocket event propagation across instances
  3.5 Load test connection pool under multi-replica

Phase 4: Billing Webhook Hardening (independent of Phases 2-3)
  4.1 Add WebhookEvent model to Prisma schema
  4.2 Implement AutumnWebhookController with raw body + signature verification
  4.3 Implement AutumnWebhookService with idempotent event handlers
  4.4 E2E test webhook flow (simulate Autumn events)
  4.5 Wire subscription state sync from webhook events
```

**Ordering rationale:**
- Phase 1 first because it is pure cleanup with zero risk and immediate doc improvement
- Phase 2 before Phase 3 because connection exhaustion would crash the app under multi-replica
- Phase 4 is independent and can run in parallel with Phase 2/3
- Within Phase 3, start with 2 replicas (conservative), validate, then consider 3

---

## Scalability Considerations

| Concern | 1 replica (current) | 2-3 replicas | 5+ replicas |
|---------|---------------------|--------------|-------------|
| DB connections | 20 pool (fine) | 40-60 (PgBouncer needed) | 100+ (PgBouncer mandatory) |
| Redis connections | ~10 per instance | ~30 total (fine, Redis handles thousands) | ~50+ (monitor `CLIENT LIST`) |
| BullMQ job distribution | Single consumer | Automatic via Redis atomics | Automatic, consider lowering per-instance concurrency |
| WebSocket events | Direct emit | Via Redis adapter (working) | Via Redis adapter (working) |
| Scheduled jobs | BullMQ single execution | Same guarantee | Same guarantee |
| Session validation | DB lookup (cached 5min) | Same, shared cache via Redis | Consider increasing `cookieCache.maxAge` |
| Billing webhooks | N/A | Any instance handles (idempotent) | Same |

---

## Sources

- [Prisma PgBouncer Configuration](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer) -- Transaction mode requirement for Prisma
- [Prisma Connection Pool Docs](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool) -- Pool sizing guidance
- [Prisma Connection Management](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management) -- Multi-instance connection strategies
- [BullMQ Repeatable Jobs](https://docs.bullmq.io/guide/jobs/repeatable) -- Single-execution guarantee across instances
- [BullMQ Job Schedulers](https://docs.bullmq.io/guide/job-schedulers) -- Distributed scheduling semantics
- [Railway Horizontal Scaling](https://station.railway.com/questions/horizontal-scaling-scaling-controls-e1dffb16) -- Replica behavior and limitations
- [BullMQ Horizontal Scaling Guide](https://oneuptime.com/blog/post/2026-01-21-bullmq-horizontal-scaling/view) -- Worker distribution patterns
- [Autumn/Stripe Webhook Architecture](https://deepwiki.com/useautumn/autumn/9.1-revenuecat-webhook-architecture) -- Webhook handling patterns
- [Webhook Idempotency at Scale](https://dev.to/art_light/webhooks-at-scale-designing-an-idempotent-replay-safe-and-observable-webhook-system-7lk) -- Event store deduplication patterns
- Codebase files verified: `prisma-client.factory.ts`, `prisma.service.ts`, `base.worker.ts`, `queue.config.ts`, `redis-io.adapter.ts`, `autumn.service.ts`, `autumn.controller.ts`, `subscription.service.ts`, `subscription-lifecycle.service.ts`, `health.controller.ts`, `railway.toml`, `main.ts`
