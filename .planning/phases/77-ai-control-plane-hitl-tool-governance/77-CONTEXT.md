# Phase 77: AI Control Plane -- HITL & Tool Governance - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Unify the HITL contract, add tool governance metadata to IToolRegistryService, fix the ActionType enum taxonomy, clean the pending-actions DTO, and write contract + E2E tests covering 100% of HIGH-risk tools. Scope: AICP-01, AICP-02, AICP-03, AICP-04, AICP-12, AICP-14.

</domain>

<decisions>
## Implementation Decisions

### Tool Governance Metadata
- Extend existing `IToolRegistryService` (Phase 32 stub) with governance fields: `domain`, `riskLevel`, `requiresApproval`, `inputSchema`
- Each tool service registers metadata at startup via the registry -- registry is the single source of truth
- Research backed this: MCP spec `ToolAnnotations`, Google Vertex AI API Registry, LangGraph governance patterns all converge on centralized registry
- `needsApproval` stays on AI SDK `tool()` calls for SDK compatibility, but the registry is authoritative for HITL
- No decorators -- explicit registry registration preferred over reflection-based metadata

### Risk Taxonomy
- 3-tier: LOW / MEDIUM / HIGH
- LOW = read-only, no side effects (search_emails, read_email, view_calendar, list_contacts, list_folders, semantic_search, ask_user)
- MEDIUM = reversible mutations (archive_email, move_email, create_event, update_event, draft_email, create_contact, update_contact, create_folder, save_memory, run_code)
- HIGH = irreversible or external side effects (send_email, delete_email, forward_email, reply_email, delete_event, delete_contact)
- Aligns with MCP spec destructive/readOnly semantics and NIST AI RMF impact tiers

### Approval Rules
- Default convention: `riskLevel === 'HIGH'` implies `requiresApproval: true`
- MEDIUM and LOW default to `requiresApproval: false`
- Tools can override (e.g., a MEDIUM tool that still needs approval)
- Keeps boilerplate low with an explicit escape hatch

### Tool Domains
- 6 domains: `email`, `calendar`, `contacts`, `knowledge` (RAG/memory), `productivity` (tasks/reminders), `system` (sandbox, ask_user)
- Matches existing tool service file boundaries
- Domain flows into frontend rendering and risk context

### Action Taxonomy Fix
- ActionType enum values will match tool names 1:1: `SEND_EMAIL` for `send_email`, `DELETE_EVENT` for `delete_event`, etc.
- `resolveToolName()` lookup table in the controller disappears -- tool name IS the action type
- Only mutating tools get ActionType enum values (tools that can trigger HITL)
- Read-only tools never create ActionQueue entries, no enum values needed
- Prisma migration: SQL data migration to rename existing values (e.g., `SCHEDULE_MEETING` → `DELETE_EVENT`), then ALTER TYPE to add/remove enum values

### Controller Refactor
- `resolveToolName()` and hardcoded `mapSeverity()` in HitlController disappear
- Controller asks the registry for tool metadata instead of maintaining its own mapping
- `getExecutableTool()` replaced by registry lookup

### Approval Response Contract
- 3 outcome states: `executed` / `failed` / `rejected`
- Approve always attempts execution immediately -- no `approved_only` state
- Response shape: `{ outcome, summary, executionTimeMs, data?, error?, reason? }`
- Summary + data returned (e.g., `summary: 'Email sent to john@...'`, `data: { messageId }`)
- Frontend shows summary, data available for detailed rendering

### Pending Actions DTO Cleanup
- Clean break: remove redundant fields
  - Drop `executionId` (use `id`)
  - Drop `agentName` (always `ai-chat`)
  - Drop `adjustedConfidence` (unused)
- Add `riskLevel` from tool registry
- Add `domain` from tool registry
- Frontend HitlApprovalCard adapts to new contract
- Types generated from swagger.json (existing pattern)

### Test Strategy
- **Contract tests (AICP-12):** supertest against real NestJS app with test DB
  - Verify pending-actions returns exact DTO shape
  - Verify approve returns { outcome, summary, data } for each decision type (approve/reject/modify)
  - Verify 404/403 error response shapes
  - Registry assertion test: get all tools, assert every tool has name, domain, riskLevel, requiresApproval, inputSchema -- replaces existing tool-approval-gates.spec.ts
- **E2E HITL tests (AICP-14):** against real Railway deployment with dvdmarchetto@gmail.com tenant
  - 100% coverage of all HIGH-risk tools: send_email, delete_email, forward_email, reply_email, delete_event, delete_contact
  - Full flow: trigger pending action → approve → execute → verify outcome in real system
  - Tests use self-targeting or test-created data to avoid destructive side effects on real data

### Claude's Discretion
- Exact IAiTool interface field types and method signatures
- Registry initialization pattern (module onModuleInit vs factory)
- Prisma migration ordering and rollback strategy
- Test fixture setup and cleanup approach
- Whether to keep tool-approval-gates.spec.ts or fully replace it

</decisions>

<specifics>
## Specific Ideas

- Research showed MCP spec ToolAnnotations (destructive/readOnly/idempotent) as the closest industry standard -- adopt compatible semantics
- User wants E2E tests against real Railway deployment, not mocked -- dvdmarchetto@gmail.com tenant is the test tenant
- User wants 100% test coverage of all HIGH-risk tools in E2E

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `IToolRegistryService` at `backend/src/common/interfaces/tool-registry.interface.ts` -- Phase 32 stub, needs governance fields added
- `tool-approval-gates.spec.ts` -- existing test for needsApproval flags on all 20 tools, will be replaced by registry assertion
- `HitlApprovalCard.tsx` -- frontend component for rendering pending actions, needs update for new DTO
- `stress-db-integration.test.ts` -- existing integration test patterns for ActionQueue

### Established Patterns
- Tool services use `getTools(tenantId, conversationId, piiResolve)` returning `Record<string, unknown>` -- needs typed return
- HitlService uses Prisma ActionQueue with `ActionStatus` enum (PENDING_APPROVAL, APPROVED, REJECTED, EXECUTED, FAILED, EXPIRED)
- PII resolution via closure pattern in tool construction
- Swagger-generated types for frontend API contracts

### Integration Points
- `AiChatService.createToolSet()` -- where tools are assembled and PII resolution is wired
- `HitlService.createPendingAction()` -- needs riskLevel added to CreateActionParams
- `ActionQueue` Prisma model -- needs riskLevel column added
- `ActionType` Prisma enum -- needs values renamed/added/removed
- Frontend `swagger.json` -- regenerated after DTO changes

</code_context>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 77-ai-control-plane-hitl-tool-governance*
*Context gathered: 2026-03-18*
