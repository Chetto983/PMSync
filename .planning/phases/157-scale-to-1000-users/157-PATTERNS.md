# Phase 157: Scale to 1000 Users — Pattern Map

**Mapped:** 2026-04-18
**Files analyzed:** 26 (16 googleapis call sites + 4 net-new files for Artillery + 2 Railway TOMLs + 1 new Jest spec + 2 doc/infra files + attachment-metrics mod)
**Analogs found:** 22 strong matches / 26 total (4 files are net-new primitives — see §No Analog Found)

> **Note to planner — research file-list corrections:**
> 1. Research file list named services like `google-message.service.ts` / `google-label.service.ts` / `google-mailbox.service.ts` / `google-push.service.ts` — **those files do not exist**. Actual Gmail service files under `backend/src/modules/email-sync/drivers/google/services/` are: `gmail-message.service.ts`, `gmail-send.service.ts`, `gmail-sync.service.ts` (types-only imports).
> 2. Research-supplied list of 15 files is **one short** — `backend/src/modules/providers/services/gmail-client-manager.service.ts:14` also imports `{ gmail_v1, google } from 'googleapis'`. **All 16 files must be migrated**; otherwise the `npm uninstall googleapis` step blows up at runtime on the client-pool code path.
> 3. Research list included `backend/src/modules/ai/services/ai-calendar.service.ts` — this file either does not exist or does not reference googleapis (grep returns no match). Drop it.
> 4. Research list referenced Google Contacts/Calendar driver services in `modules/calendar/drivers/google/` and `modules/contacts/drivers/google/` — those directories **do not exist**. Calendar and contacts are still flat under `modules/calendar/services/` and `modules/contacts/services/`. Plan accordingly.

## File Classification

### Workstream 1 — googleapis → scoped packages (16 files verified via grep + 1 manifest)

| File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `backend/package.json` | config (manifest) | static | (self) existing dep list | exact — in-place edit |
| `backend/src/modules/email/services/email-fetch.service.ts` | service | request-response (Gmail fetch) | **canonical analog** (fresh `OAuth2Client` per call, no reused state — 4 lines of change) | exact |
| `backend/src/modules/email/services/gmail-sync-back.service.ts` | service | request-response | `email-fetch.service.ts` | exact |
| `backend/src/modules/email/services/attachment-on-demand.service.ts` | service | streaming (Gmail attachment) | `email-fetch.service.ts` | exact |
| `backend/src/modules/email-sync/drivers/google/google.driver.ts` | driver (facade) | request-response, stateful | (self) — see §Pattern-1b below; unique pattern of storing `oauth2Client` for refresh | role-match |
| `backend/src/modules/email-sync/drivers/google/services/gmail-message.service.ts` | driver sub-service | types-only import | **canonical analog** for "types-only" files | exact |
| `backend/src/modules/email-sync/drivers/google/services/gmail-send.service.ts` | driver sub-service | types-only | `gmail-message.service.ts` | exact |
| `backend/src/modules/email-sync/drivers/google/services/gmail-sync.service.ts` | driver sub-service | types-only | `gmail-message.service.ts` | exact |
| `backend/src/modules/email-sync/services/gmail-webhook.service.ts` | service | event-driven (webhook) | `email-fetch.service.ts` | exact |
| `backend/src/modules/email-sync/services/gmail/gmail-folder.service.ts` | service | request-response | `email-fetch.service.ts` | exact |
| `backend/src/modules/providers/services/gmail-client-manager.service.ts` | service (client pool) | request-response, cached | unique (client pool w/ `OAuth2Client` already imported) | role-match |
| `backend/src/modules/providers/services/google-oauth.service.ts` | service (multi-API) | request-response across Gmail+Calendar+People | **canonical analog** for multi-surface (already uses `OAuth2Client` from `google-auth-library`; only `google.X()` factories need swap) | exact |
| `backend/src/modules/calendar/services/calendar-list.service.ts` | service | request-response | `google-oauth.service.ts:534-545` (calendar factory pattern) | exact |
| `backend/src/modules/calendar/services/calendar-events.service.ts` | service | request-response | `google-oauth.service.ts:566-580` | exact |
| `backend/src/modules/calendar/services/google-calendar-sync.service.ts` | service | request-response (sync) | `calendar-list.service.ts` | exact |
| `backend/src/modules/calendar/services/google-calendar-webhook.service.ts` | service | event-driven | `google-oauth.service.ts` (calendar) | exact |
| `backend/src/modules/contacts/services/google-contacts-sync.service.ts` | service | CRUD (People API) | `google-oauth.service.ts:605-620` (people factory pattern) | exact |

### Workstream 2 — attachment-metrics LRU bound

| File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `backend/src/modules/email/services/attachment-metrics.service.ts` | service (in-process metrics) | write-heavy counters | (self — modify existing 364-line file) | in-place |
| `backend/src/modules/email/services/__tests__/attachment-metrics.service.spec.ts` (NEW) | unit test | pure in-memory | `backend/src/modules/subscription/services/__tests__/usage-tracking.service.spec.ts` (pure unit, no DB/Redis, constructor-inject mock, asserts counter state) | role-match |

### Workstream 3 — Artillery load-test rig

| File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `backend/load-test/artillery.config.yml` (NEW) | config | load-gen scenarios | **no analog in repo** — see §No Analog Found. Use verbatim Pattern 1 YAML from 157-RESEARCH.md §"Pattern 1" (lines 198-266) | none |
| `backend/load-test/scenarios/http-only.yml` (NEW) | config | HTTP scenario | no analog — RESEARCH.md Pattern 1 HTTP flow | none |
| `backend/load-test/scenarios/socketio.yml` (NEW) | config | Socket.IO handshake | no analog — RESEARCH.md Pattern 1 SIO flow | none |
| `backend/load-test/scenarios/ai-chat.yml` (NEW) | config | SSE stream | no analog — AI chat endpoint is `POST /ai/chat` (memory entry "AI Chat Architecture 2026-03-22"); treat as a plain POST in Artillery HTTP engine, because Artillery cannot measure SSE tokens/sec natively — see §adaptation notes | none |
| `backend/load-test/processors/auth.js` (NEW) | helper script | request-response (auth) | no JS analog; **use TypeScript pattern from `backend/src/common/auth/*.guard.spec.ts`** for better-auth session cookie flow | partial |
| `backend/package.json` (modify scripts) | manifest | static | existing `scripts` block (see §Pattern-3a) | exact |
| `docs/load-testing.md` (NEW) | documentation | n/a | `docs/CLAUDE_REFERENCE.md` (existing long-form reference doc) | role-match |

### Workstream 4 — Railway topology split

| File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `backend/railway.http.toml` (NEW) | infra config | n/a | `backend/railway.toml` (existing, 13 lines) | exact — clone + `WORKERS_ENABLED=false` + remove migrate |
| `backend/railway.worker.toml` (NEW) | infra config | n/a | `backend/railway.toml` | exact — clone + `WORKERS_ENABLED=true` + `startCommand` with `migrate deploy` |
| `backend/Dockerfile.railway` (modify) | build | n/a | (self — current 29-line Dockerfile) | in-place |
| `backend/entrypoint.sh` (modify OR leave alone — see notes) | build | n/a | (self, 35 lines) | in-place — but see §Pattern-4b: entrypoint.sh is **not currently invoked by Dockerfile.railway CMD** (CMD runs `npx prisma migrate deploy && node dist/main` directly). This file is a no-op in production and the plan may simply delete it OR leave it for dev-compose. Confirm before editing. |
| `backend/src/modules/health/controllers/worker-health.controller.ts` (NEW) | controller | request-response | `backend/src/modules/health/controllers/health.controller.ts` — **`/health/live` already exists at line 44-49** and is `@Public()`. No new controller needed — see §Pattern-4c | **ALREADY EXISTS** |
| `docs/infra-runbook.md` (NEW) | documentation | n/a | none in repo (no `docs/ops/` dir yet) | none |

## Pattern Assignments

### Workstream 1 — googleapis → scoped packages

#### `backend/package.json` — manifest edit (dependency swap)

**Pattern: add three new scoped deps in one commit, DO NOT remove `googleapis` yet.**

Verified existing entries (from `backend/package.json`):
```jsonc
// Line 84-85 — current
"google-auth-library": "^10.5.0",   // KEEP — peer dep of all @googleapis/* scoped packages
"googleapis": "^171.4.0",            // REMOVE LAST (after all 16 call sites migrated)
```

Target diff (staged across 2 commits):
```jsonc
// Commit 1 — add side-by-side (RESEARCH.md Pattern 4 migration strategy §1)
"@googleapis/calendar": "^14.2.0",
"@googleapis/gmail": "^16.1.1",
"@googleapis/people": "^7.0.1",
"google-auth-library": "^10.5.0",
"googleapis": "^171.4.0",            // still here, still works

// Commit 2 — after all 16 imports migrated, tsc clean, jest green
// run: npm uninstall googleapis
```

**Adaptation notes:**
- Version-verify at plan-time per RESEARCH.md lines 124-132. Versions above are the published latest as of 2026-04-18; refresh if plan slips beyond 2026-05-18.
- `google-auth-library@^10.5.0` is **already** a direct dep (line 84) — do NOT re-add.
- `lru-cache` gets added in Workstream 2's commit, not this one.

---

#### `backend/src/modules/email/services/email-fetch.service.ts` — canonical "fresh OAuth2Client per call" migration

**Analog: itself** — this is the **simplest** of the 16 files. Use it as the walkthrough the planner references for all other "fresh-client" files.

**Current state** (lines 1-3, 136-139 — VERIFIED by Read):
```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { google, gmail_v1 } from 'googleapis';
// ...
const oauth2Client = new google.auth.OAuth2();
oauth2Client.setCredentials({ access_token: accessToken });

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
```

**Target state:**
```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { gmail as gmailFactory, gmail_v1 } from '@googleapis/gmail';
import { OAuth2Client } from 'google-auth-library';
// ...
const oauth2Client = new OAuth2Client();
oauth2Client.setCredentials({ access_token: accessToken });

const gmail = gmailFactory({ version: 'v1', auth: oauth2Client });
```

**Adaptation notes:**
- `gmail_v1` type namespace is preserved (used at line 152 as `gmail_v1.Schema$MessagePart` — VERIFIED).
- Alias the `gmail` factory to `gmailFactory` to avoid shadowing the `gmail` local variable (existing local at line 139).
- `as any` casts that appear in some files (e.g., `google-oauth.service.ts:423` — `auth: auth as any`) can be **dropped** after migration: the scoped packages' `auth:` type now accepts `OAuth2Client` directly. Let the planner audit `grep -n "auth: auth as any" backend/src` post-migration and remove the casts.

**Reusable pattern for all same-shape files:** `gmail-sync-back.service.ts`, `attachment-on-demand.service.ts`, `gmail-webhook.service.ts`, `gmail-folder.service.ts` — identical 3-line diff.

---

#### `backend/src/modules/email-sync/drivers/google/google.driver.ts` — stateful driver (stores `oauth2Client` across calls)

**Analog: itself — unique pattern** (no other file stores the client between calls).

**Current state** (lines 2, 57, 106-113 — VERIFIED):
```typescript
import { google, gmail_v1 } from 'googleapis';
// ...
private oauth2Client: InstanceType<typeof google.auth.OAuth2> | null = null;
// ...
const oauth2Client = new google.auth.OAuth2();
oauth2Client.setCredentials({
  access_token: credentials.accessToken,
  refresh_token: credentials.refreshToken,
});

this.oauth2Client = oauth2Client;
this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
```

**Target state:**
```typescript
import { gmail as gmailFactory, gmail_v1 } from '@googleapis/gmail';
import { OAuth2Client } from 'google-auth-library';
// ...
private oauth2Client: OAuth2Client | null = null;   // simpler type — no InstanceType<typeof ...> gymnastics
// ...
const oauth2Client = new OAuth2Client();
oauth2Client.setCredentials({
  access_token: credentials.accessToken,
  refresh_token: credentials.refreshToken,
});

this.oauth2Client = oauth2Client;
this.gmail = gmailFactory({ version: 'v1', auth: oauth2Client });
```

**Adaptation notes:**
- The type `InstanceType<typeof google.auth.OAuth2>` collapses to plain `OAuth2Client` in the scoped-package world — a small cleanup win.
- The `TokenRefresherFn` type (line 48) and `propagateTokenRefreshCallback()` flow are unchanged.
- Sub-services (`GmailMessageService` etc.) receive `this.gmail: gmail_v1.Gmail` via `initialize()` (line 37 of `gmail-message.service.ts`) — no signature change because `gmail_v1.Gmail` has the same shape in both packages.

---

#### `backend/src/modules/providers/services/google-oauth.service.ts` — multi-API file (Gmail + Calendar + People all in one)

**Analog: itself** — only file touching all three surfaces.

**Current imports** (lines 2-3):
```typescript
import { OAuth2Client } from 'google-auth-library';   // already using it
import { google } from 'googleapis';                   // only used for google.gmail/google.calendar/google.people factories
```

**Current usage** (representative lines 423, 541, 612 — VERIFIED):
```typescript
const gmail = google.gmail({ version: 'v1', auth: auth as any });
const calendar = google.calendar({ version: 'v3', auth: auth as any });
const people = google.people({ version: 'v1', auth: auth as any });
```

**Target imports:**
```typescript
import { OAuth2Client } from 'google-auth-library';
import { gmail as gmailFactory } from '@googleapis/gmail';
import { calendar as calendarFactory } from '@googleapis/calendar';
import { people as peopleFactory } from '@googleapis/people';
```

**Target usage:**
```typescript
const gmail = gmailFactory({ version: 'v1', auth });        // drop `as any`
const calendar = calendarFactory({ version: 'v3', auth });  // drop `as any`
const people = peopleFactory({ version: 'v1', auth });      // drop `as any`
```

**Adaptation notes:**
- This is the highest-value file in the migration: it exercises all three scoped packages in one process, so its successful tsc + jest run is the gate for the whole migration.
- 7 sites total (`gmail` ×3, `calendar` ×2, `people` ×1, one more `gmail` at line 487 — search `google\\.(gmail|calendar|people)` to enumerate).

---

#### `backend/src/modules/email-sync/drivers/google/services/gmail-message.service.ts` — types-only file

**Analog: itself** — canonical "types-only" pattern for `gmail-send.service.ts` + `gmail-sync.service.ts`.

**Current state** (line 2 — VERIFIED):
```typescript
import { gmail_v1 } from 'googleapis';
```

**Target state:**
```typescript
import { gmail_v1 } from '@googleapis/gmail';
```

**Adaptation notes:** One-line import-path change; no runtime code touches. Three files share this pattern — batch them in one commit.

---

### Workstream 2 — attachment-metrics LRU bound

#### `backend/src/modules/email/services/attachment-metrics.service.ts` — modify in place

**Current state** (lines 83-86 — VERIFIED):
```typescript
// In-memory counters (can be replaced with Prometheus/OpenTelemetry in production)
private counters: Map<AttachmentOperation, number> = new Map();
private bytesCounters: Map<string, number> = new Map();
private latencies: Map<AttachmentOperation, number[]> = new Map();
private tenantCounters: Map<string, Map<AttachmentOperation, number>> = new Map();
```

**The ONLY leaky Map is `tenantCounters` (line 86).** The other three are bounded:
- `counters` — max 9 entries (one per `AttachmentOperation` variant) ✓
- `bytesCounters` — max 3 entries (`'uploaded' | 'downloaded' | 'saved'`) ✓
- `latencies` — per-entry capped at 1000 numbers (line 149-152, VERIFIED) ✓

**Target state (Pattern 3 from 157-RESEARCH.md, adapted to the actual class):**
```typescript
import { LRUCache } from 'lru-cache';
// ...
private readonly tenantCounters = new LRUCache<string, Map<AttachmentOperation, number>>({
  max: 10_000,                 // hard cap — ~6 MB at full
  ttl: 1000 * 60 * 60 * 24,    // 24h
  updateAgeOnGet: false,       // counters are write-driven
  updateAgeOnHas: false,
});
```

And replace the `recordOperation` tenant-map block (lines 136-143 — VERIFIED):
```typescript
// BEFORE
if (context.tenantId) {
  if (!this.tenantCounters.has(context.tenantId)) {
    this.tenantCounters.set(context.tenantId, new Map());
  }
  const tenantMap = this.tenantCounters.get(context.tenantId)!;
  const tenantCount = tenantMap.get(operation) || 0;
  tenantMap.set(operation, tenantCount + 1);
}

// AFTER
if (context.tenantId) {
  let tenantMap = this.tenantCounters.get(context.tenantId);
  if (!tenantMap) {
    tenantMap = new Map<AttachmentOperation, number>();
    this.tenantCounters.set(context.tenantId, tenantMap);
  }
  tenantMap.set(operation, (tenantMap.get(operation) ?? 0) + 1);
}
```

Also `getMetrics(tenantId)` at line 278-284 — VERIFIED — still works (`LRUCache.has()` + `.get()` have the same shape as native `Map`). `resetMetrics()` at line 322 still works (`.clear()` exists on `LRUCache`).

**Adaptation notes:**
- Hard 500-line cap: file is currently **364 lines**; LRU changes add ~5 lines. Safe, well under 500.
- **Decision gate (RESEARCH.md §Open Question 2):** Before adopting LRU, grep for `getMetrics\(.*[a-z]` call sites. If no consumer passes a tenantId, **delete `tenantCounters` entirely** (simpler, no dep). Planner should run `grep -rn "\\.getMetrics(" backend/src` and decide. RESEARCH flagged this as an assumption (A4).
- Fallback pattern if `lru-cache` is rejected as a new dep: **reuse `TtlMap` from `microsoft.driver.ts:46-80`** (below). RESEARCH.md §Environment Availability explicitly permits this.

**Reusable alternative — copy `TtlMap` from `microsoft.driver.ts:46-80` — VERIFIED:**
```typescript
/** T-0903: TTL-aware Map — entries expire after a configurable duration */
class TtlMap<K, V> extends Map<K, V> {
  private expiry = new Map<K, number>();
  constructor(private readonly ttlMs: number) {
    super();
  }

  override get(key: K): V | undefined {
    const exp = this.expiry.get(key);
    if (exp !== undefined && Date.now() > exp) {
      super.delete(key);
      this.expiry.delete(key);
      return undefined;
    }
    return super.get(key);
  }

  override set(key: K, value: V): this {
    this.expiry.set(key, Date.now() + this.ttlMs);
    return super.set(key, value);
  }

  override has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  override delete(key: K): boolean {
    this.expiry.delete(key);
    return super.delete(key);
  }

  override clear(): void {
    this.expiry.clear();
    super.clear();
  }
}
```
**Gap vs `lru-cache`:** `TtlMap` has NO size cap — only TTL. For `tenantCounters`, TTL-only is acceptable (tenants stop appearing → entries expire in 24h → steady-state RAM proportional to active tenants). But it doesn't defend against a 10k-tenant burst within the TTL window. `lru-cache` defends against both. Planner's call.

**If copying `TtlMap`:** extract it into a shared util (`backend/src/common/utils/ttl-map.ts`) rather than duplicating — CLAUDE.md "FOLLOW EXISTING PATTERNS" + "max 500 lines per file" (microsoft.driver.ts is already 719 lines, over cap — the extraction would actually **help** that file too). Planner may choose to leave TtlMap in place and only `import` from microsoft.driver.ts; I recommend the extraction but it's a secondary refactor.

---

#### `backend/src/modules/email/services/__tests__/attachment-metrics.service.spec.ts` (NEW)

**Analog: `backend/src/modules/subscription/services/__tests__/usage-tracking.service.spec.ts`** — VERIFIED (lines 1-76). This is a pure unit test of an in-memory service with constructor-injected mocks, no DB/Redis, asserts internal counter state via public methods.

**Pattern to copy** (lines 1-52 of the analog):
```typescript
/**
 * AttachmentMetricsService unit tests — SCALE-02
 * Pure unit tests — in-memory LRU + counters, no external deps.
 */
import { AttachmentMetricsService } from '../attachment-metrics.service';

describe('AttachmentMetricsService', () => {
  let service: AttachmentMetricsService;
  const tenantId = 'test-tenant-metrics-001';

  beforeEach(() => {
    service = new AttachmentMetricsService();
  });

  describe('tenantCounters LRU bound', () => {
    it('does not exceed max=10000 tenants', () => {
      for (let i = 0; i < 11_000; i++) {
        service.recordOperation('upload', { tenantId: `tenant-${i}` });
      }
      // Access the private LRUCache via (service as any) — acceptable in tests per RESEARCH.md
      const lru = (service as any).tenantCounters;
      expect(lru.size).toBeLessThanOrEqual(10_000);
    });

    it('evicts old tenants first (LRU semantics)', () => {
      for (let i = 0; i < 10_000; i++) {
        service.recordOperation('upload', { tenantId: `tenant-${i}` });
      }
      // tenant-0 is oldest — insert one more and tenant-0 should be gone
      service.recordOperation('upload', { tenantId: 'tenant-overflow' });
      const metrics0 = service.getMetrics('tenant-0');
      expect(metrics0.totalUploads).toBe(0);   // evicted
    });

    it('expires entries after 24h TTL', () => {
      jest.useFakeTimers();
      service.recordOperation('upload', { tenantId });
      expect(service.getMetrics(tenantId).totalUploads).toBe(1);
      jest.advanceTimersByTime(1000 * 60 * 60 * 24 + 1);
      // LRU v11 TTL is access-gated per RESEARCH.md Pitfall 6
      expect(service.getMetrics(tenantId).totalUploads).toBe(0);
      jest.useRealTimers();
    });
  });

  describe('recordOperation', () => {
    it('increments global counter', () => {
      service.recordOperation('upload', { tenantId });
      expect(service.getMetrics().totalUploads).toBe(1);
    });

    it('increments tenant counter separately from global', () => {
      service.recordOperation('upload', { tenantId: 'tenant-a' });
      service.recordOperation('upload', { tenantId: 'tenant-b' });
      expect(service.getMetrics('tenant-a').totalUploads).toBe(1);
      expect(service.getMetrics().totalUploads).toBe(2);
    });
  });
});
```

**Adaptation notes:**
- No NestJS TestingModule needed (usage-tracking spec uses plain `new Service()` at line 21 — VERIFIED). Same here.
- The `(service as any).tenantCounters` access pattern matches how the analog tests inject a mock Redis (line 29 of `contacts-cache.service.spec.ts`). Private field poking is accepted in this codebase for state assertions.
- **Do NOT modify tests to make them pass** (CLAUDE.md hard-stop). If the TTL assertion fails because `lru-cache` v11 doesn't preemptively evict (RESEARCH.md Pitfall 6), fix the production code (add `ttlAutopurge: true`), not the test.

---

### Workstream 3 — Artillery load-test rig

**No existing analog in the repo** — this is a fresh-build workstream. The closest reference is the inline Artillery YAML in `157-RESEARCH.md` Pattern 1 (lines 200-266). The planner should treat that YAML as the source and break it into the 4 files listed below per the ROADMAP structure.

#### `backend/load-test/artillery.config.yml` (NEW)

Top-level config — copy the `config:` block from RESEARCH.md Pattern 1 (lines 201-233), **drop** the inline `scenarios:` (they move to `scenarios/*.yml`).

**Pattern source:** Artillery docs `config.*` — phases/ensure/plugins. RESEARCH.md verified syntax.

**Critical content (from RESEARCH.md lines 223-233):**
```yaml
config:
  target: "{{ $processEnvironment.LOADTEST_TARGET }}"
  phases:
    - { duration: 30,  arrivalRate: 0,    rampTo: 100,  name: "Ramp to 100" }
    - { duration: 120, arrivalRate: 100,                name: "Hold 100" }
    - { duration: 60,                     rampTo: 500,  name: "Ramp to 500" }
    - { duration: 180, arrivalRate: 500,                name: "Hold 500" }
    - { duration: 60,                     rampTo: 1000, name: "Ramp to 1000" }
    - { duration: 900, arrivalRate: 1000,               name: "Hold 1000 — acceptance gate" }
  engines:
    socketio-v3: { query: "transport=websocket" }
  http: { timeout: 10 }
  plugins:
    expect: {}
    metrics-by-endpoint: {}
  ensure:
    p95: 500
    maxErrorRate: 1
  processor: "./processors/auth.js"
```

**Adaptation notes:**
- Use `$processEnvironment.LOADTEST_TARGET` (Artillery var syntax), not a literal URL — avoids hard-coding the Railway URL and keeps the file portable.
- `ensure: p95: 500` is the native Artillery gate; Artillery exits non-zero if breached → CI catches it automatically. **Do not wrap this in a shell script**; trust the engine.
- Smoke variant (`artillery-smoke.yml`) from RESEARCH.md Wave 0 (line 809) uses `duration: 30, arrivalRate: 10` — write a second top-level config that includes the same scenarios but with a tiny phase block.

---

#### `backend/load-test/scenarios/http-only.yml` (NEW)

Copy scenario block from RESEARCH.md Pattern 1 lines 235-256 (verbatim):
```yaml
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
          headers: { cookie: "{{ sessionCookie }}" }
      - think: 2
      - get:
          url: "/emails/{{ $randomNumber(1, 100) }}"
          headers: { cookie: "{{ sessionCookie }}" }
      - think: 5
```

**Adaptation notes:**
- Verify the `/auth/sign-in` endpoint shape against the live better-auth router. Memory entry "API Architecture (2026-03-15)" notes auth is cookie-based (`credentials: 'include'`); the `capture: set-cookie` step matches.
- Pre-seed `loadtest+1` .. `loadtest+1000` users in a dedicated `loadtest-tenant` (RESEARCH.md Pitfall 5 — mandatory isolation).
- Research ID `SCALE-01` defines this scenario; use RESEARCH.md §Validation Architecture as the acceptance spec.

---

#### `backend/load-test/scenarios/socketio.yml` (NEW)

Copy from RESEARCH.md Pattern 1 lines 257-266:
```yaml
scenarios:
  - name: "Socket.IO heartbeat only"
    weight: 20
    engine: socketio-v3
    flow:
      - emit:
          channel: "authenticate"
          data: { token: "{{ $processEnvironment.LOADTEST_TOKEN }}" }
      - think: 60
```

**Adaptation notes:**
- RESEARCH.md §Assumptions A5 flags that `socketio-v3` engine needs a 10-client pre-flight test because PMSync runs `socket.io@4.8.3` (per package.json line 111) — the `v3` engine maps to Socket.IO protocol v4 on the wire, so it **should** work. Verify with the smoke YAML first.
- Fallback: the node harness in RESEARCH.md Example 5 (lines 651-679) — copy that into `backend/load-test/socket-io-harness.mjs` if Artillery's engine falters.

---

#### `backend/load-test/scenarios/ai-chat.yml` (NEW)

**No direct analog in Artillery YAML for SSE** — Artillery's HTTP engine follows 302s but does NOT consume SSE streams; it'll close the connection after `timeout: 10`, which is misleading as a load-test metric because real SSE clients stay open for 30+ seconds.

**Pattern:**
```yaml
scenarios:
  - name: "AI chat — single turn"
    weight: 5   # low weight; SSE is expensive
    flow:
      - post:
          url: "/auth/sign-in"
          json: { email: "loadtest+{{ $randomNumber(1, 100) }}@pmsync.local", password: "{{ $processEnvironment.LOADTEST_PASSWORD }}" }
          capture:
            - header: "set-cookie"
              as: "sessionCookie"
      - post:
          url: "/ai/chat"
          headers: { cookie: "{{ sessionCookie }}" }
          json:
            message: "Summarize my inbox"
          # Note: SSE stream consumed eagerly by Artillery; timeout governs upper bound
          # To measure tokens/sec, use the Node harness in Example 5 style instead.
      - think: 10
```

**Adaptation notes:**
- Memory entry "AI Chat Architecture (2026-03-22)" confirms `POST /ai/chat` is the SSE streaming route. Artillery will POST but not measure token-arrival-rate.
- **Planner should flag this**: if the acceptance gate SCALE-06 cares about AI chat p95, a separate Node SSE harness is needed. For a baseline, this YAML is sufficient — just measures time-to-first-byte and total bytes.
- Weight set to 5 (low) because an open SSE connection at 1000 VUs would blow past Railway's per-process connection cap; SCALE-06 target is HTTP p95, not SSE throughput.

---

#### `backend/load-test/processors/auth.js` (NEW)

**No JS analog in repo** (all code is TypeScript). The closest reference pattern is how `backend/src/common/auth/__tests__/better-auth-flows.spec.ts` exercises the session cookie flow.

**Sketch (no analog — design fresh):**
```javascript
// backend/load-test/processors/auth.js
// Artillery calls processors as CommonJS — plain Node, no TS.
// Exported functions are referenced from YAML via: - function: "fnName"

module.exports = {
  // Rotate through a pre-seeded user pool deterministically
  pickUser(requestParams, context, ee, next) {
    const idx = (context.vars.$uuid || context.$uuid || Math.random() * 1000) | 0;
    context.vars.loadtestEmail = `loadtest+${idx % 1000}@pmsync.local`;
    return next();
  },

  // Redact Set-Cookie before reporting (RESEARCH.md §Security V7)
  redactCookie(requestParams, response, context, ee, next) {
    if (response.headers && response.headers['set-cookie']) {
      response.headers['set-cookie'] = '<redacted>';
    }
    return next();
  },
};
```

**Adaptation notes:**
- Must be plain CommonJS (`module.exports`) — Artillery's processor loader does not run through `ts-node`.
- Keep it stateless: Artillery workers share processor state per-worker but not across CI runs.
- RESEARCH.md §Security Pattern V7 mandates cookie redaction in reports — `redactCookie` is the hook for that.

---

#### `backend/package.json` — new scripts (modify existing `scripts` block)

**Analog: existing scripts block** (lines 8-42 — VERIFIED). The pattern is: each script is one line, using `cross-env` on Windows, outputs to `dist/` or stdout.

**Current relevant scripts** (VERIFIED):
```jsonc
"test": "dotenv-cli -e .env.test -- jest",
"test:cov": "dotenv-cli -e .env.test -- jest --coverage",
"type-check": "tsc --noEmit",
```

**Target additions** (insert alphabetically in `scripts`):
```jsonc
"load-test:smoke": "dotenv-cli -e .env.loadtest -- artillery run load-test/artillery-smoke.yml --output load-test/report-smoke.json",
"load-test:100": "dotenv-cli -e .env.loadtest -- artillery run load-test/artillery-100.yml --output load-test/report-100.json",
"load-test:1000": "dotenv-cli -e .env.loadtest -- artillery run load-test/artillery.config.yml --output load-test/report-1000.json",
"load-test:report": "artillery report load-test/report-1000.json --output load-test/report.html",
"load-test:seed": "ts-node scripts/seed-loadtest-users.ts",
"load-test:cleanup": "ts-node scripts/cleanup-loadtest-users.ts",
```

And under `devDependencies`:
```jsonc
"artillery": "^2.0.30",
```

**Adaptation notes:**
- Use `dotenv-cli` prefix (existing pattern at line 22) — keeps `.env.loadtest` out of shell history.
- `load-test:seed` + `load-test:cleanup` pair addresses RESEARCH.md Pitfall 5 (tenant leak).
- Dockerfile / Railway never install devDeps (line 15 of Dockerfile.railway: `RUN npm prune --omit=dev` — VERIFIED), so Artillery stays dev-only. No prod-footprint impact.

---

#### `docs/load-testing.md` (NEW)

**Analog: `docs/CLAUDE_REFERENCE.md`** — existing long-form reference doc (referenced from CLAUDE.md line 105). Same structure: sections, code blocks, checklists.

**Required sections (from RESEARCH.md §Validation Architecture + §Pitfalls):**
1. Overview + acceptance gate (SCALE-06: p95 < 500ms, RAM < 3 GB)
2. Pre-flight checklist (verify `loadtest-tenant` seeded, `.env.loadtest` set, target URL reachable)
3. Running commands (`npm run load-test:seed`, `load-test:smoke`, `load-test:1000`, `load-test:cleanup`)
4. Reading the report (p95 per-endpoint, RSS gauge vs. heap-used gauge — RESEARCH.md Pitfall 7)
5. Known pitfalls (the 7 from RESEARCH.md §Common Pitfalls that affect load-testing)
6. Rollback procedure (if acceptance gate fails, do NOT split topology — treat as product bug)

---

### Workstream 4 — Railway topology split

#### `backend/railway.http.toml` (NEW)

**Analog: `backend/railway.toml`** (VERIFIED — 13 lines, complete):
```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile.railway"

[deploy]
numReplicas = 2
sleepApplication = false
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 5
startCommand = "node dist/main"
healthcheckPath = "/health/live"
healthcheckTimeout = 120
```

**Target state (RESEARCH.md Pattern 5, lines 471-483):**
```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile.railway"

[deploy]
numReplicas = 2
sleepApplication = false
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 5
startCommand = "node dist/main"          # unchanged from current — but Dockerfile CMD must ALSO be changed, see below
healthcheckPath = "/health/live"          # ALREADY EXISTS — see §Pattern-4c
healthcheckTimeout = 120
```

**Adaptation notes:**
- Env vars are set per-service in Railway UI, not in the TOML. The HTTP service needs `WORKERS_ENABLED=false` (Phase 146 wiring — VERIFIED in `base.worker.ts:204`). Document this in the runbook.
- `startCommand = "node dist/main"` happens to match the current `railway.toml` line 10. **But the Dockerfile CMD (`npx prisma migrate deploy && node dist/main` at line 29) will STILL run `migrate deploy`** on the HTTP service unless the `startCommand` override wins — RESEARCH.md §Assumptions A2 flags this. **Verify the override actually takes effect** before shipping, or add an explicit guard (see `Dockerfile.railway` modification below).

---

#### `backend/railway.worker.toml` (NEW)

**Analog: `backend/railway.toml`**. Target from RESEARCH.md Pattern 5 lines 486-499:
```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile.railway"

[deploy]
numReplicas = 1
sleepApplication = false
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 5
startCommand = "npx prisma migrate deploy && node dist/main"   # THE migrator — exclusive ownership
healthcheckPath = "/health/live"
healthcheckTimeout = 120
```

**Adaptation notes:**
- Single replica for workers (RESEARCH.md §Open Question 5 flags this may bottleneck; planner should prepare to bump to `numReplicas: 2` if Artillery baseline shows queue depth rising).
- `/health/live` works because the worker service still runs the full NestJS process (HTTP module listens; only BullMQ workers are the differentiator via `WORKERS_ENABLED`).
- **Same `startCommand` precedence caveat** as http.toml. If `startCommand` does NOT override CMD, migrations run twice → P2028 race (RESEARCH.md Pitfall 4).

---

#### `backend/Dockerfile.railway` — modify (line 29)

**Current state (VERIFIED — 29 lines):**
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci
RUN npx prisma generate

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json /app/package-lock.json /app/.npmrc ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE ${PORT:-3000}
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]   # line 29 — the problem
```

**Target:** Change line 29 to just:
```dockerfile
CMD ["node", "dist/main"]
```

**Adaptation notes:**
- Removing `migrate deploy` from the Dockerfile makes **ownership of migrations explicit in `railway.worker.toml:startCommand`**. This is RESEARCH.md Pattern 5 Option A (recommended over entrypoint.sh guard-flag Option B).
- Breaking change for anyone who deploys via raw Docker: they must run `npx prisma migrate deploy` manually. Document in the new `docs/infra-runbook.md`.
- **Before shipping this change**: verify in a staging deploy that `railway.worker.toml`'s `startCommand` actually runs migrations (RESEARCH.md §Assumptions A2). If not, revert this line and use Option B (entrypoint.sh guard) instead.

---

#### `backend/entrypoint.sh` — probably LEAVE ALONE

**Current state (VERIFIED — 35 lines):** This script does DB wait + conditional `migrate deploy` + `db push` + seed + `exec npm run start:prod`.

**Key finding:** The Dockerfile CMD (line 29) does NOT invoke `entrypoint.sh`. It calls `sh -c "npx prisma migrate deploy && node dist/main"` directly. **`entrypoint.sh` is effectively dead code in Railway production** — likely used only by `docker-compose` for local dev (line 35 `exec npm run start:prod`).

**Adaptation notes:**
- **Do NOT edit this file unless you also verify where it's invoked.** `grep -rn "entrypoint.sh" backend/` + check `docker-compose.yml` at repo root.
- RESEARCH.md file-list said "refactor to conditionally skip migrations based on env flag" — that's Option B from Pattern 5, which RESEARCH.md explicitly rejected in favor of Option A (Dockerfile + TOML startCommand). **Strike the entrypoint.sh modification from the plan** unless the planner confirms the script is actually invoked in Railway production.
- If planner discovers entrypoint.sh IS invoked (via a Railway `nixpacks`-style build ignored the Dockerfile CMD), a 5-line guard around line 22-23 is sufficient:
  ```bash
  if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
    echo "Applying Prisma migrations..."
    npx prisma migrate deploy
  fi
  ```

---

#### `backend/src/modules/health/controllers/worker-health.controller.ts` — DO NOT CREATE; already exists as `/health/live`

**Analog / Existing file: `backend/src/modules/health/controllers/health.controller.ts`** (VERIFIED lines 44-49):
```typescript
/**
 * Liveness probe
 */
@Get('live')
@ApiOperation({ summary: 'Liveness probe', description: 'Kubernetes liveness probe' })
@ApiResponse({ status: 200, description: 'Service is alive' })
async getLiveness() {
  return { status: 'alive' };
}
```

**Also already present:** worker-specific health at `/health/workers` (lines 79-95 — VERIFIED):
```typescript
@Get('workers')
async getWorkerHealth() {
  const workers = BaseWorker.getAll();
  const statuses = workers.map((w) => w.getStatus());
  // ... returns { status, totalWorkers, totalErrors5m, autoPausedCount, workers }
}
```

**Adaptation notes:**
- **Do not create a new controller.** The class `HealthController` is `@Public()` at line 10 (VERIFIED), has `/health/live` for the Kubernetes/Railway liveness probe, and has `/health/workers` that already reports worker-specific status.
- The worker service just needs to boot the `HealthModule` (already does — it's part of `AppModule`). No backend code change is required for `/health/live` to be available on the worker replica.
- If the planner wants to differentiate "HTTP-healthy" vs. "workers-healthy" in the probe response, extend the existing `getLiveness()` — do NOT add a new controller. But RESEARCH.md §Open Question 3 flags that plain 200 is sufficient for Railway; don't over-engineer.
- **Strike this file from the plan's "create" list. Move it to "no change needed".**

---

#### `docs/infra-runbook.md` (NEW)

**No analog** — no `docs/ops/` folder exists. Closest precedent: `docs/CLAUDE_REFERENCE.md` (style reference from CLAUDE.md:105). Structure should follow the same section-heavy pattern.

**Required sections (from RESEARCH.md §Architecture + §Wave 0 Gaps line 815):**
1. Topology overview (ASCII diagram from RESEARCH.md lines 138-184)
2. Environment variables per service (HTTP: `WORKERS_ENABLED=false`; Worker: `WORKERS_ENABLED=true`)
3. Deploy order (worker first → wait for migration log → deploy HTTP — RESEARCH.md Pattern 5 Risk note)
4. Rollback procedure (revert to single `railway.toml`, delete `railway.http.toml` + `railway.worker.toml`, redeploy)
5. Health endpoints and expected responses (`GET /health/live` → `{"status":"alive"}`)
6. Updating the entry in `C:\Users\Davide\.claude\projects\d--MailAgent\memory\MEMORY.md` — the **"Railway Postgres Config (2026-03-20)"** and **"Database Hosting"** memory entries need a pointer to this new runbook

---

## Shared Patterns

### Shared Pattern A — `OAuth2Client` construction (Workstream 1)

**Source:** `backend/src/modules/providers/services/google-oauth.service.ts:31` (VERIFIED) — already uses the correct pattern today.
**Apply to:** All 16 googleapis files — standardize on this import.
```typescript
import { OAuth2Client } from 'google-auth-library';
// ...
const oauth2Client = new OAuth2Client();                 // no-arg for token-only flows
oauth2Client.setCredentials({ access_token: token });
```
Two files still use `new google.auth.OAuth2()` (VERIFIED: `google.driver.ts:106`, `email-fetch.service.ts:136`) — both should switch to the canonical pattern in this phase.

### Shared Pattern B — NestJS unit-spec scaffold (Workstream 2)

**Source:** `backend/src/modules/subscription/services/__tests__/usage-tracking.service.spec.ts:16-52` (VERIFIED).
**Apply to:** `attachment-metrics.service.spec.ts` (new).
```typescript
describe('ServiceName', () => {
  let service: ServiceName;
  beforeEach(() => {
    service = new ServiceName(/* mocks */);   // no TestingModule — plain new
  });
  // ... tests assert internal state via public getters + (service as any).privateField for LRU size
});
```
Convention: `.spec.ts` co-located under `__tests__/` sibling to the service file.

### Shared Pattern C — `railway.toml` structure (Workstream 4)

**Source:** `backend/railway.toml` (VERIFIED — 13 lines, 2 sections: `[build]` + `[deploy]`). Both new TOMLs are clones with 2 lines changed (numReplicas, startCommand).

### Shared Pattern D — `@Public()` health endpoint (Workstream 4)

**Source:** `backend/src/modules/health/controllers/health.controller.ts:10-18` (VERIFIED). `@Public()` from `common/auth/public.decorator` + `@ApiTags('Health')` + per-method `@ApiOperation`. Already covers all Workstream 4 probe needs — no new code.

## No Analog Found

| File | Role | Data Flow | Reason | Action for Planner |
|---|---|---|---|---|
| `backend/load-test/artillery.config.yml` | infra | load-gen | Artillery has never been used in this repo | Copy RESEARCH.md Pattern 1 YAML verbatim; it's already design-complete |
| `backend/load-test/scenarios/*.yml` (3 files) | infra | load-gen | Same as above | Split RESEARCH.md Pattern 1 scenarios across files |
| `backend/load-test/processors/auth.js` | load-gen helper | n/a | Artillery processors are CommonJS; no CJS in this TS-only backend | Design fresh from Artillery docs; RESEARCH.md §Security V7 gives the security requirements |
| `docs/infra-runbook.md` | doc | n/a | No `docs/ops/` folder exists | Use RESEARCH.md §Architecture + §Pattern 5 as structure skeleton |

## Metadata

**Analog search scope:**
- `backend/src/modules/email/` (attachment-metrics, email-fetch, gmail-sync-back, attachment-on-demand)
- `backend/src/modules/email-sync/drivers/google/` (driver + 3 sub-services)
- `backend/src/modules/email-sync/drivers/microsoft/` (TtlMap analog)
- `backend/src/modules/email-sync/services/gmail/` + `gmail-webhook`
- `backend/src/modules/providers/services/` (google-oauth, gmail-client-manager)
- `backend/src/modules/calendar/services/` (4 googleapis files)
- `backend/src/modules/contacts/services/` (google-contacts-sync)
- `backend/src/modules/health/` (controllers + services)
- `backend/src/modules/subscription/services/__tests__/` (test pattern)
- `backend/src/modules/contacts/services/__tests__/` (test pattern — contacts-cache)
- `backend/*.toml`, `backend/Dockerfile.railway`, `backend/entrypoint.sh`, `backend/package.json`

**Files scanned:** ~40 via Grep + 12 full Reads (Reads: CLAUDE.md, RESEARCH.md, ROADMAP.md, microsoft.driver.ts, attachment-metrics.service.ts, railway.toml, Dockerfile.railway, entrypoint.sh, health.controller.ts, email-fetch.service.ts, google.driver.ts, google-oauth.service.ts, google-contacts-sync.service.ts, gmail-message.service.ts, gmail-client-manager.service.ts, contacts-cache.service.spec.ts, health.service.spec.ts, usage-tracking.service.spec.ts, contacts-webhook-stats.unit.spec.ts, package.json, nestjs-best-practices/SKILL.md).

**Verification:**
- Every code excerpt above has a line-number citation to its source file.
- Every "ALREADY EXISTS" claim was verified by `Read` (not inferred from the research document).
- Research file-list corrections (4 items at the top of this doc) are based on direct grep/glob evidence, not speculation.

**Pattern extraction date:** 2026-04-18

**Valid until:** 2026-05-18 (aligned with RESEARCH.md's validity window — npm versions and file paths change).
