# AI Agent Remediation Roadmap

> Date: 2026-03-15
> Based on: architecture audit of agent tools, HITL, long-term memory, legacy chat code, and system prompt/runtime alignment.

## Executive Summary

The agent stack has four structural problems:

1. HITL approval and execution are not on one coherent contract.
2. Tool execution governance is incomplete, especially for mutating actions.
3. Long-term memory write and retrieval paths are disconnected.
4. Frontend and backend still carry legacy chat contracts from before the streaming rewrite.

This roadmap fixes the system in dependency order. The goal is not just to remove bugs, but to converge on one agent architecture that is testable, observable, and safe to evolve.

## Target State

By the end of this roadmap, the platform should have:

- one canonical chat transport
- one canonical HITL DTO and approval lifecycle
- one canonical tool execution registry for both read and write tools
- one canonical memory persistence and retrieval path
- a system prompt that only references tools and behaviors that the product actually supports
- no active frontend code calling legacy chat or approval endpoints

## Current Critical Gaps

| Area | Current state | Risk |
|------|---------------|------|
| HITL execution | Approved actions can be marked approved before execution fails | False success, unsafe UX |
| Tool registry | Registry contains read/search tools, but HITL tries to execute write tools from it | Dead execution path |
| Memory | `save_memory` writes embeddings outside `AIMemory.vector`, retrieval only reads `AIMemory.vector` | Memory appears broken |
| Chat transport | Frontend still calls old non-streaming and dead streaming endpoints | Runtime drift, fragile features |
| Prompt/runtime | Prompt expects `ask_user` and `save_memory` UX that frontend does not render properly | Poor agent behavior, fallback JSON cards |
| Legacy surface | Old `/ai/actions/pending`, fake learning facade, old chat client still exist | Ongoing drift and confusion |

## Principles

- Canonical over compatible: choose one active contract per capability.
- Approval must mean executable, not just state-changed.
- Prompt, tools, backend DTOs, and frontend renderers must be version-aligned.
- Remove dead paths quickly once replacements are validated.
- Every phase ends with contract tests, not just manual verification.

## Phase 0: Freeze and Instrument

**Goal:** stop accidental drift while the architecture is being repaired.

### Work

- Inventory all active AI endpoints, tool names, approval action types, and frontend callers.
- Add structured logs and counters around:
  - tool lookup failures
  - HITL approval failures after approval
  - fallback tool UI renders
  - memory save vs memory retrieve hit rate
- Mark legacy endpoints and legacy frontend client methods with explicit deprecation comments.

### Deliverables

- endpoint/tool inventory doc
- runtime counters for tool execution, HITL, and memory retrieval
- deprecation tags in code for legacy chat/HITL surfaces

### Success Criteria

- every tool execution failure is observable by tool name and action type
- every pending-action endpoint is explicitly marked as canonical or legacy
- no anonymous fallback/failure path remains uninstrumented

## Phase 1: HITL Contract Unification

**Goal:** make one approval lifecycle work end to end.

### Work

- Choose one canonical pending-actions endpoint:
  - recommended: `/api/v1/ai/chat/pending-actions`
- Normalize backend response shape to the DTO the frontend actually needs:
  - `id`
  - `executionId`
  - `status`
  - `actionType`
  - `summary`
  - `payload`
  - `confidence`
  - `reasoning`
  - `createdAt`
  - `expiresAt`
- Make approve/reject endpoints return real execution outcome:
  - `approved_only`
  - `executed`
  - `failed`
- Remove the false-positive success case where approval returns 200 even when execution fails.
- Delete or hard-deprecate the legacy `/ai/actions/pending` controller mapping once frontend is migrated.

### Key Files

- [backend/src/modules/ai-chat/controllers/hitl.controller.ts](/d:/MailAgent/backend/src/modules/ai-chat/controllers/hitl.controller.ts)
- [backend/src/modules/ai-chat/services/hitl.service.ts](/d:/MailAgent/backend/src/modules/ai-chat/services/hitl.service.ts)
- [backend/src/modules/ai/controllers/ai.controller.ts](/d:/MailAgent/backend/src/modules/ai/controllers/ai.controller.ts)
- [frontend/lib/api/ai.ts](/d:/MailAgent/frontend/lib/api/ai.ts)
- [frontend/hooks/ai/use-ai-actions.ts](/d:/MailAgent/frontend/hooks/ai/use-ai-actions.ts)
- [frontend/src/components/chat/AssistantMessage.tsx](/d:/MailAgent/frontend/src/components/chat/AssistantMessage.tsx)

### Success Criteria

- frontend reads one pending-action DTO shape only
- approved actions cannot report success if execution fails
- no legacy pending-action endpoint is used by production UI

## Phase 2: Tool Execution Governance

**Goal:** make approval and execution use a real tool control plane.

### Work

- Define the canonical execution model for mutating tools:
  - either register them in `ToolRegistryService`
  - or move HITL execution to a dedicated action executor service
- Fix action-to-tool mapping:
  - remove invalid mappings like `SCHEDULE_MEETING -> delete_event`
- Require every executable tool to declare:
  - `name`
  - `domain`
  - `riskLevel`
  - `requiresApproval`
  - `inputSchema`
  - `outputSchema`
- Split read-only tool registration from mutating tool execution if needed, but make the boundary explicit.
- Add contract tests for each approved action type.

### Key Files

- [backend/src/modules/ai-chat/controllers/hitl.controller.ts](/d:/MailAgent/backend/src/modules/ai-chat/controllers/hitl.controller.ts)
- [backend/src/common/modules/tool-registry/tool-registry.service.ts](/d:/MailAgent/backend/src/common/modules/tool-registry/tool-registry.service.ts)
- [backend/src/common/interfaces/tool-registry.interface.ts](/d:/MailAgent/backend/src/common/interfaces/tool-registry.interface.ts)
- [backend/src/modules/email/email.module.ts](/d:/MailAgent/backend/src/modules/email/email.module.ts)
- [backend/src/modules/contacts/contacts.module.ts](/d:/MailAgent/backend/src/modules/contacts/contacts.module.ts)
- [backend/src/modules/calendar/calendar.module.ts](/d:/MailAgent/backend/src/modules/calendar/calendar.module.ts)

### Success Criteria

- every approval action type maps to a valid executable path
- no approved action can fail due to missing registration
- mutating tools have explicit approval metadata and schema coverage

## Phase 3: Long-Term Memory Repair

**Goal:** make memory write, storage, retrieval, and UI behavior consistent.

### Work

- Choose one canonical memory vector model:
  - preferred option A: store vectors directly on `AIMemory.vector`
  - alternative option B: retrieve from the separate embeddings store and stop querying `AIMemory.vector`
- Update `save_memory` and retrieval to use the same store.
- Add memory indexing rules:
  - per-tenant
  - per-user
  - category
  - tags
  - retention policy
- Define what qualifies as memory:
  - stable preferences
  - contact notes
  - workflow rules
  - explicit user facts
- Add tests for:
  - save -> retrieve
  - cross-tenant isolation
  - user-only isolation
  - duplicate memory behavior

### Key Files

- [backend/src/modules/ai-chat/tools/rag-tools.service.ts](/d:/MailAgent/backend/src/modules/ai-chat/tools/rag-tools.service.ts)
- [backend/src/modules/ai-chat/services/memory.service.ts](/d:/MailAgent/backend/src/modules/ai-chat/services/memory.service.ts)
- [backend/src/modules/ai/services/embeddings.service.ts](/d:/MailAgent/backend/src/modules/ai/services/embeddings.service.ts)
- [backend/prisma/schema.prisma](/d:/MailAgent/backend/prisma/schema.prisma)

### Success Criteria

- a saved memory is retrievable in the next conversation turn
- memory retrieval returns tenant/user-scoped results only
- “Known Facts” hit rate is measurable and non-zero in production

## Phase 4: Prompt, Runtime Context, and Tool UX Alignment

**Goal:** stop telling the model to do things the product cannot represent.

### Work

- Pass real runtime context into the system prompt:
  - timezone
  - locale
  - provider
- Audit the system prompt and skill content so they only reference supported tools and behaviors.
- Add dedicated frontend renderers for:
  - `ask_user`
  - `save_memory`
  - any other active tool names that currently fall back to generic JSON
- Define prompt rules for clarification and memory creation:
  - when to ask
  - when to save
  - when to avoid saving
- Remove stale guidance that assumes unsupported UI patterns.

### Key Files

- [backend/src/modules/ai-chat/constants/system-prompt.ts](/d:/MailAgent/backend/src/modules/ai-chat/constants/system-prompt.ts)
- [backend/src/modules/ai-chat/skills/skill-content.ts](/d:/MailAgent/backend/src/modules/ai-chat/skills/skill-content.ts)
- [backend/src/modules/ai-chat/services/ai-chat.service.ts](/d:/MailAgent/backend/src/modules/ai-chat/services/ai-chat.service.ts)
- [backend/src/modules/ai-chat/tools/conversation-tools.service.ts](/d:/MailAgent/backend/src/modules/ai-chat/tools/conversation-tools.service.ts)
- [frontend/src/components/chat/tool-uis/index.tsx](/d:/MailAgent/frontend/src/components/chat/tool-uis/index.tsx)
- [frontend/src/components/chat/tool-uis/FallbackToolUI.tsx](/d:/MailAgent/frontend/src/components/chat/tool-uis/FallbackToolUI.tsx)

### Success Criteria

- runtime context reflects actual user timezone/provider/locale
- no active first-party tool falls through to fallback UI unintentionally
- prompt instructions match real frontend/ backend behavior

## Phase 5: Legacy Chat Surface Removal

**Goal:** eliminate the old contracts that keep reintroducing bugs.

### Work

- Remove or hard-disable legacy `aiChatApi.chat()` JSON usage for the new assistant.
- Remove or hard-disable dead `/api/v1/ai/chat/stream` callers if the backend no longer exposes that route.
- Migrate `SchedulingDrawer` and any other direct callers to the canonical chat transport.
- Remove the fake learning facade unless a real backend contract is restored.
- Delete or isolate dead compatibility code once tests pass.

### Key Files

- [frontend/lib/api/ai.ts](/d:/MailAgent/frontend/lib/api/ai.ts)
- [frontend/components/calendar/ai/SchedulingDrawer.tsx](/d:/MailAgent/frontend/components/calendar/ai/SchedulingDrawer.tsx)
- [frontend/hooks/ai/use-ai-actions.ts](/d:/MailAgent/frontend/hooks/ai/use-ai-actions.ts)
- [frontend/src/components/chat/ChatRuntimeProvider.tsx](/d:/MailAgent/frontend/src/components/chat/ChatRuntimeProvider.tsx)
- [backend/src/modules/ai/controllers/ai.controller.ts](/d:/MailAgent/backend/src/modules/ai/controllers/ai.controller.ts)
- [backend/src/modules/ai-chat/controllers/ai-chat.controller.ts](/d:/MailAgent/backend/src/modules/ai-chat/controllers/ai-chat.controller.ts)

### Success Criteria

- one chat transport remains in production code
- one pending-action path remains in production code
- no production UI depends on compatibility shims

## Phase 6: Validation and Release Gates

**Goal:** make regressions visible before production.

### Work

- Add backend contract tests for:
  - pending-actions DTO
  - approve/reject responses
  - tool execution path per action type
  - memory save/retrieve lifecycle
- Add frontend tests for:
  - HITL card rendering
  - `ask_user` UI
  - `save_memory` UI
  - fallback renderer detection
- Add end-to-end flows:
  - ambiguous user request triggers `ask_user`
  - destructive action triggers HITL
  - approval executes real action
  - saved preference influences later answer
- Add deployment gates:
  - fail CI if deprecated endpoints are still imported by production bundles
  - fail CI if fallback UI catches a known active tool name

### Success Criteria

- CI proves save -> retrieve memory works
- CI proves approve -> execute works for every supported action type
- CI proves there are no legacy chat endpoint imports left in production code

## Recommended Delivery Order

### Sprint 1

- Phase 0
- Phase 1
- start Phase 2

### Sprint 2

- finish Phase 2
- Phase 3

### Sprint 3

- Phase 4
- Phase 5

### Sprint 4

- Phase 6
- production hardening
- deprecation removal

## Execution Notes

- Do not start prompt tuning before Phase 1 and Phase 3 are fixed. Right now some “agent stupidity” is architecture failure, not prompt weakness.
- Do not expand tool count before Phase 2 is done. New tools will just deepen the registry and approval drift.
- Do not ship new memory features before the storage model is unified.
- Prefer deletion over compatibility once the canonical path is validated.

## First Three Concrete Tickets

1. Canonical HITL DTO and approval response cleanup.
2. Tool executor redesign for approved mutating actions.
3. Long-term memory storage unification (`AIMemory.vector` vs embeddings store).

## Companion Docs

- [docs/AI_AGENT_REMEDIATION_ROADMAP_2026-03-15.md](/d:/MailAgent/docs/AI_AGENT_REMEDIATION_ROADMAP_2026-03-15.md)
- [docs/PROMPT_AUDIT_2026-03-10.md](/d:/MailAgent/docs/PROMPT_AUDIT_2026-03-10.md)
- [docs/TRANSFORMATION_ROADMAP.md](/d:/MailAgent/docs/TRANSFORMATION_ROADMAP.md)
- [docs/AUDIT.md](/d:/MailAgent/docs/AUDIT.md)
