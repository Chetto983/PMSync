# Phase 157: Scale to 1000 Users — Load Test, Quick Wins & Horizontal Split — Research

**Researched:** 2026-04-18
**Domain:** Node.js load testing, Node.js heap/RSS instrumentation, npm package scoping (CommonJS), LRU cache patterns, Railway multi-service topology
**Confidence:** HIGH on verified mechanics; MEDIUM on production-topology tradeoffs (Railway "hobby" plan has soft documentation); LOW on the acceptance-gate target itself (not yet empirically grounded — see §Open Questions)

## Summary

This phase bundles four loosely-coupled workstreams that normally belong in three phases: (1) a load-test rig, (2) two unbounded-Map quick wins, (3) a swap of `googleapis` (199.6 MB on disk, verified) for scoped `@googleapis/*` packages, and (4) a Railway replica split into HTTP-only + worker-only services enabled by Phase 146's `WORKERS_ENABLED`/module-toggle hierarchy.

The research here surfaces several places where the ROADMAP scope outline is either wrong or incomplete. Most importantly:

- **`lru-cache` is NOT a direct dependency.** It appears only as a transitive dep in `package-lock.json` (`11.3.5`, 14 references, none in `package.json`). The ROADMAP statement "use `lru-cache` already in deps" is false. A new direct dep must be added, OR the fix must use a different pattern (custom TTL map — which the Microsoft driver already uses — or flush-to-Postgres).
- **The Microsoft `folderIdCache`/`folderPathCache` are already bounded and not leaky.** They live in a `Scope.TRANSIENT` driver (fresh instance per sync, GC'd on disconnect) and already wrap a custom 5-min-TTL `TtlMap`. The ROADMAP's "leak 2" framing is wrong. There IS a related concern (`attachment-metrics` genuinely leaks), but the Microsoft one does not — see §Runtime State Inventory.
- **`googleapis` CANNOT be tree-shaken.** Backend `tsconfig.json` compiles to `"module": "commonjs"`; CJS `require()` pulls the entire 199.6 MB barrel regardless of which surface methods are called. Scoped packages are the only fix. Verified sizes: scoped `@googleapis/gmail` 1.15 MB, `@googleapis/calendar` 809 KB, plus **a third one the ROADMAP missed** — `@googleapis/people` 560 KB, used by `google-contacts-sync.service.ts` (`people_v1` import). Sum: ~2.5 MB vs 199.6 MB = **−197 MB per install**, far above the ROADMAP's −80–100 MB estimate (which likely referenced node_modules-on-dehydrated-install not the disk footprint).
- **k6 does NOT support Socket.IO.** Socket.IO's handshake/heartbeat/packet-encoding protocol is above raw WebSocket; the official Socket.IO load-test guide recommends using `socket.io-client` directly. Artillery has a native Socket.IO engine. For this phase's acceptance gate (p95 < 500 ms on HTTP with realistic user sim), Artillery is the better single-tool choice, OR k6 for HTTP + a small Node script using `socket.io-client` for WebSocket. Choosing k6 alone leaves Socket.IO unmeasured.
- **Railway cannot set per-replica env vars on a single service.** Applying different `WORKERS_ENABLED` values to replicas of one service is not possible — env vars apply uniformly. The split must be **two Railway services** (`backend-http`, `backend-worker`) that share the same Docker image tag but differ on the `WORKERS_ENABLED` env var and `numReplicas`. This introduces a Prisma-migration question (only one service should run `migrate deploy`).

**Primary recommendation (sequence-by-risk, not by ROADMAP order):**

1. **De-bundle first** — `googleapis` → scoped packages (pure refactor, reversible, measurable). One PR, no topology change.
2. **Bound `attachment-metrics` properly** — add `lru-cache@^11` as direct dep; cap `tenantCounters` at ~10k tenants with TTL; cap `latencies` arrays (already done per-op, but cap is only on latency arrays, not on tenantCounters — see §Pitfall 2).
3. **Ship load-test rig against current topology** (Artillery scenarios: login → list inbox → read thread → send ack; plus a separate socket.io-client RAM-slope harness). Record baseline metrics BEFORE split.
4. **Split Railway services last**, using the baseline from step 3 as a before/after comparison. This is the highest-risk change (deploy-pipeline rewiring, migration re-wiring, two service graphs).

The user explicitly chose bundled scope over this 3-phase split (STATE.md line 77-79), flagging it as higher-risk. This research gives the planner enough material to at minimum **execute the four workstreams in the risk-ordered sequence above** as separate plans within the phase, rather than interleaving them.

<user_constraints>
## User Constraints (from CONTEXT.md)

**No CONTEXT.md exists for Phase 157 yet.** The research proceeds from the ROADMAP scope outline and the orchestrator-supplied context. If a `/gsd-discuss-phase 157` run produces a CONTEXT.md later, the following inherited constraints from CLAUDE.md and STATE.md still apply verbatim:

### Locked Decisions (inherited from CLAUDE.md + STATE.md)
- **Phase 146 foundation is non-negotiable.** `WORKERS_ENABLED` / `EMAIL_WORKERS_ENABLED` / `CALENDAR_WORKERS_ENABLED` / `CONTACTS_WORKERS_ENABLED` / `AI_WORKERS_ENABLED` / `CRM_WORKERS_ENABLED` are already in production as of 2026-04-18 and must not be redefined [VERIFIED: `backend/src/common/workers/base.worker.ts:204`, `backend/src/common/workers/__tests__/base-worker-isolation.spec.ts:272-357`, commit `8b0083e3` from 146-06].
- **NEVER `prisma db push` in production** (CLAUDE.md hard-stop, quoted verbatim: *"On 2026-04-01 this wiped the entire production database"*). The Railway-service split must not introduce a second `migrate deploy` runner — only one service (the worker service, by convention, or the HTTP service with a release phase) runs migrations. Verified current Dockerfile.railway line 29 does `prisma migrate deploy` in the `CMD`. Splitting services requires gating this.
- **NEVER modify tests to make them pass** (CLAUDE.md hard-stop). Load-test failures are product bugs, not test bugs.
- **Max 500 lines per file.** `microsoft-message.service.ts` is already 719 lines [VERIFIED: `wc -l`]. It is **already over the limit** — any addition for this phase must reduce lines, not grow them.
- **Post-edit validation mandatory:** `cd backend && npx tsc --noEmit` after every edit.
- **Multi-tenant queries MUST include `tenantId`** (not directly applicable to this phase's code, but the per-user RAM harness must NOT introduce tenant-unaware queries).

### Claude's Discretion
- Choice of load-test tool (k6, artillery, or hybrid — see §Question 1)
- Choice of per-user RAM measurement technique (endpoint vs prom-client gauge vs external heapdump — see §Question 2)
- Exact LRU vs flush-to-Postgres vs WeakMap pattern for attachment metrics (see §Question 4)
- Whether to split Railway topology in this phase at all, or defer behind a feature flag (see §Question 5 + §Open Questions)

### Deferred Ideas (OUT OF SCOPE — per Phase 146 CONTEXT and STATE.md)
- Job data size optimization (store large BullMQ payloads in Postgres/S3)
- Redis AOF persistence tuning (Railway-managed)
- Replacing Socket.IO with AnyCable or similar
- Upgrading to Railway "pro" plan for native per-replica config
</user_constraints>

<phase_requirements>
## Phase Requirements

**No REQ-IDs registered yet for Phase 157.** The ROADMAP entry (lines 299-311) lists scope bullets but not numbered requirements. The planner SHOULD mint them before writing plans; a proposed set based on the ROADMAP acceptance gate:

| ID (proposed) | Description | Research Support |
|----|-------------|------------------|
| SCALE-01 | Produce a reproducible load-test rig that can ramp 100 → 500 → 1000 concurrent virtual users against a deployed PMSync backend, recording per-user RAM slope and p95 latency | §Standard Stack (Artillery + socket.io-client), §Code Examples (Artillery scenario), §Validation Architecture |
| SCALE-02 | Eliminate unbounded growth in `AttachmentMetricsService.tenantCounters` (Map-of-Maps keyed by tenantId with per-tenant per-operation counts) so that 10k+ tenants over the process lifetime does not accumulate | §Don't Hand-Roll (lru-cache), §Pitfalls (Pitfall 2), §Code Examples (LRU wrapper) |
| SCALE-03 | ~~Eliminate unbounded growth in `MicrosoftMessageService.folderIdCache` / `folderPathCache`~~ **SUPERSEDED:** research confirms these caches are already bounded (Scope.TRANSIENT driver + 5-min TtlMap). Recommend striking this requirement. | §Runtime State Inventory (Stored data) |
| SCALE-04 | Replace the `googleapis` import (199.6 MB unpacked) with `@googleapis/gmail` + `@googleapis/calendar` + `@googleapis/people` + `google-auth-library` (already installed) across all 15 referencing files | §Standard Stack, §Code Examples (Google migration), §Pitfalls (Pitfall 3) |
| SCALE-05 | Deploy a Railway topology with 2× HTTP-only replicas (`WORKERS_ENABLED=false`) + 1× worker-only replica (`WORKERS_ENABLED=true`), sharing one Docker image; document deploy/migration flow in an infra runbook | §Architecture Patterns (Pattern 5), §Pitfalls (Pitfall 4) |
| SCALE-06 | The 1000-user load test sustains **p95 < 500 ms** on HTTP replicas with **RAM stable below 3 GB per replica** for ≥15 minutes of steady-state traffic | §Validation Architecture (acceptance gate), §Open Questions (is 500 ms the right target?) |

The planner should confirm or renumber before execution. `SCALE-03` is specifically flagged — the research inverts the ROADMAP scope bullet because the "leak" does not exist.
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Load-test rig (scenarios + runner) | External (dev laptop / CI runner / separate Railway service) | — | A load generator must NOT share a process with the system under test; resource contention invalidates measurements |
| Per-user RAM instrumentation endpoint | API / Backend | — | Exposes `v8.getHeapStatistics()` + `process.memoryUsage()` on a debug route OR as prom-client gauges; HTTP replica only |
| LRU-bound `AttachmentMetricsService` | API / Backend | — | Singleton service, in-process memory concern, all mutation/read happens backend-side |
| `googleapis` → scoped packages refactor | API / Backend | Build (Docker) | Code change is backend-only, but image size drops show in the `builder` stage of `Dockerfile.railway` |
| Railway service split (HTTP vs worker) | Ops / Railway | API / Backend (feature flags) | Service topology lives in Railway UI + `railway.toml` per service; backend supplies the `WORKERS_ENABLED` wiring already (Phase 146) |
| Infra runbook doc | Documentation (`docs/ops/`) | — | Not code; consumed by operators (Claude-in-ops mode + human) |

## Standard Stack

### Core (verify versions during planning)

| Library | Version (Latest) | Purpose | Why Standard |
|---------|-----------------|---------|--------------|
| `artillery` | **2.0.30** [VERIFIED: `npm view artillery version` 2026-04-18] | HTTP + Socket.IO load testing | Native Socket.IO engine (k6 lacks this); YAML scenarios; same tool covers HTTP and WS so p95 aggregation is coherent [CITED: artillery.io docs; Socket.IO official load-test guide] |
| `socket.io-client` | `^4.8.3` (already in backend devDependencies) | Raw Socket.IO client for a bespoke Node harness, if Artillery's SIO engine is insufficient | Official Socket.IO load-test guide recommends it as the fallback when a protocol-native tool is needed [CITED: socket.io/docs/v4/load-testing/] |
| `@googleapis/gmail` | **16.1.1** [VERIFIED: `npm view @googleapis/gmail version` 2026-04-18] | Gmail API surface (messages, labels, threads) | Scoped replacement for `googleapis.google.gmail()`; 1.15 MB vs 199.6 MB monolith [VERIFIED: `npm view dist.unpackedSize`] |
| `@googleapis/calendar` | **14.2.0** [VERIFIED: same] | Google Calendar API surface | 809 KB |
| `@googleapis/people` | **7.0.1** [VERIFIED: same] | Google People API (contacts) | 560 KB — **this one was missing from the ROADMAP scope** but is required for `google-contacts-sync.service.ts` and `google-oauth.service.ts` (line 612) |
| `google-auth-library` | `^10.5.0` (already installed) | `OAuth2Client`, `GoogleAuth` | Already a direct dep; all three `@googleapis/*` packages accept an `OAuth2Client` from this package as their `auth:` argument, so the migration doesn't require re-wiring auth |
| `lru-cache` | **11.3.5** [VERIFIED: `npm view lru-cache version` 2026-04-18] | Bound-by-size / bound-by-TTL cache for `AttachmentMetricsService.tenantCounters` | Industry standard; `fetch()` method with `fetchMethod` for compute-on-miss; `ttl`, `max`, `allowStale` options [CITED: isaacs.github.io/node-lru-cache/] |

### Supporting (already installed — no-op)

| Library | Purpose | Relevance to this phase |
|---------|---------|-------------------------|
| `prom-client` | Prometheus metric surfaces | Already exposes `/metrics`; per-user RAM can be a gauge (`nodejs_heap_used_bytes`, `nodejs_rss_bytes`) — `prom-client` already registers `defaultMetrics` which covers these |
| `@willsoto/nestjs-prometheus` | NestJS DI wrapper for prom-client | Already in `backend/src/common/metrics/metrics.module.ts` [VERIFIED: grep] — adding custom gauges is additive |
| `ioredis` | Redis client | Unchanged; Socket.IO redis adapter already uses it |
| `@nestjs/platform-socket.io` | Socket.IO transport | Unchanged |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Artillery | **k6 (HTTP-only) + a Node `socket.io-client` harness** | Two tools, two result formats; harder to aggregate p95 across protocols; k6 produces nicer dashboards (Grafana Cloud k6 if on that plan) but PMSync is on Railway, not Grafana Cloud. Net: Artillery wins for single-tool operator ergonomics. |
| Artillery | `autocannon` | `autocannon` is HTTP-only and also fast, but no scenarios or Socket.IO — worse fit than k6. Exclude. |
| Artillery | Locust | Python tool, good if the team knows Python, but PMSync is Node-only — cognitive overhead. Exclude. |
| `lru-cache` | `node-cache` | Less actively maintained (last publish > 18 months); LRU semantics weaker than `lru-cache`. Exclude. |
| `lru-cache` | **Custom flush-to-Postgres** every N minutes (the metrics go to a `TenantMetricSnapshot` table, Map is cleared) | Eliminates in-process growth entirely, but adds a DB write loop and a cleanup job. Heavier lift. Appropriate if metrics are actually consumed (right now they're only exposed via `getMetrics()` — unclear who reads them). **Recommended for planner to investigate whether `AttachmentMetricsService.getMetrics()` has any consumer** before committing to LRU; if no consumer, simpler fix is to delete `tenantCounters` entirely. |
| Separate Railway services | Single service with `numReplicas: 3` and a per-replica discriminator via `RAILWAY_REPLICA_ID` (a built-in env var Railway exposes) | Would let one replica run workers based on a deterministic rule (e.g., `RAILWAY_REPLICA_ID === '0'` → workers enabled). Appealing but fragile — Railway's replica IDs are not documented as stable, and a replica restart can change the assignment. **Not recommended.** Use two services. |

**Installation (proposed by planner, verify first):**
```bash
cd backend
npm install @googleapis/gmail@^16.1.1 @googleapis/calendar@^14.2.0 @googleapis/people@^7.0.1 lru-cache@^11.3.5
npm install -D artillery@^2.0.30
npm uninstall googleapis  # do this LAST, after all imports are migrated
```

**Version verification (run at plan-time, not research-time):**
```bash
cd backend
npm view @googleapis/gmail version
npm view @googleapis/calendar version
npm view @googleapis/people version
npm view lru-cache version
npm view artillery version
```

## Architecture Patterns

### System Architecture Diagram

```
                       Load Generator (CI runner OR dev laptop)
                              |
                    Artillery v2.0.30 runs scenarios.yml
                              |
                    +---------+---------+
                    |                   |
              HTTP requests       Socket.IO handshake
                    |                   |
                    v                   v
        +--------------------------------------------+
        |     Railway project: pmsync-backend         |
        |                                             |
        |  +---------------------+  +--------------+  |
        |  | Service: backend-   |  | Service:     |  |
        |  | http (2× replicas)  |  | backend-     |  |
        |  |                     |  | worker       |  |
        |  | WORKERS_ENABLED=    |  | (1× replica) |  |
        |  |   false             |  |              |  |
        |  |                     |  | WORKERS_     |  |
        |  | Hosts:              |  |   ENABLED=   |  |
        |  |  - REST + WS        |  |   true       |  |
        |  |  - Socket.IO        |  | HTTP=false   |  |
        |  |  - /metrics         |  | (no Express  |  |
        |  |  - /health/live     |  |   listen)    |  |
        |  |                     |  |              |  |
        |  +---------+-----------+  +------+-------+  |
        |            |                     |          |
        |            +----+           +----+          |
        |                 |           |               |
        |                 v           v               |
        |           +------------------------+        |
        |           | Redis (shared service) |        |
        |           | - BullMQ queues        |        |
        |           | - Socket.IO pub/sub    |        |
        |           | - Shared KV cache      |        |
        |           +-----------+------------+        |
        |                       |                     |
        |                       v                     |
        |           +------------------------+        |
        |           | Postgres (shared)      |        |
        |           |  migrate deploy runs   |        |
        |           |  from backend-worker   |        |
        |           |  entrypoint ONLY       |        |
        |           +------------------------+        |
        +--------------------------------------------+
```

Flow for the acceptance-gate scenario:
1. Load generator ramps virtual users: 100 over 30s → hold 2min → 500 over 60s → hold 3min → 1000 over 60s → hold 15min.
2. Each VU does: `POST /auth/sign-in` → `GET /emails?inbox=INBOX&limit=50` → `GET /emails/:threadId` → connect Socket.IO → subscribe to a tenant room → stay idle with heartbeats.
3. `backend-http` service handles all of this; `backend-worker` is idle (no HTTP surface).
4. Prometheus scrapes `/metrics` on `backend-http` every 15s; RAM gauge (`nodejs_heap_used_bytes`, `process_resident_memory_bytes`) is the baseline for the RAM-slope metric.
5. Per-user RAM slope = `(RAM_at_N_users − RAM_at_0_users) / N_users`.

### Pattern 1: Artillery Scenario with Per-User RAM Sampling Hook

**What:** Artillery scenario that drives HTTP + Socket.IO + samples backend `/metrics` at wave boundaries.
**When to use:** Primary acceptance-gate harness for SCALE-01 / SCALE-06.

```yaml
# Source: artillery.io/docs — standard config
# backend/load-tests/artillery-1000-users.yml
config:
  target: "https://pmsync-backend-production.up.railway.app"
  phases:
    - duration: 30
      arrivalRate: 0
      rampTo: 100
      name: "Ramp to 100"
    - duration: 120
      arrivalRate: 100
      name: "Hold 100"
    - duration: 60
      rampTo: 500
      name: "Ramp to 500"
    - duration: 180
      arrivalRate: 500
      name: "Hold 500"
    - duration: 60
      rampTo: 1000
      name: "Ramp to 1000"
    - duration: 900  # 15 minutes steady-state
      arrivalRate: 1000
      name: "Hold 1000 — acceptance gate window"
  engines:
    socketio-v3:
      query: "transport=websocket"
  http:
    timeout: 10
  plugins:
    expect: {}                    # built-in assertion engine
    metrics-by-endpoint: {}       # built-in per-endpoint p95
  ensure:
    p95: 500                      # fail the run if p95 > 500 ms
    maxErrorRate: 1               # fail if > 1% errors

scenarios:
  - name: "Logged-in user session"
    weight: 80
    flow:
      - post:
          url: "/auth/sign-in"
          json:
            email: "loadtest+{{ $randomNumber(1, 1000) }}@pmsync.local"
            password: "{{ $processEnvironment.LOADTEST_PASSWORD }}"
          capture:
            - header: "set-cookie"
              as: "sessionCookie"
      - get:
          url: "/emails?folder=INBOX&limit=50"
          headers:
            cookie: "{{ sessionCookie }}"
      - think: 2
      - get:
          url: "/emails/{{ $randomNumber(1, 100) }}"
          headers:
            cookie: "{{ sessionCookie }}"
      - think: 5
  - name: "Socket.IO heartbeat only"
    weight: 20
    engine: socketio-v3
    flow:
      - emit:
          channel: "authenticate"
          data:
            token: "{{ $processEnvironment.LOADTEST_TOKEN }}"
      - think: 60
```

**Critical notes:**
- The `ensure` block is Artillery's native pass/fail gate — **no separate CI step needed** to assert the acceptance criteria. Exit code != 0 if p95 > 500 ms.
- `metrics-by-endpoint` plugin emits separate p95 for `/emails` vs `/emails/:id` — the gate should be per-endpoint, not aggregate (aggregate hides a slow endpoint behind fast ones).
- The `socketio-v3` engine is Artillery's native Socket.IO support [CITED: artillery.io/docs/reference/engines/socketio]. It speaks the Engine.IO v4 handshake correctly.
- Login must use **pre-seeded load-test users** in a dedicated tenant (`loadtest-tenant`) — do NOT hammer real tenants' `better-auth` session store.

### Pattern 2: Per-User RAM Gauge via prom-client (Already Available)

**What:** Expose RAM as Prometheus gauges on the existing `/metrics` endpoint; Artillery reads them out-of-band.
**When to use:** For measuring per-user RAM slope without adding a new debug route.

```typescript
// Source: PMSync existing pattern — backend/src/common/metrics/metrics.module.ts
// prom-client's `collectDefaultMetrics()` already registers:
//   process_resident_memory_bytes   (RSS)
//   nodejs_heap_size_total_bytes    (heap total)
//   nodejs_heap_size_used_bytes     (heap used)
//   nodejs_external_memory_bytes    (off-heap / buffers)
//   process_cpu_user_seconds_total  (CPU)
// [VERIFIED: prom-client docs; existing metrics.module.ts imports PrometheusModule.register()]

// If collectDefaultMetrics() is NOT already wired, add:
// backend/src/main.ts (in bootstrap())
import { collectDefaultMetrics } from 'prom-client';
collectDefaultMetrics({ prefix: 'pmsync_' });
```

**Per-user RAM slope math:**
```
At t=0 (0 VUs):   nodejs_heap_size_used_bytes = H_0
At t=N (N VUs):   nodejs_heap_size_used_bytes = H_N
Per-user slope = (H_N − H_0) / N     (bytes per logged-in user)
```

Collect via a small shell harness the load test runs post-ramp:
```bash
# snapshot.sh — called by Artillery's `afterRequest` hook or via a sidecar
curl -s https://pmsync-backend.railway.app/metrics | \
  grep -E '^(process_resident_memory_bytes|nodejs_heap_size_used_bytes)'
```

**Alternative (more precise, more invasive):** Add a debug-gated route:
```typescript
// backend/src/modules/health/controllers/debug-memory.controller.ts
@Controller('debug/memory')
export class DebugMemoryController {
  @Get('snapshot')
  snapshot() {
    if (process.env.DEBUG_MEMORY_ENABLED !== 'true') {
      throw new ForbiddenException();
    }
    return {
      rss: process.memoryUsage().rss,
      heapUsed: process.memoryUsage().heapUsed,
      external: process.memoryUsage().external,
      ...v8.getHeapStatistics(),
      timestamp: new Date().toISOString(),
    };
  }
}
```
**Tradeoff:** The prom-client approach is strictly superior for production because it's already protected and observable. The debug route adds security surface. Prefer prom-client unless you need `heap_size_limit` which `prom-client` doesn't expose (but you can register a custom gauge that calls `v8.getHeapStatistics().heap_size_limit`).

### Pattern 3: LRU Wrapper for `AttachmentMetricsService.tenantCounters`

**What:** Bound the outer `Map<tenantId, Map<operation, count>>` by tenant count, with per-entry TTL.
**When to use:** SCALE-02 fix.

```typescript
// Source: lru-cache v11 API [CITED: isaacs.github.io/node-lru-cache/]
// backend/src/modules/email/services/attachment-metrics.service.ts

import { LRUCache } from 'lru-cache';

@Injectable()
export class AttachmentMetricsService {
  private readonly logger = new Logger(AttachmentMetricsService.name);

  private counters: Map<AttachmentOperation, number> = new Map();
  private bytesCounters: Map<string, number> = new Map();
  private latencies: Map<AttachmentOperation, number[]> = new Map();

  // CHANGED: tenant counters now LRU-bounded
  private readonly tenantCounters = new LRUCache<string, Map<AttachmentOperation, number>>({
    max: 10_000,              // hard cap at 10k tenants in memory
    ttl: 1000 * 60 * 60 * 24, // 24h TTL — tenant dropping out for 24h loses its counter
    updateAgeOnGet: false,    // do NOT extend TTL on read (counters are write-driven)
    updateAgeOnHas: false,
  });

  recordOperation(operation: AttachmentOperation, context: AttachmentLogContext, durationMs?: number): void {
    // ... existing global counter + latency logic unchanged ...

    if (context.tenantId) {
      let tenantMap = this.tenantCounters.get(context.tenantId);
      if (!tenantMap) {
        tenantMap = new Map();
        this.tenantCounters.set(context.tenantId, tenantMap);
      }
      const tenantCount = tenantMap.get(operation) || 0;
      tenantMap.set(operation, tenantCount + 1);
    }

    // ... existing logging unchanged ...
  }
}
```

**Size budget:** Each tenant's inner map has at most 9 entries (the 9 `AttachmentOperation` variants) × ~64 B per entry (key + small-number v8-optimized) ≈ 600 B per tenant. 10,000 tenants × 600 B = **~6 MB maximum** for `tenantCounters`. Safe.

**TTL rationale (24h):** The metrics endpoint surface (`getMetrics(tenantId?)`) — audit needed for planner to confirm consumer exists. If no consumer, delete `tenantCounters` instead of capping it (simpler, fewer lines, no dep).

### Pattern 4: `googleapis` → Scoped Package Migration

**What:** Replace `import { google } from 'googleapis'` with three scoped imports + explicit `OAuth2Client`.
**When to use:** SCALE-04 fix.

**BEFORE** (current — `backend/src/modules/email/services/email-fetch.service.ts`):
```typescript
import { google, gmail_v1 } from 'googleapis';

const oauth2Client = new google.auth.OAuth2();
oauth2Client.setCredentials({ access_token: token });
const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
await gmail.users.messages.list({ userId: 'me', maxResults: 50 });
```

**AFTER** (scoped packages):
```typescript
import { gmail, gmail_v1 } from '@googleapis/gmail';
import { OAuth2Client } from 'google-auth-library';

const oauth2Client = new OAuth2Client();
oauth2Client.setCredentials({ access_token: token });
const gmailClient: gmail_v1.Gmail = gmail({ version: 'v1', auth: oauth2Client });
await gmailClient.users.messages.list({ userId: 'me', maxResults: 50 });
```

**Key facts [CITED: @googleapis/gmail npm README, google-auth-library docs]:**
- `@googleapis/gmail` exports `gmail` (factory function) and `gmail_v1` (types namespace). Same shape as `google.gmail()` and `google.gmail_v1`.
- `@googleapis/calendar` exports `calendar` and `calendar_v3`. Same shape.
- `@googleapis/people` exports `people` and `people_v1`. Same shape.
- `OAuth2Client` from `google-auth-library` is **the same class** that `google.auth.OAuth2` re-exports. Behavior is identical; the import path differs.
- All three scoped packages list `google-auth-library` as a `peerDependency` (not a `dependency`), which is why `google-auth-library@^10.5.0` must remain a direct dep.

**Migration surface (15 files, verified via grep):**

| File | Calls |
|------|-------|
| `backend/src/modules/contacts/services/google-contacts-sync.service.ts` | `people_v1`, `google.auth.OAuth2`, `google.people()` |
| `backend/src/modules/email/services/attachment-on-demand.service.ts` | `google.auth.OAuth2`, `google.gmail()` |
| `backend/src/modules/email/services/gmail-sync-back.service.ts` | `google.auth.OAuth2`, `google.gmail()` (×2) |
| `backend/src/modules/calendar/services/google-calendar-webhook.service.ts` | `calendar_v3`, `google.auth.OAuth2`, `google.calendar()` (×2) |
| `backend/src/modules/calendar/services/google-calendar-sync.service.ts` | `calendar_v3`, `google.auth.OAuth2`, `google.calendar()` |
| `backend/src/modules/email/services/email-fetch.service.ts` | `gmail_v1`, `google.auth.OAuth2`, `google.gmail()` |
| `backend/src/modules/email-sync/drivers/google/google.driver.ts` | `gmail_v1`, `google.auth.OAuth2`, `google.gmail()` |
| `backend/src/modules/email-sync/drivers/google/services/gmail-message.service.ts` | `gmail_v1` (types only) |
| `backend/src/modules/calendar/services/calendar-list.service.ts` | `calendar_v3`, `google.auth.OAuth2`, `google.calendar()` |
| `backend/src/modules/email-sync/drivers/google/services/gmail-sync.service.ts` | `gmail_v1` (types only) |
| `backend/src/modules/calendar/services/calendar-events.service.ts` | `calendar_v3`, `google.auth.OAuth2` (×4), `google.calendar()` (×4) |
| `backend/src/modules/email-sync/drivers/google/services/gmail-send.service.ts` | `gmail_v1` (types only) |
| `backend/src/modules/email-sync/services/gmail-webhook.service.ts` | `gmail_v1`, `google.auth.OAuth2` (×2), `google.gmail()` (×2) |
| `backend/src/modules/email-sync/services/gmail/gmail-folder.service.ts` | `gmail_v1`, `google.auth.OAuth2` (×4), `google.gmail()` (×4) |
| `backend/src/modules/providers/services/google-oauth.service.ts` | `google.gmail()` (×3), `google.calendar()` (×2), `google.people()` (×1) — **this file touches all three APIs** |

**Migration strategy (planner should adopt):**
1. Add `@googleapis/gmail`, `@googleapis/calendar`, `@googleapis/people` as deps in one commit. **Do NOT remove `googleapis` yet.** Both work side-by-side.
2. Migrate files one module at a time (contacts → calendar → email-sync gmail → email), run `npx tsc --noEmit` + existing Jest suites between each.
3. When all 15 files are migrated and tests pass, `npm uninstall googleapis` in a final commit. `package-lock.json` will drop ~200 MB of installed-tree references.
4. Verify with `du -sh node_modules/googleapis` returns "No such file" and `du -sh node_modules/@googleapis/` returns ~3 MB.

### Pattern 5: Railway Two-Service Split (HTTP + Worker)

**What:** Two Railway services, one Docker image, differentiated by env var.
**When to use:** SCALE-05 fix.

**Railway layout after split:**

| Service | `railway.toml` (per service) | `numReplicas` | Key env vars |
|---------|------------------------------|---------------|--------------|
| `backend-http` | `startCommand = "node dist/main"`<br/>`healthcheckPath = "/health/live"` | 2 | `WORKERS_ENABLED=false`<br/>`PORT=3000`<br/>`RUN_MIGRATIONS=false` |
| `backend-worker` | `startCommand = "node dist/main"`<br/>(no healthcheck — no HTTP; see note) | 1 | `WORKERS_ENABLED=true`<br/>`HTTP_ENABLED=false` (new — requires backend change) OR keep HTTP listening on a dummy port<br/>`RUN_MIGRATIONS=true` |

**Critical wiring decisions:**

1. **Who runs `prisma migrate deploy`?** Current `Dockerfile.railway:29` embeds `npx prisma migrate deploy && node dist/main` in the CMD. After the split, **only one service must run migrations** (to avoid race conditions and duplicate `_prisma_migrations` rows). Options:
   - **Option A (recommended):** Remove `prisma migrate deploy` from the Dockerfile CMD. Have `backend-worker` service override `startCommand = "npx prisma migrate deploy && node dist/main"`. `backend-http` overrides to just `node dist/main`. One migrator, clear ownership. [VERIFIED: Railway docs confirm `startCommand` in `railway.toml` overrides Dockerfile CMD.]
   - **Option B:** Add a guard env var: `entrypoint.sh` checks `RUN_MIGRATIONS=true` before running `migrate deploy`, default `false`. Rejected because it requires editing `entrypoint.sh` and adds an env var that must be set correctly on exactly one service (error-prone).

2. **Does the worker service need a healthcheck?** Railway's healthcheck is HTTP-based. If `backend-worker` doesn't listen on HTTP, Railway will mark the deployment unhealthy and may restart it in a loop. Three ways out:
   - **Keep HTTP listening on the worker**, but put a guard in `main.ts` that returns 503 from all non-`/health` routes when `HTTP_ENABLED=false`. Cheapest.
   - **Set `healthcheckTimeout = 0`** to disable the check (Railway allows this on non-web services).
   - **Expose a minimal `/health/live` on the worker** that returns 200 if `BullMQ` workers are initialized. Provides real signal; adds code.
   Recommendation: expose `/health/live` — the HTTP module is a few KB, not worth the complexity of disabling it.

3. **How does the worker know "I am the worker"?** Via the `WORKERS_ENABLED=true` env var (Phase 146 wiring already reads this). No code change needed beyond Option A above.

4. **`numReplicas: 2` on HTTP service — Railway's variable-scope implications.** Railway applies the **same** env vars to all replicas of a service. So `backend-http` will have `WORKERS_ENABLED=false` on both its replicas — correct. `backend-worker` has `WORKERS_ENABLED=true` on its one replica — correct. No per-replica env var is needed.

5. **Shared image vs shared code repo.** Railway can deploy two services from the same GitHub repo by setting the same `rootDirectory: "backend"` and the same `Dockerfile.railway` on both service configs. They'll each build their own image from the same source — but the Dockerfile is deterministic so the image contents are byte-identical. **Memory optimization:** Use Railway's "deploy from image reference" to deploy both services from one build artifact instead of two builds. [ASSUMED — verify in Railway UI before committing to this optimization.]

```
# Proposed backend/railway.http.toml  (new file)
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile.railway"

[deploy]
numReplicas = 2
sleepApplication = false
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 5
startCommand = "node dist/main"   # NO migrate deploy
healthcheckPath = "/health/live"
healthcheckTimeout = 120
```

```
# Proposed backend/railway.worker.toml  (new file)
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile.railway"

[deploy]
numReplicas = 1
sleepApplication = false
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 5
startCommand = "npx prisma migrate deploy && node dist/main"   # THE migrator
healthcheckPath = "/health/live"
healthcheckTimeout = 120
```

**Risk:** If the HTTP service boots before migrations complete on the worker, HTTP requests hitting unmigrated tables throw P2021 (table not found). Mitigations: (a) Manual deploy sequencing (deploy worker first, wait, then deploy HTTP); (b) Startup retry loop in HTTP's bootstrap that polls `_prisma_migrations` for the expected migration ID; (c) Railway dependency configuration (Railway allows setting a service dependency so HTTP waits for worker to be healthy). Option (c) is the cleanest if Railway supports it — [ASSUMED: Railway docs suggest "Shared Deploy" config exists, verify in the Railway UI before committing]. If not, Option (a) manual is an acceptable operator-burden compromise.

### Anti-Patterns to Avoid

- **Load-testing from the dev laptop with 1000 VUs over a home Wi-Fi.** Throughput is capped by the laptop's uplink, not the server. Run Artillery from a Railway sidecar service OR from GitHub Actions (has ~10 Gbps egress) OR from a dedicated EC2 t3.large.
- **Load-testing against the production tenant pool.** Pre-seed a `loadtest-tenant` with 1000 test users; isolate by tenantId; delete afterwards. Hitting real tenants pollutes metrics and risks GDPR exposure.
- **Running the load test without the Prisma migration applied.** If the `loadtest-tenant` seed depends on a schema that isn't deployed, the first request fails and the ramp aborts. Apply migrations first, verify with a sentinel request, then ramp.
- **Using `k6` for the Socket.IO portion.** k6's `ws` module speaks raw WebSocket — Socket.IO's Engine.IO framing, namespace routing, and ack callbacks will NOT be exercised. Metrics lie.
- **Disabling `prisma migrate deploy` on BOTH services "to be safe".** Then no service migrates. Deploys silently diverge from schema. Pick exactly one migrator.
- **Setting `WORKERS_ENABLED=false` on a replica that ALSO has module-level `EMAIL_WORKERS_ENABLED=true`.** The Phase 146 hierarchy is `Global → Module → Per-worker`; global `false` wins. But the mixed signal is confusing in dashboards. Stick to one level.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Load-test runner | Custom Node + `http.Agent` harness | **Artillery** (npm) | Ramp phases, p95 aggregation, HTML report, CI exit codes, Socket.IO engine all built-in. A custom harness re-implements 500 LOC of ramp/reporting scaffolding. |
| Socket.IO protocol client | `ws` + hand-rolled Engine.IO framing | `socket.io-client` (already in devDeps) | Engine.IO handshake, upgrade dance, heartbeat intervals, ack callbacks are 1,000+ LOC of finicky protocol. Reuse the official client. |
| Per-user RAM endpoint | New Express route with `process.memoryUsage()` + handcrafted JSON | `prom-client` + `collectDefaultMetrics()` (already installed) | Prometheus gauge already has `process_resident_memory_bytes` and `nodejs_heap_size_used_bytes`. Zero new code, standard scraping. |
| LRU cache for tenant metrics | Custom `Map` with a `setInterval` cleanup timer | `lru-cache@11` with `ttl` + `max` | TTL + LRU eviction, optional `fetch()` with deduped concurrent reads, battle-tested. Custom timer cleanup races with GC and misses the "many short-lived keys" case. |
| Per-replica env var differentiation | Custom shell script that reads `hostname` and picks a config | **Two Railway services** | Railway's env-var-per-service is exactly this problem's answer. Hostname-based dispatch is fragile, undocumented, and invisible to ops dashboards. |
| `googleapis` partial import | Custom webpack config to tree-shake out unused Google APIs | Scoped `@googleapis/*` packages | Tree-shaking is a non-starter for CJS output (`tsconfig.module=commonjs`). Even if the output were ESM, `googleapis`'s barrel is not side-effect-free. Scoped packages are the ONLY way. |

**Key insight:** Every one of these problems has an existing well-adopted solution. The one that's tempting to build — a custom load test in the backend repo — is the one with the highest maintenance cost long-term. Artillery YAML + `package.json` script is the right size.

## Runtime State Inventory

This phase involves code and config changes that affect runtime memory and deploy topology. Audit per §2.5:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | None tenant-keyed that this phase touches. The `attachment-metrics.service.ts` `tenantCounters` Map lives in-process only (no DB). | None — code edit only. |
| **Live service config** | **Railway services:** currently ONE service `pmsync-backend` with `numReplicas: 2` ([VERIFIED: `backend/railway.toml`]). After phase 157, TWO services: `backend-http` + `backend-worker`. Both need Railway-UI creation and shared-var wiring. | Manual Railway UI action (split the service) — requires operator, not Claude. |
| **Live service config** | **Prometheus scrape target:** `pmsync-backend:3000/metrics`. After split, scrapes must point at `backend-http:3000/metrics` (workers also expose `/metrics` but separately). | Operator updates Prometheus config / Railway integration. |
| **OS-registered state** | None. No systemd/Task Scheduler registrations. Railway manages process lifecycle. | None. |
| **Secrets and env vars** | New env var `WORKERS_ENABLED=false` on `backend-http`, `WORKERS_ENABLED=true` on `backend-worker`. Existing module toggles (`EMAIL_WORKERS_ENABLED`, etc.) unchanged — they continue to work inside each service. `RUN_MIGRATIONS` env var proposed but rejected in Pattern 5 (use `startCommand` override instead). | Operator sets env vars in Railway UI per service. |
| **Secrets and env vars** | New env var `DEBUG_MEMORY_ENABLED` **IF** the debug route is added (Pattern 2 alternative). Rejected in favor of prom-client. If used, must be `false` in production after the load test. | None, unless the debug route is added. |
| **Build artifacts** | `node_modules/googleapis` (199.6 MB) will be removed when `npm uninstall googleapis` runs. `node_modules/@googleapis/{gmail,calendar,people}` will be added (~2.5 MB total). `package-lock.json` must be committed. No stale .egg-info / .pyc equivalents in this Node project. | Verify `package-lock.json` diff is clean; rebuild Docker image forces fresh install. |
| **Build artifacts** | Railway builder cache may retain the old `googleapis` node_modules entry. Force a clean build by bumping a cache-bust env var on first deploy OR use Railway's "Clear Deployment Cache" UI action. | Operator action on first deploy after SCALE-04. |

**The canonical rename/refactor question ("what runtime systems still have the old string cached after every file is updated?"):** 

- Nothing stores `"googleapis"` as data. The string appears only in `package.json`, `package-lock.json`, `node_modules/`, and TypeScript imports. All refreshed by `npm install` + build.
- Nothing stores `WORKERS_ENABLED` as data. It's read at startup by `BaseWorker.isEnabled()` [VERIFIED: `base.worker.ts:204`]. No restart-persistent state.
- The Microsoft `folderIdCache` / `folderPathCache` concern from the ROADMAP is a **false positive**. Verified at `microsoft.driver.ts:93-94`: these are per-driver-instance `TtlMap`s with 5-min expiry, and the driver is `Scope.TRANSIENT` (fresh per sync). They cannot accumulate across users or tenants. STRIKE SCALE-03.

## Common Pitfalls

### Pitfall 1: `attachment-metrics.service.ts` latency arrays claim to be bounded but `tenantCounters` is NOT
**What goes wrong:** The service has a comment "Keep only last 1000 entries to prevent memory growth" [VERIFIED: `attachment-metrics.service.ts:149-152`] on `latencies`. But `tenantCounters` has no cap. At 10k new tenants per week (hypothetical at scale), the Map grows unbounded.
**Why it happens:** The developer bounded the ONE thing they noticed (latency arrays) and missed the OTHER thing (outer tenant map). Classic partial-fix.
**How to avoid:** Apply Pattern 3 (LRU with max=10k, ttl=24h) OR delete `tenantCounters` entirely if no consumer calls `getMetrics(tenantId)` with a specific tenant. Audit the codebase for `getMetrics(tenantId)` calls before deciding.
**Warning signs:** Heap used grows linearly with the number of unique tenants the process has ever seen.

### Pitfall 2: ROADMAP scope bullet "Microsoft message service (2 caches)" is wrong
**What goes wrong:** A plan task is written to "wrap `folderIdCache` + `folderPathCache` with `lru-cache`", which doesn't fix any real leak and costs developer time.
**Why it happens:** The ROADMAP was written without reading `microsoft.driver.ts` — the caches are owned by the driver (not the service) and TRANSIENT-scoped.
**How to avoid:** Planner MUST re-read `microsoft.driver.ts:82-94` before writing the SCALE-03 task. Strike the task or re-scope it to "audit all `Scope.TRANSIENT` driver caches to confirm they're GC-safe" — which is a real, cheap audit.
**Warning signs:** Team spends hours refactoring something that was already fine.

### Pitfall 3: `googleapis` migration leaves one `google.*` import behind and loader explodes
**What goes wrong:** After `npm uninstall googleapis`, a file that still `import { google } from 'googleapis'` fails at build time with a clear error. BUT — if a file dynamically `require('googleapis')` inside a rarely-taken branch, the error is runtime-only. Example: an admin-only Gmail-backup endpoint called once a month.
**Why it happens:** 15 files grep'd, but dynamic requires don't show in a static grep.
**How to avoid:** After migration, run `cd backend && npx tsc --noEmit` AND `node -e "require('./dist/main.js')"` AND a smoke test hitting every Gmail / Calendar / People controller. Also grep for string `"googleapis"` in source (not just import statements): `grep -r "googleapis" backend/src --include="*.ts"`. Any hit post-migration is a latent bug.
**Warning signs:** Smoke test passes, but a 2am cron dies on `MODULE_NOT_FOUND: 'googleapis'` three days later.

### Pitfall 4: Railway service split + Prisma migration race
**What goes wrong:** Both `backend-http` and `backend-worker` start with `prisma migrate deploy` in their CMD. Two processes race on `_prisma_migrations`. Most of the time Prisma's advisory lock works; sometimes it doesn't and one of them errors out with P2028 / P3014.
**Why it happens:** Both services were deployed from the same Dockerfile.railway that has `migrate deploy` baked in.
**How to avoid:** Override `startCommand` per-service in `railway.http.toml` / `railway.worker.toml` (Pattern 5) so ONLY the worker runs migrations. Alternative: remove `migrate deploy` from the Dockerfile entirely and require operators to run it via `npx prisma migrate deploy` in a Railway one-off task (cleaner but more manual).
**Warning signs:** Random deploys fail with `P2028` or the `_prisma_migrations` table shows duplicate rows for the same migration ID.

### Pitfall 5: Load-test tenant leaks into production dashboards
**What goes wrong:** The load test pre-seeds 1000 users in a `loadtest-tenant` and forgets to delete them. Dashboards that aggregate across tenants now show 1000+ "users" that never existed. Prom metrics show misleading `active_users` gauges. Grafana alerts fire or suppress based on wrong data.
**Why it happens:** Pre-seed is documented; cleanup isn't enforced. The happy-path load test exits OK; the cleanup step is "manual".
**How to avoid:** Artillery `config.phases` has an optional `afterScenario` hook. OR: write a `backend/scripts/loadtest-cleanup.ts` that deletes everything in `loadtest-tenant` and call it from `npm run loadtest:1000 && npm run loadtest:cleanup`. Treat cleanup as part of the test, not an appendix.
**Warning signs:** Dashboards show tenant count >> active paying customers after a load-test run.

### Pitfall 6: `lru-cache` v11 TTL does NOT preemptively evict
**What goes wrong:** Developer assumes `ttl: 60_000` means "keys older than 60s are removed every second". Reality: `lru-cache` removes expired keys only on access [CITED: isaacs.github.io/node-lru-cache/ — "LRU-cache is not primarily a TTL cache and does not make strong TTL guarantees"]. If a tenant never hits `getMetrics(tenantId)` again, their counter stays in memory until it falls out of LRU eviction.
**Why it happens:** Misreading the API. TTL is access-gated, not time-gated.
**How to avoid:** Rely on `max` (size cap) as the primary bound; TTL is a secondary hygiene thing. OR: set `ttlAutopurge: true` (opt-in for timer-driven eviction). Note that `ttlAutopurge` adds a `setInterval` that can hold the event loop open — test with `--detectOpenHandles` in Jest.
**Warning signs:** `tenantCounters.size === max` at 3am on a quiet tenant day (means eviction is purely size-driven, not time-driven).

### Pitfall 7: Per-user RAM slope is dominated by buffer churn, not per-user allocation
**What goes wrong:** Measurement shows "per-user RAM = 15 MB" but the real underlying issue is a 500 MB buffer pool for attachment streaming that scales with concurrent uploads, not logged-in users. The slope metric blames the wrong thing.
**Why it happens:** `process_resident_memory_bytes` is aggregate; it doesn't distinguish "per-user state" from "transient buffer state".
**How to avoid:** Take measurements at STEADY STATE (held for 5+ min with no new VUs ramping) to let buffer churn drain. Use `nodejs_heap_size_used_bytes` (long-lived objects) as the primary gauge, not RSS. Compare `external` memory (Buffers) separately.
**Warning signs:** Per-user slope varies wildly between runs with the same VU count — classic signal that transient state is contaminating the measurement.

## Code Examples

### Example 1: Verified Artillery config (HTTP + Socket.IO) matching SCALE-01

(See Pattern 1 above — the YAML is ready-to-commit under `backend/load-tests/artillery-1000-users.yml`.)

### Example 2: `@googleapis/gmail` migration for the simplest file

**`backend/src/modules/email/services/email-fetch.service.ts` — BEFORE:**
```typescript
// Source: current code (line 3, 136-139)
import { google, gmail_v1 } from 'googleapis';

// ...

const oauth2Client = new google.auth.OAuth2();
oauth2Client.setCredentials({ access_token: token });

const gmail: gmail_v1.Gmail = google.gmail({ version: 'v1', auth: oauth2Client });
```

**`backend/src/modules/email/services/email-fetch.service.ts` — AFTER:**
```typescript
// Source: @googleapis/gmail README + google-auth-library docs
import { gmail as gmailFactory, gmail_v1 } from '@googleapis/gmail';
import { OAuth2Client } from 'google-auth-library';

// ...

const oauth2Client = new OAuth2Client();
oauth2Client.setCredentials({ access_token: token });

const gmail: gmail_v1.Gmail = gmailFactory({ version: 'v1', auth: oauth2Client });
```

**Why `gmailFactory` (alias)?** The package default-exports a function named `gmail` that conflicts with the variable-naming convention in PMSync (which uses `const gmail` all over the place). Aliasing on import avoids shadowing. This is a style choice — `import { gmail } from '@googleapis/gmail'` and renaming the variable also works.

### Example 3: LRU wrapper around `tenantCounters` — full file diff

See Pattern 3 above. The diff is ~10 lines of change (imports + property declaration + the get/set logic in `recordOperation()`), bounded at 10k tenants × 24h TTL.

### Example 4: Railway `startCommand` override (per-service)

```toml
# backend/railway.worker.toml — the migrator
[deploy]
startCommand = "npx prisma migrate deploy && node dist/main"
numReplicas = 1
```

```toml
# backend/railway.http.toml — no migration
[deploy]
startCommand = "node dist/main"
numReplicas = 2
```

Both reference `Dockerfile.railway`, but the `startCommand` in `railway.toml` overrides the `CMD` in the Dockerfile [VERIFIED: Railway docs — `deploy.startCommand` takes precedence over Dockerfile CMD].

### Example 5: Custom socket.io-client Node harness (fallback if Artillery's SIO engine is insufficient)

```javascript
// backend/load-tests/socket-io-harness.mjs
import { io } from 'socket.io-client';

const TARGET = process.env.TARGET || 'https://pmsync-backend-production.up.railway.app';
const COUNT = Number(process.env.COUNT || 1000);
const HOLD_SECONDS = Number(process.env.HOLD_SECONDS || 900);

const clients = [];
console.log(`Connecting ${COUNT} Socket.IO clients to ${TARGET}`);
const startedAt = Date.now();

for (let i = 0; i < COUNT; i++) {
  const socket = io(TARGET, {
    transports: ['websocket'],
    auth: { token: process.env.LOADTEST_TOKEN },
    reconnection: false,
  });
  socket.on('connect', () => { /* counted */ });
  socket.on('connect_error', (err) => console.error('connect_error', err.message));
  clients.push(socket);
  if (i % 100 === 0) await new Promise((r) => setTimeout(r, 50)); // trickle
}

console.log(`Connected ${clients.filter(c => c.connected).length}/${COUNT} in ${Date.now() - startedAt}ms`);
await new Promise((r) => setTimeout(r, HOLD_SECONDS * 1000));
clients.forEach((c) => c.disconnect());
console.log('Disconnected all clients');
```

Run with: `LOADTEST_TOKEN=xxx COUNT=1000 node backend/load-tests/socket-io-harness.mjs`. Sample `/metrics` before, during, after to compute Socket.IO connection overhead per user.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single Node process runs HTTP + all queue workers | Split HTTP and worker into separate processes / services | BullMQ best practice since 2022 | HTTP replicas scale independently of queue load; worker crashes don't take HTTP down [CITED: BullMQ 2026 best practices article on dev.to] |
| Monolithic `googleapis` (199.6 MB) | Scoped `@googleapis/*` packages | Google introduced scoped packages in 2021 | −99% node_modules footprint for Google APIs |
| Unbounded in-process counters | `lru-cache` or flush-to-external-store | Ongoing best practice | Constant memory regardless of cardinality |
| k6 for everything | k6 for HTTP + Artillery or socket.io-client for Socket.IO | Always — k6 never supported Socket.IO natively | Coherent p95 across protocols in one tool (Artillery) or explicit split |
| Dev-laptop load-testing | Load-test from CI or a dedicated VM | Always | Laptop uplink is the bottleneck; metrics are wrong |

**Deprecated/outdated:**
- `google.auth.OAuth2` re-export from `googleapis` — still works but **redundant**; `google-auth-library`'s `OAuth2Client` is the canonical import. [VERIFIED: google-auth-library README].
- `googleapis.google.gmail().users.messages.list()` — same API surface in `@googleapis/gmail`'s `gmail().users.messages.list()`. Functionally identical; migration is purely import-path rewriting.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Railway "hobby" plan supports multiple services in one project at current pricing tier | Pattern 5 | If hobby plan limits to one service, the split requires a "pro" upgrade ($20/mo) — changes cost profile of the phase. VERIFY in Railway pricing page before committing to the split. |
| A2 | Railway's `deploy.startCommand` in `railway.toml` takes precedence over `Dockerfile.railway` CMD | Pattern 5, Pitfall 4 | If not, the Dockerfile CMD runs migrations on BOTH services, producing the race condition described. Trivial to test: deploy one service with a divergent `startCommand` and check logs. |
| A3 | Railway supports setting up dependency ordering between services ("deploy worker before HTTP") | Pattern 5 (risk note) | If not, operator must manually sequence deploys, or HTTP service must implement a startup retry waiting for migrations. |
| A4 | `AttachmentMetricsService.getMetrics(tenantId)` has at least one consumer | Pattern 3, Pitfall 1 | If no consumer, `tenantCounters` should be deleted entirely rather than LRU-bounded — simpler fix, no new dep. Grep `grep -r "getMetrics(" backend/src` to verify before choosing. |
| A5 | Artillery's `socketio-v3` engine speaks PMSync's Socket.IO 4.x handshake correctly | Pattern 1 | If handshake mismatches (Artillery supports Socket.IO up to v3 but PMSync is on `socket.io@4.8.3` per package.json), fall back to the Node harness (Example 5). Test with a 10-client ramp first. |
| A6 | `prom-client.collectDefaultMetrics()` is already wired in PMSync's bootstrap | Pattern 2 | Grep `grep -r "collectDefaultMetrics" backend/src` confirms whether registration exists. If not, planner must add it in `main.ts` or `MetricsModule`. |
| A7 | The "acceptance gate" of p95 < 500 ms at 1000 users was chosen by the user, not derived from actual user SLA | §Open Questions, §Summary | If 500 ms is too tight for a load-free replica's current p95 (current measurement unknown), the gate either fails trivially or is too lenient. Get the CURRENT p95 first as a sanity baseline. |
| A8 | `googleapis@^171.4.0` and `@googleapis/gmail@^16.1.1` produce semantically identical results for the same API call | Pattern 4 | Breaking API changes between versions would manifest as runtime errors during migration. Run the Jest suite + smoke tests per-file. |

## Open Questions (RESOLVED)

All 6 questions below were resolved on 2026-04-19 during post-research review, before plan revision v2. Resolutions are binding for the planner.

1. **Is p95 < 500 ms the right gate, or arbitrary?**
   - **RESOLVED:** Treated as aspirational, not SLA-derived. Plan 04 (SCALE-05 baseline) records real p95 numbers on the CURRENT topology and reinterprets the acceptance gate against those numbers via the Pattern A/B/C/D decision tree in `157-04-PLAN.md`. If baseline p95 at 1000 VU is already near 500 ms, the gate is revised downward; if it's >2 s, the phase adds a targeted perf plan before Plan 05 proceeds. The planner does NOT hardcode 500 ms as a fail-shut gate in Plan 05 — it compares pre-split vs post-split numbers.

2. **Does `AttachmentMetricsService.getMetrics(tenantId)` have a real consumer?**
   - **RESOLVED (verified by grep 2026-04-19):** NO consumer. The only `getMetrics` call in the codebase is `folders.controller.ts:892` on `this.folderQueue.getMetrics()` — a different service (FolderQueue). `AttachmentMetricsService.getMetrics(tenantId?)` accepts the parameter but NO call site ever passes a tenantId. `tenantCounters` is write-only dead data.
   - **Decision:** **Delete `tenantCounters` entirely** rather than LRU-bound it. Also removes the need to install `lru-cache` as a direct dep, which resolves blocker #1 (Wave 2 `package.json` overlap between 157-02 and 157-03). The `getMetrics(tenantId?)` signature is kept for API compatibility but the tenant branch becomes a no-op returning the global metrics unchanged.

3. **Does Railway's healthcheck system accept a service with no HTTP listener?**
   - **RESOLVED (verified by PATTERNS.md Hazard #4):** The existing `health.controller.ts:44-49` already registers `@Public() /health/live`. Both `backend-http` and `backend-worker` services run the same image and therefore both expose `/health/live` automatically. NO new controller is needed. Plan 05 must NOT create a worker-health controller.

4. **What's the current baseline "empty process" RAM?**
   - **RESOLVED:** Measured in Plan 04 (SCALE-05) Task 1 pre-flight. The task includes: deploy fresh replica, wait 30 s, snapshot `MEMORY_USAGE_GB` via Railway API, record as "cold-start baseline" in `157-BASELINE.md`. Delta-per-user is then computed during the ramp as `(RAM@phase_end - cold_start) / active_users`.

5. **Is the single worker replica a bottleneck at 1000 users?**
   - **RESOLVED:** Deferred to Plan 04 observation, not pre-decided. Plan 04 Task 2 (RAM scraping loop) also snapshots BullMQ queue depth every 30 s (`QueueHealthService.getQueueStatuses()` — already shipped in Phase 146). If any queue depth grows monotonically without drain during the 1000 VU phase, the baseline report recommends `numReplicas: 2` on `backend-worker` as a Plan 05 input (NOT as a blocker). The Phase 157 spec remains "1 worker replica" as the starting point; scaling to 2 is a Plan 05 runbook option, not a hard requirement.

6. **Does the load-test tenant seeding scale to 1000 synthetic users within reasonable time?**
   - **RESOLVED:** Plan 03 (SCALE-04) Task 3 (seed script) is rewritten per blocker #2 in the checker report. The script MUST use better-auth's server-side helper (`auth.api.signUpEmail` from `backend/src/common/auth/better-auth.instance.ts`) — NOT raw `prisma.user.create`. Raw Prisma creates bypass password hashing and the Artillery `/auth/sign-in` will return 401 on every request. The correct seeding uses `auth.api.signUpEmail({ body: { email, password, name } })` with `Promise.all` + 10-chunk batching (not 50; better-auth's bcrypt rounds saturate CPU). Target: < 3 min for 1000 users. Task adds an acceptance criterion: smoke-login 10 seeded users returns 200 before the task is marked done.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22 (Alpine) | Runtime | ✓ | `node:22-alpine` [VERIFIED: `Dockerfile.railway:1`] | — |
| Redis (Railway-managed) | BullMQ + Socket.IO adapter | ✓ | (Railway-managed) | — |
| PostgreSQL (Railway-managed) | Prisma | ✓ | (Railway-managed) | — |
| `npm` + `npx prisma migrate deploy` | Migration runner | ✓ | Ships with Node 22 | — |
| `artillery` | Load test rig (SCALE-01) | **✗ (new install)** | ^2.0.30 | Fall back to custom Node harness (Example 5) for Socket.IO; `autocannon` for HTTP-only |
| `socket.io-client` | Custom harness fallback | ✓ (already in backend devDependencies per `package.json:149`) | ^4.8.3 | — |
| `lru-cache` as DIRECT dep | SCALE-02 | **✗ (only transitive)** [VERIFIED: grep of `package.json` — no direct entry] | 11.3.5 (latest) | Use custom TtlMap pattern from `microsoft.driver.ts:46-80` to avoid adding a dep |
| `@googleapis/gmail` | SCALE-04 | **✗ (new install)** | ^16.1.1 | — |
| `@googleapis/calendar` | SCALE-04 | **✗ (new install)** | ^14.2.0 | — |
| `@googleapis/people` | SCALE-04 | **✗ (new install — ROADMAP missed this)** | ^7.0.1 | — |
| `google-auth-library` | SCALE-04 auth surface | ✓ (already direct dep) | ^10.5.0 [VERIFIED: `package.json:84`] | — |
| `prom-client` + `@willsoto/nestjs-prometheus` | Per-user RAM metrics (SCALE-01/06) | ✓ (already installed) | 15.1.3 / 6.0.2 | — |
| Railway "hobby" plan multi-service support | SCALE-05 | [ASSUMED ✓ — VERIFY before planning] | — | Upgrade to "pro" plan ($20/mo) if blocked |

**Missing dependencies with no fallback:** None — all are installable via `npm install`.

**Missing dependencies with fallback:**
- Artillery → socket.io-client + autocannon hybrid (Example 5 + stock autocannon). Acceptable but introduces more scripts to maintain.
- `lru-cache` as direct dep → reuse custom `TtlMap` from `microsoft.driver.ts`. Keeps zero-dep footprint but duplicates an existing well-tested library; not recommended.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (ts-jest) for unit/integration + Artillery (standalone runner) for load |
| Config file | `backend/jest.config.js` (existing) + `backend/load-tests/artillery-*.yml` (new) |
| Quick run command | `cd backend && npx jest --testPathPattern="attachment-metrics\|googleapis-imports" --forceExit` |
| Load rig command | `cd backend && npx artillery run load-tests/artillery-1000-users.yml --output artillery-report.json && npx artillery report artillery-report.json` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCALE-01 | Artillery rig runs 100 → 500 → 1000 ramp end-to-end without crashing | integration (smoke) | `cd backend && npx artillery run load-tests/artillery-smoke.yml --quiet` (10-user smoke) | ❌ Wave 0 — create `load-tests/artillery-smoke.yml` |
| SCALE-01 | Artillery rig records p95 latency per-endpoint | integration | inspect `artillery-report.json.aggregate.summaries["http.response_time"].p95` | Auto-generated by artillery run |
| SCALE-02 | `AttachmentMetricsService.tenantCounters` capped at max=10000 | unit | `cd backend && npx jest --testPathPattern="attachment-metrics" --forceExit` | ❌ Wave 0 — extend `backend/src/modules/email/services/__tests__/attachment-metrics.spec.ts` (create if absent) |
| SCALE-02 | `AttachmentMetricsService.tenantCounters` expires entries after 24h TTL | unit | Same spec, use Jest `jest.useFakeTimers()` | ❌ Wave 0 |
| SCALE-03 | (STRIKE) Microsoft driver caches are TRANSIENT-scoped | code review | `grep -A2 "Scope.TRANSIENT" backend/src/modules/email-sync/drivers/microsoft/microsoft.driver.ts` confirms line 82 | N/A — no test needed, the research verified the invariant |
| SCALE-04 | No file imports `googleapis` post-migration | static check | `! grep -r "from 'googleapis'" backend/src` returns exit 0 | N/A — grep-based gate, runs in CI |
| SCALE-04 | No file uses dynamic `require('googleapis')` | static check | `! grep -r "require.'googleapis'." backend/src` | N/A |
| SCALE-04 | Gmail/Calendar/People smoke tests pass against scoped packages | integration | `cd backend && npx jest --testPathPattern="gmail-message\|calendar-events\|google-contacts-sync" --forceExit` | Partial — existing specs may need import-path updates |
| SCALE-04 | Image size reduction verified | smoke | `docker build -f Dockerfile.railway -t pmsync-test . && docker image inspect pmsync-test --format='{{.Size}}'` — compare before/after | N/A (build-time check) |
| SCALE-05 | `backend-worker` service runs migrations; `backend-http` does not | manual / post-deploy | Check Railway deploy logs; `_prisma_migrations` table does not grow from two sources | N/A (deploy-time check) |
| SCALE-05 | `backend-http` replicas return 200 on `/health/live` | smoke | `curl https://backend-http.railway.app/health/live` | Existing endpoint (Phase 129) |
| SCALE-05 | `backend-worker` replica processes queued jobs | integration | Enqueue a test job, assert it's processed by worker replica only (check logs for `[worker]` context) | ❌ Wave 0 — requires manual sync test |
| SCALE-06 | p95 < 500 ms at 1000 users on `backend-http` | acceptance (load) | Artillery `ensure: p95: 500` gate returns exit 0 | Auto-generated |
| SCALE-06 | RAM < 3 GB per replica at 1000 users steady-state | acceptance (load) | `nodejs_heap_size_used_bytes < 3 * 1024 * 1024 * 1024` for 15min hold | Requires Prometheus scrape during Artillery run; assert in a post-run script |
| (phase gate) | Type-check passes after all edits | smoke | `cd backend && npx tsc --noEmit` exits 0 | N/A |
| (phase gate) | Jest suite passes | full test | `cd backend && npm test` | Existing |

### Sampling Rate

- **Per task commit:** `cd backend && npx tsc --noEmit` (mandatory per CLAUDE.md) + `cd backend && npx jest --testPathPattern="<task-scope>" --forceExit`
- **Per wave merge:** `cd backend && npm test`
- **Per phase gate (before `/gsd-verify-work`):** Full Jest + `npx tsc --noEmit` + smoke Artillery run (10 users, 30s) + full grep gate for SCALE-04 (`! grep -r "from 'googleapis'" backend/src`)
- **Acceptance (final):** Full Artillery run against the post-split topology; Prometheus RAM snapshot at steady state; written runbook reviewed by operator

### Wave 0 Gaps

- [ ] `backend/load-tests/artillery-1000-users.yml` — full 100/500/1000 ramp scenario (Pattern 1)
- [ ] `backend/load-tests/artillery-smoke.yml` — 10-user smoke variant for CI
- [ ] `backend/scripts/seed-loadtest-users.ts` — pre-seed 1000 test users in a dedicated tenant
- [ ] `backend/scripts/cleanup-loadtest-users.ts` — teardown after load test (prevent Pitfall 5)
- [ ] `backend/src/modules/email/services/__tests__/attachment-metrics.spec.ts` — tests for SCALE-02 (may already exist — planner should check with `ls backend/src/modules/email/services/__tests__/`)
- [ ] `backend/railway.http.toml` + `backend/railway.worker.toml` — per-service config files OR equivalent Railway UI configuration (Pattern 5)
- [ ] `docs/ops/railway-multi-service-runbook.md` — infra runbook covering deploy order, migration ownership, rollback procedure (part of SCALE-05 scope)

*(No further framework install needed — Jest + Artillery cover the surface.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Partially | Load-test users must NOT use real `better-auth` credentials — isolate in `loadtest-tenant`. Session tokens for load test must be scoped + revocable. |
| V3 Session Management | Yes | `better-auth` sessions generated for load test must auto-expire (1h) AND be revoked after test. |
| V4 Access Control | Yes | `DebugMemoryController` (if added) must be behind `DEBUG_MEMORY_ENABLED=true` AND behind an IP allowlist OR auth. Prefer NOT to add it — use prom-client. |
| V5 Input Validation | No | No new user inputs. |
| V6 Cryptography | No | No crypto changes. |
| V7 Error Handling | Yes | Artillery test must NOT log full `Set-Cookie` values or session secrets in its report artifacts. Redact via a `beforeRequest` hook. |
| V14 Configuration | Yes | `WORKERS_ENABLED` and friends are env vars — ensure they're not logged at startup in production mode. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Load-test credentials leak to CI logs | Information Disclosure | Use `$processEnvironment` in Artillery YAML (not literal); mask in GitHub Actions with `::add-mask::` |
| Debug memory endpoint exposed in production | Information Disclosure | Gate behind `DEBUG_MEMORY_ENABLED !== 'true'` AND prefer prom-client approach (avoids endpoint) |
| `loadtest-tenant` data accidentally exposed via search / multi-tenant bugs | Information Disclosure | Place `loadtest-tenant` in a separate Prisma `datasource` OR tag with `isLoadTest: true` and filter in multi-tenant query helpers |
| Migration race creates inconsistent schema | Tampering (self-inflicted) | Exactly one migration runner per deploy (SCALE-05 Pattern 5) |
| Worker replica eats HTTP traffic due to misconfig | Denial of Service | `backend-worker` service does not publish a public HTTP route; `WORKERS_ENABLED=true` alone prevents queue processing on HTTP replicas |

## Project Constraints (from CLAUDE.md)

- **Post-edit validation mandatory:** `cd backend && npx tsc --noEmit` after every edit. Applies to all SCALE-02, SCALE-04 edits.
- **Max 500 lines per file:** `microsoft-message.service.ts` is already 719 lines [VERIFIED]. Any SCALE-03 work (if the task isn't struck) must reduce lines, not add. `attachment-metrics.service.ts` is 364 lines — SCALE-02 can stay under 500 comfortably.
- **NEVER `prisma db push` in production** — applicable to SCALE-05. Only `prisma migrate deploy`, owned by exactly one service.
- **NEVER modify tests to make them pass** — if Artillery's p95 gate fails at 501 ms, that's a product bug. Do not raise the gate to 550 ms without a documented reason in a new CONTEXT.md addendum.
- **Multi-tenant rule** — the per-user RAM harness must NOT leak data across tenants. `loadtest-tenant` isolation is mandatory.
- **Follow existing patterns** — the Microsoft driver's `TtlMap` (existing) is the pattern to MATCH or use `lru-cache`; do not invent a third cache primitive.
- **SCOPE CONTROL** — user bundled 4 workstreams, STATE.md notes they were warned this is higher-risk. Research advocates internal sequencing (4 plans, risk-ordered) but does NOT recommend re-scoping away from the user's bundled choice.

## Sources

### Primary (HIGH confidence)

- **PMSync codebase (verified via grep + read):**
  - `backend/package.json` — direct dependency list [VERIFIED]
  - `backend/package-lock.json` — lru-cache transitive confirmed [VERIFIED]
  - `backend/tsconfig.json:3` — `"module": "commonjs"` [VERIFIED]
  - `backend/src/modules/email/services/attachment-metrics.service.ts` — Map structure [VERIFIED]
  - `backend/src/modules/email-sync/drivers/microsoft/microsoft.driver.ts:82-94` — TRANSIENT + TtlMap [VERIFIED]
  - `backend/src/modules/email-sync/drivers/microsoft/services/microsoft-message.service.ts:32-34` — Maps owned by facade [VERIFIED]
  - `backend/src/common/workers/base.worker.ts:204` — Phase 146 feature-flag hierarchy [VERIFIED]
  - `backend/railway.toml` — current topology [VERIFIED]
  - `backend/Dockerfile.railway` — current migration wiring in CMD [VERIFIED]
  - 15 files referencing `googleapis` — grep result [VERIFIED]

- **npm registry (real-time via `npm view` on 2026-04-18):**
  - `googleapis@171.4.0` — 199,646,715 B unpacked, 1,823 files [VERIFIED]
  - `@googleapis/gmail@16.1.1` — 1,146,771 B unpacked [VERIFIED]
  - `@googleapis/calendar@14.2.0` — 808,688 B unpacked [VERIFIED]
  - `@googleapis/people@7.0.1` — 559,829 B unpacked [VERIFIED]
  - `lru-cache@11.3.5` — 1,782,529 B unpacked [VERIFIED]
  - `artillery@2.0.30` — latest [VERIFIED]
  - `google-auth-library@10.6.2` — latest (backend has ^10.5.0) [VERIFIED]

- **Phase 146 artifacts:**
  - `.planning/phases/146-ram-harden/146-CONTEXT.md` — D-11/D-12/D-13 contract [VERIFIED]
  - `.planning/phases/146-ram-harden/146-06-SUMMARY.md` — shipped wiring, commits `1ca65d52`, `232adb39`, `43bd8a96` [VERIFIED]
  - `.planning/STATE.md:76-79` — Phase 157 creation context, user chose bundled scope [VERIFIED]

### Secondary (MEDIUM confidence)

- [Socket.IO official load-testing guide](https://socket.io/docs/v4/load-testing/) — "easiest way to load test your Socket.IO server is to use the Socket.IO client library"
- [Artillery v2 Socket.IO engine docs](https://www.artillery.io/docs/reference/engines/socketio) — `socketio-v3` engine
- [k6 GitHub issue #3097](https://github.com/grafana/k6/issues/3097) — confirmed k6 does not support Socket.IO protocol natively
- [BullMQ background job processing best practices 2026 (dev.to)](https://dev.to/young_gao/background-job-processing-in-nodejs-bullmq-queues-and-worker-patterns-31d4) — separate HTTP and worker processes
- [Railway variables docs](https://docs.railway.com/variables) — service-scoped and shared variables
- [Railway services docs](https://docs.railway.com/services) — multi-service project layout
- [isaacs/node-lru-cache](https://isaacs.github.io/node-lru-cache/) — TTL semantics, `fetch()`, `ttlAutopurge`
- [Node.js v8.getHeapStatistics reference](https://joyeecheung.github.io/blog/2024/03/17/memory-leak-testing-v8-node-js-1/) — V8 memory measurement patterns
- [Artillery docs — ensure/p95 gates](https://www.artillery.io/docs/reference/test-script#ensure) — native pass/fail exit codes
- [google-auth-library README](https://github.com/googleapis/google-auth-library-nodejs) — `OAuth2Client` shape stable across versions
- Medium article: [Load-Testing PoC: k6 vs Artillery vs Locust vs Gatling](https://medium.com/@dorangao/load-testing-poc-k6-vs-artillery-vs-locust-vs-gatling-node-js-express-target-f056094ffbef) — Artillery native Socket.IO support advantage

### Tertiary (LOW confidence)

- [Odown blog: Backend Deployment with Railway](https://odown.com/blog/using-railway-as-a-backend/) — general Railway multi-service guidance (informative, not authoritative for specific features)
- [Vervali blog: Best Load Testing Tools 2026](https://www.vervali.com/blog/best-load-testing-tools-in-2026-definitive-guide-to-jmeter-gatling-k6-loadrunner-locust-blazemeter-neoload-artillery-and-more/) — ecosystem overview
- Railway "hobby" plan multi-service pricing: [ASSUMED current, verify in Railway pricing UI before SCALE-05]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified on npm registry in-session
- Architecture patterns: HIGH for single-process / lru / googleapis migration; MEDIUM for Railway topology split (depends on Railway-specific behaviors A2/A3)
- Pitfalls: HIGH — all seven derive from verified file contents or authoritative docs
- Code examples: HIGH — Artillery YAML matches official docs; googleapis migration matches scoped package README
- Validation Architecture: HIGH — test commands use existing Jest config + Artillery's native gates
- Environment Availability: HIGH — all `npm view` + grep results live this session
- Acceptance gate (p95 < 500 ms, RAM < 3 GB): **LOW as a target** — no current baseline to ground the numbers; open question flagged

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (30 days — load-testing tools and Google package versions change moderately; re-verify versions at plan-time if this window elapses)
