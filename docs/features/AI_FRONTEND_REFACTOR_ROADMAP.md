# AI Frontend Refactor Roadmap

## Overview

**Goal:** Replace custom AI chat components with AI SDK v6 native patterns + ai-elements
**Timeline:** 2-3 days
**Impact:** ~40% code reduction, native streaming, better maintainability
**UI Framework:** MUI (Material UI) + ai-elements (shadcn-based)
**AI SDK:** @ai-sdk/react v3.0.52, ai v6.0.58, ai-elements v1.8.1

---

## Progress Tracking (Updated 2026-01-31)

### ✅ PHASE 0: Foundation (COMPLETE)

- [x] **InlineActionCard.tsx split** (447 → 348 lines) ✓ 2026-01-31
  - [x] Created `useHitlMutations.ts` hook (63 lines)
  - [x] Created `HitlPayloadEditor.tsx` component (104 lines)
  - [x] Created `HitlStatusBadge.tsx` component (52 lines)
  - [x] Refactored `InlineActionCard.tsx` (348 lines)

### ✅ PHASE 1: AI SDK Native Integration (COMPLETE)

- [x] **use-voltagent-chat.ts refactor** (392 → 228 lines) ✓ 2026-01-31
  - [x] Use `useChat()` from `@ai-sdk/react`
  - [x] Use `DefaultChatTransport` for API communication
  - [x] Removed client-side regex parsing
  - [x] Added `getMessageMetadata()` helper for backend metadata
  - [x] Added `getMessageText()` helper for text extraction

### ✅ PHASE 2: ChatMessages ai-elements Integration (COMPLETE)

- [x] **ChatMessages.tsx refactor** (493 → 327 lines) ✓ 2026-01-31
  - [x] Use `MessageResponse` from ai-elements (replaces custom MarkdownRenderer)
  - [x] Use `Tool`, `ToolHeader`, `ToolContent`, `ToolInput`, `ToolOutput` from ai-elements
  - [x] Use `Suggestions`, `Suggestion` from ai-elements
  - [x] Native `message.parts.map()` iteration pattern
  - [x] Removed unused imports (Chip, Sparkles, ReactMarkdown)
  - [x] Removed unused MarkdownComponents (155 lines)

### 🔄 PHASE 3: Backend Metadata (NEXT)

- [ ] **voltagent.controller.ts update**
  - [ ] Add `messageMetadata` callback to `toUIMessageStream()`
  - [ ] Send `suggestedQuestions` via metadata
  - [ ] Send `askUser` via metadata
  - [ ] Send `totalTokens` via metadata

### 🔄 PHASE 4: Consolidation (PLANNED)

See: [2026-01-31-ai-sdk-consolidation.md](../plans/2026-01-31-ai-sdk-consolidation.md)

- [ ] Deprecate `use-ai-stream-chat.ts` (357 lines) → Use useVoltAgentChat
- [ ] Migrate ChatPanel consumers to ai-elements pattern
- [ ] Delete `ChatPanel.tsx` (472 lines)
- [ ] Move `use-voltagent-chat.ts` to shared hooks location

### ⏳ PHASE 5: New Components (FUTURE)

- [ ] Create AiChat/index.tsx wrapper
- [ ] Create AiChatInput.tsx with ai-elements
- [ ] Extract MentionPopover.tsx with debounced search
- [ ] Deprecate AiDashboard folder

---

## Current State

### Completed Refactors

| Component | Before | After | Savings |
|-----------|--------|-------|---------|
| `use-voltagent-chat.ts` | 392 lines | 228 lines | 164 lines (42%) |
| `ChatMessages.tsx` | 493 lines | 327 lines | 166 lines (34%) |
| `InlineActionCard.tsx` | 447 lines | 348 lines | 99 lines (22%) |
| **Subtotal** | **1332 lines** | **903 lines** | **429 lines (32%)** |

### To Deprecate

| Component | Lines | Replacement |
|-----------|-------|-------------|
| `use-ai-stream-chat.ts` | 357 lines | useVoltAgentChat |
| `ChatPanel.tsx` | 472 lines | ai-elements + ChatMessages |
| **Subtotal** | **829 lines** | **0 lines** |

### Total Estimated Savings

**1258 lines removed** across all phases.

---

## ai-elements Components (Already Installed)

Located at `frontend/src/components/ai-elements/`:

| Component | Purpose |
|-----------|---------|
| `message.tsx` | Message, MessageContent, MessageResponse, MessageActions |
| `tool.tsx` | Tool, ToolHeader, ToolContent, ToolInput, ToolOutput |
| `suggestion.tsx` | Suggestions, Suggestion |
| `conversation.tsx` | Conversation, ConversationContent, ConversationEmptyState |
| `prompt-input.tsx` | PromptInput, PromptInputTextarea, PromptInputSubmit |
| `confirmation.tsx` | Confirmation dialogs for HITL |

---

## Key Patterns

### Native AI SDK Message Parts Iteration

```tsx
{message.parts.map((part, partIndex) => {
  // Text parts -> MessageResponse (uses Streamdown)
  if (part.type === 'text') {
    return <MessageResponse key={partIndex}>{part.text}</MessageResponse>;
  }
  // Tool parts (tool-{name} or dynamic-tool)
  if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
    const toolPart = part as ToolPart;
    return (
      <Tool key={toolPart.toolCallId}>
        <ToolHeader type={toolPart.type} state={toolPart.state} />
        <ToolContent>
          <ToolInput input={toolPart.input} />
          <ToolOutput output={toolPart.output} />
        </ToolContent>
      </Tool>
    );
  }
  return null;
})}
```

### Backend Metadata Pattern

```typescript
// Backend: voltagent.controller.ts
const uiStream = streamResult.toUIMessageStream({
  messageMetadata: ({ part }) => {
    if (part.type === 'finish') {
      return {
        suggestedQuestions: part.suggestedQuestions,
        askUser: part.askUser,
      };
    }
  },
});
```

```tsx
// Frontend: ChatMessages.tsx
const metadata = getMessageMetadata(message);
if (metadata.suggestedQuestions) {
  return <Suggestions>...</Suggestions>;
}
```

---

## Verification

1. `cd frontend && npm run type-check` - No TypeScript errors
2. `cd frontend && npm run lint` - No lint errors
3. Manual test: Chat streaming works
4. Manual test: Tools display correctly
5. Manual test: Suggested questions appear
6. Manual test: HITL actions work

---

## Dependencies (Verified 2026-01-31)

```json
{
  "@ai-sdk/react": "^3.0.52",
  "ai": "^6.0.58",
  "ai-elements": "^1.8.1"
}
```

---

## Sources

- [AI SDK useChat](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)
- [AI SDK Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
- [ai-elements GitHub](https://github.com/vercel/ai-elements)
- [VoltAgent UI Integration](https://voltagent.dev/docs/ui/ai-sdk-integration/)
