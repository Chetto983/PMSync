# AI SDK Native Refactor Design

**Date:** 2026-01-31
**Goal:** Simplify chat frontend using AI SDK v6 native patterns
**Impact:** ~250 lines removed, eliminate lint errors, better maintainability

## Problem

Current `use-voltagent-chat.ts` (392 lines) reinvents what AI SDK provides:
- Custom message processing causing React render cascade bugs
- Ref access during render (lint errors = real bugs)
- Client-side regex parsing for `suggestedQuestions` and `askUser`

## Solution

Use AI SDK v6 native patterns:
1. `message.parts[]` instead of custom processing
2. `message.metadata` for structured data (backend sends it)
3. Remove ref workarounds (SDK handles throttling)

## Files to Change

### 1. `use-voltagent-chat.ts` (392 → ~150 lines)

Remove:
- `extractSuggestedQuestions()` - backend sends via metadata
- `extractAskUser()` - backend sends via metadata
- Custom `messagesWithParts` useMemo - use `chat.messages` directly
- Ref-based caching workarounds - SDK handles with `experimental_throttle`

Keep:
- `DefaultChatTransport` setup (correct)
- `conversationId` management
- Auth token handling

### 2. `voltagent.controller.ts` (+15 lines)

Add `messageMetadata` callback to `toUIMessageStream()`:
```typescript
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

### 3. `ChatMessages.tsx` (~-100 lines)

Use AI SDK v6 parts structure:
```tsx
{message.parts.map((part, i) => {
  if (part.type === 'text') return <MarkdownRenderer key={i} content={part.text} />;
  if (part.type === 'tool-invocation') return <ToolActivityCard key={part.toolCallId} tool={part} />;
  return null;
})}

{message.metadata?.suggestedQuestions && (
  <SuggestedQuestions questions={message.metadata.suggestedQuestions} />
)}
```

## Verification

1. `npm run type-check` - no TypeScript errors
2. `npm run lint` - ref access errors gone
3. Manual test: chat streaming works, tools display, HITL works
