# Domain Pitfalls

**Domain:** Adding push dispatch, tiered rate limiting, HITL approval routing, and Graph RAG to existing NestJS AI email client
**Researched:** 2026-03-24

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or security vulnerabilities.

### Pitfall 1: Stale Push Subscriptions Silently Dropping Notifications

**What goes wrong:** Backend sends push notifications via `web-push` to endpoints stored in `PushSubscription`, but browser endpoints go stale when users clear browser data, uninstall the PWA, or when the push service rotates the endpoint URL. The `sendNotification()` call returns a 410 Gone or 404, but if you catch-and-swallow these errors, you accumulate dead subscriptions and users silently stop receiving notifications with no feedback.

**Why it happens:** The current `PushSubscription` model has no `lastSuccessAt` or `failureCount` field. The `push.service.ts` only handles subscribe/unsubscribe -- there is no cleanup path for server-detected failures.

**Consequences:** Database fills with dead subscriptions. Dispatch latency grows as you attempt delivery to stale endpoints. Users think notifications are broken but have no way to diagnose it.

**Prevention:**
1. On every `web-push.sendNotification()` response, check for HTTP 404/410 -- immediately delete the subscription row.
2. Track `failureCount` and `lastSuccessAt` on the model. After 3 consecutive failures, soft-delete the subscription.
3. Return delivery stats (sent/failed/stale) from the dispatch method so callers can log observability metrics.
4. Add a scheduled cleanup job (e.g., weekly) to purge subscriptions with no success in 30+ days.

**Detection:** Monitor `PushSubscription` table growth vs. active user count. If subscriptions grow faster than users, you have a stale endpoint problem.

**Confidence:** HIGH -- this is the #1 cited backend push failure mode across MDN docs and production post-mortems.

---

### Pitfall 2: Push Dispatch Blocking the Event Loop

**What goes wrong:** When a triggering event (new email, AI triage complete, calendar reminder) fires, the push dispatch runs synchronously in the same request/job handler. With `web-push.sendNotification()` making HTTPS calls to push service endpoints (FCM, Mozilla, Apple), each call takes 100-500ms. If a user has 5 subscriptions across devices, that is 500ms-2.5s of blocking.

**Why it happens:** The natural approach is to call dispatch inline after the domain event completes. The existing codebase uses `EventEmitter2` for domain events with async handlers, but if the push handler awaits delivery, it blocks the event chain.

**Consequences:** Email sync jobs slow down. API response latency spikes. BullMQ job throughput drops. Under load, the event loop backs up.

**Prevention:**
1. Push dispatch MUST go through BullMQ, not inline execution. Create a `push-dispatch` queue with a dedicated worker.
2. The domain event handler should only enqueue the job (fire-and-forget), never await delivery.
3. Set concurrency on the push worker to 5-10 to parallelize deliveries without flooding outbound connections.
4. Use `web-push.sendNotification()` with a timeout option (5s) to prevent hanging on unresponsive endpoints.

**Detection:** Monitor BullMQ job duration for email-sync and triage jobs. If they spike after push dispatch is added, push is blocking inline.

**Confidence:** HIGH -- directly observable from the codebase architecture (EventEmitter2 async handlers, BullMQ patterns).

---

### Pitfall 3: Throttler Tier Name Collision Breaking Existing Rate Limits

**What goes wrong:** The current `ThrottlerModule.forRoot()` defines two named tiers: `short` (300/min reads) and `write` (30/min writes). Controllers use `@Throttle({ default: { ... } })` with the `default` key, NOT the tier names. When you add new per-endpoint tiers, if you use `@Throttle({ write: { limit: 10, ttl: 60000 } })` expecting to override only the write tier, the `short` tier still applies simultaneously. The endpoint gets BOTH limits -- the per-endpoint write limit AND the global 300/min read limit. This is correct behavior but often surprises developers.

**Why it happens:** `@nestjs/throttler` applies ALL defined throttlers unless a specific one is skipped. The `@Throttle()` decorator overrides limits for named throttlers but does not disable the others. The current codebase uses `{ default: { ... } }` which overrides ALL throttlers with a single rule -- this was a workaround, not intentional tiered design.

**Consequences:** Endpoints either get rate limited twice (too strict) or the wrong tier applies. Existing 429 responses (already flagged in v7.0 as a user-reported issue) get worse instead of better.

**Prevention:**
1. Before changing anything, audit every `@Throttle()` usage in the codebase -- there are 17+ decorators already. Map which tier each endpoint should belong to.
2. Rename the global tiers to be explicit: `read` and `write` instead of `short` and `write`.
3. Use `@SkipThrottle({ read: true })` on write-only endpoints to disable the read tier, rather than trying to override it.
4. Write a verification script (like the existing `verify-rate-limiting.ts`) that tests each tier independently.

**Detection:** The existing `scripts/verify-rate-limiting.ts` should be extended to validate per-endpoint limits against the intended tier config.

**Confidence:** HIGH -- verified by reading the actual throttler config in `app.module.ts` and the 17+ `@Throttle()` decorators.

---

### Pitfall 4: HITL Approval Re-submit Losing Conversation State

**What goes wrong:** When a tool with `needsApproval: true` fires, the AI SDK pauses the stream and sends a `tool-approval-request` to the client. The user approves/denies. The client then re-submits the full `messages[]` array (including the approval response) via `clientMessages` in the `StreamChatParams`. The `prepareChatAgent` method handles this via `convertToModelMessages()`. But if the conversation history has been modified between the original request and the approval re-submit (e.g., another message was sent in a different tab, or a background enrichment ran), the re-submitted messages diverge from server state, causing either `InvalidPromptError` or tool calls referencing non-existent context.

**Why it happens:** The current flow trusts `clientMessages` for HITL re-submits (line 184 in `ai-chat.service.ts`) and bypasses server-side history loading. There is no server-side correlation between the pending approval and the re-submitted messages. The approval is purely client-side state.

**Consequences:** Intermittent `InvalidPromptError` during approval flows. Users approve an action, get an error, and have to re-ask the AI from scratch. The destructive tool may or may not have executed depending on when the error occurred.

**Prevention:**
1. Store a `pendingApprovalId` server-side when a tool triggers `needsApproval`. Include the tool call context (toolCallId, toolName, args).
2. On re-submit, validate that the `pendingApprovalId` matches and the tool call context is unchanged.
3. If the conversation state has diverged, reject the approval with a clear error message instead of silently proceeding.
4. Add idempotency protection -- if the same `toolCallId` has already been executed, return the cached result instead of re-executing.

**Detection:** Log correlation between approval re-submits and `InvalidPromptError` occurrences. If they spike together, this is the cause.

**Confidence:** MEDIUM -- the vulnerability is visible in the code, but the exact failure frequency depends on user behavior patterns (multi-tab usage, slow approval).

---

### Pitfall 5: Graph Expansion N+1 Queries from Contact Email Lookup

**What goes wrong:** The `GraphExpansionService.expandContacts()` runs two SQL queries: one to find contacts matching seed senders (via JSONB `emails` array), then another to find recent emails from those contacts. The second query JOINs `emails` with `unified_contacts` using a JSONB subquery (`EXISTS (SELECT 1 FROM jsonb_array_elements(...))`). This is functionally correct but the JSONB `jsonb_array_elements` call in the JOIN condition prevents PostgreSQL from using indexes effectively, causing a sequential scan on the contacts table for each email row.

**Why it happens:** The `unified_contacts.emails` field is a JSONB array, not a normalized relation. There is no GIN index on the email values within the JSONB structure. The existing code (lines 204-241 in `graph-expansion.service.ts`) works at small scale but degrades quadratically.

**Consequences:** Graph expansion latency grows from ~50ms to 500ms+ as the contact table grows past 10K records. The 300ms slow-expansion warning will trigger frequently. The entire RAG pipeline stalls because graph expansion is on the critical path.

**Prevention:**
1. Add a GIN index on the email values: `CREATE INDEX idx_contacts_emails_gin ON unified_contacts USING GIN ((emails jsonb_path_ops))` -- but verify this actually helps with the `ANY()` pattern used.
2. Better: extract contact emails into a junction table `contact_emails(contactId, email)` with a B-tree index. This is a schema change but eliminates the JSONB scan entirely.
3. If schema change is too invasive, pre-compute a materialized mapping table `sender_contact_map(sender_email, contact_id)` refreshed on contact updates, and use that for the JOIN instead.
4. Set a hard timeout (200ms) on graph expansion and return partial results if exceeded.

**Detection:** The existing `elapsed > 300` warning in `GraphExpansionService` is the canary. Monitor its frequency as contact volume grows.

**Confidence:** HIGH -- the JSONB pattern is visible in the code and is a well-documented PostgreSQL anti-pattern for JOIN conditions.

## Moderate Pitfalls

### Pitfall 6: Push Notification Payload Size Exceeding Browser Limits

**What goes wrong:** Web Push payloads are limited to ~4KB (varies by browser). If you include the full email subject, sender info, snippet, and metadata, you can exceed this limit. `web-push.sendNotification()` silently truncates or the push service rejects the payload entirely.

**Prevention:**
1. Define a strict notification payload schema with max lengths: title (50 chars), body (100 chars), icon URL, click URL, and a data object for routing.
2. Never include email body content in the push payload -- only enough to identify and route.
3. Test with Firefox (strictest limit at ~3.9KB) not just Chrome.

**Confidence:** HIGH -- documented browser limitation.

---

### Pitfall 7: Rate Limit Bypass via AI Chat Tool Calls

**What goes wrong:** The AI chat pipeline has its own rate limiter (`RedisRateLimiterService` at 30 req/min per user in `ai-chat.service.ts`), separate from the HTTP-level `@nestjs/throttler`. But AI tool calls (send_email, delete_email, etc.) execute server-side within the agent loop and bypass the HTTP throttler entirely. A single chat message can trigger 8 tool calls (the `stepCountIs(8)` limit), meaning one chat request could execute 8 email sends -- far exceeding the intended 10/min write limit on the email actions endpoint.

**Prevention:**
1. Add per-tool rate limits within the tool execution layer, not just at the HTTP level.
2. The `ToolRegistryService` already tracks tool metadata -- extend it with per-tool rate limit config.
3. Check rate limits inside the tool's `execute` function before performing the action.
4. Consider the total tool calls per chat message (currently max 8 steps) as a multiplier when setting chat-level rate limits.

**Confidence:** HIGH -- directly visible from the code: `stopWhen: stepCountIs(8)` and no per-tool rate limiting.

---

### Pitfall 8: HITL FallbackToolRenderer Showing Approval UI for Non-Destructive Tools

**What goes wrong:** The current `FallbackToolRenderer` in the frontend shows ALL tool invocations in the chat UI, including read-only tools like `search_emails` and `semantic_search`. When you add explicit approval routing for destructive tools, users may confuse the informational tool-call display (showing what the AI searched) with the approval prompt (asking permission to delete). This creates "approval fatigue" -- users click approve habitually without reading, defeating the purpose of HITL.

**Prevention:**
1. Split the tool renderer into two distinct UIs: an informational renderer (collapsed, non-interactive) for read-only tools, and an approval renderer (prominent, with explicit approve/deny buttons and a summary of what will happen) for `needsApproval` tools.
2. The approval renderer must show the tool's effect in plain language ("Send email to john@example.com with subject 'Re: Budget'"), not raw JSON args.
3. Auto-collapse completed tool calls after approval to reduce visual noise.

**Confidence:** MEDIUM -- based on the HITL contract test showing 6 HIGH-risk tools and ~20 total tools all going through FallbackToolRenderer.

---

### Pitfall 9: Query Router False Negatives Skipping RAG for Complex Queries

**What goes wrong:** The `QueryRouterService` uses regex heuristics to classify query complexity. The `MULTI_HOP_PATTERNS` list has 8 patterns, but natural language is infinitely varied. A query like "what happened with the Johnson proposal after our lunch" has multi-hop intent (email + calendar + contact) but may not match any pattern, falling through to the `search` tier which skips graph expansion.

**Prevention:**
1. Default to `search` (not `simple`) for unmatched queries -- already done, this is correct.
2. Make `graph_context_search` available as a tool at the `search` tier, not just `multi_hop`. Let the LLM decide when to use it based on the tool description.
3. Add telemetry: log classification results and compare with whether the user's follow-up suggests the initial results were insufficient (e.g., "no, I meant the conversation with Johnson AND the meeting").
4. Do NOT try to make the regex classifier comprehensive -- it will never catch everything. The LLM's tool selection is the real router; the heuristic classifier is a performance optimization for step 0 tool filtering.

**Confidence:** HIGH -- the regex approach is inherently limited and this is acknowledged by the 0.5 confidence default fallback.

---

### Pitfall 10: Entity Graph Materialization Stale Data

**What goes wrong:** If you materialize an entity graph (email-to-contact-to-calendar relationships) as a table or materialized view, it becomes stale as new emails arrive, contacts are updated, and calendar events change. The graph expansion results will be incorrect until the next refresh, leading to the AI providing outdated relationship context.

**Prevention:**
1. Do NOT use a materialized view for the entity graph. The current approach of running live SQL queries in `GraphExpansionService` is correct -- it always reflects current data.
2. If performance requires caching, cache at the query level (Redis, 5-min TTL) keyed by `(tenantId, seedEmailIds hash)`, not at the graph level.
3. If you add a `sender_contact_map` table (per Pitfall 5), update it via domain events (`ContactUpdatedEvent`, `ContactCreatedEvent`) to keep it in sync.

**Confidence:** MEDIUM -- this is a design temptation, not a current bug.

---

### Pitfall 11: Push Notification Preferences Not Respecting Tenant Isolation

**What goes wrong:** Push notification preferences (which event types trigger notifications) need to be per-user AND per-tenant. If a user belongs to multiple tenants (orgs), they may want notifications for one org but not another. Storing preferences at the user level without tenant scoping leaks notification preferences across organizational boundaries.

**Prevention:**
1. The `PushSubscription` model already has `tenantId` -- good. But notification preferences (event type toggles) must also be scoped to `(tenantId, userId)`, not just `userId`.
2. When dispatching, filter subscriptions by `tenantId` to ensure notifications only go to subscriptions registered in the same tenant context.
3. The existing `NotificationSettings.tsx` frontend component should be checked to ensure it sends `tenantId` with preference updates.

**Confidence:** HIGH -- multi-tenancy is a core architectural constraint and every new feature must respect it.

---

### Pitfall 12: Memory Anchoring Creating Circular Context Inflation

**What goes wrong:** When implementing memory anchoring for Graph RAG (injecting relevant AI memories alongside search results), the memories themselves may reference entities that trigger additional graph expansion, which finds more context, which activates more memories. Each chat turn grows the context window.

**Prevention:**
1. Cap total context assembly at a fixed token budget (e.g., 4K tokens for RAG context + 1K for memories).
2. Never re-expand graph results found via memory injection -- memories are additive context, not new seed queries.
3. The existing `memoryService.getRelevantMemories(tenantId, userId, llmMessage, 5)` with limit=5 is a good starting point. Keep this limit low.
4. Track total context size in the `AiRunLedger` and alert if average context per chat message exceeds the budget.

**Confidence:** MEDIUM -- this is a design risk for the upcoming implementation, not a current bug.

## Minor Pitfalls

### Pitfall 13: web-push VAPID Key Mismatch Between Environments

**What goes wrong:** VAPID keys must match between the frontend (subscription request) and backend (notification send). If environment variables are not in sync (e.g., different keys in development vs. Railway deployment), subscriptions created in one environment fail silently in another.

**Prevention:** Store VAPID keys as a single source of truth in environment config. The frontend should fetch the public VAPID key from a backend endpoint, not from a hardcoded env variable.

**Confidence:** HIGH -- standard web-push deployment issue.

---

### Pitfall 14: Throttler Redis Storage Fail-Open Allowing Unlimited Requests

**What goes wrong:** The existing `RedisThrottlerStorage` has a `catch` block that returns `totalHits: 0` on Redis errors (line 88-96), meaning if Redis goes down, ALL rate limits are disabled. This is intentional (fail-open to not block users), but it means a Redis outage creates an unprotected window.

**Prevention:**
1. Log fail-open events with WARN level and increment a Prometheus counter.
2. Consider a local in-memory fallback with conservative limits (e.g., 10 req/min) when Redis is unreachable.
3. Monitor the fail-open counter in dashboards -- any non-zero value needs investigation.

**Confidence:** HIGH -- visible in the code.

---

### Pitfall 15: Graph RAG Few-Shot Examples Inflating Prompt Size

**What goes wrong:** Adding few-shot examples to the system prompt for Graph RAG tool usage guidance increases the base prompt size. With 20+ tools already, the system prompt is already substantial. Adding 3-5 few-shot examples (each ~200-500 tokens) can push the base prompt past 3K tokens, reducing the available context window for actual conversation history and RAG results.

**Prevention:**
1. Use dynamic few-shot injection -- only include examples relevant to the detected query complexity tier.
2. Keep few-shot examples minimal (1-2 per tier, not per tool).
3. Monitor total input tokens via `AiRunLedger` -- if average prompt tokens increase by more than 500 after few-shot addition, the examples are too verbose.

**Confidence:** MEDIUM -- depends on implementation choices.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Push backend dispatch | Stale subscriptions (P1), blocking event loop (P2) | BullMQ queue, 410 cleanup, delivery metrics |
| Push notification preferences | Tenant isolation leak (P11) | Scope all preferences to (tenantId, userId) |
| Push payload construction | 4KB payload limit (P6) | Strict schema, truncation, test on Firefox |
| VAPID key deployment | Key mismatch (P13) | Backend serves public key, single source of truth |
| Tiered rate limiting migration | Tier name collision (P3), existing @Throttle audit | Map all 17+ decorators before changing config |
| Rate limiting AI tools | Tool call bypass (P7) | Per-tool rate limits in execute(), not just HTTP |
| Throttler Redis failover | Fail-open unlimited (P14) | Local fallback, Prometheus counter |
| HITL approval routing | State divergence (P4), approval fatigue (P8) | Server-side pending state, split UI renderers |
| HITL for new destructive tools | Inconsistent classification | Extend HITL contract test for every new tool |
| Query router accuracy | False negatives (P9) | LLM tool selection is the real router, not regex |
| Graph expansion performance | JSONB N+1 (P5) | GIN index or junction table, 200ms timeout |
| Entity graph materialization | Stale data (P10) | Live queries, not materialized views |
| Memory anchoring | Context inflation (P12) | Fixed token budget, no recursive expansion |
| Few-shot examples | Prompt bloat (P15) | Dynamic injection by tier, monitor input tokens |

## Sources

- [MDN Web Push API Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/Push_API/Best_Practices) -- payload limits, subscription lifecycle
- [NestJS Rate Limiting Docs](https://docs.nestjs.com/security/rate-limiting) -- throttler module, named tiers, @SkipThrottle
- [NestJS Throttler GitHub](https://github.com/nestjs/throttler) -- per-endpoint override behavior
- [AI SDK v6 HITL Cookbook](https://ai-sdk.dev/cookbook/next/human-in-the-loop) -- needsApproval flow, approval/denial handling
- [AI SDK v6 needsApproval mid-execute issue #9862](https://github.com/vercel/ai/issues/9862) -- limitations of current HITL model
- [Graph RAG vs SQL RAG](https://towardsdatascience.com/graph-rag-vs-sql-rag/) -- PostgreSQL graph query complexity
- [EDB SQL/PGQ for PostgreSQL](https://www.enterprisedb.com/blog/representing-graphs-postgresql-sqlpgq) -- recursive CTE performance characteristics
- Codebase analysis: `backend/src/app.module.ts` (throttler config), `backend/src/modules/push/push.service.ts` (current push implementation), `backend/src/modules/ai-chat/services/ai-chat.service.ts` (HITL flow, tool creation), `backend/src/modules/ai-chat/services/graph-expansion.service.ts` (JSONB join pattern), `backend/src/common/guards/redis-throttler-storage.service.ts` (fail-open behavior)
