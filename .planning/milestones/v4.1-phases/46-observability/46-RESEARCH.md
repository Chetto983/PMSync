# Phase 46: Observability - Research

**Researched:** 2026-03-06
**Domain:** Prometheus metrics for NestJS (HTTP, BullMQ, AI cost)
**Confidence:** HIGH

## Summary

The project already has `@willsoto/nestjs-prometheus@6.0.2` and `prom-client@15.1.3` installed but completely unused. There is existing hand-rolled Prometheus text output in `HealthService.getPrometheusMetrics()` and `QueueHealthService.exportPrometheusText()` served at `GET /health/metrics`. This hand-rolled approach is fragile (manual string concatenation, no histogram support, no default metrics) and must be replaced with proper `prom-client` registry usage via `@willsoto/nestjs-prometheus`.

The existing `AiRunLedgerService` already tracks token counts and cost per LLM call via a DB insert. The phase needs to add prom-client counters that increment alongside the existing ledger write, not replace it.

**Primary recommendation:** Wire `PrometheusModule.register()` in AppModule, replace hand-rolled text output with `register.metrics()`, add HTTP histogram middleware, expose BullMQ queue gauges via scheduled collection, and add AI token/cost counters in `AiRunLedgerService.recordRun()`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OBS-01 | prom-client replaces custom metrics, /metrics endpoint live | PrometheusModule auto-registers `/metrics` endpoint; remove hand-rolled text from HealthController |
| OBS-02 | Request duration histogram + active connections gauge middleware | NestJS interceptor with prom-client Histogram (method/route/status labels) + Gauge for in-flight |
| OBS-03 | BullMQ queue depth metrics exposed | Scheduled gauge collection from QueueHealthService data into prom-client gauges |
| OBS-04 | AI cost/token counter via prom-client | Counter increments in AiRunLedgerService.recordRun() alongside existing DB write |
| TEST-09 | Prometheus /metrics endpoint returns valid prom-client format with expected metric names | HTTP test: GET /metrics, parse with prom-client contentType check, assert metric names present |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| prom-client | 15.1.3 | Prometheus client library | Already installed; official Node.js Prometheus client |
| @willsoto/nestjs-prometheus | 6.0.2 | NestJS integration for prom-client | Already installed; provides PrometheusModule, auto /metrics endpoint, DI-friendly metric providers |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | - | All deps already present |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @willsoto/nestjs-prometheus | Raw prom-client only | More boilerplate, no auto /metrics controller -- willsoto already installed, use it |
| OpenTelemetry | Full OTel SDK | Explicitly out of scope per REQUIREMENTS.md ("Phase 2 scope") |

**Installation:** No new packages needed. Both are already in `package.json` and `node_modules`.

## Architecture Patterns

### Recommended Module Structure
```
src/
├── common/
│   └── metrics/
│       ├── metrics.module.ts          # PrometheusModule.register() + metric providers
│       ├── http-metrics.interceptor.ts # Request duration histogram + in-flight gauge
│       ├── queue-metrics.service.ts    # Scheduled BullMQ gauge collector
│       └── ai-metrics.service.ts      # AI token/cost counter wrapper
```

### Pattern 1: PrometheusModule Registration
**What:** Register `@willsoto/nestjs-prometheus` in AppModule imports
**When to use:** Always -- this is the entry point for all prom-client metrics

```typescript
// Source: @willsoto/nestjs-prometheus docs
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',           // Endpoint path (outside api/v1 prefix)
      defaultMetrics: {
        enabled: true,            // nodejs_* and process_* metrics
      },
    }),
  ],
})
export class AppModule {}
```

**Critical:** The `/metrics` path must be excluded from the global `api/v1` prefix. Currently `main.ts` excludes `health` and `webhooks` paths. `/metrics` needs the same treatment -- OR mount it under `/health/metrics` to reuse the existing exclusion. The cleanest approach: use `path: '/metrics'` and add it to the exclude list in `main.ts`.

### Pattern 2: HTTP Request Duration Histogram
**What:** NestJS interceptor that records request latency per route
**When to use:** Global interceptor registered in AppModule providers

```typescript
import { Histogram, Gauge } from 'prom-client';

// Metric definitions (created via makeHistogramProvider / makeGaugeProvider)
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const httpRequestsInFlight = new Gauge({
  name: 'http_requests_in_flight',
  help: 'Number of HTTP requests currently being processed',
  labelNames: ['method'],
});
```

**Key detail:** Use `@willsoto/nestjs-prometheus` provider factories (`makeHistogramProvider`, `makeGaugeProvider`) to register metrics as NestJS providers, then inject them via `@InjectMetric()`.

### Pattern 3: BullMQ Queue Depth Collection
**What:** Periodic gauge updates from BullMQ queue counts
**When to use:** Scheduled collection (every 15-30s) rather than on-demand per scrape

```typescript
// Collect queue depths on interval, update gauges
@Injectable()
export class QueueMetricsCollector implements OnModuleInit, OnModuleDestroy {
  private interval: NodeJS.Timeout;

  constructor(
    @InjectMetric('bullmq_queue_depth') private queueDepth: Gauge,
    private queueHealthService: QueueHealthService,
  ) {}

  async onModuleInit() {
    this.interval = setInterval(() => this.collect(), 15_000);
  }

  private async collect() {
    const statuses = await this.queueHealthService.getQueueStatuses();
    for (const s of statuses) {
      this.queueDepth.set({ queue: s.name, state: 'waiting' }, s.waiting);
      this.queueDepth.set({ queue: s.name, state: 'active' }, s.active);
      this.queueDepth.set({ queue: s.name, state: 'delayed' }, s.delayed);
      this.queueDepth.set({ queue: s.name, state: 'failed' }, s.failed);
    }
  }

  onModuleDestroy() { clearInterval(this.interval); }
}
```

### Pattern 4: AI Cost/Token Counters
**What:** prom-client counters incremented inside `AiRunLedgerService.recordRun()`
**When to use:** Every LLM call, alongside existing DB ledger write

```typescript
// In AiRunLedgerService or a dedicated AiMetricsService
@InjectMetric('ai_tokens_total') private tokensCounter: Counter;
@InjectMetric('ai_cost_usd_total') private costCounter: Counter;
@InjectMetric('ai_requests_total') private requestsCounter: Counter;

// Inside recordRun():
this.tokensCounter.inc({ model: params.model, type: 'prompt' }, promptTokens);
this.tokensCounter.inc({ model: params.model, type: 'completion' }, completionTokens);
this.costCounter.inc({ model: params.model }, estimatedCostUsd);
this.requestsCounter.inc({ model: params.model, run_type: params.runType });
```

### Anti-Patterns to Avoid
- **Hand-rolled Prometheus text:** The existing `exportPrometheusText()` and `getPrometheusMetrics()` in HealthService/QueueHealthService use manual string concatenation. This is wrong -- prom-client's `register.metrics()` handles serialization correctly including timestamps, escaping, and content-type.
- **Creating metrics outside the registry:** Never use `new Histogram()` raw without registering. Use `@willsoto/nestjs-prometheus` providers or ensure the default registry captures them.
- **High-cardinality labels:** Do NOT use `url` as a label (unbounded). Use normalized `route` (e.g., `/api/v1/emails/:id` not `/api/v1/emails/abc-123`). NestJS provides `req.route?.path` for this.
- **Blocking scrape endpoint:** Never do DB queries inside the `/metrics` handler. Pre-collect and update gauges on intervals.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Prometheus text format | String concatenation (current approach) | `prom-client` registry.metrics() | Handles escaping, timestamps, content-type, default metrics |
| /metrics endpoint | Custom controller | PrometheusModule auto-controller | Already wired, handles content-type negotiation |
| Histogram buckets | Manual percentile calculation | prom-client Histogram with standard buckets | Prometheus server computes p50/p95/p99 from histogram buckets |
| Default Node.js metrics | Nothing (currently missing) | `defaultMetrics: { enabled: true }` | GC, event loop lag, memory -- free observability |

**Key insight:** The entire current metrics implementation (HealthService.getPrometheusMetrics + QueueHealthService.exportPrometheusText) is ~200 lines of hand-rolled string concatenation that prom-client replaces with proper typed metrics. The existing code should be migrated to prom-client gauges, not extended.

## Common Pitfalls

### Pitfall 1: Metric Name Conflicts
**What goes wrong:** Registering a metric name that already exists throws `Error: A metric with the name X has already been registered`
**Why it happens:** prom-client uses a global default registry; re-importing a module or hot-reloading can trigger double registration
**How to avoid:** Use `@willsoto/nestjs-prometheus` provider factories which handle idempotent registration. For testing, call `register.clear()` in beforeEach.
**Warning signs:** App crash on startup with "already registered" error

### Pitfall 2: High Cardinality Labels
**What goes wrong:** Using raw URL path as label creates thousands of time series (one per unique URL)
**Why it happens:** Routes with path parameters (`:id`) create unique label values
**How to avoid:** Use `req.route?.path` (NestJS matched route pattern) not `req.url`. Fallback to `req.url` only if route is undefined, and normalize it.
**Warning signs:** Prometheus scrape getting slower over time, high memory usage

### Pitfall 3: Blocking /metrics with DB Queries
**What goes wrong:** Prometheus scrape times out because `/metrics` handler runs expensive DB queries
**Why it happens:** Current HealthService.getPrometheusMetrics() does 8+ DB queries on every scrape
**How to avoid:** Pre-collect expensive data (queue depths, provider stats) on interval; `/metrics` just returns registry snapshot
**Warning signs:** Scrape duration > 1s, Prometheus recording "scrape_duration_seconds" increasing

### Pitfall 4: Missing Route Path in NestJS
**What goes wrong:** `req.route?.path` is undefined for some requests (404s, middleware-handled routes, WebSocket upgrades)
**Why it happens:** NestJS only populates route when a controller method matches
**How to avoid:** Use `'unmatched'` as fallback label value for unmatched routes
**Warning signs:** Metric labels showing raw URLs with IDs

### Pitfall 5: Global Prefix Collision
**What goes wrong:** `/metrics` endpoint gets prefixed to `/api/v1/metrics`
**Why it happens:** `app.setGlobalPrefix('api/v1')` applies to all routes
**How to avoid:** Add `/metrics` to the exclude list in `main.ts` setGlobalPrefix call, OR configure PrometheusModule with a path under an already-excluded prefix (e.g., `health/metrics`)
**Warning signs:** 404 on GET /metrics, endpoint only reachable at /api/v1/metrics

## Code Examples

### MetricsModule Setup
```typescript
// src/common/metrics/metrics.module.ts
import { Module } from '@nestjs/common';
import {
  PrometheusModule,
  makeHistogramProvider,
  makeGaugeProvider,
  makeCounterProvider,
} from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: true },
    }),
  ],
  providers: [
    // HTTP metrics
    makeHistogramProvider({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    }),
    makeGaugeProvider({
      name: 'http_requests_in_flight',
      help: 'Number of HTTP requests currently being processed',
      labelNames: ['method'],
    }),
    // Queue metrics
    makeGaugeProvider({
      name: 'bullmq_queue_depth',
      help: 'BullMQ queue depth by queue and state',
      labelNames: ['queue', 'state'],
    }),
    // AI metrics
    makeCounterProvider({
      name: 'ai_tokens_total',
      help: 'Total AI tokens consumed',
      labelNames: ['model', 'type'],
    }),
    makeCounterProvider({
      name: 'ai_cost_usd_total',
      help: 'Total estimated AI cost in USD',
      labelNames: ['model'],
    }),
    makeCounterProvider({
      name: 'ai_requests_total',
      help: 'Total AI requests',
      labelNames: ['model', 'run_type', 'status'],
    }),
  ],
  exports: [PrometheusModule],
})
export class MetricsModule {}
```

### HTTP Metrics Interceptor
```typescript
// src/common/metrics/http-metrics.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Histogram, Gauge } from 'prom-client';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric('http_request_duration_seconds') private readonly duration: Histogram,
    @InjectMetric('http_requests_in_flight') private readonly inFlight: Gauge,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method = req.method;

    this.inFlight.inc({ method });
    const end = this.duration.startTimer({ method });

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          const route = req.route?.path || 'unmatched';
          end({ route, status_code: res.statusCode });
          this.inFlight.dec({ method });
        },
        error: (error) => {
          const route = req.route?.path || 'unmatched';
          const status = error?.status || 500;
          end({ route, status_code: status });
          this.inFlight.dec({ method });
        },
      }),
    );
  }
}
```

### AI Metrics Integration Point
```typescript
// In AiRunLedgerService -- add @InjectMetric to constructor
constructor(
  private readonly prisma: PrismaService,
  @Optional() @InjectMetric('ai_tokens_total') private readonly tokensCounter?: Counter,
  @Optional() @InjectMetric('ai_cost_usd_total') private readonly costCounter?: Counter,
  @Optional() @InjectMetric('ai_requests_total') private readonly requestsCounter?: Counter,
) {}

// Inside recordRun(), after computing estimatedCostUsd:
this.tokensCounter?.inc({ model: params.model, type: 'prompt' }, promptTokens);
this.tokensCounter?.inc({ model: params.model, type: 'completion' }, completionTokens);
this.costCounter?.inc({ model: params.model }, estimatedCostUsd);
this.requestsCounter?.inc({
  model: params.model,
  run_type: params.runType,
  status: (params.status ?? 'SUCCESS').toLowerCase(),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual string Prometheus text | prom-client registry.metrics() | prom-client 14+ | Correct format, default metrics, proper types |
| Custom /metrics controller | PrometheusModule auto-controller | @willsoto/nestjs-prometheus 5+ | Zero boilerplate endpoint |
| OpenTelemetry | Still maturing for Node.js metrics | - | Out of scope for v4.1 per REQUIREMENTS.md |

**Deprecated/outdated:**
- The existing `HealthService.getPrometheusMetrics()` and `QueueHealthService.exportPrometheusText()` are custom implementations that should be superseded, not extended.

## Existing Code Impact Assessment

### Files to Modify
| File | Change | Risk |
|------|--------|------|
| `app.module.ts` | Import MetricsModule | LOW -- additive import |
| `main.ts` | Exclude `/metrics` from global prefix | LOW -- same pattern as health/webhooks |
| `health.controller.ts` | Remove `/health/metrics` hand-rolled endpoint OR keep as alias | LOW |
| `ai-run-ledger.service.ts` | Inject prom-client counters, increment in recordRun() | LOW -- additive, @Optional injection |
| `ai.module.ts` | Import MetricsModule or re-export metric providers | LOW |

### Files to Create
| File | Purpose | Lines (est.) |
|------|---------|-------------|
| `common/metrics/metrics.module.ts` | PrometheusModule + metric provider registrations | ~60 |
| `common/metrics/http-metrics.interceptor.ts` | Request duration + in-flight gauge | ~50 |
| `common/metrics/queue-metrics.collector.ts` | Scheduled BullMQ gauge updates | ~60 |

### Files Potentially Affected
| File | Why |
|------|-----|
| `queue-health.service.ts` | Still used for queue data collection; exportPrometheusText() becomes dead code |
| `health.service.ts` | getPrometheusMetrics() becomes dead code after migration |

## Open Questions

1. **Keep /health/metrics or only /metrics?**
   - What we know: Existing monitoring may point to `/health/metrics`. PrometheusModule creates `/metrics`.
   - Recommendation: Register PrometheusModule at `/metrics`. Add deprecation comment on old `/health/metrics`. Optionally redirect.

2. **Auth on /metrics endpoint?**
   - What we know: Phase depends on Phase 42 (stable auth). `/health` currently has no auth (SkipThrottle only). Prometheus scraping typically uses no auth or basic auth.
   - Recommendation: No JWT auth on `/metrics` -- same as `/health`. Add to SkipThrottle exclusions. Rely on network-level access control (internal-only in production).

3. **Should existing hand-rolled metrics data be preserved?**
   - What we know: HealthService.getPrometheusMetrics() exposes ~25 custom metrics (sync stats, webhook freshness, provider ages). These are expensive (8+ DB queries per scrape).
   - Recommendation: Out of scope for Phase 46. The requirements specify HTTP duration, queue depths, and AI costs only. Existing email-sync-specific metrics can be migrated later as a follow-up.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing) + Jest (existing) |
| Config file | `backend/vitest.config.ts` / `backend/jest.config.ts` |
| Quick run command | `cd backend && npx vitest run src/common/metrics` |
| Full suite command | `cd backend && npm run vitest` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OBS-01 | /metrics returns valid prom-client format | integration | `cd backend && npx vitest run src/common/metrics/__tests__/metrics-endpoint.test.ts` | Wave 0 |
| OBS-02 | HTTP histogram records latency with labels | unit | `cd backend && npx vitest run src/common/metrics/__tests__/http-metrics.test.ts` | Wave 0 |
| OBS-03 | BullMQ queue depths in metrics output | unit | `cd backend && npx vitest run src/common/metrics/__tests__/queue-metrics.test.ts` | Wave 0 |
| OBS-04 | AI counters increment on recordRun | unit | `cd backend && npx vitest run src/modules/ai/services/__tests__/ai-metrics.test.ts` | Wave 0 |
| TEST-09 | /metrics contains expected metric names | integration | Same as OBS-01 | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx vitest run src/common/metrics`
- **Per wave merge:** `cd backend && npm run vitest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/common/metrics/__tests__/metrics-endpoint.test.ts` -- covers OBS-01, TEST-09
- [ ] `src/common/metrics/__tests__/http-metrics.test.ts` -- covers OBS-02
- [ ] `src/common/metrics/__tests__/queue-metrics.test.ts` -- covers OBS-03
- [ ] `src/modules/ai/services/__tests__/ai-metrics.test.ts` -- covers OBS-04

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `backend/package.json` -- `@willsoto/nestjs-prometheus@6.0.2`, `prom-client@15.1.3` already installed
- Codebase inspection: `app.module.ts` -- no PrometheusModule import (unused dependency)
- Codebase inspection: `health.controller.ts` -- hand-rolled `/health/metrics` endpoint
- Codebase inspection: `queue-health.service.ts` -- manual Prometheus text generation
- Codebase inspection: `ai-run-ledger.service.ts` -- existing LLM cost/token tracking with COST_MAP
- Codebase inspection: `queue.config.ts` -- QUEUE_NAMES constant with 28 queue names
- npm: `@willsoto/nestjs-prometheus` peer deps confirmed NestJS 11 + prom-client 15 compatible

### Secondary (MEDIUM confidence)
- prom-client standard buckets and metric types are well-documented and stable since v14

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- libraries already installed, versions confirmed
- Architecture: HIGH -- @willsoto/nestjs-prometheus pattern is well-established, codebase patterns clear
- Pitfalls: HIGH -- based on direct codebase inspection (hand-rolled metrics, DB queries in scrape path, global prefix)

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable libraries, no breaking changes expected)
