# Backend AI Safety Hardening Implementation Plan

Date: 2026-03-09
Scope: Workstream 1 from `docs/CTO_EXECUTION_BACKLOG_2026-03-09.md`
Status: implementation planning
Priority: critical

## Goal

Make backend AI actions consistent, approval-aware, and auditable.

This plan is specifically about fixing the current AI control plane, not redesigning the entire AI product surface.

## Current Confirmed Defects

### 1. Approval and Execution Are Split Across Different Tool Surfaces

Current runtime:

- `AiChatService` builds AI SDK `tool(...)` objects dynamically inside `createToolSet(...)`

Current approval execution:

- `HitlController` executes approved actions through `ToolRegistryService`

Problem:

- the registry uses `IAiTool` objects
- the chat runtime uses a separate dynamic tool set
- approved actions can therefore pass approval but fail at execution time

Primary files:

- `backend/src/modules/ai-chat/services/ai-chat.service.ts`
- `backend/src/modules/ai-chat/controllers/hitl.controller.ts`
- `backend/src/common/interfaces/tool-registry.interface.ts`
- `backend/src/common/modules/tool-registry/tool-registry.service.ts`

### 2. Action Type Taxonomy Is Incomplete

Current defect:

- `delete_event` is mapped to `SCHEDULE_MEETING`

Reason:

- `ActionType` is missing event-specific mutation entries

Primary files:

- `backend/prisma/schema.prisma`
- `backend/src/modules/ai-chat/services/ai-chat.service.ts`
- `backend/src/modules/ai-chat/controllers/hitl.controller.ts`

### 3. Approval Policy Is Tool-by-Tool, Not Policy-Driven

Current behavior:

- some mutating tools use `needsApproval: true`
- other mutating tools execute immediately
- there is no canonical trust class model

Primary files:

- `backend/src/modules/ai-chat/tools/email-tools.service.ts`
- `backend/src/modules/ai-chat/tools/calendar-tools.service.ts`
- `backend/src/modules/ai-chat/tools/contact-tools.service.ts`
- `backend/src/modules/ai-chat/tools/folder-tools.service.ts`

### 4. Tool Telemetry Is Incomplete

Current defect:

- chat ledger writes `toolCallCount: 0` even when tools were used

Primary file:

- `backend/src/modules/ai-chat/services/ai-chat.service.ts`

## Target End State

```text
tool definition
  -> canonical metadata
  -> canonical action type
  -> canonical approval policy
  -> canonical execution handler

chat runtime
  -> uses canonical tool definition

HITL approval
  -> stores canonical action type and payload

HITL execution
  -> uses the same canonical execution handler

ledger + audit
  -> record tool usage, approval outcome, and execution result
```

## Implementation Strategy

Do this in six tickets, in order.

## Ticket AI-SAFE-01

Title: Introduce canonical AI tool metadata and policy model

### Objective

Replace ad hoc `needsApproval` usage with explicit backend metadata.

### Proposed Additions

Define canonical metadata fields for backend tools:

- `trustClass`
- `approvalPolicy`
- `actionType`
- `isMutating`
- `isExternallyVisible`
- `isDestructive`

### File Targets

- `backend/src/common/interfaces/tool-registry.interface.ts`
- `backend/src/common/modules/tool-registry/tool-registry.service.ts`

### Notes

The registry contract should stop being only `name/description/parameters/execute`.

It should carry enough metadata to support:

- approval decisions
- audit classification
- mutation policy validation
- runtime safety assertions

### Acceptance Criteria

- every registered backend AI tool has canonical metadata
- metadata can be queried centrally
- approval policy is no longer inferred only from scattered `needsApproval` flags

## Ticket AI-SAFE-02

Title: Complete and normalize the `ActionType` taxonomy

### Objective

Stop forcing semantic mismatches like `delete_event -> SCHEDULE_MEETING`.

### Proposed Changes

Add missing action types for current mutating tools, at minimum:

- `CREATE_EVENT`
- `UPDATE_EVENT`
- `DELETE_EVENT`
- `CREATE_FOLDER`
- `MOVE_EMAIL`
- `ARCHIVE_EMAIL`
- `DRAFT_EMAIL`

Review whether these should also exist:

- `UPDATE_CONTACT`
- `CREATE_CONTACT`

### File Targets

- `backend/prisma/schema.prisma`
- any generated Prisma client artifacts after migration
- `backend/src/modules/ai-chat/services/ai-chat.service.ts`
- `backend/src/modules/ai-chat/controllers/hitl.controller.ts`
- `backend/src/modules/ai-chat/services/hitl.service.ts`

### Acceptance Criteria

- every approval-capable or mutating tool maps to a correct `ActionType`
- no tool is mapped to a semantically unrelated action enum value
- the action-type mapping exists in one canonical place

## Ticket AI-SAFE-03

Title: Unify chat runtime execution and HITL execution

### Objective

Make approved actions execute through the same executable tool definition used by chat orchestration.

### Proposed Direction

Introduce a canonical backend tool definition layer, then derive:

- AI SDK `tool(...)` wrappers for chat runtime
- registry-executable handlers for approval execution

Do not keep two independently defined tool surfaces.

### File Targets

- `backend/src/modules/ai-chat/services/ai-chat.service.ts`
- `backend/src/modules/ai-chat/controllers/hitl.controller.ts`
- `backend/src/common/interfaces/tool-registry.interface.ts`
- `backend/src/common/modules/tool-registry/tool-registry.service.ts`
- tool-definition sources under:
  - `backend/src/modules/ai-chat/tools/email-tools.service.ts`
  - `backend/src/modules/ai-chat/tools/calendar-tools.service.ts`
  - `backend/src/modules/ai-chat/tools/contact-tools.service.ts`
  - `backend/src/modules/ai-chat/tools/folder-tools.service.ts`

### Acceptance Criteria

- approved HITL actions execute through the same canonical handler as chat-invoked actions
- registry lookup cannot succeed for a tool that chat runtime does not actually define
- chat runtime and approval executor share one canonical tool inventory

## Ticket AI-SAFE-04

Title: Reclassify all mutating tools by trust class and approval policy

### Objective

Turn the audit findings into explicit backend policy.

### Required Review Set

Email tools:

- `send_email`
- `archive_email`
- `move_email`
- `delete_email`
- `forward_email`
- `reply_email`
- `draft_email`

Calendar tools:

- `create_event`
- `update_event`
- `delete_event`

Contact tools:

- `create_contact`
- `update_contact`

Folder tools:

- `create_folder`

### Proposed Initial Policy

Read-only:

- no approval

Reversible internal writes:

- explicit policy decision required
- default recommendation: approval or explicit user confirmation for now

Persistent data mutations:

- approval required until policy is intentionally relaxed

Destructive or externally visible:

- approval required

### File Targets

- `backend/src/modules/ai-chat/tools/email-tools.service.ts`
- `backend/src/modules/ai-chat/tools/calendar-tools.service.ts`
- `backend/src/modules/ai-chat/tools/contact-tools.service.ts`
- `backend/src/modules/ai-chat/tools/folder-tools.service.ts`
- `backend/src/modules/ai-chat/constants/system-prompt.ts`

### Acceptance Criteria

- every mutating tool has an explicit trust class
- every mutating tool has an explicit approval policy
- prompt guidance and backend enforcement no longer contradict each other

## Ticket AI-SAFE-05

Title: Fix AI ledger and audit coverage for tool approval and execution

### Objective

Make tool usage and approval outcomes visible in telemetry.

### Required Improvements

- count actual tool calls in chat ledger writes
- record whether a tool call:
  - executed immediately
  - created pending approval
  - was approved
  - was rejected
  - failed execution
- preserve action ID and tool name linkage in telemetry

### File Targets

- `backend/src/modules/ai-chat/services/ai-chat.service.ts`
- `backend/src/modules/ai-chat/services/hitl.service.ts`
- `backend/src/modules/ai-chat/controllers/hitl.controller.ts`
- `backend/src/modules/ai/services/ai-run-ledger.service.ts`
- `backend/src/common/services/audit.service.ts`

### Acceptance Criteria

- ledger no longer records `toolCallCount: 0` for tool-using chat runs
- approval lifecycle events are observable in logs or ledger records
- failed approved actions are visible as failures, not silent drops

## Ticket AI-SAFE-06

Title: Add regression tests for the AI control plane

### Objective

Prevent reintroduction of the same safety defects.

### Required Test Coverage

1. mutating-tool inventory classification test
2. approval-required tool cannot execute immediately
3. approved action executes successfully through canonical handler
4. rejected action does not execute
5. missing tool/action mapping fails test, not production flow
6. `ActionType` completeness for registered mutating tools
7. ledger tool-call count reflects actual tool usage

### Primary Test Targets

- `backend/src/modules/ai-chat/__tests__/hitl.test.ts`
- new unit tests around canonical tool metadata
- new tests for action-type mapping
- new tests for ledger/tool-call accounting

### Acceptance Criteria

- CI fails if a mutating tool is added without metadata or action mapping
- CI fails if HITL and runtime tool surfaces diverge again

## Suggested Delivery Sequence

### Phase A

- AI-SAFE-01
- AI-SAFE-02

These create the metadata and action taxonomy foundation.

### Phase B

- AI-SAFE-03
- AI-SAFE-04

These unify execution and reclassify policy.

### Phase C

- AI-SAFE-05
- AI-SAFE-06

These harden observability and prevent regression.

## Recommended Non-Goals For This Pass

Do not mix these into the same implementation wave:

- auth migration cleanup
- full ABAC or permission engine rollout
- CRM domain expansion
- microservice extraction
- frontend redesign

The purpose of this pass is to fix the backend AI control plane first.

## Definition of Done

This workstream is complete only when all of the following are true:

1. All mutating tools are centrally classified.
2. All approval-required actions execute through the same canonical handler used by chat runtime.
3. `ActionType` semantics correctly match the actual tool operation.
4. Ledger and audit records reflect approval and execution outcomes.
5. Regression tests fail if tool inventory, policy, or execution surfaces drift again.
