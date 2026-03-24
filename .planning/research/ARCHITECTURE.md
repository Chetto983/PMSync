# Architecture Patterns

**Domain:** AI email client -- v9.0 integration of push dispatch, tiered rate limiting, HITL approval routing, Graph RAG
**Researched:** 2026-03-24
**Confidence:** HIGH (all recommendations derive from reading existing codebase, not external sources)

## Scope

This document covers how four new feature areas integrate into the existing PMSync architecture. It does NOT cover the existing architecture exhaustively -- see `.planning/codebase/ARCHITECTURE.md` for that. Focus is on integration points, new components, modified components, and data flow changes.

---

## 1. Push Notification Backend Dispatch

### Current State

- `PushModule` exists with `PushService` (subscribe/unsubscribe only) and `PushController` (POST/DELETE `/push/subscribe`)
- `PushSubscription` Prisma model: `{id, tenantId, userId, endpoint, p256dh, auth, userAgent}` with `@@unique([tenantId, endpoint])`
- `web-push` npm package installed but never imported at runtime
- Frontend has VAPID subscription UI, SW push/notificationclick handlers (v8.0 PUSH-01..04)
- `RealtimeEventsService` handles WebSocket event emission with tenant-scoped rooms, buffering, deduplication
- No push dispatch logic exists anywhere in backend

### Integration Architecture

```
EventEmitter2 domain events
    |
    v
PushDispatchListener (@OnEvent)      <-- NEW
    |
    +-- filters by event type (new_email, follow_up_reminder, ai_action_complete)
    +-- loads user push preferences (per-category opt-in)
    +-- loads PushSubscription records for target user(s)
    |
    v
PushDispatchService                  <-- NEW
    |
    +-- builds notification payload (title, body, icon, action URL, tag)
    +-- calls web-push.sendNotification() per subscription
    +-- handles 410 Gone (auto-delete expired subscriptions)
    +-- handles 429 (exponential backoff via BullMQ delayed job)
    +-- Prometheus counter: push_notifications_sent_total{status,event_type}
    |
    v
web-push library (RFC 8291 encryption)
```

### Component Boundaries

| Component | Location | Responsibility | New/Modified |
|-----------|----------|---------------|--------------|
| `PushDispatchService` | `backend/src/modules/push/push-dispatch.service.ts` | Build payloads, send via web-push, handle errors, prune stale subscriptions | **NEW** |
| `PushDispatchListener` | `backend/src/modules/push/push-dispatch.listener.ts` | Listen to domain events, resolve target users, check preferences, delegate to dispatch | **NEW** |
| `PushPreferenceService` | `backend/src/modules/push/push-preference.service.ts` | CRUD for per-user notification preferences (which categories enabled) | **NEW** |
| `PushPreference` | `backend/prisma/schema.prisma` | New model: `{tenantId, userId, category, enabled}` | **NEW** |
| `PushService` | `backend/src/modules/push/push.service.ts` | Add `getSubscriptionsByUser(tenantId, userId)` and `pruneExpired(endpoint)` | **MODIFIED** |
| `PushModule` | `backend/src/modules/push/push.module.ts` | Import EventEmitterModule, register listener, export dispatch service | **MODIFIED** |
| `PushController` | `backend/src/modules/push/push.controller.ts` | Add GET/PATCH `/push/preferences` endpoints | **MODIFIED** |

### Event Trigger Points

These existing domain events should trigger push notifications:

| Event | Source | Push Category | Notification Content |
|-------|--------|--------------|---------------------|
| `email:new` | `RealtimeEventsService.emitEmailEvent()` | `new_email` | "New email from {sender}: {subject}" |
| `followup:reminder` | `ReminderSchedulerService` | `follow_up` | "Follow-up due: {subject}" |
| `ai:action_complete` | `AiChatService.onStepFinish` | `ai_action` | "AI completed: {toolName}" |
| `calendar:reminder` | `CalendarModule` cron | `calendar` | "Upcoming: {event title} in {time}" |

### Key Design Decisions

1. **Event-driven, not controller-driven.** Push dispatch listens to `EventEmitter2` events -- the same events that drive WebSocket updates. This avoids duplicating trigger logic across HTTP controllers.

2. **Fire-and-forget with BullMQ fallback.** Normal sends are synchronous (web-push is fast, ~50ms). Failed sends with 429 status retry via a BullMQ delayed job. No new queue -- reuse the existing Redis/BullMQ infrastructure.

3. **Prune on 410 Gone.** When a push endpoint returns HTTP 410, the subscription is stale (user revoked permission or browser unregistered). Auto-delete from `PushSubscription` table. This is the standard web-push pattern.

4. **Tag-based deduplication in SW.** Push payloads include a `tag` field (e.g., `email:{emailId}`). The browser's service worker replaces existing notifications with the same tag, preventing notification floods during bulk sync.

### Data Flow

```
1. Email arrives via sync -> EmailSyncModule persists -> emits 'email:new' event
2. RealtimeEventsService handles it (WebSocket broadcast, unchanged)
3. PushDispatchListener ALSO handles 'email:new' event (new)
4. Listener checks PushPreference for target userId + category 'new_email'
5. If enabled, loads PushSubscription records for userId
6. PushDispatchService builds payload, calls web-push.sendNotification()
7. Success -> Prometheus counter. 410 -> prune. 429 -> BullMQ retry.
```

---

## 2. Tiered Write-Rate Limiting

### Current State

- `ThrottlerModule` configured globally with two named tiers: `short` (300/min read) and `write` (30/min write)
- Per-endpoint `@Throttle()` decorators on ~18 controller methods with custom limits
- `RedisRateLimiterService` provides distributed rate limiting via Lua scripts (used for AI chat: 30 req/60s per user)
- `UserThrottlerGuard` extends NestJS ThrottlerGuard for per-user (not per-IP) limiting
- The flat 30/min write limit was identified as "cause of user-reported 429s" (v7.0 decision, marked for revisit)

### Integration Architecture

The existing `@Throttle()` system is the right mechanism. No new services needed -- just reconfigure the decorator limits per endpoint category.

```
Tier Definitions (in ThrottlerModule.forRoot):
  read:    300/min  (default, most GET endpoints)
  write:   60/min   (general mutations: PATCH, POST that create data)
  send:    10/min   (email sending, external API calls)
  delete:  20/min   (destructive operations)
  ai:      30/min   (AI chat, separate from HTTP throttler -- uses RedisRateLimiterService)
```

### Component Boundaries

| Component | Location | Responsibility | New/Modified |
|-----------|----------|---------------|--------------|
| `AppModule` | `backend/src/app.module.ts` | Expand `ThrottlerModule.forRoot` with 4 named tiers | **MODIFIED** |
| `UserThrottlerGuard` | `backend/src/common/guards/user-throttler.guard.ts` | No changes needed -- already supports named throttlers | **UNCHANGED** |
| Controller decorators | Various `*.controller.ts` | Replace `@Throttle({ default: ... })` with named tier references | **MODIFIED** (many files) |
| `RedisRateLimiterService` | `backend/src/common/services/redis-rate-limiter.service.ts` | No changes -- AI chat rate limiting is separate and correct | **UNCHANGED** |

### Tier Assignment

| Tier | Limit | Endpoints |
|------|-------|-----------|
| `read` | 300/min | GET endpoints (emails list, contacts list, calendar, folders, conversations) |
| `write` | 60/min | POST/PATCH (create contact, update event, label email, star, mark read) |
| `send` | 10/min | POST /emails/send, POST /emails/forward, POST /emails/reply |
| `delete` | 20/min | DELETE endpoints (emails, contacts, events, folders, conversations) |
| `ai` | 30/min | Handled by `RedisRateLimiterService` in `AiChatService`, not ThrottlerModule |

### Key Design Decisions

1. **Named tiers in ThrottlerModule, not a custom service.** `@nestjs/throttler` already supports multiple named throttlers. The existing `@Throttle()` decorators already use this pattern. Adding tiers is a configuration change, not an architectural one.

2. **Keep AI chat rate limiting separate.** The AI chat limit lives in `AiChatService.prepareChatAgent()` via `RedisRateLimiterService` because it needs per-user distributed limiting (not per-IP). This is correct and should not change. The ThrottlerModule handles HTTP-level limiting.

3. **Raise the write limit from 30 to 60.** The flat 30/min write limit caused user-reported 429s (documented in v7.0). Analysis: labeling 5 emails, starring 3, archiving 2 = 10 write ops in seconds. 30/min is too aggressive. 60/min accommodates power-user bursts while still preventing abuse.

4. **Separate send tier.** Email sending has external side effects (SMTP delivery) and cost implications. A dedicated 10/min tier prevents AI chat from accidentally spam-sending through tool calls.

---

## 3. Explicit HITL Approval Routing

### Current State

- AI SDK v6 `needsApproval: true` on `tool()` definitions for 6 HIGH-risk tools: `send_email`, `delete_email`, `forward_email`, `reply_email`, `delete_event`, `delete_contact`
- ToolRegistry tracks `requiresApproval` and `riskLevel` metadata for all 31 tools
- Frontend `assistant-ui` handles tool approval inline via AI SDK `ToolInvocation` state machine (`partial` -> approved/rejected by user)
- Old HitlController/HitlService were deleted (AICP-01, AICP-02) -- all HITL is SDK-native
- HITL re-submit works via `clientMessages` in `ChatRequestDto` -> `convertToModelMessages()` in `AiChatService`
- Problem: MEDIUM-risk tools (create_event, update_event, create_contact, update_contact, draft_email, save_memory) do NOT require approval, despite having side effects

### What "Explicit HITL Approval Routing" Means

The goal is NOT to replace the AI SDK native HITL mechanism (which works). The goal is:

1. **Expand the approval gate** to cover all mutating tools, not just HIGH-risk ones
2. **Add a "destructive action" confirmation UI** that shows exactly what will change before the user approves
3. **Allow per-user HITL preference** (some users want approval for ALL mutations, others only for HIGH-risk)

### Integration Architecture

```
Tool Definition (tool-services)
    |
    +-- riskLevel: HIGH -> needsApproval: true (always)
    +-- riskLevel: MEDIUM -> needsApproval: configurable per user
    +-- riskLevel: LOW -> needsApproval: false (always)
    |
    v
AiChatService.createToolSet()
    |
    +-- loads user HITL preference (from new UserAiPreference model)
    +-- wraps MEDIUM-risk tool() calls: sets needsApproval dynamically
    |
    v
AI SDK ToolLoopAgent
    |
    +-- tool call with needsApproval -> pauses, emits tool-approval-request
    +-- frontend shows approval UI with structured diff
    +-- user approves/rejects -> re-submit with clientMessages
```

### Component Boundaries

| Component | Location | Responsibility | New/Modified |
|-----------|----------|---------------|--------------|
| `UserAiPreference` | `backend/prisma/schema.prisma` | New model: `{tenantId, userId, hitlLevel: 'HIGH_ONLY' \| 'ALL_MUTATIONS' \| 'NONE'}` | **NEW** |
| `AiPreferenceService` | `backend/src/modules/ai-chat/services/ai-preference.service.ts` | CRUD for user AI preferences, cached in Redis (5min TTL) | **NEW** |
| `AiChatService.createToolSet()` | `backend/src/modules/ai-chat/services/ai-chat.service.ts` | Load HITL preference, set `needsApproval` dynamically on MEDIUM-risk tools | **MODIFIED** |
| Tool services | `backend/src/modules/ai-chat/tools/*.service.ts` | No changes -- `needsApproval` is already on HIGH-risk tools | **UNCHANGED** |
| Frontend approval renderer | `frontend/src/components/ai-elements/tool-renderers/` | Enhanced approval UI showing structured diff of what will change | **MODIFIED** |
| Settings page | `frontend/pages/settings/` | New "AI Safety" section for HITL preference toggle | **MODIFIED** |

### Key Design Decisions

1. **Dynamic `needsApproval` via wrapper, not tool redefinition.** The AI SDK `tool()` accepts `needsApproval` at definition time. For MEDIUM-risk tools where approval depends on user preference, wrap the tool definition in `createToolSet()` to conditionally set `needsApproval: true`. This avoids duplicating tool definitions.

2. **Three HITL levels, not a per-tool toggle.** Per-tool configuration creates UX complexity (31 toggles). Three levels cover the actual use cases:
   - `HIGH_ONLY` (default): Only irreversible actions need approval (current behavior)
   - `ALL_MUTATIONS`: Every MEDIUM and HIGH tool needs approval (cautious users)
   - `NONE`: Skip all approval gates (power users who trust the AI)

3. **`NONE` mode still logs to audit trail.** Even without approval, all tool executions are logged via `AuditService.logToolExecution()` (already exists). This satisfies compliance without blocking workflow.

4. **Structured diff in approval UI.** Instead of "AI wants to call send_email. Allow?", show: "Send email to john@example.com, Subject: 'Budget update', Body: [preview]. Allow?" This is a frontend enhancement to the existing `FallbackToolRenderer` -- render the tool's input schema as a readable summary.

### Data Flow (MEDIUM-risk tool with ALL_MUTATIONS preference)

```
1. User sends message "Create a meeting with John tomorrow at 3pm"
2. AiChatService.createToolSet() loads preference -> ALL_MUTATIONS
3. create_event tool is wrapped with needsApproval: true (normally false)
4. ToolLoopAgent calls create_event -> pauses, emits approval request
5. Frontend shows: "Create event: 'Meeting with John', Tomorrow 3:00 PM. Allow?"
6. User clicks Approve
7. Frontend re-submits with approval response in clientMessages
8. AiChatService.prepareChatAgent() detects HITL re-submit
9. convertToModelMessages() processes approval, tool executes
10. Event created, result streamed back
```

---

## 4. Graph RAG Pipeline

### Current State (Steps 1-3 implemented)

The Graph RAG plan from the project memory outlines 8 steps. Steps 1-3 are already implemented:

| Step | Status | Component | What It Does |
|------|--------|-----------|-------------|
| 1. Query Router | DONE | `QueryRouterService` | Classifies queries as simple/search/multi_hop, excludes tool domains on step 0 |
| 2. Reranking | DONE | `RerankingService` | Post-RRF heuristic scoring: recency decay, thread coherence, priority boost, keyword match |
| 3. Graph Expansion | DONE | `GraphExpansionService` | Expands seed email results via thread siblings, sender->contact, sender->calendar attendee |
| 4. Context Assembly | NOT STARTED | -- | Assemble expanded results into structured LLM context |
| 5. Entity Graph | NOT STARTED | -- | Persistent entity-relationship graph in PostgreSQL |
| 6. Memory Anchoring | NOT STARTED | -- | Link memories to entities for contextual recall |
| 7. Tool Consolidation | NOT STARTED | -- | Merge semantic_search + graph_context_search into unified retrieval |
| 8. Few-shot Examples | NOT STARTED | -- | Dynamic few-shot injection based on query type |

### Remaining Steps Architecture

#### Step 4: Context Assembly Service

```
GraphExpansionService output
    |
    v
ContextAssemblyService                    <-- NEW
    |
    +-- Deduplicates across seed results and expansion
    +-- Formats into structured sections (Emails, Contacts, Calendar, Memories)
    +-- Truncates to token budget (e.g., 4000 tokens for context)
    +-- Prioritizes by reranked score
    |
    v
Injected as tool result in graph_context_search
```

| Component | Location | New/Modified |
|-----------|----------|--------------|
| `ContextAssemblyService` | `backend/src/modules/ai-chat/services/context-assembly.service.ts` | **NEW** |
| `RagToolsService.buildGraphContextSearch()` | `backend/src/modules/ai-chat/tools/rag-tools.service.ts` | **MODIFIED** -- use ContextAssemblyService for formatting |

#### Step 5: Entity Graph

```
Prisma Schema additions:
  EntityNode { id, tenantId, type, name, metadata, embedding, createdAt }
  EntityEdge { id, tenantId, sourceId, targetId, relationship, weight, metadata, createdAt }

  Types: PERSON, ORGANIZATION, PROJECT, TOPIC
  Relationships: SENT_EMAIL_TO, ATTENDED_MEETING_WITH, WORKS_AT, PART_OF_PROJECT
```

| Component | Location | New/Modified |
|-----------|----------|--------------|
| `EntityNode` / `EntityEdge` | `backend/prisma/schema.prisma` | **NEW** models |
| `EntityGraphService` | `backend/src/modules/ai-chat/services/entity-graph.service.ts` | **NEW** -- CRUD for entity graph, relationship inference |
| `EntityGraphBuildService` | `backend/src/modules/ai-chat/services/entity-graph-build.service.ts` | **NEW** -- batch builder from emails/contacts/calendar (BullMQ job) |
| `GraphExpansionService` | `backend/src/modules/ai-chat/services/graph-expansion.service.ts` | **MODIFIED** -- use EntityEdge for richer traversal instead of raw SQL joins |

**Important constraint:** Entity graph construction is an expensive batch operation. It should run as a BullMQ scheduled job (nightly, like embedding backfill), NOT inline during chat. The graph is pre-computed and queried at chat time.

#### Step 6: Memory Anchoring

```
AIMemory model extension:
  + entityNodeId  String?   (FK to EntityNode)

MemoryService enhancements:
  - When saving memory, extract entities and link to EntityNode
  - When retrieving memories, include entity-adjacent memories
```

| Component | Location | New/Modified |
|-----------|----------|--------------|
| `AIMemory` | `backend/prisma/schema.prisma` | **MODIFIED** -- add `entityNodeId` FK |
| `MemoryService` | `backend/src/modules/ai-chat/services/memory.service.ts` | **MODIFIED** -- entity-aware retrieval |

#### Step 7: Tool Consolidation

Merge `semantic_search` and `graph_context_search` into a single `search` tool that auto-selects the retrieval strategy based on `QueryRouterService` classification.

```
QueryRouterService.classify(query)
    |
    +-- simple -> no search (unchanged)
    +-- search -> HybridSearchService.search() (vector + FTS)
    +-- multi_hop -> HybridSearchService.search() + GraphExpansionService.expand() + ContextAssemblyService.assemble()
```

| Component | Location | New/Modified |
|-----------|----------|--------------|
| `RagToolsService` | `backend/src/modules/ai-chat/tools/rag-tools.service.ts` | **MODIFIED** -- merge two tools into one with internal routing |
| `TOOL_DOMAINS` | `backend/src/modules/ai-chat/constants/tool-domains.ts` | **MODIFIED** -- replace semantic_search + graph_context_search with unified `search` |
| Tool renderers | `frontend/src/components/ai-elements/tool-renderers/` | **MODIFIED** -- unified search result renderer |

#### Step 8: Few-shot Examples

```
System prompt injection:
  QueryRouterService.classify() -> complexity tier
  FewShotService.getExamples(complexity) -> 2-3 example interactions
  Injected into system prompt BEFORE user message
```

| Component | Location | New/Modified |
|-----------|----------|--------------|
| `FewShotService` | `backend/src/modules/ai-chat/services/few-shot.service.ts` | **NEW** -- static example bank, selected by query type |
| `AiChatService.prepareChatAgent()` | `backend/src/modules/ai-chat/services/ai-chat.service.ts` | **MODIFIED** -- inject few-shot examples into system prompt |

---

## Cross-Cutting Integration Points

### Shared Infrastructure (No Changes Needed)

| Infrastructure | Used By | Status |
|---------------|---------|--------|
| Redis (ioredis) | Rate limiting, push retry backoff, HITL preference cache | EXISTING |
| BullMQ | Entity graph build jobs, push retry jobs | EXISTING (new job types) |
| EventEmitter2 | Push dispatch triggers | EXISTING (new listeners) |
| Prometheus | Push notification counters, rate limit metrics | EXISTING (new metrics) |
| PrismaService | All new models | EXISTING |
| AuditService | HITL logging, push dispatch logging | EXISTING |

### New Prisma Models Summary

```prisma
model PushPreference {
  id        String   @id @default(cuid())
  tenantId  String
  userId    String
  category  String   // 'new_email' | 'follow_up' | 'ai_action' | 'calendar'
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([tenantId, userId, category])
}

model UserAiPreference {
  id        String   @id @default(cuid())
  tenantId  String
  userId    String
  hitlLevel String   @default("HIGH_ONLY") // 'HIGH_ONLY' | 'ALL_MUTATIONS' | 'NONE'
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([tenantId, userId])
}

model EntityNode {
  id         String       @id @default(cuid())
  tenantId   String
  type       String       // 'PERSON' | 'ORGANIZATION' | 'PROJECT' | 'TOPIC'
  name       String
  metadata   Json?
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt
  outEdges   EntityEdge[] @relation("source")
  inEdges    EntityEdge[] @relation("target")
  memories   AIMemory[]
  tenant     Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@unique([tenantId, type, name])
  @@index([tenantId, type])
}

model EntityEdge {
  id           String     @id @default(cuid())
  tenantId     String
  sourceId     String
  targetId     String
  relationship String     // 'SENT_EMAIL_TO' | 'ATTENDED_MEETING_WITH' | 'WORKS_AT' | etc.
  weight       Float      @default(1.0)
  metadata     Json?
  createdAt    DateTime   @default(now())
  source       EntityNode @relation("source", fields: [sourceId], references: [id], onDelete: Cascade)
  target       EntityNode @relation("target", fields: [targetId], references: [id], onDelete: Cascade)
  tenant       Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@index([tenantId, sourceId])
  @@index([tenantId, targetId])
  @@index([tenantId, relationship])
}
```

### Modified Existing Models

```prisma
// AIMemory -- add entity link
model AIMemory {
  // ... existing fields ...
  entityNodeId String?      // NEW: FK to EntityNode for memory anchoring
  entityNode   EntityNode?  @relation(fields: [entityNodeId], references: [id], onDelete: SetNull)
}
```

---

## Suggested Build Order

The four features have these dependency relationships:

```
Tiered Rate Limiting (independent, pure config)
    |
    v (should ship first -- prevents 429s during development)

Push Notification Dispatch (depends on: Prisma migration for PushPreference)
    |
    v (independent of other features)

HITL Approval Routing (depends on: Prisma migration for UserAiPreference)
    |
    v (independent of Graph RAG)

Graph RAG Steps 4-8 (depends on: Prisma migration for EntityNode/EntityEdge)
    Step 4: Context Assembly (no schema deps, pure service)
    Step 5: Entity Graph (schema + batch builder)
    Step 6: Memory Anchoring (depends on Step 5)
    Step 7: Tool Consolidation (depends on Steps 4-6)
    Step 8: Few-shot Examples (independent of Steps 4-7)
```

### Recommended Phase Order

1. **Tiered Rate Limiting** -- Zero risk, immediate user benefit (fixes 429s), no schema changes, pure config + decorator updates. Ship in one phase.

2. **Push Notification Backend Dispatch** -- Independent feature, completes v8.0 plumbing. Requires one Prisma migration (PushPreference model). Ships in 2-3 phases (service + listener + preferences).

3. **HITL Approval Routing** -- Touches AiChatService (high-traffic code), needs careful testing. Requires one Prisma migration (UserAiPreference). Ships in 2 phases (backend dynamic approval + frontend settings).

4. **Graph RAG Steps 4-8** -- Most complex, most phases, highest risk. Entity graph is a significant schema addition. Ships in 4-5 phases (context assembly -> entity graph schema + builder -> memory anchoring -> tool consolidation + few-shot).

### Rationale

- Rate limiting first because it is the simplest change with the most immediate user benefit.
- Push before HITL because push is a standalone feature with no impact on the chat pipeline. HITL modifies the core chat pipeline and needs more testing.
- Graph RAG last because it is the largest feature and Steps 1-3 are already working. The existing search is functional; this makes it better, not functional.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Push Dispatch in Controllers
**What:** Adding push notification sends inside HTTP controller methods.
**Why bad:** Controllers already emit domain events via `RealtimeEventsService`. Adding push dispatch creates duplicate trigger logic and misses events from non-HTTP sources (cron jobs, queue workers).
**Instead:** Listen to existing domain events with `@OnEvent` in `PushDispatchListener`.

### Anti-Pattern 2: Per-Tool HITL Configuration
**What:** Adding a UI toggle for each of the 31 tools individually.
**Why bad:** UX nightmare (31 toggles), maintenance burden (new tools need new settings), users do not understand individual tool risk profiles.
**Instead:** Three-level HITL preference (HIGH_ONLY, ALL_MUTATIONS, NONE) maps cleanly to the existing riskLevel taxonomy.

### Anti-Pattern 3: Inline Entity Graph Construction
**What:** Building entity relationships during chat requests.
**Why bad:** Entity extraction from emails requires LLM calls (~500ms each). Doing this inline adds seconds to chat response time.
**Instead:** Nightly BullMQ batch job for entity graph construction, like the existing embedding backfill pattern.

### Anti-Pattern 4: Separate Rate Limiting Service for HTTP
**What:** Building a custom rate limiting service for HTTP endpoints.
**Why bad:** `@nestjs/throttler` with named tiers already handles this. The existing `RedisThrottlerStorage` provides distributed counting. A custom service would duplicate infrastructure.
**Instead:** Reconfigure `ThrottlerModule.forRoot()` tiers and update `@Throttle()` decorators.

### Anti-Pattern 5: Replacing AI SDK HITL with Custom REST Endpoints
**What:** Re-creating HitlController/HitlService (previously deleted in AICP-01/02).
**Why bad:** AI SDK v6 ToolInvocation state machine handles approval natively. Custom REST endpoints create state synchronization issues between the streaming SSE response and REST calls.
**Instead:** Keep the SDK-native flow. The only backend change is dynamic `needsApproval` based on user preference.

---

## Sources

- Codebase analysis: all files referenced above were read directly from the repository
- Existing architecture doc: `.planning/codebase/ARCHITECTURE.md` (2026-01-31 analysis)
- v8.0 research: `.planning/research/ARCHITECTURE.md` (2026-03-23, push frontend plumbing)
- HITL contract tests: `backend/src/modules/ai-chat/__tests__/hitl-contract.test.ts`
- v7.0 rate limit decision: `.planning/PROJECT.md` line 279 (marked for revisit)
