# VoltAgent Issues Fix Plan

## Issue 1: Internal Context Markers Leaking to User

### Problem
The AI assistant shows internal context markers to end users in chat responses:
- `[Conversation History]`
- `[Current Message]`
- `[Conversation Summary]`
- `[Key Context]`
- `[Recent Messages]`
- `## Learned Constraints`
- `[User Memory]`

### Root Cause
Context markers are injected directly into the user message that goes to the LLM:

**File: `voltagent.service.ts` line 953:**
```typescript
enhancedMessage = `[Conversation History]\n${safeHistoryContext}\n\n[Current Message]\n${enhancedMessage}`;
```

**File: `voltagent.service.ts` line 886:**
```typescript
enhancedMessage = `[User Memory]\n${safeMemoryContext}\n\n---\n\n${enhancedMessage}`;
```

**File: `conversation-compaction.service.ts` `formatForPrompt()`:**
```typescript
parts.push(`[Conversation Summary - ${count} earlier messages]\n${summary}`);
parts.push(`[Key Context]\n${keyFacts}`);
parts.push(`[Recent Messages]\n${recentFormatted}`);
```

**File: `episodic-memory.service.ts` `formatLessonsForPrompt()`:**
```typescript
return `## Learned Constraints (Do NOT Ignore)...`
```

The LLM sees these markers as part of the conversation and echoes them in responses.

### Solution (Following 2025 Best Practices)

Based on [OWASP LLM Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) and [Anthropic's context engineering guidance](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents):

**Option A (Recommended): Add explicit LLM instruction to never echo context markers**

Add to the supervisor system prompt in `voltagent.service.ts`:
```typescript
const CONTEXT_HANDLING_INSTRUCTION = `
CRITICAL INSTRUCTION - INTERNAL CONTEXT HANDLING:
The user message may contain sections wrapped in brackets like [Conversation History], [User Memory], [Key Context], etc.
These are INTERNAL system context injections for YOUR reference only.
You MUST NEVER:
1. Mention these section headers in your response
2. Reference that you received "conversation history" or "memory"
3. Echo any text that starts with [ ] brackets
4. Show "## Learned Constraints" or similar headers

Respond naturally as if the context was always available to you.
`;
```

**Option B (Additional Safety): Strip markers from LLM response**

Add post-processing in `voltagent.service.ts` before returning to user:
```typescript
function sanitizeResponse(text: string): string {
  // Remove any accidentally echoed context markers
  return text
    .replace(/\[Conversation History\][\s\S]*?\[Current Message\]/gi, '')
    .replace(/\[User Memory\][\s\S]*?---/gi, '')
    .replace(/\[Conversation Summary[^\]]*\]/gi, '')
    .replace(/\[Key Context\]/gi, '')
    .replace(/\[Recent Messages\]/gi, '')
    .replace(/## Learned Constraints[\s\S]*?(?=\n\n|$)/gi, '')
    .trim();
}
```

### Files to Modify

1. **`backend/src/modules/ai/voltagent/voltagent.service.ts`**
   - Add context handling instruction to system prompt
   - Add response sanitization before returning to frontend

2. **`backend/src/modules/ai/voltagent/agents/supervisor.agent.ts`** (if system prompt is defined there)
   - Add explicit instruction about context markers

---

## Issue 2: HITL Approval Doesn't Report Success/Failure to User

### Problem
After user approves an action via Human-in-the-Loop, the LLM doesn't report whether the action succeeded or failed. User said: "LLM after HITL approve must tell is all is made or error!"

### Root Cause

**Backend returns execution result correctly:**
```typescript
// voltagent.controller.ts line 326
return {
  status: 'approved',
  ...result,  // includes executionResult with success/error/summary
};
```

**Frontend API type is incomplete:**
```typescript
// frontend/lib/api/ai.ts line 671
return apiClient.post<{ status: 'approved' }>(...);  // Missing executionResult!
```

**Frontend hook discards the result:**
```typescript
// frontend/hooks/ai/use-ai-actions.ts line 133
mutationFn: async ({ executionId, payload }) => {
  await voltAgentApi.approveAction(executionId, payload);
  return executionId;  // Throws away the API response!
},
```

### Solution (Following LangGraph HITL Best Practices)

Based on [LangChain Human-in-the-Loop](https://docs.langchain.com/oss/python/langchain/human-in-the-loop) patterns:

**Step 1: Update Frontend API Types**

```typescript
// frontend/lib/api/ai.ts
export type ApprovalResponse = {
  status: 'approved' | 'rejected';
  approved: boolean;
  executionResult?: {
    success: boolean;
    error?: string;
    summary?: string | string[];
    data?: Record<string, unknown>;
    executionTimeMs: number;
  };
  action?: {
    actionType: string;
    summary: string;
  };
};

approveAction(executionId: string, payload?: Record<string, unknown>) {
  return apiClient.post<ApprovalResponse>(`/api/v1/voltagent/actions/${executionId}/approve`, {
    payload,
  });
},
```

**Step 2: Update Hook to Return Execution Result**

```typescript
// frontend/hooks/ai/use-ai-actions.ts
const approveMutation = useMutation({
  mutationFn: async ({ executionId, payload }: { executionId: string; payload?: Record<string, unknown> }) => {
    const response = await voltAgentApi.approveAction(executionId, payload);
    return response.data;  // Return full response with executionResult
  },
  onSuccess: (result) => {
    queryClient.invalidateQueries({ queryKey: aiActionsKeys.pending() });
    queryClient.invalidateQueries({ queryKey: aiActionsKeys.counts() });

    // Call callback with full result including execution status
    onApprove?.(result.executionId, result.executionResult);
  },
});
```

**Step 3: Show Feedback in Chat UI**

Option A: Inject result as assistant message in chat
Option B: Show toast notification with result
Option C: Update inline action card with result status

Recommended: **Option A + Option B combined**

```tsx
// In the component that handles approval
const handleApprove = async (actionId: string) => {
  const result = await approveAction(actionId);

  if (result.executionResult?.success) {
    // Add success message to chat
    addAssistantMessage(`✅ Action completed: ${result.executionResult.summary || 'Success'}`);
    toast.success('Action executed successfully');
  } else {
    // Add error message to chat
    addAssistantMessage(`❌ Action failed: ${result.executionResult?.error || 'Unknown error'}`);
    toast.error(`Action failed: ${result.executionResult?.error}`);
  }
};
```

### Files to Modify

1. **`frontend/lib/api/ai.ts`**
   - Add `ApprovalResponse` type with `executionResult`
   - Update `approveAction` return type

2. **`frontend/hooks/ai/use-ai-actions.ts`**
   - Update mutation to return full response
   - Update `onApprove` callback signature to include result
   - Export new types

3. **`frontend/components/ai/AIChatInterface.tsx`** (or wherever approval is handled)
   - Handle execution result and show feedback to user
   - Inject result message into chat thread

4. **`frontend/components/ai/PendingActionCard.tsx`** (if exists)
   - Show execution status after approval

---

## Implementation Order

1. **Issue 1 First** (simpler, backend-only)
   - Add context handling instruction to supervisor system prompt
   - Add response sanitization function
   - Test that markers no longer appear in responses

2. **Issue 2 Second** (frontend + backend coordination)
   - Update API types
   - Update hook mutation
   - Update UI components to show feedback
   - Test full approval flow

## Testing Checklist

### Issue 1 Tests
- [ ] Send message referencing previous conversation
- [ ] Verify `[Conversation History]` not in response
- [ ] Verify `## Learned Constraints` not in response
- [ ] Verify `[User Memory]` not in response

### Issue 2 Tests
- [ ] Approve action via UI
- [ ] Verify success message shown to user
- [ ] Trigger action that will fail
- [ ] Verify error message shown to user
- [ ] Verify chat thread includes result message
