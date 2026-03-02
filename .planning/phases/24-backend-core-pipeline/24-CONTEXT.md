# Phase 24: Backend Core Pipeline - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

New AiChatModule replaces the old VoltAgent chat pipeline entirely. AiChatService handles chat orchestration end-to-end: streaming via AI SDK v6, conversation history via Prisma, HITL approval for destructive actions, GDPR compliance (PII tokenization + audit logging), and rate limiting. Old VoltAgent chat code is deleted in this phase — atomic swap, not coexistence.

**Roadmap update needed:** Success criteria #1 says "old v3 endpoint still works unchanged" — user explicitly chose full replacement. Update to: "New endpoint replaces old endpoint at same URL path. Old chat pipeline code deleted."

</domain>

<decisions>
## Implementation Decisions

### Streaming Contract
- AI SDK v6 native data stream protocol — frontend (assistant-ui in Phase 27) consumes natively
- Typed chunks: text-delta, tool-call, tool-result, error, usage
- Error handling: emit typed error chunk in stream, then close gracefully. No HTTP error abort — frontend renders partial content + error
- Optional `conversationId` param: if provided, load and continue; if omitted, create new conversation
- Conversation history: pre-compute rolling summaries of older messages (stored async), keep recent messages verbatim — similar to Claude/ChatGPT approach
- System prompt: server-side only, injected by AiChatService, never sent to/from frontend
- Cancellation: AbortController support — partial response saved as-is to conversation
- Multi-step agent loop: AI SDK v6 `maxSteps` with cap at 5 steps per request
- Tool events: stream emits tool-call and tool-result chunks for real-time visibility
- Usage metadata: final chunk includes token counts (prompt/completion), model, latency

### HITL Approval Flow
- Inline in stream: stream pauses, emits typed 'needs-approval' chunk with action details
- Three actions: approve as-is, reject, or **modify then approve** (user can edit action parameters inline)
- Modified actions: show diff of changes and require re-confirmation before execution
- Timeout: 1 hour auto-deny for pending actions
- Configurable per tool: each tool tagged as needs-approval or auto-execute, user can customize in settings
- Batch approval: related destructive actions grouped into one approval card
- Per-item control in batch: user can approve/reject individual items within a batch
- Per-tool trust setting: user can mark specific tools as auto-approved (aligns with configurable per-action)
- Persistence: pending HITL actions persisted in DB (survives page refresh, required for 1-hour timeout)
- History: both inline indicator in chat + detailed entry in activity/audit log
- Rejection: AI acknowledges rejection within the stream, conversation continues

### Replacement Strategy (No Coexistence)
- Delete all old VoltAgent chat pipeline code in Phase 24 — atomic swap
- Same URL path (`POST /api/v1/ai/chat`) — new implementation, frontend doesn't need URL changes
- New dedicated NestJS module: AiChatModule (AiChatController, AiChatService, ConversationService)
- Tools defined inside AiChatModule (not imported from old AI module)
- No rollback mechanism — E2E validation gate must pass before merge. Accept the risk.
- No feature flag — if tests pass, ship it

### GDPR Pipeline Wiring
- PII tokenization before LLM call — LLM never sees raw PII
- PII detokenized before tool execution — tools need real data to work
- Consent gate: first-time users must accept AI terms before chat activates (stored in user profile)
- Rate limiting: per-user only (X requests/minute), not per-org

### Claude's Discretion
- Data model approach: reuse existing conversation tables vs new schema — evaluate for cleanest result
- PII boundary details: decide the full tokenize/detokenize round-trip based on what's practical vs GDPR-required
- Audit logging level: evaluate GDPR requirements and existing patterns to decide full interaction log vs summary
- Circuit breaker configuration: thresholds, recovery behavior
- Rate limiter implementation: Redis-based, in-memory, or NestJS throttler — pick what fits
- Summary generation strategy: when to trigger, how much history to summarize, storage format

</decisions>

<specifics>
## Specific Ideas

- "Look at ZeroClaw (github.com/openagen/zeroclaw/tree/main/src)" — reference architecture with: dedicated approval module, agent pipeline (classifier -> dispatcher -> loop -> memory_loader), separate security module (audit, policy, secrets)
- User wants it to feel like Claude/ChatGPT: summarized older history, real-time tool visibility, inline approval
- Batch HITL with per-item granularity — user can selectively approve/reject within a batch
- Modify-then-approve flow: user edits action params inline, sees diff, confirms — not just binary approve/reject

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 24-backend-core-pipeline*
*Context gathered: 2026-03-02*
