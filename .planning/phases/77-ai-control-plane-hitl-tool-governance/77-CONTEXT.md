# Phase 77: AI Control Plane -- HITL & Tool Governance - Context

**Gathered:** 2026-03-18 (updated)
**Status:** Ready for re-planning

<domain>
## Phase Boundary

Replace the custom HITL infrastructure (HitlController, HitlService, ActionQueue) with AI SDK v6's native approval flow (`needsApproval`, `addToolApprovalResponse`, `part.state`). Add tool governance metadata to IToolRegistryService. Drop the ActionType enum (ActionQueue removed). Write contract + E2E tests covering 100% of HIGH-risk tools. Scope: AICP-01, AICP-02, AICP-03, AICP-04, AICP-12, AICP-14.

**Key principle:** Don't reinvent the wheel — AI SDK already provides the HITL lifecycle natively. Use `needsApproval` on tool definitions, `status.type === 'requires-action'` + `addResult` on the frontend via assistant-ui's `makeAssistantToolUI`.

</domain>

<decisions>
## Implementation Decisions

### SDK-Native HITL (Architecture Pivot)
- Use AI SDK v6 native approval flow: `needsApproval: true` on `tool()` definitions pauses execution and enters `approval-requested` state
- Frontend detects `status.type === 'requires-action'` in `makeAssistantToolUI` render callback and shows approval UI
- `addResult({ approved: true/false })` sends user decision back through assistant-ui
- `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses` auto-resubmits after approval
- **Replaces entirely:** HitlController, HitlService, ActionQueue table, ActionType enum, ActionStatus enum, pending-actions polling
- Reference: https://ai-sdk.dev/cookbook/next/human-in-the-loop

### ActionQueue Removal (Clean Delete)
- Drop `ActionQueue` Prisma model via migration (`DROP TABLE`, `DROP TYPE` for ActionType and ActionStatus enums)
- Delete `HitlController` (`backend/src/modules/ai-chat/controllers/hitl.controller.ts`)
- Delete `HitlService` (`backend/src/modules/ai-chat/services/hitl.service.ts`)
- Delete `hitl.dto.ts` (`backend/src/modules/ai-chat/dto/hitl.dto.ts`)
- Delete `hitl.controller.spec.ts`, `hitl.test.ts`
- No 410 Gone stubs — clean break, frontend and backend deploy together
- Conversation message history IS the audit trail — no separate audit table needed

### Approval UX: Approve/Deny Only
- Two decisions: approve or deny. No "modify" option
- If user wants changes, they deny and tell the AI what to change in natural language via chat
- Matches AI SDK native pattern exactly (approve: true/false)

### Shared HitlApprovalWrapper
- One shared wrapper component that any `makeAssistantToolUI` can use when `status.type === 'requires-action'`
- `FallbackToolUI` includes the wrapper so tools without custom renderers still show approval cards
- Approval card shows: tool name + human-readable summary derived from args (e.g., "Send email to john@... with subject 'Meeting'")
- No raw JSON params — summary generation logic per tool type
- Existing `HitlApprovalCardFromStatus` evolves into the shared wrapper
- Poll-based `HitlApprovalCard` deleted (dead code after ActionQueue removal)

### System Prompt: Denial Handling
- Add instruction to existing system prompt builder: "When a tool execution is denied by the user, do not retry it. Inform the user that the action was not performed."
- Prevents model retry loops on denied tools

### Tool Governance Metadata (Unchanged)
- Extend existing `IToolRegistryService` (Phase 32 stub) with governance fields: `domain`, `riskLevel`, `requiresApproval`, `inputSchema`
- Each tool service registers metadata at startup via the registry — registry is the single source of truth
- `needsApproval` stays on AI SDK `tool()` calls for SDK compatibility; registry is authoritative for metadata queries
- No decorators — explicit registry registration preferred over reflection-based metadata

### Risk Taxonomy (Unchanged)
- 3-tier: LOW / MEDIUM / HIGH
- LOW = read-only, no side effects (search_emails, read_email, view_calendar, list_contacts, list_folders, semantic_search, ask_user)
- MEDIUM = reversible mutations (archive_email, move_email, create_event, update_event, draft_email, create_contact, update_contact, create_folder, save_memory, run_code)
- HIGH = irreversible or external side effects (send_email, delete_email, forward_email, reply_email, delete_event, delete_contact)
- Aligns with MCP spec destructive/readOnly semantics and NIST AI RMF impact tiers

### Approval Rules (Unchanged)
- Default convention: `riskLevel === 'HIGH'` implies `requiresApproval: true` (i.e., `needsApproval: true` on `tool()`)
- MEDIUM and LOW default to `requiresApproval: false`
- Tools can override (e.g., a MEDIUM tool that still needs approval)

### Tool Domains (Unchanged)
- 6 domains: `email`, `calendar`, `contacts`, `knowledge` (RAG/memory), `productivity` (tasks/reminders), `system` (sandbox, ask_user)
- Matches existing tool service file boundaries
- Domain flows into frontend rendering and risk context

### Test Strategy (Revised)
- **Registry governance assertion test:** Get all tools from registry, assert each has name, domain, riskLevel, requiresApproval, inputSchema. Replaces `tool-approval-gates.spec.ts`
- **Backend integration tests (AICP-12):** supertest against real NestJS app with test DB
  - Test SSE chat stream: send message triggering HIGH-risk tool → parse stream for approval-requested → send approval → verify tool execution in stream
  - Verify registry returns correct governance metadata for all tools
  - Verify 100% of HIGH-risk tools trigger approval-requested state
- **Playwright E2E smoke test (AICP-14):** against real deployment
  - Type message triggering HIGH-risk tool → wait for approval card to render → click Approve → verify result card appears
  - Lightweight smoke test — protocol correctness covered by backend integration tests
  - Tests use self-targeting or test-created data to avoid destructive side effects

### Claude's Discretion
- Exact IAiTool interface field types and method signatures
- Registry initialization pattern (module onModuleInit vs factory)
- Prisma migration ordering (drop table, drop enums)
- Human-readable summary generation approach per tool type
- Whether to keep tool-approval-gates.spec.ts during transition or delete immediately
- Playwright test scope (how many HIGH-risk tools to cover vs single smoke test)

</decisions>

<specifics>
## Specific Ideas

- AI SDK native HITL cookbook: https://ai-sdk.dev/cookbook/next/human-in-the-loop
- assistant-ui already provides `makeAssistantToolUI` with `status`, `addResult`, `args`, `toolName` — the plumbing exists
- `HitlApprovalCardFromStatus` is already coded but marked "NOT ACTIVE" — activate and evolve it
- `TriageToolUI` already checks `status.type === 'requires-action'` — use as reference pattern
- User wants codebase clean and maintainable — aggressive deletion of dead code, no stubs

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `HitlApprovalCardFromStatus` at `frontend/src/components/chat/HitlApprovalCard.tsx:151` — already has addResult pattern, evolve into shared wrapper
- `TriageToolUI` at `frontend/src/components/chat/tool-uis/TriageToolUI.tsx` — reference pattern for `requires-action` handling
- `IToolRegistryService` at `backend/src/common/interfaces/tool-registry.interface.ts` — Phase 32 stub, needs governance fields added
- `tool-approval-gates.spec.ts` — 5 destructive + 15 read-only approval assertions, replaced by registry test
- `ChatRuntimeProvider` at `frontend/src/components/chat/ChatRuntimeProvider.tsx` — uses `AssistantChatTransport`, may need `sendAutomaticallyWhen` added

### Established Patterns
- Tool services use `tool()` from AI SDK with `needsApproval: true` — 5 tools already flagged (send_email, delete_email, forward_email, reply_email, delete_event)
- `makeAssistantToolUI` provides `{ status, result, addResult, toolName, args }` render props
- PII resolution via closure pattern in tool construction
- Swagger-generated types for frontend API contracts

### Integration Points
- `AiChatService.createToolSet()` — where tools are assembled; needs registry metadata wired
- `ChatRuntimeProvider` — may need `sendAutomaticallyWhen` configuration for auto-resubmission
- `FallbackToolUI` — needs HitlApprovalWrapper for tools without custom renderers
- System prompt builder — needs denial-handling instruction added
- Prisma schema — ActionQueue model, ActionType enum, ActionStatus enum all deleted

### Delete List
- `backend/src/modules/ai-chat/controllers/hitl.controller.ts` (388 lines)
- `backend/src/modules/ai-chat/controllers/__tests__/hitl.controller.spec.ts`
- `backend/src/modules/ai-chat/services/hitl.service.ts`
- `backend/src/modules/ai-chat/dto/hitl.dto.ts`
- `backend/src/modules/ai-chat/__tests__/hitl.test.ts`
- `backend/src/modules/ai-chat/tools/tool-approval-gates.spec.ts`
- `frontend/src/components/chat/HitlApprovalCard.tsx` poll-based component (lines 1-135)
- ActionQueue Prisma model + ActionType/ActionStatus enums (migration)
- Frontend API functions for pending-actions polling and approve/reject calls

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 77-ai-control-plane-hitl-tool-governance*
*Context gathered: 2026-03-18 (updated with SDK-native HITL pivot)*
