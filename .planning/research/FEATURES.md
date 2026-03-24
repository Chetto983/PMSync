# Feature Landscape: v9.0 AI Intelligence & Platform Hardening

**Domain:** Push dispatch, tiered rate limiting, explicit HITL approval, Graph RAG for AI email client
**Researched:** 2026-03-24
**Confidence:** HIGH (all features verified against existing codebase)

## Scope Note

This document covers only v9.0 features. The following are already shipped and NOT re-listed:
- Full email client (VList, TipTap, kanban, keyboard nav, search, dark mode)
- AI chat with streaming, 31 tools, PII tokenization, circuit breaker
- PWA: installable, offline email reading, background sync, SW push handlers
- Push subscription UI toggle in settings, PushSubscription model in DB
- Flat rate limiting: 300/min read, 30/min write (ThrottlerModule), 30/60s AI chat (RedisRateLimiter)
- `needsApproval: true` on 6 HIGH-risk tools (send/delete/forward/reply email, delete contact, delete calendar)
- AI SDK v6 HITL: backend pauses tool execution, frontend re-submits via `convertToModelMessages`
- Graph RAG Steps 1-3 complete: QueryRouterService, RerankingService, GraphExpansionService
- `graph_context_search` tool with thread/contact/calendar expansion

---

## Table Stakes

Features that MUST work. Missing = broken promises or user frustration.

### 1. Push Notification Backend Dispatch

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| New email push notification | Users toggled push ON in v8.0 settings. Nothing fires. The toggle is a lie. Trust-destroying. | Medium | PushSubscription model (exists), web-push 3.6.7 (installed, unused), SW push/notificationclick handlers (exist) |
| Event-driven dispatch service | PushService only has subscribe/unsubscribe. No `sendNotification()` method. Need: event trigger -> lookup user subscriptions -> web-push.sendNotification() per device. | Medium | EventEmitter2 (exists), new PushDispatchService, VAPID keys from env |
| Per-user notification preferences | Without preferences, push is all-or-nothing. Users need category controls (new email, calendar reminder, AI completion). Minimum: on/off per category. | Low | Extend UserPreferences or new PushPreference columns |
| Stale subscription cleanup | Browsers silently revoke push endpoints. Sending to dead endpoints returns 410 Gone. Must delete subscription on 410/404 from web-push. | Low | Error callback in web-push.sendNotification(), PushService.unsubscribe() |
| Multi-device delivery | Users subscribe from phone + laptop. Each device must receive notification. | Low | Already handled -- PushSubscription keyed by `tenantId_endpoint`, not userId uniquely. Multiple rows per user = multiple devices. |

### 2. Tiered Rate Limiting

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| Per-category write limits | Flat 30/min write tier causes false 429s during normal workflows. Archiving 10 emails = 10 writes. Chat + email actions compete for same budget. Users get blocked doing expected things. v7.0 explicitly flagged this for revisit. | Low | ThrottlerModule already supports named throttlers. Add `@Throttle()` per controller/route. |
| Burst-friendly limits for safe writes | Archive, star, mark-read are safe, reversible. 30/min is hostile to power users doing email triage. These need higher limits (e.g., 100/min) than send/delete (30/min). | Low | Named throttle tiers: `read` (300/min), `write-safe` (100/min), `write-destructive` (30/min) |
| Rate limit response headers | Frontend needs `X-RateLimit-Remaining` / `X-RateLimit-Reset` to show proactive warnings before hitting 429. Prevents surprise errors. | Low | UserThrottlerGuard header injection, already standard NestJS pattern |

### 3. Explicit HITL Approval UX

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| Approval/rejection buttons on destructive tool calls | Backend already pauses (needsApproval: true, AI SDK enters `approval-requested` state). Frontend renders nothing special -- all tool calls look the same through FallbackToolRenderer. Users cannot distinguish "read email" from "delete email". | Medium | AI SDK `part.state === 'approval-requested'`, `addToolApprovalResponse()`, tool renderer component |
| Visual distinction for destructive tools | Tool calls with HIGH risk must look dangerous (red/warning styling, shield icon). Currently all tools render identically. | Low | Existing smart tool renderer registry, add approval-state variant |
| Approval resubmit flow | After user clicks approve/reject, frontend must call `addToolApprovalResponse()` which re-submits the message chain. Backend already handles this via `isApprovalResubmit` path in `prepareChatAgent`. | Medium | `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses` (AI SDK pattern) |
| Approval audit logging | Who approved what destructive action and when. GDPR-relevant accountability trail. | Low | AuditService.logAudit() already exists. Fire on approval/rejection. |

### 4. Graph RAG Steps 4-8 (Continuing Existing Roadmap)

Steps 1-3 are complete and working. These are the remaining planned steps.

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| Memory-entity anchoring (Step 6) | AIMemory records float free. "Marco prefers PDF invoices" has no link to Marco's contact ID. "What do I know about Marco?" requires semantic search instead of direct lookup. | Medium | AIMemory schema extension (add emailId?, contactId?), save_memory tool update, system prompt instruction |
| Context assembly (Step 4) | graph_context_search returns raw results. Dumping 10 email snippets into LLM context wastes tokens. Structured summary ("3 contacts at Acme, 12 emails in 2 threads") = same signal in 40-60% fewer tokens. | Medium | GraphExpansionService (exists), new ContextAssemblerService |
| Few-shot tool chain examples (Step 8) | Model sometimes picks wrong tool sequences for multi-hop queries. 3-5 concrete examples in system prompt fix this. ~40 lines, ~250 extra tokens. | Low | System prompt modification only |

## Differentiators

Features that elevate the product. Not expected, but valued when present.

### Push Notifications (Beyond Table Stakes)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI triage batch notifications | "3 urgent emails need attention" instead of 5 separate alerts. Superhuman-grade intelligent batching. | High | Requires debounce window (e.g., 60s), email triage service (exists), summary generation |
| Thread-grouped notifications | Multiple emails in same thread = single notification with count, not N separate alerts | Medium | web-push `tag` field for collapsing, thread ID from email model |
| Deep link to email thread | Click notification -> opens exact email thread in app, not just inbox | Low | SW notificationclick handler exists, needs thread/email ID in push payload |
| Follow-up reminder push | "Reminder: You haven't replied to Marco's email from Tuesday" | Medium | ReminderModule exists, needs push dispatch integration |

### Rate Limiting (Beyond Table Stakes)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Progressive rate limiting | First hit = 429 with retry-after. Sustained abuse = exponentially longer cooldowns. Better than cliff-edge blocking. | Medium | Sliding window with escalation in Redis |
| Cost-aware AI throttling | AI calls have real $ cost. Separate monthly token budget prevents accidental cost spikes. | Medium | AiRunLedger (exists) has cost data; add threshold check |

### HITL Approval (Beyond Table Stakes)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Approval with parameter modification | User sees "Send email to john@acme.com" and edits recipient before approving. Fix-in-place instead of reject-and-retype. | High | Custom editable tool args UI, re-injection into agent pipeline |
| Batch approval for multi-step plans | AI proposes "archive 5 emails" -- user approves all at once instead of 5 clicks | Medium | Grouped approval UI, multi-approval batching |
| Auto-reject timeout | Pending approvals auto-reject after N minutes if user walks away. Prevents stuck agent loops. | Low | Frontend timer, state cleanup, no backend changes |

### Graph RAG (Beyond Table Stakes, Steps 5 and 7)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Materialized entity graph (Step 5) | Pre-computed relationship edges drop graph expansion latency from ~200ms JSONB queries to ~20ms index lookups. entity_graph table with edge types: email_sender, email_recipient, co_thread, co_attendee. | High | New Prisma model, nightly BullMQ rebuild, incremental updates on email sync events |
| Tool consolidation (Step 7) | Merge search_emails + semantic_search into unified `search` tool with `mode: keyword/semantic/auto`. Reduces model confusion across 31 tools. Keep old names as aliases for 1 release. | Medium | QueryRouterService (exists) routes auto mode. Alias period for backward compat. |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Push for every single email | Notification fatigue. Users disable push entirely. Defeats the purpose. | Default to "important/urgent only" or batch via AI triage. Per-category preferences. |
| Per-endpoint rate limit config UI | Over-engineering. No evidence admins need to tune individual endpoints. | Hardcoded tiers (read/write-safe/write-destructive/ai) with sensible defaults. Env var overrides at most. |
| Drag-and-drop HITL approval workflow builder | Enterprise ABAC territory. Out of scope per PROJECT.md constraints. | Simple boolean `requiresApproval` on tool registry. Conditional rules are a much later phase. |
| Cross-model reranker (Cohere/BGE rerank API) | Extra latency (~200ms), cost, and external dependency. Heuristic reranking (Step 2, already built) is sufficient for current data volumes. | Keep RerankingService with recency/thread/priority/keyword heuristics. Revisit only if result quality measurably degrades. |
| Neo4j or separate graph database | New operational dependency. PostgreSQL handles the traversal patterns via joins on entity_graph table. | Materialized entity_graph in PostgreSQL (Step 5). |
| Universal mega-search tool | Merging ALL search tools (contacts, calendar, emails, semantic) into one confuses the model with too many optional parameters. | Consolidate only search_emails + semantic_search (Step 7). Keep domain-specific contact/calendar search separate. |
| Real-time entity graph (event-sourced) | Complex event choreography for marginal freshness gain. | Nightly full rebuild + incremental edge upsert on email sync. |

## Feature Dependencies

```
Push Notification Dispatch
  PushSubscription model (EXISTS) --> PushDispatchService.sendNotification() (NEW)
  EventEmitter2 domain events (EXISTS) --> email.received trigger --> push dispatch (NEW)
  NotificationSettings toggle (EXISTS) --> per-user category preferences (NEW)
  web-push 3.6.7 (INSTALLED) --> VAPID env config (NEW)

Tiered Rate Limiting
  ThrottlerModule named throttlers (EXISTS: 'short' + 'write') --> @Throttle() per controller (NEW)
  UserThrottlerGuard (EXISTS) --> rate limit response headers (NEW)
  RedisThrottlerStorage (EXISTS) --> no changes needed

HITL Explicit Approval
  needsApproval: true on 6 tools (EXISTS) --> frontend approval-requested rendering (NEW)
  convertToModelMessages HITL path (EXISTS) --> approval resubmit UX (NEW)
  Tool registry governance metadata (EXISTS) --> approval audit logging (NEW)
  Smart tool renderers (EXISTS, 10 custom) --> approval-state variant renderer (NEW)

Graph RAG Continuation
  QueryRouterService (EXISTS, Step 1) --> Tool consolidation auto mode (Step 7)
  RerankingService (EXISTS, Step 2) --> Better seed quality (passive)
  GraphExpansionService (EXISTS, Step 3) --> ContextAssemblerService (Step 4)
  GraphExpansionService (EXISTS, Step 3) --> EntityGraphService + migration (Step 5)
  AIMemory model (EXISTS) --> add emailId/contactId columns (Step 6, independent)
  Steps 1+3 --> Tool consolidation unified search (Step 7)
  Step 7 --> Few-shot examples in system prompt (Step 8)
```

## MVP Recommendation

### Priority 1 (Fix broken promises)

1. **Push notification backend dispatch** -- Toggle exists, nothing fires. Trust-destroying broken promise.
   - PushDispatchService with web-push.sendNotification()
   - Email received event trigger
   - 410/404 subscription cleanup
   - Per-user category preferences (minimum: on/off per category)

2. **Tiered rate limiting** -- Users hit 429 during normal workflows. Quick config fix.
   - Named throttle tiers: `read` (300/min, existing), `write-safe` (100/min), `write-destructive` (30/min, existing), `ai-chat` (30/min, existing separate)
   - `@Throttle()` decorators on controllers
   - Rate limit headers in response

### Priority 2 (Complete existing plumbing)

3. **Explicit HITL approval UX** -- Backend pauses, frontend shows nothing.
   - Approval/rejection buttons for `part.state === 'approval-requested'`
   - Visual distinction (red/warning for destructive tools)
   - `addToolApprovalResponse()` integration
   - Audit logging on approve/reject

### Priority 3 (Intelligence improvements)

4. **Graph RAG Steps 6, 4, 8** -- Extend existing working pipeline.
   - Step 6: Memory-entity anchoring (standalone, no dependencies)
   - Step 4: Context assembly (depends on Step 3, token efficiency)
   - Step 8: Few-shot examples (lowest effort, highest signal-to-code ratio)

### Defer to v9.x+

- **Step 5 (Entity graph materialization)**: Performance optimization for graph expansion. Current ~200ms JSONB is acceptable. Build when query volume justifies it.
- **Step 7 (Tool consolidation)**: Reduces model confusion but requires alias period. Ship after Steps 4/6/8 prove the pipeline.
- AI triage batch notifications: Additional AI pipeline work. Ship basic per-email push first.
- Approval with parameter modification: Complex UI. Simple approve/reject is sufficient.
- Progressive rate limiting: Standard 429 + retry-after covers requirements.

## Sources

- Codebase analysis: PushService, PushController, ThrottlerModule config, UserThrottlerGuard, tool-registry.interface.ts, EmailToolsService (needsApproval), AiChatService (HITL resubmit path), HybridSearchService, RerankingService, GraphExpansionService, QueryRouterService, RagToolsService
- AI SDK v6 HITL cookbook: https://ai-sdk.dev/cookbook/next/human-in-the-loop (HIGH confidence, verified via memory reference)
- Graph RAG 8-step plan: `C:\Users\Davide\.claude\plans\rosy-imagining-starlight.md` (HIGH confidence, Steps 1-3 verified in codebase)
- web-push npm: v3.6.7 installed in backend/package.json but unused (no sendNotification calls in codebase)
- NestJS ThrottlerModule: named throttlers supported, @Throttle() per-route decoration (HIGH confidence, verified in app.module.ts config)

---
*Feature research for: v9.0 AI Intelligence & Platform Hardening*
*Researched: 2026-03-24*
