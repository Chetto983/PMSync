# Feature Landscape

**Domain:** Legacy cleanup, horizontal scaling, and billing hardening for NestJS/Next.js email platform
**Researched:** 2026-03-31

## Table Stakes

Features users/operators expect. Missing = production risk or accumulated debt.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| JWT dual-stack removal | Auth fully migrated to better-auth in v5.0; residual JWT references are dead code that confuses contributors and expands attack surface | Low | Only comment references remain in guards -- no actual JwtModule/JwtService. ES256 key generation script still exists for reference. Main work: delete `generate-es256-keys.ts`, strip JWT comments from guards, remove any `JWT_SECRET`/`JWT_PRIVATE_KEY` env vars |
| Deprecated API alias removal (voltAgentApi, multiAgentApi) | MEMORY.md says aliases kept for compat; grep shows ZERO references in frontend/src -- already cleaned. Verify package.json and any barrel exports | Low | Confirm no remaining references. If truly gone, this is a documentation cleanup only (update MEMORY.md, remove deprecation warnings) |
| Tailwind CSS package removal | `tailwindcss` kept solely for `@tailwind base` CSS var injection (globals.css line 3). Only 1 reference in src/ (ChatThemeBridge.tsx comment). MUI is the actual design system | Medium | Requires converting CSS custom property definitions from `@tailwind base` + `@layer base` to plain CSS. Tailwind config maps `hsl(var(--xxx))` -- these vars are defined in globals.css already. Remove tailwindcss, postcss-tailwind deps, tailwind.config.ts. Verify no component uses Tailwind utility classes |
| Socket.IO transport hardening for multi-instance | Railway has NO sticky sessions. Socket.IO defaults to polling+websocket. If long-polling is still enabled, multi-instance will break with 400 errors | Medium | Redis adapter already exists and works. Must force `transports: ['websocket']` on both server and client to disable HTTP long-polling fallback. This is mandatory for Railway horizontal scaling |
| DB connection pool sizing for replicas | Current: `connection_limit=20` appended if missing. With N replicas, total connections = 20*N. Railway PostgreSQL has finite connection limits | Medium | Need to calculate: Railway PostgreSQL max connections (typically 97 for starter), divide by expected replica count, set per-instance pool size accordingly. May need PgBouncer or Supabase pooler |
| BullMQ worker coordination across replicas | BullMQ uses Redis for coordination -- multiple workers safely dequeue. But concurrency settings multiply per instance (2 workers x 3 replicas = 6 effective, not 2) | Medium | Audit all queue concurrency settings. Decide: run workers on dedicated instance (recommended) or let all replicas process jobs with reduced per-instance concurrency. Cron/scheduled jobs MUST run on single instance to avoid duplicates |
| Frontend billing UI | Backend has complete Autumn integration (attach, check, track, cancel, billing portal, pricing table) but frontend has ZERO billing pages | High | Must build: pricing table page, plan selection/upgrade flow, usage dashboard, billing portal redirect, quota warning banners. This is a gap between backend completeness and frontend absence |
| Billing E2E validation on Railway/Vercel | Autumn SDK integration exists but has never been validated end-to-end in production. Payment flows, webhook delivery, usage tracking, quota enforcement -- all untested with real Stripe | High | Requires: Autumn test mode configuration, E2E test scripts for attach/check/track/cancel flows, webhook delivery verification, edge case testing (payment failure, card decline, mid-cycle upgrade/downgrade) |

## Differentiators

Features that improve operational quality. Not blocking but high-value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Horizontal autoscaling (Railway replica dial) | Handle traffic spikes without manual intervention. Railway supports manual replica count; no autoscale trigger yet | Low | Just configure replica count in Railway service settings. All prerequisites (Redis adapter, stateless backend) already met once transport hardening is done |
| Bundle size optimization with @next/bundle-analyzer | Reduce JS payload, improve LCP/TTI. Lighthouse CI already enforces budgets but analyzer provides actionable insights | Medium | Install @next/bundle-analyzer, audit large deps (TipTap, MUI, date-fns, AI SDK), apply dynamic imports where missing. Target: reduce initial JS by 15-20% |
| SSR/RSC optimization | Move data-fetching to server components where possible. Next.js 16 with React 19 supports this natively | Medium | Audit pages for client-only data fetching that could be server-side. Low-hanging fruit: landing page, pricing page, settings pages with static content |
| CDN cache headers for static assets | Vercel handles this by default but custom headers for API responses (Cache-Control for GET endpoints) reduce backend load | Low | Add Cache-Control headers to read-heavy GET endpoints (folder list, labels, pricing table). Vercel already caches static assets |
| Prometheus metrics per replica | Current metrics are summed across replicas by Railway. Per-instance labels in prom-client allow Grafana to distinguish replica health | Low | Add `instance` label to existing Prometheus counters/histograms. Useful for debugging hot replicas |
| Graceful shutdown with connection draining | Railway scales down by terminating replicas. Active requests and WebSocket connections need graceful termination | Medium | NestJS `enableShutdownHooks()` likely already configured. Verify: HTTP request draining, WebSocket disconnect events, BullMQ worker graceful stop |
| Usage quota warning banners in UI | Show users approaching quota limits before they hit hard blocks. Improves UX vs. sudden 403/429 errors | Medium | Requires frontend component polling /check endpoint or receiving real-time quota updates via WebSocket. Display at 80% and 95% thresholds |
| Billing webhook endpoint for Autumn/Stripe events | Autumn claims to handle webhooks internally, but having a server-side webhook receiver enables: audit logging, plan change propagation to local DB, cache invalidation | Medium | No webhook controller exists in subscription module. Autumn may handle plan changes transparently, but local DB subscription record needs updating on plan change |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Custom Stripe integration bypassing Autumn | Autumn wraps Stripe; going direct adds massive complexity (webhook handling, subscription state machine, invoice management) | Keep Autumn as billing abstraction. Only go direct if Autumn proves inadequate |
| Node.js cluster mode on Railway | Railway provides horizontal scaling via replicas with load balancing. Node cluster mode inside a container adds complexity without benefit since Railway already distributes across instances | Use Railway replica scaling. One Node process per container |
| PgBouncer self-managed on Railway | Running PgBouncer as a separate Railway service adds operational complexity | Use Prisma's built-in connection_limit parameter. If connections are exhausted, reduce per-instance pool size proportionally to replica count. Consider Supabase pooler only if Railway Postgres hits hard limits |
| Real-time billing usage via WebSocket | Pushing every usage event to frontend via WS is over-engineering. Usage changes slowly (per-request) | Poll /check on page load + after AI operations. Cache aggressively client-side (5min staleTime) |
| Tailwind-to-MUI migration of CSS variables | The CSS custom properties in globals.css are framework-agnostic (plain CSS). Don't migrate them to MUI theme -- just stop routing through Tailwind's @layer base | Keep CSS variables as-is. Only remove the Tailwind processing pipeline |
| Frontend-side JWT validation | JWT is being removed. Don't add any new JWT handling to replace what's being deleted | Cookie-based auth via better-auth is already the sole auth mechanism |

## Feature Dependencies

```
Socket.IO transport hardening --> Horizontal scaling (replicas will break WS without this)
DB connection pool sizing --> Horizontal scaling (connection exhaustion without this)
BullMQ worker coordination --> Horizontal scaling (duplicate jobs without this)
Tailwind removal --> Bundle size optimization (removes unused CSS processing)
Frontend billing UI --> Billing E2E validation (can't E2E test what doesn't exist)
Backend billing webhook --> Billing E2E validation (plan changes need local propagation)
```

## MVP Recommendation

### Phase 1: Legacy Removal (prerequisite, low risk)
Prioritize:
1. JWT dual-stack removal (comments + env vars + key gen script)
2. Deprecated API alias verification (confirm already removed, update docs)
3. Tailwind CSS package removal (convert @tailwind base to plain CSS)

**Rationale:** Zero new features, pure deletion. Reduces confusion, removes dead dependencies, shrinks bundle.

### Phase 2: Horizontal Scaling Readiness (infrastructure, medium risk)
Prioritize:
1. Socket.IO transport hardening (force websocket-only)
2. DB connection pool sizing (calculate per-replica limits)
3. BullMQ worker strategy (dedicated worker instance vs. distributed)
4. Graceful shutdown verification

**Rationale:** Must work before increasing replicas. One wrong setting = production outage.

### Phase 3: Frontend Performance (user-facing, medium effort)
Prioritize:
1. Bundle analysis with @next/bundle-analyzer
2. Dynamic imports for heavy deps (TipTap, chart libs)
3. CDN cache headers for GET endpoints

**Rationale:** Measurable improvement. Lighthouse CI provides regression gate.

### Phase 4: Billing Hardening (highest complexity, highest business value)
Prioritize:
1. Frontend billing UI (pricing table, upgrade flow, usage dashboard)
2. Billing webhook endpoint
3. E2E validation on Railway/Vercel with Autumn test mode
4. Edge case testing (payment failures, mid-cycle changes, cancellations)

**Rationale:** Billing has the most unknowns. Backend is built but untested. Frontend is entirely missing. Needs real Stripe test mode to validate.

Defer:
- **Autoscaling triggers**: Railway doesn't support auto-scaling triggers yet; manual replica dial is sufficient
- **Per-replica Prometheus labels**: Nice-to-have, not blocking
- **SSR/RSC migration**: Large effort, incremental benefit on an app that's already fast

## Sources

- Railway Scaling Docs: https://docs.railway.com/deployments/scaling
- Railway Horizontal Scaling Launch: https://blog.railway.com/p/launch-week-01-horizontal-scaling
- Socket.IO Multiple Nodes: https://socket.io/docs/v3/using-multiple-nodes/
- Socket.IO Redis Adapter: https://socket.io/docs/v4/redis-adapter/
- BullMQ Concurrency: https://docs.bullmq.io/guide/workers/concurrency
- BullMQ Parallelism: https://docs.bullmq.io/guide/parallelism-and-concurrency
- BullMQ Multi-Instance Discussion: https://github.com/taskforcesh/bullmq/discussions/3049
- Autumn Billing Platform: https://useautumn.com/
- Autumn GitHub: https://github.com/useautumn/autumn
- Next.js Bundle Optimization: https://nextjs.org/docs/app/guides/package-bundling
- Railway NestJS Sticky Sessions Issue: https://station.railway.com/feedback/sticky-sessions-fa65efc4
- Codebase: direct grep/read of D:/MailAgent backend and frontend source
