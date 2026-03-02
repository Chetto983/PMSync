# Phase 25: Tools & RAG - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

All chat tools defined as AI SDK v6 `tool()` in `@Injectable()` ToolsService classes with NestJS DI, intent-based routing via `prepareStep` + `activeTools`, and hybrid RAG search (vector + keyword with RRF fusion). Duplicate tool elimination and preserved embedding pipeline.

Frontend rendering of tool results is Phase 27 scope. Non-chat AI (briefing, follow-ups) is Phase 26 scope.

</domain>

<decisions>
## Implementation Decisions

### Tool Inventory (~20 tools)
- Full ~20 tools across all domains, not a lean subset
- **Email (9):** send_email, search_emails, read_email, archive_email, move_email, delete_email, forward_email, reply_email, draft_email
- **Calendar (4):** view_calendar, create_event, update_event, delete_event
- **Contacts (3):** search_contacts, create_contact, update_contact
- **Folders (2):** list_folders, create_folder
- **RAG & Utility (2-3):** semantic_search (unified), save_memory, recall via auto-inject

### Tool Grouping
- Claude's discretion on how to split into ToolsService classes — based on NestJS DI constraints and module boundaries

### Tool Granularity
- Claude's discretion: separate vs consolidated tools per entity — follow Anthropic best practices (separate tools with focused schemas reduce selection errors)

### Unified Semantic Search
- Single `semantic_search` tool covering all sources: `{ query, sources?: ('emails'|'contacts'|'calendar')[], limit? }`
- LLM specifies what to search, or auto-detects source from query context

### Memory (ChatGPT-style via mem0 philosophy)
- `save_memory` tool — LLM explicitly saves key facts (like ChatGPT's bio tool). Timestamped, structured.
- Auto-inject: before each chat turn, search stored memories by similarity to user message, inject top-3 relevant memories into system prompt ("Known facts about this user: ...")
- No explicit `recall_memory` tool needed — memories are always available in system prompt context
- Background auto-extraction is deferred to Phase 30+ (hot-path tool-only for Phase 25)

### Email Tool Details
- `read_email` returns existing fields (snippet, bodyText truncated, triage labels/sentiment) — no extra LLM call. Triage already generates summaries on ingestion.
- `draft_email` creates a real draft in the email provider (Gmail/Outlook) via IMAP/API, not just chat-only text

### Tool Return Data
- All tools return rich, artifact-ready structured objects (full created/modified entity with context)
- Tool results serve as payload for Phase 27 frontend tool renderers (`makeAssistantToolUI`)
- E.g., `search_emails` returns `{ results: [{ id, from, subject, date, snippet, labels }] }` → rendered as email cards

### Intent Routing (prepareStep + activeTools)
- **No find_tool meta-tool** — use AI SDK v6's native `prepareStep` callback with `activeTools` parameter
- All ~20 tools defined upfront in ToolsService classes. `prepareStep` gates which are active per step.
- **Step 0:** IntentClassifier (FastText, existing, bilingual EN/IT) classifies user query → maps to 6-8 relevant `activeTools`
- **Subsequent steps:** `prepareStep` can expand `activeTools` based on previous step results (e.g., email search result → add reply/forward tools)
- **Low confidence fallback:** When FastText confidence < threshold, use small Mistral model (Ministral 3B) as LLM-based router for intent classification
- **Two-tier routing:** FastText (fast, local, free) → Ministral 3B fallback (accurate, cheap, handles ambiguous multi-domain queries)
- **Per-turn scoping:** Tool access does not persist across turns. Each user message triggers fresh intent classification.
- **find_tool is silent/invisible:** No "searching for tools" shown to user in chat

### Multi-step Tool Chains
- AI SDK v6 `streamText` with `maxSteps: 5` — LLM can chain up to 5 tool calls in a single turn
- Enables: search → read → analyze → draft → confirm
- `prepareStep` dynamically adjusts `activeTools` between steps

### Scalability
- Tools are NestJS singletons — zero per-user RAM cost
- Token savings from intent routing: ~70% reduction vs loading all 20 tools (critical at 10K users × 20 req/day = 200K req/day)

### HITL & Destructive Actions
- **Approval required (6 tools):** send_email, reply_email, forward_email (external), delete_email, delete_event, delete_contact (permanent)
- **No approval (14 tools):** draft_email (internal), archive/move (reversible), create/update events/contacts (internal), all read/search tools, save_memory
- **Rejection with reason:** User can optionally type why they rejected. AI receives feedback and adjusts (e.g., rewrite less formally)
- **Auto-expire:** Pending HITL actions expire after a timeout. AI informs user the action was cancelled if expired.
- **Stream results to chat:** After approval, tool executes and result appears inline in the conversation
- **Backend data structure** must include enough info for Phase 27 approval cards (to/subject/body for emails, event details for calendar)

### Hybrid Search (RAG)
- **PostgreSQL Full-Text Search (tsvector)** for keyword path — not Prisma `contains`
- Migration: add `tsvector` columns + GIN indexes to Email, Contact, and CalendarEvent tables
- **RRF fusion:** K=50 (Supabase default), equal weights 1:1 (vector:keyword), pull 20 from each source → fuse to top 10
- **Sources:** Emails + Contacts + Calendar events
- **Calendar RAG:** Claude's discretion on embedding vs FTS-only for calendar events (calendar data is short/structured, FTS may suffice)
- Preserve existing embedding pipeline (BullMQ queues, KnowledgeBase, pgvector storage) — extend, don't replace

### Claude's Discretion
- ToolsService class grouping and naming
- Tool granularity (separate vs consolidated) — follow Anthropic best practices
- Calendar embedding strategy (full embed vs FTS-only)
- Exact IntentClassifier → activeTools mapping rules
- HITL auto-expire timeout duration
- Batch HITL behavior (multiple pending actions simultaneously vs one-at-a-time)
- Calendar tool datetime handling (LLM parses natural language vs server-side)

</decisions>

<specifics>
## Specific Ideas

- **Anthropic's advanced tool use guide** — tool search pattern, clear naming with detailed descriptions, JSON Schema + examples for better accuracy, programmatic tool calling for multi-step workflows
  - Source: https://www.anthropic.com/engineering/advanced-tool-use
- **Zeroclaw architecture** — modular domain separation (tools, skills, approval, rag, memory as separate modules)
  - Source: https://github.com/openagen/zeroclaw/tree/main/src
- **mem0 memory philosophy** — automatic extraction + semantic retrieval, layered memory (user/session/agent)
  - Source: https://github.com/mem0ai/mem0
- **ChatGPT memory architecture** — bio tool for explicit saves, 6-layer system prompt injection (Model Set Context with timestamps), no vector search per turn
  - Source: https://embracethered.com/blog/posts/2025/chatgpt-how-does-chat-history-memory-preferences-work/
- **assistant-ui HITL pattern** — `makeAssistantToolUI` with `status.type === "requires_action"`, `addResult()` for approve/reject, rich preview cards
  - Source: https://www.assistant-ui.com/docs/copilots/make-assistant-tool-ui
- **AI SDK v6 prepareStep** — native dynamic tool gating via `activeTools` + `prepareStep` callback, no need for find_tool meta-tool
  - Source: https://ai-sdk.dev/docs/agents/loop-control
- **Supabase hybrid search** — native PostgreSQL function with RRF, K=50, equal weights, FULL OUTER JOIN fusion
  - Source: https://supabase.com/docs/guides/ai/hybrid-search
- **RRF best practice** — pull 20 from each source, fuse to 10. Hybrid improves accuracy 8-15% over pure vector (62% → 84%)
- **System prompts reference** — D:\MailAgent\esempio\system-prompts-and-models-of-ai-tools-main (Manus, Anthropic, Google patterns)

</specifics>

<deferred>
## Deferred Ideas

- **Background auto-extraction of memories** (mem0-style post-conversation extraction) — Phase 30+ enhancement, requires separate orchestration logic
- **User-configurable HITL preferences** (power users skip approval for certain tools) — future UX phase
- **HITL edit-before-approve** (user modifies draft before sending) — Phase 27 frontend enhancement

</deferred>

---

*Phase: 25-tools-rag*
*Context gathered: 2026-03-02*
