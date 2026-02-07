# 02-04-RESEARCH: AI Chat UI Issues Investigation

## Problem Statement

After implementing Phases 02-01, 02-02, and 02-03, the following issues persist:

1. **Tool calls not showing in chat history** - When VoltAgent executes tools, they don't appear in the chat UI
2. **Close button not working** - Mobile dialog close functionality broken
3. **Theme/CSS issues** - ai-elements components may not be styled correctly

Previous quick fixes failed. This document records deep investigation findings.

---

## Investigation 1: Tool Invocation Message Structure

### Backend Analysis

**File**: `backend/src/modules/ai/voltagent/voltagent.controller.ts:201-213`

```typescript
const uiStream = streamResult.toUIMessageStream({
  sendReasoning: false,
  sendSources: false,
  messageMetadata: ({ part }) => {
    if (part.type === 'finish' && part.usage) {
      return { totalTokens: part.usage.totalTokens };
    }
    return undefined;
  },
});
```

**Key Finding**: VoltAgent's `toUIMessageStream()` is the source of message parts. This is VoltAgent's native protocol, NOT raw AI SDK.

### Frontend Analysis

**File**: `frontend/components/ai/AiDashboard/ChatMessages.tsx:209-266`

The frontend expects these part types:
- `part.type === 'text'` → renders `<MessageResponse>`
- `part.type === 'tool-invocation'` → attempts to render `<Tool>` component
- `part.type.startsWith('tool-')` → legacy ai-elements format

### CRITICAL MISMATCH IDENTIFIED

**Problem**: VoltAgent's `toUIMessageStream()` sends parts in VoltAgent format, NOT AI SDK format.

The AI SDK v4 `UIMessage` has `.parts[]` with:
- `{ type: 'text', text: string }`
- `{ type: 'tool-invocation', toolInvocationId, toolName, args, state, result }`

But VoltAgent may send:
- `{ type: 'tool-call', ... }` or different structure
- Tool results embedded in text parts
- Completely different part structure

### Action Required

1. **Add console.log to ChatMessages.tsx** to dump actual message.parts structure
2. **Check VoltAgent toUIMessageStream() documentation** for actual output format
3. **Map VoltAgent format to AI SDK format** in the rendering code

---

## Investigation 2: CSS/Tailwind Configuration

### Tailwind Content Paths

**File**: `frontend/tailwind.config.ts`

```typescript
content: [
  './pages/**/*.{js,ts,jsx,tsx,mdx}',
  './components/**/*.{js,ts,jsx,tsx,mdx}',
  './app/**/*.{js,ts,jsx,tsx,mdx}',
  './src/**/*.{js,ts,jsx,tsx,mdx}',  // ADDED - was missing!
],
```

The `./src/**/*` path was added in previous fix to include `frontend/src/components/ai-elements/`.

### CSS Variables

**File**: `frontend/styles/globals.css`

All required CSS variables are defined:
- `--background`, `--foreground`
- `--muted`, `--muted-foreground`
- `--border`, `--card`, etc.

### Component Imports

ai-elements components import from `@/components/ui/*` which resolves to:
- `frontend/components/ui/collapsible.tsx` ✓
- `frontend/components/ui/badge.tsx` ✓
- `frontend/components/ui/button.tsx` ✓

All required shadcn components exist.

### Finding: CSS setup is CORRECT

The issue is NOT CSS configuration. The ai-elements should receive proper styles.

---

## Investigation 3: Close Button

### Current Implementation

**File**: `frontend/components/ai/AiDashboard/index.tsx`

The close button likely uses MUI Dialog's `onClose` prop. Need to verify:
1. Is `onClose` being passed correctly?
2. Is there event propagation interference?
3. Is the mobile viewport detecting click events?

### Action Required

Check the Dialog implementation in AiDashboard - specifically the IconButton with X/close icon.

---

## Root Cause Hypothesis

### Most Likely: VoltAgent Stream Format Mismatch

VoltAgent's `toUIMessageStream()` produces a stream format that is similar but NOT identical to AI SDK's `UIMessage` parts structure.

The frontend code was written expecting AI SDK v4 `tool-invocation` parts, but VoltAgent likely sends:
- Tool calls as separate events
- Different part type names
- Different property structures

### Evidence

1. Tools ARE executing (backend logs show tool results being processed)
2. Tools are NOT appearing in UI (frontend never receives/recognizes them)
3. CSS is correct (ai-elements components would render if they received data)

---

## Recommended Fix Plan

### Phase 1: Debug Logging

Add debug logging to frontend to capture actual message structure:

```typescript
// In ChatMessages.tsx, line ~141
console.log('[DEBUG] Message:', JSON.stringify(message, null, 2));
console.log('[DEBUG] Parts:', message.parts);
```

### Phase 2: Check VoltAgent Documentation

VoltAgent docs: https://voltagent.dev/docs/
- Find `toUIMessageStream()` output specification
- Check if there's a different part type for tools

### Phase 3: Create Proper Part Mapper

Once we know the actual format, create a mapping function:

```typescript
function mapVoltAgentPartToAISDK(part: VoltAgentPart): AISDKPart {
  // Map VoltAgent format to what ai-elements expects
}
```

### Phase 4: Fix Close Button

After tools work, investigate close button separately.

---

## Next Steps

1. Open browser DevTools console
2. Send a chat message that triggers a tool (e.g., "summarize my last email")
3. Capture the actual `message.parts` structure
4. Create proper mapping logic

---

## Files to Modify

| File | Change |
|------|--------|
| `ChatMessages.tsx` | Add debug logging, fix part type mapping |
| `use-voltagent-chat.ts` | May need to transform parts on receive |
| `AiDashboard/index.tsx` | Fix close button event handling |

---

## Debug Logging Added

### ChatMessages.tsx (line ~130)

```typescript
React.useEffect(() => {
  if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    console.log('[ChatMessages DEBUG] Last message:', {
      role: lastMsg.role,
      id: lastMsg.id,
      partsCount: lastMsg.parts?.length,
      parts: lastMsg.parts?.map((p, i) => ({
        index: i,
        type: p.type,
        keys: Object.keys(p),
        preview: JSON.stringify(p).slice(0, 200),
      })),
      rawMessage: lastMsg,
    });
  }
}, [messages.length]);
```

### MobileChatDialog.tsx (line ~55)

```typescript
const handleClose = React.useCallback(() => {
  console.log('[MobileChatDialog] Close button clicked');
  onClose();
}, [onClose]);
```

---

## Status

- [x] Backend tool execution verified (tools ARE running)
- [x] CSS configuration verified (styles ARE correct)
- [x] ai-elements components verified (components ARE available)
- [x] Debug logging added to ChatMessages.tsx
- [x] Debug logging added to MobileChatDialog.tsx
- [ ] Browser testing (NEXT STEP - open browser, check console)

---

## Next Session Instructions

1. Start the dev server: `cd frontend && npm run dev`
2. Open http://localhost:3001/dashboard/ai
3. Send a message that triggers a tool (e.g., "summarize my last email")
4. Check browser console for `[ChatMessages DEBUG]` logs
5. Look at the `parts` array structure
6. On mobile view, try the close button and check for `[MobileChatDialog]` log