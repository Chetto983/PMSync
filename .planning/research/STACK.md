# Technology Stack

**Project:** PMSync v9.0 -- AI Intelligence & Platform Hardening
**Researched:** 2026-03-24
**Overall confidence:** HIGH

## Executive Decision

**No new npm packages required.** Every capability needed for v9.0 is achievable with already-installed dependencies. This is the ideal outcome for a brownfield project -- zero dependency surface increase.

## What Is Already Installed (DO NOT ADD)

| Package | Version | Used For in v9.0 |
|---------|---------|------------------|
| `web-push` | ^3.6.7 | Push notification dispatch (installed v8.0, unused) |
| `@types/web-push` | ^3.6.4 | TypeScript types for web-push |
| `@nestjs/throttler` | ^6.5.0 | Tiered rate limiting (already configured with named throttlers) |
| `ai` (AI SDK) | ^6.0.49 | HITL approval via `needsApproval` on tool definitions |
| `@ai-sdk/react` | (installed) | Frontend `addToolApprovalResponse` for HITL UX |
| `ioredis` | ^5.9.2 | Redis-backed throttler storage (already implemented) |
| `bullmq` | ^5.67.1 | Entity graph nightly refresh job |
| `@nestjs/schedule` | ^6.1.0 | Cron scheduling for graph refresh |
| `eventemitter2` (via `@nestjs/event-emitter`) | (installed) | Domain events for push notification triggers |
| `prisma` | ^7.3.0 | EntityGraph model, AIMemory anchoring fields |
| `pgvector` (via Prisma) | (installed) | Existing hybrid search, unchanged |
| `prom-client` | (installed) | Metrics for push delivery, throttle hits |
| `tokenlens` | ^1.3.1 | Token counting for context assembly budget |

## Feature-by-Feature Stack Analysis

### 1. Push Notification Backend Dispatch

**What exists:**
- `web-push` ^3.6.7 installed but never imported in backend code
- `PushSubscription` Prisma model with multi-tenant upsert
- `PushService` with subscribe/unsubscribe methods only
- Frontend: Serwist SW handlers for `push` and `notificationclick` events
- Frontend: VAPID subscription UI with browser support gating

**What to build (no new packages):**
- `PushDispatchService` -- wraps `web-push.sendNotification()` with VAPID config from env vars
- Event listeners on `EventEmitter2` for trigger events (new email, HITL pending, calendar reminder)
- `NotificationPreferencesService` -- per-user opt-in/out by category (stored in existing User model or new Prisma field)
- Dead subscription cleanup -- handle 410 Gone responses from push services
- BullMQ job for batched/delayed push dispatch (avoid spam on bulk email sync)

**Why no new packages:**
- `web-push` handles VAPID signing, payload encryption, and HTTP/2 dispatch to push services. It is the standard Node.js library for Web Push Protocol (RFC 8030). Nothing else needed.
- `EventEmitter2` (already global) provides the event bus for trigger routing.
- `BullMQ` (already global) handles async dispatch with retry.

**Environment variables needed:**
```
VAPID_PUBLIC_KEY=    # Already exists (frontend uses it)
VAPID_PRIVATE_KEY=   # Needs adding to backend .env
VAPID_SUBJECT=mailto:admin@pmsync.local
```

**Confidence:** HIGH -- web-push is the de facto standard, already installed, well-documented API.

---

### 2. Tiered Write-Rate Limiting

**What exists:**
- `@nestjs/throttler` ^6.5.0 with named throttlers (`short`: 300/min, `write`: 30/min)
- `RedisThrottlerStorage` -- Lua-script-based atomic increment with blocking
- `UserThrottlerGuard` -- tracks by userId (auth'd) or IP (anon)
- Per-route `@Throttle()` overrides on email send/reply/forward (10/min)
- `@SkipThrottle()` on health, metrics, webhooks

**What to build (no new packages):**
- Add more named throttlers in `ThrottlerModule.forRoot()` for granular tiers:
  - `auth`: 5/min (login, register, password reset -- anti-brute-force)
  - `ai`: 20/min (AI chat streaming -- expensive operations)
  - `bulk`: 50/min (bulk email actions, label operations)
  - Keep `short` (300/min read) and `write` (30/min general write)
- Apply `@Throttle({ ai: { limit: 20, ttl: 60000 } })` to AI chat controller
- Apply `@Throttle({ auth: { limit: 5, ttl: 60000 } })` to auth endpoints
- Apply `@Throttle({ bulk: { limit: 50, ttl: 60000 } })` to bulk action endpoints

**Why `@nestjs/throttler` v6 is sufficient:**
- Named throttlers already work (proven in codebase with `short` and `write`)
- Per-route `@Throttle()` decorator overrides global config per throttler name
- Redis storage already distributes across replicas
- `@SkipThrottle({ write: true })` selectively disables specific tiers per route
- No need for external rate limiting (nginx, Cloudflare) -- app-level is correct for user-based tracking

**Confidence:** HIGH -- already working in production, just needs more named tiers.

---

### 3. Explicit HITL Approval Routing

**What exists:**
- Tool registry with `requiresApproval: boolean` and `riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'` metadata
- HITL contract tests verifying HIGH-risk tools require approval
- `HitlApprovalWrapper` frontend component
- AI SDK v6 `tool()` definitions in tool service files
- Inconsistent enforcement: some mutating tools bypass approval (noted in `docs/technical_overview.md`)

**What to build (no new packages):**
- Use AI SDK v6 native `needsApproval` property on tool definitions:
  ```typescript
  tool({
    description: '...',
    parameters: z.object({...}),
    needsApproval: true, // or async (args) => args.permanent === true
    execute: async (args, { tenantId }) => { ... }
  })
  ```
- Dynamic approval logic: `needsApproval: async (args) => isDestructive(args)` for conditional gates
- Frontend: `addToolApprovalResponse(toolCallId, approved)` via `@ai-sdk/react` `useChat`
- Map tool registry `requiresApproval` metadata to AI SDK `needsApproval` at tool registration time
- Audit every tool's `riskLevel` and ensure HIGH-risk tools have `needsApproval: true`

**Why AI SDK v6 native HITL is the right approach:**
- Already installed (`ai` ^6.0.49)
- `needsApproval` pauses the tool loop agent automatically -- no custom state machine
- Frontend gets `approval-requested` tool part state natively
- Denial message forwarded to model so it can respond appropriately
- Memory reference confirms this pattern: `memory/reference_ai_sdk_hitl.md`

**What NOT to do:**
- Do NOT build custom approval queue/polling (AI SDK handles this in-stream)
- Do NOT add WebSocket channels for approval (SSE stream already carries tool states)
- Do NOT add a separate approval database table (approval state lives in message stream)

**Confidence:** HIGH -- AI SDK v6 docs explicit, memory reference confirms pattern, existing code partially implements.

---

### 4. Graph RAG Pipeline

**What exists:**
- Hybrid search: pgvector HNSW + tsvector FTS with RRF (k=60) in SQL functions
- `HybridSearchService` with `hybrid_email_search` SQL function
- `RerankingService` already created (heuristic reranking pass)
- 31 tools registered via `ToolRegistryModule` with domain/risk metadata
- `AIMemory` Prisma model for memory storage
- Full 8-step plan in `rosy-imagining-starlight.md`

**What to build (no new packages):**

All 8 Graph RAG steps use only PostgreSQL + Prisma + existing NestJS patterns:

| Step | New Service | Dependencies Used |
|------|------------|-------------------|
| 1. Query Router | `QueryRouterService` | Pure TypeScript (regex + keyword scoring) |
| 2. Reranking | `RerankingService` (exists) | Heuristic scoring on RRF results |
| 3. Graph Expansion | `GraphExpansionService` | 3 parallel SQL queries via Prisma |
| 4. Context Assembly | `ContextAssemblerService` | `tokenlens` (installed) for token counting |
| 5. Entity Graph | `EntityGraphService` + migration | New `entity_graph` Prisma model, BullMQ nightly job |
| 6. Memory Anchoring | Migration + tool update | Add `emailId`/`contactId` FKs to `AIMemory` |
| 7. Tool Consolidation | Modify `rag-tools.service.ts` | Merge search tools, no new deps |
| 8. Few-Shot Examples | Modify `system-prompt.ts` | ~40 lines of prompt text |

**Why no graph database (Neo4j, etc.):**
- The entity graph is a simple adjacency list (source, target, edge_type, weight)
- PostgreSQL handles this with indexed FK lookups in <20ms
- Data volume is modest (10K-100K emails per tenant, not billions of nodes)
- Adding Neo4j would mean: new infra, new connection management, new deployment config, data sync
- The plan explicitly states "All PostgreSQL -- no new dependencies"

**Why not mem0:**
- mem0 is a standalone graph memory service designed for single-agent scenarios
- PMSync is multi-tenant with existing Prisma-managed memory table
- Adopting mem0 would require: separate process, separate database, migration of AIMemory data
- The memory anchoring approach (Step 6) achieves the same entity-linked recall within Prisma

**Confidence:** HIGH -- plan fully specified, all infrastructure exists, pure PostgreSQL approach validated.

---

## Alternatives Considered and Rejected

| Category | Considered | Why Rejected |
|----------|-----------|--------------|
| Push dispatch | Firebase Cloud Messaging (FCM) | web-push already installed; FCM adds Google dependency and complexity for a feature that only needs Web Push Protocol |
| Push dispatch | OneSignal / Pushover | Third-party SaaS dependency; web-push is self-hosted and sufficient |
| Rate limiting | `express-rate-limit` | Already have `@nestjs/throttler` with Redis storage; adding another would create two competing systems |
| Rate limiting | Cloudflare Rate Limiting | App-level user-based tracking needed; Cloudflare only sees IP |
| HITL | Custom approval queue + WebSocket | AI SDK v6 `needsApproval` handles this natively in the streaming protocol |
| HITL | Separate approval database table | Approval state is transient (per-stream), not persistent; DB table is overengineering |
| Graph RAG | Neo4j / ArangoDB | Overkill for adjacency-list entity graph; adds deployment complexity for modest data volume |
| Graph RAG | LangChain / LlamaIndex | Python ecosystem; project is TypeScript-only; AI SDK v6 covers all needs |
| Graph RAG | mem0 | Separate process; multi-tenant mismatch; Prisma-native anchoring is simpler |
| Reranking | Cohere Rerank API | External API call adds latency and cost; heuristic reranking is sufficient for email domain |

## Schema Changes Required (Prisma, no new packages)

```prisma
// New model for Step 5: Entity Graph
model EntityGraph {
  id           String   @id @default(cuid())
  tenantId     String
  sourceType   String   // 'email' | 'contact' | 'calendar_event'
  sourceId     String
  targetType   String
  targetId     String
  edgeType     String   // 'email_sender' | 'co_thread' | 'co_attendee' | etc.
  weight       Float    @default(1.0)
  lastSeenAt   DateTime
  createdAt    DateTime @default(now())

  @@unique([tenantId, sourceType, sourceId, targetType, targetId, edgeType])
  @@index([tenantId, sourceType, sourceId])
  @@index([tenantId, targetType, targetId])
}

// Modified model for Step 6: Memory Anchoring
model AIMemory {
  // ... existing fields ...
  emailId    String?  // FK to Email (nullable)
  contactId  String?  // FK to Contact (nullable)

  @@index([tenantId, emailId])
  @@index([tenantId, contactId])
}
```

## Environment Variables (New)

```bash
# Push notifications (backend dispatch)
VAPID_PRIVATE_KEY=       # Base64-encoded ECDSA private key
VAPID_SUBJECT=mailto:admin@pmsync.local  # Contact URI for push service
# VAPID_PUBLIC_KEY already exists in frontend config
```

## What NOT to Add

| Package | Why Not |
|---------|---------|
| `firebase-admin` | web-push covers Web Push Protocol without Google lock-in |
| `@langchain/*` | Python-centric ecosystem; AI SDK v6 is the TypeScript standard |
| `neo4j-driver` | PostgreSQL adjacency list sufficient for email-scale graph |
| `mem0` | Multi-tenant incompatible; Prisma-native anchoring simpler |
| `express-rate-limit` | Conflicts with existing @nestjs/throttler |
| `@cohere-ai/cohere` | External reranking API unnecessary; heuristic reranking sufficient |
| `graphql` | REST API pattern established; no benefit for these features |
| Any embedding model package | pgvector + Mistral embeddings already working |

## Installation

```bash
# Nothing to install. All packages already present.
# Verify with:
cd backend && node -e "require('web-push'); console.log('web-push OK')"
```

## Sources

- [@nestjs/throttler npm](https://www.npmjs.com/package/@nestjs/throttler) -- v6.5.0 named throttlers, per-route `@Throttle()` (HIGH confidence)
- [AI SDK v6 Tool Execution Approval](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) -- `needsApproval` property (HIGH confidence)
- [AI SDK HITL Cookbook](https://ai-sdk.dev/cookbook/next/human-in-the-loop) -- Frontend approval flow (HIGH confidence)
- [web-push npm](https://www.npmjs.com/package/web-push) -- v3.6.7 sendNotification API (HIGH confidence)
- [web-push GitHub](https://github.com/web-push-libs/web-push) -- VAPID configuration, payload encryption (HIGH confidence)
- Graph RAG plan: `C:\Users\Davide\.claude\plans\rosy-imagining-starlight.md` -- Full 8-step implementation (HIGH confidence, project-internal)
- Existing codebase analysis (HIGH confidence, verified by reading source files)
