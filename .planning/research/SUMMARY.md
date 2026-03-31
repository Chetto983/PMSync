# Project Research Summary

**Project:** PMSync v11.0 — Legacy Cleanup, Scalability & Billing Hardening
**Domain:** NestJS/Next.js email platform — horizontal scaling, legacy removal, billing hardening
**Researched:** 2026-03-31
**Confidence:** HIGH (stack + architecture verified against codebase; MEDIUM on Autumn SDK specifics)

## Executive Summary

PMSync v11.0 is a hardening release, not a feature release. The codebase is already architecturally correct for horizontal scaling — Redis-backed sessions, Redis WebSocket adapter, BullMQ Redis coordination, stateless HTTP handlers — but several gaps block actually turning on multiple replicas without production risk. The recommended approach is sequential: remove legacy dead code first (zero risk, immediate wins), then resolve multi-instance blockers one by one before touching Railway replica count, then harden billing as a parallel track. No new npm packages are required. Every change in v11.0 is configuration adjustment, code cleanup, or targeted hardening using libraries already present.

The single highest-risk area is the transition to horizontal scaling. Six `@Cron` decorators will fire on every instance simultaneously, in-memory Maps in `TriageLearningService`, `CircuitBreaker`, and `EmailTriageService` will diverge across instances, and Prisma's `connection_limit=20` per instance will exhaust Railway PostgreSQL's ~97 connection max at 3+ replicas. These are not theoretical risks — they are concrete bugs that will surface immediately when `numReplicas` is increased. They must all be resolved before increasing the replica count.

Billing is the biggest unknown. The backend `AutumnService` is complete and well-structured, but the entire frontend billing UI does not exist, and the backend has never been validated end-to-end in production against real Stripe test mode. Autumn's "no webhooks needed" claim needs verification in practice: without a webhook receiver, subscription state can drift up to 24 hours from reality when payments fail or plans change externally. The billing phase carries the most unknowns and should be treated as exploratory with real Stripe test mode validation required before shipping.

---

## Key Findings

### Recommended Stack

v11.0 requires zero new npm dependencies. All work uses the existing stack: NestJS 11, Prisma 7 + `@prisma/adapter-pg`, BullMQ 5.67.3 + ioredis, `@socket.io/redis-adapter`, `autumn-js` 0.1.75, `@next/bundle-analyzer`, `prom-client`. Infrastructure additions are Railway-level: a PgBouncer service (Railway template, no app code) and replica count configuration in `railway.toml`.

**Core technologies and v11.0 role:**
- **PgBouncer 1.23+ (Railway template):** DB connection pooling proxy — multiplexes Prisma connections across N replicas so PostgreSQL max_connections (~97) is not exhausted. Transaction mode required; `DIRECT_URL` env var needed for `prisma migrate`.
- **BullMQ (existing, config change only):** Reduce per-instance concurrency (DEFAULT: 5→3, HIGH_THROUGHPUT: 10→5) so effective concurrency stays bounded when replicas multiply.
- **Railway replicas (config only):** Start at `numReplicas=2`, validate, then scale to 3. All prerequisites (Redis adapter, stateless auth) are already met once blocking pitfalls are resolved.
- **`optimizePackageImports` + dynamic imports (Next.js built-in):** Extend to `recharts`, `@xyflow/react`, `FullCalendar`, `@rive-app/react-webgl2` for bundle reduction. No packages added.
- **`autumn-js` (existing, hardening only):** Add Redis-based idempotency on `track()` calls, circuit breaker pattern (already exists in AI module), and a daily reconciliation BullMQ job.

### Expected Features

**Must have (table stakes — missing = production risk or critical debt):**
- JWT dual-stack removal — 84 `@ApiBearerAuth()` decorators + `addBearerAuth()` in `main.ts` are dead code; auth migrated to better-auth in v5.0. Remove carefully: keep Google Pub/Sub JWT, Microsoft OAuth JWT, sandbox service JWT.
- Tailwind CSS package removal — `tailwindcss` kept solely for `@tailwind base` CSS var injection; MUI is the design system. Requires extracting `--tw-` variables to plain CSS before removing the package.
- Socket.IO transport hardening — force `transports: ['websocket']` on client and server. Without this, HTTP long-polling across Railway instances fails because Railway has no sticky sessions.
- DB connection pool sizing for replicas — current `connection_limit=20` per instance exceeds Railway PostgreSQL limits at 3+ replicas. PgBouncer or dynamic pool math required before scaling.
- BullMQ @Cron audit — 6 remaining `@Cron` decorators (cache-prewarming x2, data-cleanup x4, churn-recompute x1, forecast-refresh x1) must be migrated to BullMQ before horizontal scaling or they fire on every instance.
- Frontend billing UI — backend billing is complete; frontend has ZERO billing pages. Pricing table, upgrade flow, usage dashboard, and quota warning banners all need to be built.

**Should have (high operational value, not day-1 blockers):**
- Billing webhook endpoint with idempotency — without it, subscription state can be 24h stale after payment failure. Add `AutumnWebhookController` + `AutumnWebhookService` + `WebhookEvent` dedup table.
- Graceful shutdown for rolling deploys — `SIGTERM` handling during Railway rolling deploys to prevent duplicate email sends from partially-completed BullMQ jobs.
- Per-replica Prometheus instance labels — adds `RAILWAY_REPLICA_ID` to prom-client metrics for per-replica Grafana visibility.
- Bundle dynamic imports for heavy routes — `recharts`, `@xyflow/react`, `FullCalendar` behind `React.lazy`.
- Billing reconciliation scheduled job — daily BullMQ job to compare local subscription state with Autumn API; logs discrepancies.

**Defer (not v11.0 scope):**
- Railway autoscaling triggers — Railway does not support auto-scaling triggers yet. Manual replica dial is sufficient.
- SSR/RSC migration — large effort, incremental benefit on an already-performant app.
- Separate BullMQ worker Railway service — useful at scale, premature for v11.0. Revisit if queue backlog grows.
- BullBoard/Arena dashboards — nice-to-have monitoring UI, not blocking.

### Architecture Approach

v11.0 modifies the existing monolith deployment model to run as N Railway replicas behind a round-robin load balancer, with PgBouncer proxying all database connections. No new modules are introduced — `AutumnWebhookController` and `AutumnWebhookService` are additions to the existing `subscription` module. Everything else is modification of existing components. The app is already stateless at the right boundaries: sessions in PostgreSQL, caches in Redis, job state in Redis. The gaps are specific in-memory data structures that need Redis externalization before multi-instance is safe.

**Components and v11.0 changes:**
1. `prisma-client.factory.ts` — MODIFY: configure for PgBouncer transaction mode, dynamic pool sizing
2. `prisma.config.ts` — MODIFY: add `directUrl` for CLI migrations bypassing PgBouncer
3. `railway.toml` — MODIFY: `numReplicas = 2` (start conservative)
4. `main.ts` — MODIFY: replace `addBearerAuth()` with `addCookieAuth()` in Swagger config
5. 84 controller files — MODIFY: replace `@ApiBearerAuth()` with `@ApiCookieAuth()` (mechanical)
6. `AutumnWebhookController` — NEW: raw body parsing, HMAC signature verification, event routing
7. `AutumnWebhookService` — NEW: idempotent subscription lifecycle event handlers
8. `WebhookEvent` Prisma model — NEW: deduplication store for processed billing events
9. `TriageLearningService` signal buffer — MODIFY: externalize to Redis (currently in-memory Map)
10. `CircuitBreaker` state — MODIFY or DOCUMENT: per-instance state vs. shared Redis state decision
11. `EmailTriageService` semaphore — MODIFY: Redis-based distributed semaphore

### Critical Pitfalls

1. **@Cron decorators fire on every Railway instance** — Migrate the 6 remaining `@Cron` decorators to BullMQ `ScheduledJobsQueueService` before increasing `numReplicas`. Add `JOBS_ENABLED=false` env var as interim safety net on non-primary instances. This is a data corruption risk (duplicate GDPR cleanups) and cost risk (N times LLM cache warmup).

2. **In-memory Maps diverge across instances** — `TriageLearningService.signalBuffer`, `CircuitBreaker.breakers`, and `EmailTriageService` semaphore are all in-memory and not shared across replicas. The most critical is the semaphore: actual AI concurrency becomes N times the configured limit, risking LLM API 429s. Externalize to Redis before scaling.

3. **Prisma connection pool exhaustion** — 3 replicas x 20 connections = 60 of Railway PostgreSQL's ~97 max. During rolling deploys, old and new instances co-exist, temporarily doubling the count. Deploy PgBouncer and set Prisma `connection_limit=1` per instance (PgBouncer manages the actual server pool).

4. **Billing webhook has no idempotency** — No webhook receiver exists. If added without event deduplication, Stripe/Autumn retries (up to 3 days) will double-process subscription state changes. Use `INSERT ... ON CONFLICT (event_id) DO NOTHING` pattern with a `WebhookEvent` table. Return 200 immediately after signature verification; process asynchronously via BullMQ.

5. **JWT scope confusion during legacy removal** — Grepping for "JWT" returns 40+ hits including Google Pub/Sub OIDC verification, Microsoft OAuth token validation, and sandbox compute SDK tokens. These must NOT be removed. Create explicit keep/remove inventory before touching any JWT-related code.

---

## Implications for Roadmap

Based on combined research, the phase structure is hard-constrained by dependencies: legacy cleanup must precede scaling (@Cron pitfall), connection pooling must precede replica increase (Pitfall 3), WebSocket transport must be hardened before replicas (Pitfall 5). Billing can run in parallel with phases 2-3 but billing E2E requires the frontend to exist first.

### Phase 1: Legacy Cleanup
**Rationale:** Pure deletion — zero new features, zero new risk. Removes dead auth code, dead CSS tooling, and deprecated API aliases. Establishes a cleaner baseline for everything that follows. Also the prerequisite for Phase 2 because remaining `@Cron` decorators must be migrated to BullMQ before replicas increase.
**Delivers:** Smaller bundle, fewer confusing code paths, no dead dependencies, accurate Swagger auth docs, all scheduled jobs running under BullMQ coordination.
**Addresses:** JWT dual-stack removal, Tailwind CSS removal, deprecated API alias verification, @Cron-to-BullMQ migration.
**Avoids:** Pitfall 6 (JWT scope confusion — create keep/remove inventory first), Pitfall 7 (Tailwind CSS variable loss — extract `--tw-` vars before removing package), Pitfall 10 (alias removal order — frontend-first).

### Phase 2: Horizontal Scaling Readiness
**Rationale:** Connection pooling and WebSocket transport hardening are prerequisites for safely increasing replica count. These must all pass validation at `numReplicas=1` with PgBouncer before going to 2.
**Delivers:** Railway ready for 2-3 replicas with confidence that DB connections, WebSocket, BullMQ, and in-memory state are all multi-instance safe.
**Uses:** PgBouncer (Railway template), `ioredis` (distributed semaphore and signal buffer), existing `RedisIoAdapter`.
**Implements:** PgBouncer sidecar, `directUrl` in `prisma.config.ts`, `transports: ['websocket']` on client+server, Redis externalization of `TriageLearningService` buffer and `EmailTriageService` semaphore, graceful shutdown verification.
**Avoids:** Pitfall 2 (in-memory Maps), Pitfall 3 (connection exhaustion), Pitfall 5 (WebSocket transport), Pitfall 8 (rolling deploy stale jobs).

### Phase 3: Replica Activation and Validation
**Rationale:** Separated from Phase 2 because Phase 2 changes need validation at single-replica before scaling. Phase 3 is the actual replica increase plus observability.
**Delivers:** Production running at `numReplicas=2`, validated via load test and real traffic. Per-replica Prometheus labels visible in Grafana.
**Uses:** Railway `numReplicas=2`, `RAILWAY_REPLICA_ID` env var, prom-client instance labels.
**Implements:** `railway.toml` replica count increase, instance ID in health responses and structured logs, per-replica metrics labels.
**Avoids:** Pitfall 3 (must have PgBouncer from Phase 2 running before this).

### Phase 4: Frontend Performance
**Rationale:** Independent of scaling phases; no shared infrastructure dependencies. Lighthouse CI already gates regressions. Can be parallelized with Phase 2 if capacity allows. Must precede Phase 5 because billing pages will be new routes that need the same bundle discipline.
**Delivers:** Reduced initial JS bundle (target -15% to -20%), improved LCP/TTI metrics, tightened Lighthouse budget.
**Uses:** `@next/bundle-analyzer` (existing), Next.js `optimizePackageImports` extension, `React.lazy()` dynamic imports.
**Addresses:** Bundle optimization for `recharts`, `@xyflow/react`, `FullCalendar`, `@rive-app/react-webgl2`.
**Avoids:** Pitfall 9 (bundle regression from new billing pages — enforce Lighthouse CI on billing PRs).

### Phase 5: Billing Hardening
**Rationale:** Most unknowns, most isolated. Backend billing is built; this phase adds the missing webhook receiver, builds the frontend UI, and validates everything end-to-end with Autumn test mode and real Stripe. Placed last because it has the highest uncertainty and should not block the higher-confidence scaling phases.
**Delivers:** Complete billing stack — frontend pricing table, upgrade flow, usage dashboard, quota warning banners — plus webhook receiver with idempotency, billing reconciliation job, E2E validation with Autumn test mode.
**Uses:** `autumn-js` (existing), BullMQ (existing), Prisma `WebhookEvent` model (new), ioredis (track() idempotency dedup key).
**Implements:** `AutumnWebhookController`, `AutumnWebhookService`, Redis `track()` idempotency, circuit breaker on Autumn API, daily reconciliation job, `returnUrl` whitelist validation, frontend billing pages.
**Avoids:** Pitfall 4 (webhook idempotency), Pitfall 11 (subscription state drift).

### Phase Ordering Rationale

- Phase 1 before all else: @Cron migration is a hard prerequisite for safe scaling, and legacy removal has zero failure modes. Clean up before adding complexity.
- Phase 2 before Phase 3: PgBouncer and WebSocket transport hardening must be validated at single-replica before scaling up. Reversing this order risks a production outage.
- Phase 4 parallel with 2-3: No dependencies on scaling infrastructure. Run concurrently if team capacity allows; sequential if solo.
- Phase 5 last: Billing has the most unknowns (Autumn SDK at 0.1.x, E2E with real Stripe required). Keeping it last avoids blocking the higher-confidence phases.

### Research Flags

Phases needing deeper research or careful verification during planning:
- **Phase 2:** `TriageLearningService` Redis migration needs source read to understand flush thresholds and signal format before implementing. `CircuitBreaker` needs an explicit design decision: shared Redis state vs. per-instance with documented tradeoff.
- **Phase 5:** Autumn webhook specifics need verification against current Autumn docs before implementation. SDK is at 0.1.x and the `Stripe-Signature` verification pattern must be confirmed against Autumn's actual webhook format (may differ from raw Stripe). Do not implement until confirmed.

Phases with well-documented patterns (can skip deep research):
- **Phase 1:** Mechanical code removal. Patterns are clear from codebase analysis.
- **Phase 3:** Railway replica configuration is well-documented once Phase 2 is validated.
- **Phase 4:** `@next/bundle-analyzer` and `optimizePackageImports` are official Next.js features with clear docs.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations use existing installed libraries. PgBouncer and Railway replica config are documented by Railway and Prisma official docs. Zero new packages. |
| Features | HIGH | Feature inventory derived from direct codebase grep plus Railway/Socket.IO/BullMQ official docs. Frontend billing gap confirmed by codebase inspection (no billing pages found). |
| Architecture | HIGH | Multi-instance safety analysis performed against actual source files: `prisma-client.factory.ts`, `base.worker.ts`, `queue.config.ts`, `redis-io.adapter.ts`, `autumn.service.ts`, `railway.toml`. |
| Pitfalls | HIGH (critical pitfalls 1-3, 5) / MEDIUM (billing pitfalls 4, 11) | @Cron, in-memory Maps, connection pool, WebSocket transport pitfalls verified against codebase. Billing webhook specifics rated MEDIUM because Autumn SDK is 0.1.x and webhook contract needs live verification. |

**Overall confidence:** HIGH for scaling work. MEDIUM for billing hardening (Autumn SDK maturity, no prior E2E validation).

### Gaps to Address

- **Autumn webhook contract:** Autumn SDK is at 0.1.x. Whether it uses `Stripe-Signature` headers directly or wraps them needs verification against current Autumn docs before implementing `AutumnWebhookController`. Do not implement until confirmed.
- **CircuitBreaker Redis migration decision:** Per-instance circuit breaking (simpler, already correct for most failure scenarios) vs. shared Redis state (more correct but adds complexity). This is a design decision that must be made explicit in Phase 2 planning, not left implicit.
- **`TriageLearningService` flush threshold:** The in-memory signal buffer has a flush threshold. The exact threshold and flush logic must be read from source before implementing the Redis migration. Do not guess.
- **PgBouncer `max_prepared_statements` compatibility:** Prisma 7 uses `@prisma/adapter-pg` (driver adapter). Verify the Railway PgBouncer template version is 1.21+ before relying on native prepared statement support and omitting `?pgbouncer=true` from the connection string.
- **`localFeatureCheck()` coverage:** The Autumn local fallback needs an audit to confirm it covers all quota checks. If it does not, a circuit-open Autumn outage may allow unconstrained usage before Phase 5 hardening ships.

---

## Sources

### Primary (HIGH confidence)
- [Prisma PgBouncer Configuration](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer) — Transaction mode requirement, `directUrl` config
- [Prisma Connection Pool Docs](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool) — Pool sizing guidance
- [Railway Scaling Documentation](https://docs.railway.com/reference/scaling) — Replica behavior, no sticky sessions, SIGTERM handling
- [Railway PgBouncer Deploy Template](https://railway.com/deploy/postgres-pgbouncer) — Infrastructure setup
- [BullMQ Repeatable Jobs](https://docs.bullmq.io/guide/jobs/repeatable) — Single-execution guarantee across instances
- [BullMQ Concurrency Docs](https://docs.bullmq.io/guide/workers/concurrency) — Per-instance concurrency behavior
- [Next.js optimizePackageImports](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports) — Tree-shaking config
- [Railway Sticky Sessions (not supported)](https://station.railway.com/feedback/sticky-sessions-fa65efc4) — WebSocket transport constraint
- PMSync codebase (direct file inspection): `prisma-client.factory.ts`, `base.worker.ts`, `queue.config.ts`, `redis-io.adapter.ts`, `autumn.service.ts`, `autumn.controller.ts`, `railway.toml`, `main.ts`, `triage-learning.service.ts`, `better-auth.guard.ts`

### Secondary (MEDIUM confidence)
- [BullMQ Horizontal Scaling Guide](https://oneuptime.com/blog/post/2026-01-21-bullmq-horizontal-scaling/view) — Worker distribution patterns
- [Autumn SDK (autumn-js 0.1.75)](https://www.npmjs.com/package/autumn-js) — Billing SDK patterns
- [Autumn Documentation](https://docs.useautumn.com/documentation/getting-started/gating) — Check/track/attach model
- [Autumn better-auth Plugin](https://better-auth.com/docs/plugins/autumn) — Customer auto-creation on signup
- [Webhook Idempotency Best Practices](https://hookdeck.com/webhooks/guides/implement-webhook-idempotency) — Event store deduplication
- [Railway NestJS Scaling Issues](https://station.railway.com/questions/nestjs-backend-doesn-t-scale-bbf417ff) — Known NestJS + Railway gotchas

### Tertiary (LOW confidence, needs validation)
- [Autumn/Stripe Webhook Architecture](https://deepwiki.com/useautumn/autumn/9.1-revenuecat-webhook-architecture) — Autumn webhook contract (unverified against live SDK)

---
*Research completed: 2026-03-31*
*Ready for roadmap: yes*
