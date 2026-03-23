# Phase 92: AI & Knowledge Base Verification - Research

**Researched:** 2026-03-20
**Domain:** AI chat pipeline, email intelligence endpoints, knowledge base (RAG), AI observability, frontend chat UI
**Confidence:** HIGH

## Summary

Phase 92 is a **verification phase** -- no new features are built. The goal is to confirm that all existing AI-powered features work end-to-end on the deployed system. The codebase has a mature AI stack: NestJS backend with Mistral AI provider, AI SDK v6 for streaming chat, assistant-ui for the React chat UI, and pgvector for knowledge base embeddings. The HITL (Human-in-the-Loop) approval system is SDK-native (no REST endpoints -- approval happens inline via `addResult` on `requires-action` tool calls).

The verification covers four distinct domains: (1) non-chat AI endpoints (compose, summarize, smart-reply, categorize, sentiment, priority, triage, follow-ups, briefing, draft generation), (2) AI chat streaming with conversation CRUD and HITL, (3) knowledge base operations (backfill, list/delete embeddings, semantic search), and (4) AI observability (run history, cost summary). Plus the frontend chat UI verification.

**Primary recommendation:** Structure verification as backend-first (API endpoint testing via curl/Swagger) followed by frontend chat UI testing in the browser. Each requirement maps to a distinct set of endpoints that can be tested independently.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BAPI-13 | User can use AI features (compose, summarize, smart-reply, categorize, sentiment, priority, triage, follow-ups, briefing, drafts) | AI controller at `backend/src/modules/ai/controllers/ai.controller.ts` exposes all endpoints under `/ai/*`. Frontend API module at `frontend/lib/api/ai.ts` has `aiApi` object with all methods. All use `EmailInsightsService.analyzeEmailUnified()` with 24h cache for consolidated analysis. |
| BAPI-14 | User can use AI chat (stream message, CRUD conversations, HITL approve/reject) | `AiChatController` at `/ai/chat` (POST stream), `/ai/chat/conversations` (GET list, POST create, GET/:id, DELETE/:id). HITL is SDK-native via `requires-action` status on tool calls -- no REST approve/reject endpoint exists. Frontend uses `@assistant-ui/react` + `@ai-sdk/react` with `useChat` hook and `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses`. |
| BAPI-15 | User can manage knowledge base (backfill, list/delete embeddings, semantic search) | `KnowledgeBaseController` at `/ai/knowledge-base/*`. Admin-only for backfill/list/delete. Search at `/ai/knowledge-base/search` (POST). Also exposed via `/ai/memory/search` on `AiController`. |
| BAPI-16 | Admin can access AI observability (list runs, cost summary) | `AiObservabilityController` at `/ai/runs` (GET, paginated) and `/ai/runs/cost-summary` (GET, aggregate). Requires admin role via `RolesGuard`. Queries `aiRunLedger` Prisma model. |
| FE-06 | AI chat interface works (send message, receive stream, HITL approval, conversation history) | Full chat UI in `frontend/src/components/chat/`. `ChatPage` -> `ChatRuntimeProvider` -> `ChatDesktopLayout`/`ChatMobileLayout`. Thread list adapter connects to backend conversation API. `AssistantMessage` renders streaming markdown. `HitlApprovalWrapper` shows inline approve/deny on `requires-action` tools. 17 tool UI renderers in `tool-uis/`. |
</phase_requirements>

## Standard Stack

### Core (Already Installed -- Verification Only)

| Library | Version | Purpose | Location |
|---------|---------|---------|----------|
| ai (Vercel AI SDK) | ^6.0.77 (backend), ^6.0.116 (frontend) | Streaming chat, UIMessage format, HITL helpers | Both packages |
| @assistant-ui/react | ^0.12.17 | Chat UI primitives (ThreadPrimitive, MessagePrimitive) | frontend |
| @assistant-ui/react-ai-sdk | ^1.3.13 | Bridge between AI SDK and assistant-ui runtime | frontend |
| @assistant-ui/react-markdown | ^0.12.5 | Markdown rendering in chat messages | frontend |
| Mistral AI | via MistralService | LLM provider for all AI operations | backend |
| pgvector | via Prisma | Vector embeddings for knowledge base / RAG | backend |

### Supporting

| Library | Version | Purpose |
|---------|---------|---------|
| assistant-stream | (transitive) | Used by thread list adapter for title generation |
| @assistant-ui/core | (transitive) | Core runtime types, ExportedMessageRepository |
| @assistant-ui/store | (transitive) | useAuiState hook for thread state |

**No new installations needed.** This is a verification phase.

## Architecture Patterns

### Backend AI Module Structure
```
backend/src/modules/
  ai/                          # Non-chat AI features
    controllers/
      ai.controller.ts          # Email intelligence (13 endpoints)
      ai-health.controller.ts   # Health probes (public + admin)
      ai-observability.controller.ts  # Run history + cost (admin)
      knowledge-base.controller.ts    # Embedding CRUD + search (admin)
    services/
      email-insights.service.ts  # Unified analysis with 24h cache
      knowledge-base.service.ts  # Embedding operations
      briefing.service.ts        # Daily briefing
      draft-generation.service.ts # AI draft gen
      follow-up-detection.service.ts
      email-triage.service.ts
      ...
  ai-chat/                     # Chat pipeline (separate module)
    controllers/
      ai-chat.controller.ts     # SSE streaming + conversation CRUD
    services/
      ai-chat.service.ts        # Core chat service
      conversation.service.ts   # Conversation persistence
    tools/                     # 10 tool service files (35+ tools)
    utils/
      active-tools.ts          # Intent-based tool selection
```

### Frontend Chat Architecture
```
frontend/src/components/chat/
  ChatPage.tsx                  # Top-level entry (skeleton -> runtime)
  ChatRuntimeProvider.tsx       # AI SDK + assistant-ui bridge
  chat-thread-list-adapter.tsx  # Backend conversation API adapter
  ChatDesktopLayout.tsx         # Sidebar + thread (md+)
  ChatMobileLayout.tsx          # Single-panel (mobile)
  ChatThreadList.tsx            # Conversation list sidebar
  ChatThread.tsx                # Message viewport + composer
  ChatComposer.tsx              # Input field
  ChatEmptyState.tsx            # Empty state with capability cards
  AssistantMessage.tsx          # AI message: avatar + markdown
  UserMessage.tsx               # User message display
  HitlApprovalCard.tsx          # SDK-native HITL approve/deny
  ChatChainOfThought.tsx        # Reasoning steps
  ChatSuggestions.tsx            # Quick action suggestions
  tool-uis/                    # 17 tool renderers + FallbackToolUI
    index.tsx                  # Registry mapping tool names -> components
    FallbackToolUI.tsx         # Handles HITL + unknown tools
```

### Key Architectural Facts

1. **HITL is SDK-native, not REST-based.** There is NO `/ai/chat/approve` or `/ai/chat/pending-actions` endpoint. The Phase 77 removal deleted `HitlController`. Approval happens inline: tool returns `requires-action` status, `HitlApprovalWrapper` renders approve/deny buttons, `addResult()` sends the decision back through the stream, and `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses` auto-resubmits.

2. **Guard chain for chat:** `BetterAuthGuard (global) -> TenantGuard -> ConsentGuard -> QuotaGuard`. The 403 is expected when FREE tier quota is exceeded ($0.10/day, 50 calls/month). Testing must use a user with active subscription or mock quotas.

3. **SSE streaming format:** Backend uses `pipeUIMessageStreamToResponse()` from AI SDK v6. Frontend has TWO consumption paths: (a) assistant-ui runtime via `AssistantChatTransport` (primary), (b) legacy `consumeChatStream()` in `ai.ts` API module (for non-chat consumers).

4. **Conversation lifecycle:** Thread list adapter calls `POST /ai/chat/conversations` to eagerly create before first message. The `conversationId` is then sent with every chat request. Backend auto-generates titles.

5. **Knowledge base is admin-only** for CRUD operations. Search is available to all authenticated users via both `/ai/knowledge-base/search` and `/ai/memory/search`.

6. **Observability requires admin role** via `RolesGuard` + `@Roles('admin')`.

### Anti-Patterns to Avoid
- **Do NOT create new endpoints or modify existing code.** This is verification only.
- **Do NOT test with a user that has exceeded quota.** The 403 from QuotaGuard is expected behavior, not a bug.
- **Do NOT confuse the two knowledge base search paths.** `/ai/memory/search` on AiController and `/ai/knowledge-base/search` on KnowledgeBaseController both call the same service.

## Don't Hand-Roll

Not applicable -- verification phase. No code is being written.

## Common Pitfalls

### Pitfall 1: Chat 403 from QuotaGuard
**What goes wrong:** AI chat returns 403 Forbidden.
**Why it happens:** FREE tier has $0.10/day cost cap and 50 AI calls/month. ConsentGuard requires `ai_chat` consent.
**How to avoid:** Ensure test user has (a) active subscription with sufficient quota, (b) `ai_chat` consent granted, (c) `ai_email_processing` consent for non-chat endpoints.
**Warning signs:** 403 status with no clear auth failure in logs.

### Pitfall 2: HITL Approval Not Appearing
**What goes wrong:** AI calls a high-risk tool but no approval card shows.
**Why it happens:** Only 6 tools have `needsApproval`: `send_email`, `delete_email`, `forward_email`, `reply_email`, `delete_event`, `delete_contact`. Other tools execute without approval.
**How to avoid:** Test HITL by asking the AI to send an email or delete something. The `requires-action` status triggers `HitlApprovalWrapper` via `FallbackToolUI`.
**Warning signs:** Tool executes immediately without showing approval card.

### Pitfall 3: Knowledge Base Empty Results
**What goes wrong:** Semantic search returns empty despite emails existing.
**Why it happens:** Embeddings must be backfilled first. New emails get embeddings via queue processors, but existing emails before the embedding system was set up need manual backfill.
**How to avoid:** Run `POST /ai/knowledge-base/emails/backfill` as admin before testing search.
**Warning signs:** Search returns `items: []` with valid query.

### Pitfall 4: AI Observability Returns Empty
**What goes wrong:** `GET /ai/runs` returns no items.
**Why it happens:** `AiRunLedger` records are only created when AI operations actually execute. If no AI calls have been made, the table is empty.
**How to avoid:** Execute some AI operations first (chat, summarize, etc.) before checking observability.
**Warning signs:** `items: [], total: 0`.

### Pitfall 5: Frontend Chat CSS Not Loading
**What goes wrong:** Chat UI renders with no styling.
**Why it happens:** Chat uses 3 CSS files (`chat-layout.css`, `chat-thread.css`, `chat-sidebar.css`) with custom properties bridged by `ChatThemeBridge`. If the CSS import chain breaks, styles vanish.
**How to avoid:** Verify `ChatPage` renders with `ChatThemeBridge` wrapping the layouts.
**Warning signs:** Unstyled divs, missing sidebar width, messages not aligned.

## Endpoint Inventory for Verification

### BAPI-13: Non-Chat AI Endpoints (AiController)

| # | Method | Path | Purpose | Guards | Notes |
|---|--------|------|---------|--------|-------|
| 1 | POST | `/ai/compose` | AI email composition | Consent(ai_email_processing), Quota(ai) | Requires prompt in body |
| 2 | POST | `/ai/summarize/:emailId` | Summarize email | Consent(ai_email_processing), Quota(ai) | Uses unified analysis |
| 3 | POST | `/ai/smart-reply/:emailId` | Generate smart replies | Consent(ai_email_processing), Quota(ai) | Returns suggestions[] |
| 4 | POST | `/ai/categorize/:emailId` | Categorize email | Consent(ai_email_processing), Quota(ai) | Returns labels[] |
| 5 | POST | `/ai/sentiment/:emailId` | Sentiment analysis | Consent(ai_email_processing), Quota(ai) | Uses unified analysis |
| 6 | POST | `/ai/priority/:emailId` | Priority scoring | Consent(ai_email_processing), Quota(ai) | Uses unified analysis |
| 7 | POST | `/ai/analyze/:emailId` | Full analysis | Consent(ai_email_processing), Quota(ai) | Comprehensive result |
| 8 | POST | `/ai/triage` | Auto-triage | Consent(ai_auto_triage), Quota(ai) | Processes untriaged |
| 9 | GET | `/ai/triage/backfill/status` | Backfill status | Tenant only | No quota needed |
| 10 | GET | `/ai/follow-ups/pending` | Pending follow-ups | Tenant only | Query: limit, includeResolved |
| 11 | GET | `/ai/follow-ups/stats` | Follow-up stats | Tenant only | Aggregate counts |
| 12 | GET | `/ai/briefing` | Daily briefing | Consent(ai_email_processing), Quota(ai) | Uses user timezone |
| 13 | POST | `/ai/briefing/refresh` | Refresh briefing | Consent(ai_email_processing), Quota(ai) | Force regenerate |
| 14 | POST | `/ai/drafts/generate` | Generate reply draft | (implied Quota) | Requires emailId |
| 15 | GET | `/ai/deadlines` | Upcoming deadlines | Tenant only | Query: days |
| 16 | POST | `/ai/memory/search` | Knowledge base search | Quota(ai) | Body: query, emailId, limit |

### BAPI-14: AI Chat Endpoints (AiChatController)

| # | Method | Path | Purpose | Guards |
|---|--------|------|---------|--------|
| 1 | POST | `/ai/chat` | Stream chat (SSE) | Tenant, Consent(ai_chat), Quota(ai) |
| 2 | POST | `/ai/chat/conversations` | Create conversation | Tenant, Consent, Quota |
| 3 | GET | `/ai/chat/conversations` | List conversations | Tenant, Consent, Quota |
| 4 | GET | `/ai/chat/conversations/:id` | Get conversation + messages | Tenant, Consent, Quota |
| 5 | DELETE | `/ai/chat/conversations/:id` | Delete conversation | Tenant, Consent, Quota |

### BAPI-15: Knowledge Base (KnowledgeBaseController)

| # | Method | Path | Purpose | Guards |
|---|--------|------|---------|--------|
| 1 | POST | `/ai/knowledge-base/emails/backfill` | Backfill embeddings | Admin only |
| 2 | GET | `/ai/knowledge-base/embeddings` | List embeddings | Admin only |
| 3 | DELETE | `/ai/knowledge-base/embeddings/:id` | Delete embedding | Admin only |
| 4 | DELETE | `/ai/knowledge-base/embeddings/email/:emailId` | Purge email embeddings | Admin only |
| 5 | POST | `/ai/knowledge-base/search` | Semantic search | Quota(ai) |

### BAPI-16: AI Observability (AiObservabilityController)

| # | Method | Path | Purpose | Guards |
|---|--------|------|---------|--------|
| 1 | GET | `/ai/runs` | List AI runs (paginated) | Admin, RolesGuard |
| 2 | GET | `/ai/runs/cost-summary` | Aggregate cost summary | Admin, RolesGuard |

### FE-06: Chat Frontend Components

| # | Component | Verification |
|---|-----------|-------------|
| 1 | ChatPage | Route renders, skeleton -> runtime transition |
| 2 | ChatRuntimeProvider | SSE transport connects, CSRF token warmed |
| 3 | ChatThreadList | Lists conversations, new/delete work |
| 4 | ChatThread | Messages render, scroll follows |
| 5 | ChatComposer | Input accepts text, send triggers stream |
| 6 | ChatEmptyState | Shows when no messages |
| 7 | AssistantMessage | Streaming markdown renders progressively |
| 8 | HitlApprovalCard | Approve/deny buttons work, busy spinner shows |
| 9 | Tool UIs (17) | Each registered tool renders structured data |
| 10 | ChatDesktopLayout | Sidebar + thread side-by-side (md+) |
| 11 | ChatMobileLayout | Single-panel switching |

## Testing Infrastructure

### Test Framework

| Property | Value |
|----------|-------|
| Framework (backend unit) | Jest (*.spec.ts) |
| Framework (backend integration) | Vitest (*.test.ts) |
| Framework (frontend) | N/A for this phase (manual browser verification) |
| Backend quick run | `cd backend && npx vitest run --reporter=verbose` |
| Backend Jest | `cd backend && npx jest --forceExit` |

### Existing Test Coverage

| Test File | What It Covers | Framework |
|-----------|---------------|-----------|
| `ai-chat/__tests__/hitl-contract.test.ts` | HITL tool governance (needsApproval flags) | Vitest |
| `ai-chat/__tests__/ai-chat-e2e.test.ts` | Full pipeline with real Mistral API | Vitest |
| `ai-chat/__tests__/chat-pipeline-msw.test.ts` | Chat pipeline with MSW mocks | Vitest |
| `ai-chat/__tests__/conversation.test.ts` | Conversation CRUD | Vitest |
| `ai-chat/__tests__/conversation-format.test.ts` | Message format conversion | Vitest |
| `ai-chat/__tests__/hybrid-search.test.ts` | Hybrid search (vector + keyword) | Vitest |
| `ai-chat/__tests__/security-isolation.test.ts` | Tenant isolation for chat | Vitest |
| `ai/__tests__/ai-observability.controller.test.ts` | Observability endpoints | Vitest |
| `frontend/chat-request-body.test.ts` | Request body construction | (frontend test) |
| `frontend/chat-thread-list-adapter.test.ts` | Thread list adapter | (frontend test) |

### Verification Strategy

This phase is primarily **manual/E2E verification** against the deployed system (Railway backend + Vercel frontend). Existing unit/integration tests provide baseline confidence but the phase goal is confirming real end-to-end behavior.

**Recommended verification order:**
1. Backend API endpoints via curl/Swagger (BAPI-13, BAPI-14, BAPI-15, BAPI-16)
2. Frontend chat UI in browser (FE-06)

### Sampling Rate
- **Per task:** Verify each endpoint returns expected shape
- **Per wave:** Run existing vitest suite to confirm no regressions
- **Phase gate:** All success criteria met on deployed system

### Wave 0 Gaps
None -- existing test infrastructure covers baseline. Phase 92 adds no new tests (verification only).

## Validation Architecture

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Verification Method |
|--------|----------|-----------|-------------------|
| BAPI-13 | Non-chat AI endpoints return valid responses | Manual API | curl each endpoint with valid emailId, check response shape |
| BAPI-14 | Chat streaming + conversation CRUD + HITL | Manual E2E | Send message via UI, verify stream, create/list/delete conversations, trigger HITL tool |
| BAPI-15 | Knowledge base backfill/list/delete/search | Manual API | Admin curl to backfill, list, search; verify results |
| BAPI-16 | Observability runs + cost summary | Manual API | Admin curl to GET /ai/runs and /ai/runs/cost-summary after running AI operations |
| FE-06 | Chat UI renders and functions | Manual browser | Load chat page, send message, verify streaming, HITL, tool UIs, conversation switching |

## Open Questions

1. **Mistral API key validity on Railway**
   - What we know: Backend uses `MISTRAL_API_KEY` env var, MistralService has circuit breaker
   - What's unclear: Whether the production API key is active and has sufficient quota
   - Recommendation: Check `/ai/health` endpoint first; if unhealthy, investigate key/quota

2. **Consent records for test user**
   - What we know: ConsentGuard checks `ai_chat` and `ai_email_processing` consent
   - What's unclear: Whether the test user has granted all required consents
   - Recommendation: If 403 errors appear, check/create consent records in the compliance module

3. **Subscription tier of test user**
   - What we know: QuotaGuard enforces FREE tier limits ($0.10/day, 50 calls/month)
   - What's unclear: Whether test user has PRO subscription or will hit quota during testing
   - Recommendation: Verify subscription status before heavy testing; upgrade if needed

## Sources

### Primary (HIGH confidence)
- `backend/src/modules/ai-chat/controllers/ai-chat.controller.ts` -- Chat streaming + CRUD endpoints
- `backend/src/modules/ai/controllers/ai.controller.ts` -- Non-chat AI endpoints (16 endpoints)
- `backend/src/modules/ai/controllers/knowledge-base.controller.ts` -- KB CRUD + search
- `backend/src/modules/ai/controllers/ai-observability.controller.ts` -- Run history + cost
- `frontend/src/components/chat/ChatRuntimeProvider.tsx` -- AI SDK + assistant-ui bridge
- `frontend/src/components/chat/HitlApprovalCard.tsx` -- SDK-native HITL approval UI
- `frontend/src/components/chat/chat-thread-list-adapter.tsx` -- Backend conversation adapter
- `frontend/src/components/chat/tool-uis/index.tsx` -- Tool renderer registry
- `frontend/lib/api/ai.ts` -- Frontend API module for all AI operations

### Secondary (HIGH confidence)
- `backend/src/modules/ai-chat/__tests__/hitl-contract.test.ts` -- HITL governance tests
- `backend/src/modules/ai-chat/utils/active-tools.ts` -- Intent-based tool selection
- `.planning/phases/92-ai-knowledge-base-verification/92-UI-SPEC.md` -- UI design contract

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and in use, versions read from package.json
- Architecture: HIGH -- all code directly read and analyzed from the codebase
- Pitfalls: HIGH -- derived from actual guard logic, controller comments, and existing test infrastructure
- Endpoints: HIGH -- complete inventory extracted from source code

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable -- verification of existing code, no external dependency changes expected)
