# Domain Pitfalls

**Domain:** Legacy cleanup, Railway horizontal scaling, and billing hardening for existing NestJS + Next.js email platform
**Researched:** 2026-03-31

---

## Critical Pitfalls

Mistakes that cause outages, data corruption, or require architectural rewrites.

### Pitfall 1: Remaining @Cron Decorators Execute on Every Instance

**What goes wrong:** The codebase has migrated most scheduled jobs to BullMQ repeatable jobs (via `ScheduledJobsQueueService`), but 6 `@Cron` decorators remain in production code: `cache-prewarming.service.ts` (2), `data-cleanup.service.ts` (4), `churn-recompute.cron.ts` (1), `forecast-refresh.cron.ts` (1). When Railway scales to N instances, each `@Cron` fires on ALL instances simultaneously.

**Why it happens:** The BullMQ migration was done incrementally. These stragglers were either added after the migration or missed during it. NestJS `@nestjs/schedule` `@Cron` runs in-process -- there is no distributed lock.

**Consequences:**
- `data-cleanup.service.ts` runs GDPR-related cleanup (expired sessions, orphaned data) on all instances -- potential race conditions on DELETE operations causing P2002/P2034 Prisma errors
- `churn-recompute.cron.ts` and `forecast-refresh.cron.ts` run expensive CRM computations N times instead of once
- Cache prewarming multiplied by N instances wastes LLM API budget (embedding cache warmup)

**Prevention:**
- Audit ALL `@Cron` decorators and migrate to `ScheduledJobsQueueService` handlers BEFORE enabling horizontal scaling
- Add a startup check: if `RAILWAY_REPLICA_ID` is set and `@Cron` decorators exist, log a warning
- Use `JOBS_ENABLED=false` env var (already supported) on replica instances as interim safety net

**Detection:** Monitor BullMQ dashboard for duplicate job completions. Alert on Prisma P2002/P2034 spike after scaling.

**Phase:** Must be resolved in Legacy Cleanup phase, before horizontal scaling phase.

---

### Pitfall 2: In-Memory State Lost Across Instances

**What goes wrong:** Several services maintain in-memory Maps that are NOT shared across instances:

1. **`TenantKeyService`** -- `cache` and `hmacCache` (Map<string, Buffer>) for derived encryption keys. Safe because deterministic (same input = same output), but wastes CPU re-deriving on each instance.

2. **`TriageLearningService`** -- `signalBuffer` (Map) and `scoreCache` (Map) hold user behavior signals IN MEMORY before flushing to Redis. If a user's signals land on different instances, the buffer never reaches the flush threshold, and scores diverge between instances.

3. **`CircuitBreaker`** -- `breakers` Map tracks failure counts per service. Instance A's circuit opens, but Instance B's stays closed -- defeating the purpose of circuit breaking.

4. **`ScheduledJobsQueueService`** -- `handlers` Map is instance-local (fine, since each instance registers the same handlers on boot).

5. **`EmailTriageService`** -- in-memory semaphore for global concurrency control. With N instances, actual concurrency is N * limit, not the intended limit.

**Why it happens:** These were written for single-instance deployment. In-memory caches are faster than Redis, so developers default to Maps.

**Consequences:**
- Triage learning scores become inconsistent (signals split across instances)
- Circuit breaker provides false safety (one instance sees failures, others keep hammering)
- AI concurrency control is N times higher than intended, risking LLM API rate limits

**Prevention:**
- `TriageLearningService`: Flush signals to Redis immediately (RPUSH) instead of buffering in memory. The buffer exists for performance; switch to Redis pipeline for equivalent throughput.
- `CircuitBreaker`: Move state to Redis (INCR failure count with TTL). Or accept per-instance circuit breaking as "good enough" and document the tradeoff.
- `EmailTriageService` semaphore: Use Redis-based distributed semaphore (SETNX with TTL).
- `TenantKeyService`: Keep as-is -- deterministic derivation means each instance has correct keys. No consistency issue.

**Detection:** Triage score divergence visible in logs (different scores from different instances for same sender). Circuit breaker ineffectiveness visible when LLM API returns 429 despite breaker being "open."

**Phase:** Must be resolved before or during horizontal scaling phase.

---

### Pitfall 3: Prisma Connection Pool Exhaustion Under Multi-Instance + BullMQ Workers

**What goes wrong:** The current `prisma-client.factory.ts` sets `connection_limit=20` with `pool_timeout=20`. With 2+ Railway instances, each creates its own Prisma pool. Railway PostgreSQL has a default max_connections of ~97 (Railway standard). 2 instances x 20 connections = 40 for Prisma alone. Add BullMQ workers (which use separate Redis connections but trigger Prisma queries), and connection starvation occurs under load.

**Why it happens:** Railway's TCP proxy adds ~1-5ms latency per connection handshake. Under load, connections are held longer. The pool fills up, and new requests queue behind `pool_timeout`. Railway does NOT run PgBouncer by default.

**Consequences:**
- `P1001` (Can't reach database server) or `P2024` (Timed out fetching a new connection from the pool) errors under moderate load
- BullMQ workers starve HTTP request handlers of connections (no priority separation)
- During Railway deployments, old and new instances briefly co-exist, doubling connection usage

**Prevention:**
- Calculate: `connection_limit = max_connections / (instances * 1.5)`. For 97 max and 3 instances: ~21, so current 20 is borderline. For 4+: reduce to 12-15.
- Add PgBouncer as a Railway service between app and database (transaction mode). This is the standard Railway recommendation.
- Separate Prisma instances for HTTP vs BullMQ workers with different pool sizes (HTTP gets priority).
- Monitor `pg_stat_activity` and alert when active connections exceed 80% of max.
- During deployment, Railway runs old + new instances simultaneously. Account for 2x normal instances in pool math.

**Detection:** `P2024` errors in logs. Increasing response times under moderate load. `pg_stat_activity` query showing connections at limit.

**Phase:** Horizontal scaling phase. Must be solved before adding instances.

---

### Pitfall 4: Billing Webhook Has No Idempotency Protection

**What goes wrong:** The `AutumnService` and `AutumnController` proxy requests to Autumn SDK but have NO webhook receiver endpoint for Autumn-to-app callbacks. If Autumn sends billing events (subscription changes, payment failures, usage resets), the app has no handler. If a handler is added without idempotency, duplicate webhooks cause double plan changes or double usage resets.

**Why it happens:** Current billing is primarily pull-based (app calls Autumn SDK). But real billing systems send webhooks for async events (payment succeeded, payment failed, subscription canceled by Autumn admin, usage threshold reached). The `subscription-lifecycle.service.ts` handles expiry checks via cron, but NOT real-time billing events.

**Consequences:**
- Subscription state can drift between Autumn and local DB (Autumn says "canceled" but local DB says "active")
- No real-time response to payment failures (only caught by daily cron at 02:00 UTC -- up to 24h delay)
- If webhook handler added without idempotency: duplicate webhooks from Autumn retries cause double downgrade/upgrade processing

**Prevention:**
- Add a webhook endpoint with idempotency key tracking (event ID in a `billing_webhook_events` table or Redis SET with TTL)
- Use atomic operations: `INSERT ... ON CONFLICT (event_id) DO NOTHING` to ensure exactly-once processing
- Enqueue webhook processing to BullMQ (respond 200 immediately, process asynchronously) to handle Autumn's retry timeout
- Add signature verification for webhook authenticity
- Test with deliberate duplicate webhook payloads

**Detection:** Subscription state mismatch between Autumn dashboard and local DB. Users reporting incorrect plan after payment.

**Phase:** Billing hardening phase. This is the single most important billing pitfall.

---

## Moderate Pitfalls

### Pitfall 5: Railway Does NOT Support Sticky Sessions for WebSocket

**What goes wrong:** Railway's load balancer distributes requests round-robin with NO sticky session support. Socket.IO's default transport sequence is: HTTP polling (multiple requests) -> WebSocket upgrade. The polling phase sends 3-4 HTTP requests that MUST hit the same instance. Without sticky sessions, the handshake fails.

**Why it happens:** Railway explicitly does not support sticky sessions. The codebase already has `RedisIoAdapter` for cross-instance pub/sub, which handles message broadcasting correctly. But the Socket.IO handshake itself requires session affinity during the upgrade window.

**Consequences:**
- WebSocket connections fail intermittently (succeed when all polling requests happen to hit same instance by chance)
- Real-time email notifications, sync status, and chat streaming break for users

**Prevention:**
- Force WebSocket-only transport: `{ transports: ['websocket'] }` on BOTH client and server. This skips the polling phase entirely and upgrades directly.
- Update frontend Socket.IO client config to `transports: ['websocket']` (remove 'polling' fallback)
- Test with multiple Railway instances: verify WebSocket connections establish reliably
- Fallback: If WebSocket-only causes issues for some corporate proxies, add reconnection logic that retries with exponential backoff

**Detection:** `connect_error` events in frontend Socket.IO logs. Users reporting stale email counts or missing notifications.

**Phase:** Must be resolved at the START of horizontal scaling phase. Without this, scaling breaks real-time features.

---

### Pitfall 6: JWT References in External Provider Code Confused with Auth JWT Removal

**What goes wrong:** The codebase has JWT references in 3 distinct contexts: (1) Google Pub/Sub OIDC JWT verification in `gmail-webhook.service.ts`, (2) Microsoft OAuth access token JWT validation in `microsoft-oauth.service.ts`, (3) AI sandbox service JWT in `sandbox.service.ts`. A developer tasked with "remove legacy JWT auth" might accidentally remove or break these.

**Why it happens:** The v5.0 migration replaced the app's own JWT auth with better-auth DB sessions. The comments in `better-auth.guard.ts`, `tenant.guard.ts`, and `roles.guard.ts` reference "former JWT payload" for backward compatibility. A grep for "JWT" returns 40+ hits across these unrelated contexts.

**Consequences:**
- Removing Google Pub/Sub JWT verification breaks Gmail real-time push notifications
- Removing Microsoft JWT validation breaks OAuth token refresh flow
- Both failures are silent (webhooks stop working, tokens stop refreshing) and only surface hours later

**Prevention:**
- Create a clear inventory: "JWT references to KEEP" vs "JWT references to REMOVE"
- JWT to REMOVE: any `JwtStrategy`, `JwtAuthGuard`, `@nestjs/jwt` imports, JWT secret env vars used for app auth
- JWT to KEEP: `verifyPubSubToken()` in gmail-webhook, `validateJWT()` in microsoft-oauth, `sandbox.service.ts` compute SDK token
- Add `// NOTE: This is NOT app auth JWT -- this is [Google/Microsoft/Compute] provider JWT` comments to each keeper
- Run full E2E after removal: trigger Gmail webhook, refresh Microsoft token, verify sandbox

**Detection:** Gmail push notifications stop arriving. Microsoft token refresh returns 401. Test these explicitly in the removal PR.

**Phase:** Legacy cleanup phase. Requires careful audit before any deletion.

---

### Pitfall 7: Tailwind Removal Breaks CSS Custom Properties

**What goes wrong:** The project kept `tailwindcss` package solely for `@tailwind base` CSS variable injection in `globals.css`. Removing it removes CSS custom properties that MUI components or chat CSS files may depend on (e.g., `--tw-ring-color`, `--tw-border-opacity`). The chat CSS files (3 files, ~950 lines) use pure CSS with custom properties.

**Why it happens:** The v9.0 migration removed all Tailwind utility classes from TSX files but kept the package for base layer injection. The dependency chain is: `tailwindcss` -> `@tailwind base` in `globals.css` -> CSS custom properties -> chat CSS files.

**Consequences:**
- Chat UI styling breaks (missing variable values default to browser defaults)
- Subtle visual regressions that are only visible in specific states (focus rings, border colors)
- MUI + chat CSS interaction breaks silently

**Prevention:**
- Before removing tailwind: extract ALL CSS custom properties from `@tailwind base` output
- Grep chat CSS files for `--tw-` prefixed variables
- Replace with explicit CSS custom property definitions in `globals.css`
- Visual regression test: screenshot chat UI before/after removal
- Run Lighthouse to verify no CLS regressions

**Detection:** Visual inspection of chat UI in all states (idle, loading, error, streaming). Check browser DevTools computed styles for `unset` or missing values.

**Phase:** Legacy cleanup phase. Low risk if done methodically.

---

### Pitfall 8: BullMQ Worker Starvation During Rolling Deploys

**What goes wrong:** Railway's rolling deploy runs old and new instances simultaneously. Both register BullMQ workers for the same queues. During the overlap:
- Old instance workers are processing jobs but about to be killed
- New instance workers start competing for the same jobs
- If old instance is killed mid-job, the job's lock expires and another worker retries it, but side effects (emails sent, webhooks dispatched) from the partial execution are NOT rolled back

**Why it happens:** BullMQ uses Redis locks with TTL. When a worker dies, its lock expires and the job becomes available for retry. But non-idempotent side effects (API calls, email sends) have already occurred.

**Consequences:**
- Duplicate email sends (partially completed send job retried by new instance)
- Duplicate webhook dispatches (push notifications sent twice)
- Orphaned state (job half-completed, some DB writes committed, others not)

**Prevention:**
- Implement graceful shutdown: listen for `SIGTERM`, call `worker.close()` which waits for active jobs to complete (up to `lockDuration`)
- Set Railway's shutdown timeout to match the longest `lockDuration` (currently 300s for scheduled jobs -- this is very long, consider reducing)
- Make all job handlers idempotent: use deduplication IDs for email sends, webhook dispatches
- For email send: check if email already has `sentAt` timestamp before sending again
- Add `beforeClose` handler to workers to log in-flight jobs

**Detection:** Duplicate email notifications after deployments. Check BullMQ "stalled" job count after each deploy.

**Phase:** Horizontal scaling phase. Must be solved alongside multi-instance configuration.

---

## Minor Pitfalls

### Pitfall 9: Frontend Bundle Size Regression from MUI + TanStack Query

**What goes wrong:** MUI is already large (~80-120KB gzipped depending on components used). Adding lazy-loaded routes, new billing pages, or settings pages without code splitting causes the main bundle to grow past Lighthouse budgets.

**Prevention:**
- Use `React.lazy()` + `Suspense` for ALL new billing/settings pages (not just "non-critical" ones)
- Import MUI components from specific paths: `@mui/material/Button` not `@mui/material`
- Monitor bundle size in CI: the project already has Lighthouse CI budget enforcement -- ensure it runs on billing PRs
- TanStack Query: already uses `staleTime: 5min` -- no change needed

**Phase:** Frontend performance phase. Ongoing discipline, not a one-time fix.

---

### Pitfall 10: Deprecated API Aliases Removed Before Frontend Updated

**What goes wrong:** The MEMORY.md notes `voltAgentApi -> aiChatApi` with a deprecated alias kept for compatibility. If backend removes deprecated aliases before ALL frontend call sites are updated, API calls break silently (404s caught by error boundaries but losing functionality).

**Prevention:**
- Search frontend for ALL deprecated alias usages before removing any backend alias
- Remove in order: (1) update all frontend call sites, (2) deploy frontend, (3) remove backend alias, (4) deploy backend
- Or: remove both simultaneously in a coordinated deploy, but test in staging first

**Phase:** Legacy cleanup phase. Simple but requires coordination.

---

### Pitfall 11: Subscription Plan State Diverges Between Autumn and Local DB

**What goes wrong:** The `SubscriptionService` maintains a local `Subscription` table with plan/status. `AutumnService` proxies to Autumn SDK. If Autumn's state changes (admin action, payment processor event) without the app being notified (no webhook handler -- see Pitfall 4), the local DB drifts.

**Prevention:**
- Add periodic reconciliation: daily cron that compares local subscription state with Autumn API (if Autumn provides a customer status endpoint)
- Log every state transition with both old and new values for audit trail
- Add admin endpoint to force-sync from Autumn

**Phase:** Billing hardening phase. Complementary to Pitfall 4 webhook handler.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Legacy JWT removal | Accidentally removing provider JWT validation (Pitfall 6) | Create explicit keep/remove inventory before touching code |
| Legacy Tailwind removal | CSS custom property loss (Pitfall 7) | Extract and replace `--tw-` variables before removing package |
| Legacy API alias removal | Frontend breaks from premature removal (Pitfall 10) | Frontend-first removal order |
| Railway horizontal scaling | @Cron duplicate execution (Pitfall 1) | Migrate remaining 6 @Cron decorators to BullMQ first |
| Railway horizontal scaling | In-memory state divergence (Pitfall 2) | Audit and externalize TriageLearning, CircuitBreaker, Semaphore |
| Railway horizontal scaling | Prisma pool exhaustion (Pitfall 3) | Add PgBouncer, recalculate pool sizes |
| Railway horizontal scaling | WebSocket handshake failure (Pitfall 5) | Force `transports: ['websocket']` on client+server |
| Railway horizontal scaling | Rolling deploy side effects (Pitfall 8) | Graceful shutdown + idempotent job handlers |
| Billing hardening | No webhook receiver (Pitfall 4) | Add idempotent webhook endpoint with event tracking |
| Billing hardening | State drift (Pitfall 11) | Add reconciliation cron + webhook handler |
| Frontend performance | Bundle regression (Pitfall 9) | Code splitting discipline + Lighthouse CI enforcement |

---

## Sources

- [Railway Scaling Documentation](https://docs.railway.com/reference/scaling) - HIGH confidence
- [Railway Sticky Sessions Feedback (not supported)](https://station.railway.com/feedback/sticky-sessions-fa65efc4) - HIGH confidence
- [NestJS scaling issues on Railway](https://station.railway.com/questions/nestjs-backend-doesn-t-scale-bbf417ff) - MEDIUM confidence
- [BullMQ Repeatable Jobs Documentation](https://docs.bullmq.io/guide/jobs/repeatable) - HIGH confidence
- [BullMQ Horizontal Scaling Guide](https://oneuptime.com/blog/post/2026-01-21-bullmq-horizontal-scaling/view) - MEDIUM confidence
- [Handling Cron Jobs in NestJS with Multiple Instances using Bull](https://dev.to/juan_castillo/handling-cron-jobs-in-nestjs-with-multiple-instances-using-bull-3pj2) - MEDIUM confidence
- [Prisma Connection Pool Documentation](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool) - HIGH confidence
- [Building Reliable Stripe Subscriptions: Webhook Idempotency](https://dev.to/aniefon_umanah_ac5f21311c/building-reliable-stripe-subscriptions-in-nestjs-webhook-idempotency-and-optimistic-locking-3o91) - MEDIUM confidence
- [Webhook Idempotency Best Practices](https://hookdeck.com/webhooks/guides/implement-webhook-idempotency) - MEDIUM confidence
- Codebase analysis of `backend/src/common/config/queue.config.ts`, `prisma-client.factory.ts`, `scheduled-jobs.queue.ts`, `tenant-key.service.ts`, `triage-learning.service.ts`, `better-auth.guard.ts`, `redis-io.adapter.ts`, `autumn.service.ts` - HIGH confidence (direct code inspection)
