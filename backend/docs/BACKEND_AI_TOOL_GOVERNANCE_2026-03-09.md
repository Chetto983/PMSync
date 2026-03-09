# Backend AI Tool Governance

Date: 2026-03-09
Scope: Current backend AI tool surfaces, approval behavior, and control gaps
Status: Current reference

## Summary

The backend AI layer exposes tool-augmented operations over email, calendar, contacts, folders, and semantic retrieval. This is preferable to unconstrained agent autonomy, but the current approval and execution model is not yet internally consistent.

This document describes:

- what tools exist today
- which tools currently require approval
- which tools currently execute immediately
- where the current backend control path is broken

## Tool Families

### Email Tools

Current tools:

- `send_email`
- `search_emails`
- `read_email`
- `archive_email`
- `move_email`
- `delete_email`
- `forward_email`
- `reply_email`
- `draft_email`

### Calendar Tools

Current tools:

- `view_calendar`
- `create_event`
- `update_event`
- `delete_event`

### Contact Tools

Current tools:

- `search_contacts`
- `create_contact`
- `update_contact`

### Folder Tools

Current tools:

- `list_folders`
- `create_folder`

### RAG Tools

Current tools include semantic retrieval and memory-oriented helpers.

## Current Approval Behavior

### Tools Marked With `needsApproval: true`

- `send_email`
- `delete_email`
- `forward_email`
- `reply_email`
- `delete_event`

### Tools That Currently Execute Immediately

- `archive_email`
- `move_email`
- `draft_email`
- `create_event`
- `update_event`
- `create_contact`
- `update_contact`
- `create_folder`

### Important Observation

The backend currently does not have a coherent trust-class model such as:

- read-only
- reversible write
- destructive write
- externally visible action

Instead, approval is set tool by tool. That is the main governance weakness.

## HITL Control Path

### Intended Flow

```text
tool call requires approval
  -> pending action is created
  -> user approves or rejects
  -> approved action is mapped back to tool execution
```

### Current Problem

The approval controller maps action types back to tool names such as `send_email`, `reply_email`, `forward_email`, `delete_email`, and `delete_event`, but the central tool registry does not currently register those runtime mutating tools.

Result:

- approval can succeed
- execution can still fail afterward because the registry lookup returns no tool

This is a backend correctness and safety issue, not a UX issue.

## Current Backend Policy Gaps

### Gap 1: Approval Policy Is Incomplete

Some mutating tools require approval, while other mutating tools do not. There is no backend-wide policy that explains why.

### Gap 2: Registry and Runtime Are Not Aligned

The runtime toolset created inside chat orchestration is not the same thing as the registry used by approval execution.

### Gap 3: Action Taxonomy Is Incomplete

The current action mapping includes semantic mismatches, for example mapping `delete_event` to `SCHEDULE_MEETING`.

### Gap 4: Observability Is Incomplete

The AI run ledger currently under-reports tool usage in chat runs.

## Recommended Tool Trust Classes

The backend should move to explicit trust classes.

### Class A: Read-Only

Examples:

- `search_emails`
- `read_email`
- `view_calendar`
- `search_contacts`
- `list_folders`
- semantic retrieval tools

Policy:

- no approval
- standard audit logging

### Class B: Reversible Internal Writes

Examples:

- `archive_email`
- `move_email`
- possibly `draft_email`

Policy:

- explicit confirmation or policy-controlled auto-allow
- audit logging
- ideally reversible operation support

### Class C: Persistent Data Mutation

Examples:

- `create_event`
- `update_event`
- `create_contact`
- `update_contact`
- `create_folder`

Policy:

- explicit confirmation at minimum
- approval depending on product trust posture
- audit logging with before/after payload

### Class D: Destructive or Externally Visible Actions

Examples:

- `send_email`
- `reply_email`
- `forward_email`
- `delete_email`
- `delete_event`

Policy:

- approval required
- durable audit trail
- reliable post-approval execution

## Contributor Rules

1. Do not add a new mutating AI tool without assigning it a trust class.
2. Do not rely only on prompt wording like "confirm first"; backend policy must enforce the behavior.
3. Approval execution must use the same executable tool surface as the runtime chat path.
4. Any new externally visible action should default to approval-required until explicitly justified otherwise.
5. Tool telemetry must capture actual tool-call counts and action outcomes.

## Immediate Backend Follow-Ups

1. Create an explicit action enum for all mutating tool types.
2. Unify the tool registry and runtime tool execution model.
3. Reclassify current tools by trust class.
4. Add backend tests for:
   - approval-required tools
   - non-approved mutation rejection
   - successful approved execution
   - failed registry lookup prevention

## References

- `backend/src/modules/ai-chat/tools/email-tools.service.ts`
- `backend/src/modules/ai-chat/tools/calendar-tools.service.ts`
- `backend/src/modules/ai-chat/tools/contact-tools.service.ts`
- `backend/src/modules/ai-chat/tools/folder-tools.service.ts`
- `backend/src/modules/ai-chat/controllers/hitl.controller.ts`
- `backend/src/modules/ai-chat/services/ai-chat.service.ts`
