# Phase 108: HITL Approval Routing - Research

**Researched:** 2026-03-24
**Domain:** AI SDK v6 Human-in-the-Loop, MUI frontend, NestJS audit logging
**Confidence:** HIGH

## Summary

Phase 108 builds on an existing but incomplete HITL foundation. The backend already uses AI SDK v6's `needsApproval: true` on 6 HIGH-risk tools (send_email, delete_email, forward_email, reply_email, delete_event, delete_contact). The frontend has a working `HitlApprovalCard.tsx` that renders approve/reject buttons when `status.type === 'requires-action'`. The chat controller already detects approval re-submits via `hasApprovalResponses()` and routes them through `convertToModelMessages()`.

What is **missing**: (1) Terminal states -- the approval card vanishes after the user clicks approve/reject because it only renders when `status.type === 'requires-action'`; it needs approved/rejected visual states. (2) Destructive vs informational visual distinction -- all tool cards look the same regardless of risk level. (3) Configurable sensitivity -- `needsApproval` is hardcoded to `true` on HIGH-risk tools; there is no per-user `hitlSensitivity` preference, only the unused `aiAutoApproveThreshold` float. (4) Audit logging for approval/rejection events specifically -- tool execution is logged but approval decisions are not.

**Primary recommendation:** Use AI SDK's `needsApproval` function variant (not boolean) to make approval dynamic per-user. Load user preferences in `createToolSet()`, pass sensitivity as closure. Replace `aiAutoApproveThreshold` (float slider) with `hitlSensitivity` (enum: HIGH_ONLY | ALL_MUTATIONS | NONE) in Prisma schema + DTO + frontend.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HITL-01 | Frontend renders approve/reject buttons when tool call is in `approval-requested` state | Existing `HitlApprovalCard.tsx` already renders buttons for `requires-action`; needs terminal state rendering (approved/rejected) |
| HITL-02 | Destructive tool calls visually distinct from informational tool calls | UI-SPEC defines warning border + tinted bg for destructive vs plain Paper for informational; `FallbackToolRenderer` and `TriageRenderer` need conditional styling based on tool risk level |
| HITL-03 | User can configure HITL sensitivity: HIGH_ONLY / ALL_MUTATIONS / NONE | New `hitlSensitivity` field in Prisma UserPreferences + DTO + frontend AiSettings; `needsApproval` function variant in tool definitions reads user preference |
| HITL-04 | Approval/rejection events logged via AuditService for GDPR | New `logHitlDecision()` method on AuditService; called from `onStepFinish` or a post-approval hook in the chat pipeline |
</phase_requirements>

## Standard Stack

### Core (already installed -- no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ai (AI SDK) | 6.0.116 | `needsApproval` function variant, `ToolLoopAgent`, `convertToModelMessages` | SDK-native HITL; no custom REST endpoints needed |
| @assistant-ui/react | 0.12.19 | `ToolCallMessagePartProps` with `status.type` and `addResult` | Handles requires-action/complete/running states natively |
| @mui/material | 6.x | ToggleButtonGroup, Dialog, Alert, Chip, Button | Project-mandated UI framework |
| lucide-react | installed | AlertTriangle, CheckCircle, XCircle, Loader2, Code, Shield | Existing icon library |
| prisma | 7.3.x | Schema migration for `hitlSensitivity` column | Existing ORM |

### Supporting (no additions needed)

No new packages required. Everything is achievable with the existing stack.

**Installation:** None needed. All dependencies are already installed.

## Architecture Patterns

### Recommended Changes Structure

```
backend/
  src/
    modules/ai-chat/
      services/ai-chat.service.ts        # Modify createToolSet() to accept sensitivity
      tools/email-tools.service.ts        # Change needsApproval: true -> function
      tools/calendar-tools.service.ts     # Same
      tools/contact-tools.service.ts      # Same
    common/services/audit.service.ts      # Add logHitlDecision()
    modules/users/dtos/update-preferences.dto.ts  # Add hitlSensitivity field
  prisma/schema.prisma                    # Add hitlSensitivity to UserPreferences

frontend/
  src/components/chat/
    HitlApprovalCard.tsx                  # Add terminal states (approved/rejected)
    tool-uis/FallbackToolUI.tsx           # Add destructive styling for non-requires-action states
  components/settings/AiSettings.tsx      # Replace slider with HitlSensitivityToggle
  locales/en.ts, it.ts, index.ts         # New translation keys
  lib/api/users.ts                        # Add hitlSensitivity to types
```

### Pattern 1: Dynamic needsApproval via function variant

**What:** AI SDK v6 `needsApproval` accepts `boolean | ((input, options) => boolean | Promise<boolean>)`. We use the function variant to check the user's `hitlSensitivity` preference at tool-call time.

**When to use:** When approval behavior must vary per-user without re-creating tools.

**Example:**
```typescript
// Source: backend/node_modules/@ai-sdk/provider-utils/src/types/tool.ts line 149
// In createToolSet(), after loading user preferences:
const sensitivity = userPrefs.hitlSensitivity ?? 'HIGH_ONLY';

// For HIGH-risk tools (send_email, delete_email, etc.):
needsApproval: () => sensitivity !== 'NONE'

// For MEDIUM-risk mutation tools (archive_email, move_email, draft_email, create_event, etc.):
needsApproval: () => sensitivity === 'ALL_MUTATIONS'
```

**Key insight:** The function is evaluated per tool call inside `isApprovalNeeded()` (see `backend/node_modules/ai/src/generate-text/is-approval-needed.ts`). The closure captures the user's sensitivity from the request scope. No need for a separate preference-fetching service inside the function.

### Pattern 2: Terminal state rendering in HitlApprovalCard

**What:** Currently `HitlApprovalWrapper` returns `null` when `status.type !== 'requires-action'`. For terminal states, it should render an approved/rejected card instead of disappearing.

**When to use:** After user clicks approve or reject and the SDK processes the result.

**Example:**
```typescript
// The status.type transitions: 'requires-action' -> 'complete' (after addResult)
// We need to check the result to determine if it was approved or rejected.
// When status.type === 'complete', check result.approved to show terminal state.
```

### Pattern 3: Audit logging for HITL decisions

**What:** Add a new `logHitlDecision()` method to AuditService following the existing fire-and-forget pattern.

**Example:**
```typescript
// Same pattern as logToolExecution() and logDataAccess()
async logHitlDecision(data: {
  tenantId: string;
  userId: string;
  toolName: string;
  toolCallId: string;
  decision: 'approved' | 'rejected';
  conversationId: string;
}): Promise<void> {
  try {
    await this.prisma.auditLog.create({
      data: {
        tenantId: data.tenantId,
        userId: data.userId,
        action: `HITL:${data.decision.toUpperCase()}`,
        entity: 'AiChat',
        entityId: data.toolCallId,
        changes: { toolName: data.toolName, conversationId: data.conversationId },
      },
    });
  } catch (error) {
    this.logger.error(`Failed to log HITL decision: ${error}`);
  }
}
```

### Anti-Patterns to Avoid

- **Custom REST endpoints for HITL approval:** The old HitlController/HitlService were deleted in Phase 77 (AICP-01/02). The AI SDK handles approval via the stream protocol. Do NOT recreate REST approval endpoints.
- **Storing pending actions in the database:** The SDK manages pending state in-memory during the stream. The frontend sends approval responses back through the same chat endpoint. No database table for pending actions.
- **Hard-coding tool risk levels on the frontend:** The frontend should NOT maintain a list of which tools are HIGH-risk. The backend's `needsApproval` flag controls which tools pause for approval. The frontend just responds to `status.type === 'requires-action'`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Approval state machine | Custom state tracking for pending/approved/rejected | AI SDK `needsApproval` + `addResult` flow | SDK handles the state transitions, stream protocol, and re-submit |
| Approval REST API | POST /approve, GET /pending-actions | AI SDK stream re-submit via `clientMessages` | Old REST approach was deleted in Phase 77; stream-native is simpler |
| Tool risk classification | Frontend tool-name-to-risk map | Backend ToolRegistryService metadata | Registry already tracks domain, riskLevel, requiresApproval |

## Common Pitfalls

### Pitfall 1: Forgetting to handle approval in conversation history
**What goes wrong:** After approval re-submit, the conversation history may contain tool-approval-request and tool-approval-response parts that cause InvalidPromptError on subsequent messages.
**Why it happens:** AI SDK v6 embeds approval state in UIMessage parts. `convertToModelMessages()` must process these correctly.
**How to avoid:** The `isApprovalResubmit` path in `prepareChatAgent()` already handles this by using `convertToModelMessages()` on the full `clientMessages`. Ensure this path is not broken by changes.
**Warning signs:** `InvalidPromptError` after approving a tool call and sending a follow-up message.

### Pitfall 2: needsApproval function must be synchronous or async-safe
**What goes wrong:** If the `needsApproval` function does a database query (to load preferences), it adds latency to every tool call evaluation.
**Why it happens:** `isApprovalNeeded()` is awaited, so async works, but it's called per tool call in the loop.
**How to avoid:** Load user preferences ONCE at the start of `createToolSet()` (or `prepareChatAgent()`), capture in closure. Do NOT query the database inside the `needsApproval` function itself.
**Warning signs:** Slow tool call execution, multiple database queries per chat stream.

### Pitfall 3: HitlApprovalCard status.type after addResult
**What goes wrong:** After calling `addResult()`, the component may unmount/remount. The `status.type` transitions from `requires-action` to `complete` (not a custom state). The `result` payload contains the approval decision.
**Why it happens:** AI SDK processes the result and moves to the next step. The tool call part updates in the message.
**How to avoid:** Check both `status.type` and the `result` object. When `status.type === 'complete'` and the tool is a destructive tool, check `result.approved` to render the correct terminal state.
**Warning signs:** Approval card disappearing completely after clicking approve/reject.

### Pitfall 4: Migration for hitlSensitivity must have a default
**What goes wrong:** Existing users have no `hitlSensitivity` value, causing null pointer errors.
**Why it happens:** New column without default.
**How to avoid:** Prisma migration with `@default("HIGH_ONLY")`. Map existing `aiAutoApproveThreshold` behavior: threshold 0.9+ = HIGH_ONLY (current default), threshold 0 = NONE.
**Warning signs:** Null sensitivity values in production.

### Pitfall 5: ALL_MUTATIONS must classify tools correctly
**What goes wrong:** Some mutation tools (archive, move, create) get marked as requiring approval when they shouldn't, or vice versa.
**Why it happens:** The line between "mutation" and "read" is blurry. `draft_email` is a mutation but low-risk.
**How to avoid:** Use ToolRegistryService metadata. HIGH-risk tools always need approval (unless NONE). MEDIUM-risk mutation tools need approval only under ALL_MUTATIONS. LOW-risk tools never need approval regardless of sensitivity.
**Warning signs:** User selecting ALL_MUTATIONS and getting approval prompts for search queries.

## Code Examples

### Existing: How needsApproval works in AI SDK v6

```typescript
// Source: backend/node_modules/ai/src/generate-text/is-approval-needed.ts
export async function isApprovalNeeded({ tool, toolCall, messages, experimental_context }) {
  if (tool.needsApproval == null) return false;
  if (typeof tool.needsApproval === 'boolean') return tool.needsApproval;
  // Function variant: called with tool input and context
  return await tool.needsApproval(toolCall.input, {
    toolCallId: toolCall.toolCallId,
    messages,
    experimental_context,
  });
}
```

### Existing: Current tool definition with static needsApproval

```typescript
// Source: backend/src/modules/ai-chat/tools/email-tools.service.ts
// Current: needsApproval: true (static boolean)
return tool({
  description: 'Send an email...',
  inputSchema: schemas.send_email,
  needsApproval: true,  // <-- This becomes a function
  execute: async (args) => { ... },
});
```

### Existing: Frontend approval card rendering

```typescript
// Source: frontend/src/components/chat/tool-uis/FallbackToolUI.tsx
if (status.type === 'requires-action') {
  return (
    <HitlApprovalWrapper
      status={status}
      addResult={addResult}
      toolName={toolName}
      args={(args ?? {}) as Record<string, unknown>}
    />
  );
}
```

### Existing: Approval re-submit detection

```typescript
// Source: backend/src/modules/ai-chat/dto/chat-request.dto.ts
export function hasApprovalResponses(dto: ChatRequestDto): boolean {
  if (!dto.messages?.length) return false;
  return dto.messages.some((msg) => {
    if (msg.role !== 'assistant') return false;
    const parts = msg.parts;
    if (!Array.isArray(parts)) return false;
    return (parts as Array<Record<string, unknown>>).some(
      (p) => p && 'approval' in p && p.approval &&
        (p.approval as Record<string, unknown>).approved != null,
    );
  });
}
```

### Existing: AuditService pattern (fire-and-forget)

```typescript
// Source: backend/src/common/services/audit.service.ts
// All audit methods: try/catch wrapping prisma.auditLog.create(), never throw
async logToolExecution(data: LogToolExecutionInput): Promise<void> {
  try {
    await this.prisma.auditLog.create({ data: { ... } });
  } catch (error) {
    this.logger.error(`Failed to log tool execution: ${error}`);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| REST pending-actions + approve endpoints (HitlController) | AI SDK stream-native needsApproval + addResult | Phase 77 (AICP-01/02) | No custom HITL infrastructure; deleted HitlController/HitlService |
| Float threshold (aiAutoApproveThreshold: 0.9) | Enum sensitivity (hitlSensitivity: HIGH_ONLY) | Phase 108 (this phase) | Clearer UX, three discrete levels instead of ambiguous percentage |
| needsApproval: boolean (static) | needsApproval: function (dynamic per-user) | Phase 108 (this phase) | Enables NONE/ALL_MUTATIONS per user without tool re-creation |

**Deprecated/outdated:**
- `aiAutoApproveThreshold` (float 0-1): Being replaced by `hitlSensitivity` enum. The slider UI in AiSettings.tsx must be replaced with a ToggleButtonGroup.
- HitlController/HitlService: Deleted in Phase 77. No REST approval endpoints.

## Open Questions

1. **What happens to the aiAutoApproveThreshold column?**
   - What we know: It exists in Prisma schema with `@default(0.9)`, in DTO, and in frontend.
   - What's unclear: Whether to drop it entirely or keep for backward compat.
   - Recommendation: Keep the column but deprecate it. Add `hitlSensitivity` as a new column with `@default("HIGH_ONLY")`. Frontend reads `hitlSensitivity` only. Migration maps existing threshold values: >= 0.5 -> HIGH_ONLY, < 0.5 -> NONE.

2. **Should ALL_MUTATIONS include create operations (create_event, draft_email)?**
   - What we know: UI-SPEC says "send, delete, create, update" for ALL_MUTATIONS.
   - What's unclear: draft_email is a create operation but very low risk.
   - Recommendation: Include all MEDIUM-risk and HIGH-risk tools under ALL_MUTATIONS. LOW-risk tools (search, read, list) are never gated. This aligns with the ToolRegistryService riskLevel metadata.

3. **How does the frontend know a tool is destructive for visual distinction (HITL-02)?**
   - What we know: The frontend receives `status.type` and `toolName` but not `riskLevel`.
   - What's unclear: Whether to embed risk metadata in the stream or use a client-side tool name list.
   - Recommendation: Maintain a `HIGH_RISK_TOOLS` constant on the frontend (matching the backend's 6 tools). This is acceptable because: (a) the list is small and stable, (b) adding it to the stream protocol would require SDK customization, (c) the existing `HitlApprovalCard.tsx` already has `HIGH_RISK_TEMPLATES` mapping tool names.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (backend), vitest (frontend) |
| Config file | backend/vitest.config.ts |
| Quick run command | `cd backend && npx vitest run src/modules/ai-chat/__tests__/hitl-contract.test.ts` |
| Full suite command | `cd backend && npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HITL-01 | Approve/reject buttons render for requires-action status | unit | Existing hitl-contract.test.ts verifies SDK-level contract | Partial (backend only) |
| HITL-02 | Destructive tools visually distinct from informational | unit | Frontend component test (new) | No -- Wave 0 |
| HITL-03 | Sensitivity preference persisted and respected | unit | `cd backend && npx vitest run src/modules/ai-chat/__tests__/hitl-sensitivity.test.ts` | No -- Wave 0 |
| HITL-04 | Approval/rejection logged via AuditService | unit | `cd backend && npx vitest run src/modules/audit/__tests__/audit.service.spec.ts` | Partial (audit exists, HITL method does not) |

### Sampling Rate

- **Per task commit:** `cd backend && npx vitest run src/modules/ai-chat/__tests__/hitl-contract.test.ts`
- **Per wave merge:** `cd backend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `backend/src/modules/ai-chat/__tests__/hitl-sensitivity.test.ts` -- covers HITL-03 (dynamic needsApproval function variant)
- [ ] Update `backend/src/modules/audit/__tests__/audit.service.spec.ts` -- covers HITL-04 (logHitlDecision method)
- [ ] Update `backend/src/modules/ai-chat/__tests__/hitl-contract.test.ts` -- update HIGH_RISK_TOOLS assertions for function variant

## Sources

### Primary (HIGH confidence)

- AI SDK v6 source code: `backend/node_modules/ai/src/generate-text/is-approval-needed.ts` -- confirms `needsApproval` supports boolean | function
- AI SDK v6 source code: `backend/node_modules/@ai-sdk/provider-utils/src/types/tool.ts` -- `ToolNeedsApprovalFunction<INPUT>` type definition
- Existing codebase: `backend/src/modules/ai-chat/tools/email-tools.service.ts` -- current `needsApproval: true` usage on 6 HIGH-risk tools
- Existing codebase: `backend/src/modules/ai-chat/__tests__/hitl-contract.test.ts` -- validates HIGH-risk tools have needsApproval
- Existing codebase: `frontend/src/components/chat/HitlApprovalCard.tsx` -- current approval UI
- Existing codebase: `backend/src/common/services/audit.service.ts` -- audit logging pattern
- Existing codebase: `backend/src/modules/ai-chat/dto/chat-request.dto.ts` -- approval re-submit detection

### Secondary (MEDIUM confidence)

- `.agents/skills/tools/references/human-in-loop.md` -- assistant-ui HITL patterns with submitResult
- `.agents/skills/ai-sdk/SKILL.md` -- AI SDK v6 general guidance

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new packages, all verified in node_modules
- Architecture: HIGH -- based on reading actual source code of AI SDK and existing codebase
- Pitfalls: HIGH -- derived from existing code patterns and SDK internals
- Frontend patterns: HIGH -- verified against existing HitlApprovalCard.tsx and FallbackToolUI.tsx

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- AI SDK v6 is mature, no breaking changes expected)
