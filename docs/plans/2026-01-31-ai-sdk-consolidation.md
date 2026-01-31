# AI SDK Consolidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate all AI chat components to use AI SDK v6 native patterns, eliminating ~750 lines of custom code

**Architecture:** Use AI SDK's native `useChat()` hook with `DefaultChatTransport`, ai-elements for UI, and backend metadata for structured data

**Tech Stack:** @ai-sdk/react v3.0.52, ai v6.0.58, ai-elements v1.8.1 (shadcn-based)

---

## Current State (2026-01-31)

### ✅ COMPLETED (This Session)

| File | Before | After | Status |
|------|--------|-------|--------|
| `use-voltagent-chat.ts` | 392 lines | 228 lines | ✅ Native AI SDK |
| `ChatMessages.tsx` | 493 lines | 327 lines | ✅ Uses ai-elements |
| `InlineActionCard.tsx` | 447 lines | 348 lines | ✅ Split into 4 files |

### ⚠️ TO DEPRECATE (Custom implementations)

| File | Lines | Reason |
|------|-------|--------|
| `use-ai-stream-chat.ts` | 357 lines | Duplicates AI SDK streaming |
| `ChatPanel.tsx` | 472 lines | Uses deprecated hook, custom bubbles |

### 📦 ai-elements Already Installed

Located at `frontend/src/components/ai-elements/`:
- `message.tsx` - Message, MessageContent, MessageResponse, MessageActions
- `tool.tsx` - Tool, ToolHeader, ToolContent, ToolInput, ToolOutput
- `suggestion.tsx` - Suggestions, Suggestion
- `conversation.tsx` - Conversation, ConversationContent, ConversationEmptyState
- `prompt-input.tsx` - PromptInput, PromptInputTextarea, PromptInputSubmit
- `confirmation.tsx` - Confirmation dialogs for HITL

---

## Implementation Tasks

### Task 1: Update Backend to Send Metadata

**Files:**
- Modify: `backend/src/modules/voltagent/controllers/voltagent.controller.ts`

**Step 1: Add messageMetadata to toUIMessageStream**

```typescript
// In chat streaming endpoint
const uiStream = streamResult.toUIMessageStream({
  sendReasoning: false,
  sendSources: false,
  messageMetadata: ({ part }) => {
    if (part.type === 'finish') {
      return {
        suggestedQuestions: part.suggestedQuestions,
        askUser: part.askUser,
        totalTokens: part.totalUsage?.totalTokens,
      };
    }
  },
});
```

**Step 2: Verify streaming works**

Run: Manual test at `/dashboard/ai`
Expected: Chat streams with metadata appearing on message.metadata

**Step 3: Commit**

```bash
git add backend/src/modules/voltagent/controllers/voltagent.controller.ts
git commit -m "feat: add messageMetadata to AI chat stream response"
```

---

### Task 2: Deprecate use-ai-stream-chat.ts

**Files:**
- Modify: `frontend/hooks/use-ai-stream-chat.ts` (add deprecation notice)
- Modify: Any files importing it

**Step 1: Find all imports**

Run: `grep -r "use-ai-stream-chat" frontend/`

**Step 2: Update imports to use use-voltagent-chat**

Replace:
```typescript
import { useAiStreamChat } from '@/hooks/use-ai-stream-chat';
```

With:
```typescript
import { useVoltAgentChat } from '@/components/ai/AiDashboard/use-voltagent-chat';
```

**Step 3: Add deprecation notice to old file**

```typescript
/**
 * @deprecated Use useVoltAgentChat from '@/components/ai/AiDashboard/use-voltagent-chat' instead.
 * This hook duplicates AI SDK v6 functionality. Will be removed in v2.0.
 */
```

**Step 4: Run type-check**

Run: `cd frontend && npm run type-check`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/
git commit -m "refactor: deprecate use-ai-stream-chat in favor of useVoltAgentChat"
```

---

### Task 3: Migrate ChatPanel.tsx Consumers

**Files:**
- Find and update all ChatPanel imports

**Step 1: Find all ChatPanel imports**

Run: `grep -r "ChatPanel" frontend/`

**Step 2: Update to use new pattern**

Replace ChatPanel usage with ai-elements + useVoltAgentChat:
- Use `<Conversation>` from ai-elements for container
- Use `<ChatMessages>` from AiDashboard for message rendering
- Use `<PromptInput>` from ai-elements for input

**Step 3: Type check**

Run: `cd frontend && npm run type-check`

**Step 4: Commit**

```bash
git add frontend/
git commit -m "refactor: migrate ChatPanel consumers to ai-elements pattern"
```

---

### Task 4: Delete Deprecated Files (After Testing)

**Files:**
- Delete: `frontend/hooks/use-ai-stream-chat.ts` (357 lines)
- Delete: `frontend/components/ai/ChatPanel.tsx` (472 lines)

**Prerequisite:** All consumers migrated and tested

**Step 1: Verify no remaining imports**

Run: `grep -r "use-ai-stream-chat\|ChatPanel" frontend/ --include="*.tsx" --include="*.ts"`
Expected: No results (only the deprecated files themselves)

**Step 2: Delete files**

```bash
rm frontend/hooks/use-ai-stream-chat.ts
rm frontend/components/ai/ChatPanel.tsx
```

**Step 3: Type check**

Run: `cd frontend && npm run type-check`

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated AI chat components (829 lines)"
```

---

### Task 5: Move use-voltagent-chat to Shared Location

**Files:**
- Move: `frontend/components/ai/AiDashboard/use-voltagent-chat.ts`
- To: `frontend/hooks/use-voltagent-chat.ts`

**Step 1: Move file**

```bash
mv frontend/components/ai/AiDashboard/use-voltagent-chat.ts frontend/hooks/use-voltagent-chat.ts
```

**Step 2: Update all imports**

Run: Find and replace all imports

**Step 3: Export from hooks index**

```typescript
// frontend/hooks/index.ts
export * from './use-voltagent-chat';
```

**Step 4: Type check**

Run: `cd frontend && npm run type-check`

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: move use-voltagent-chat to shared hooks location"
```

---

## Summary

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| Custom streaming hook | 357 lines | 0 lines | 357 lines |
| Custom ChatPanel | 472 lines | 0 lines | 472 lines |
| Total | 829 lines | 0 lines | **829 lines** |

**Total AI chat code reduction:** ~40% fewer lines while gaining AI SDK native features.

---

## Verification Checklist

- [ ] Backend sends metadata via `toUIMessageStream`
- [ ] `ChatMessages.tsx` displays metadata correctly
- [ ] No remaining imports of deprecated files
- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes
- [ ] Manual test: Chat streaming works
- [ ] Manual test: Tools display correctly
- [ ] Manual test: Suggested questions appear
- [ ] Manual test: HITL actions work

---

## Next Steps After Consolidation

1. **Phase 2**: Create AiChat wrapper using ai-elements
2. **Phase 3**: Extract MentionPopover with debounced search
3. **Phase 4**: Optimize input component
4. **Phase 5**: Deprecate AiDashboard folder entirely
