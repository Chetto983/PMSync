# Phase 02: AI Chat Overhaul - Research

**Researched:** 2026-02-06
**Domain:** AI Chat Streaming, Mobile Responsive UI, Error Handling
**Confidence:** HIGH

## Summary

The current MailAgent chat implementation is already using Vercel AI SDK v6 with the `useChat` hook via a custom `use-voltagent-chat.ts` wrapper. The integration is more mature than expected - streaming works, conversation persistence exists, and the backend properly implements `toUIMessageStream()`. However, three key areas need improvement: (1) VOLT-01 circuit breaker integration remains deferred from Phase 01, (2) mobile experience lacks a proper full-screen modal pattern, and (3) contextual suggested prompts are static rather than view-aware.

**Primary recommendation:** Focus on enhancing the existing implementation rather than replacing it. The foundation is solid - improvements should target circuit breaker integration, mobile UX polish, and context-aware prompt suggestions.

## 1. Current Codebase Audit

### Frontend Chat Components (Existing)

| File | Purpose | Status |
|------|---------|--------|
| `frontend/hooks/use-voltagent-chat.ts` | AI SDK v6 useChat wrapper with DefaultChatTransport | **Working** - 229 lines, proper streaming |
| `frontend/components/ai/AiDashboard/index.tsx` | Main chat UI with widgets | **Working** - 714 lines, well-structured |
| `frontend/components/ai/AiDashboard/ChatMessages.tsx` | Message rendering with tool parts | **Working** - 328 lines, supports UIMessage parts |
| `frontend/components/ai/AiDashboard/ChatSessionList.tsx` | Conversation list management | **Working** - 749 lines, TanStack Query |
| `frontend/components/ai/AiDashboard/TypingIndicator.tsx` | Streaming status indicator | **Working** |
| `frontend/components/ai/AiDashboard/SuggestedQuestions.tsx` | Post-response suggestions | **Exists** but not context-aware |
| `frontend/components/ai/AiDashboard/AskUserModal.tsx` | HITL clarification modal | **Working** |
| `frontend/components/ai/AiDashboard/MentionInput.tsx` | @ mentions and / commands | **Working** |

### Backend Chat Integration (Existing)

| File | Purpose | Status |
|------|---------|--------|
| `backend/src/modules/ai/voltagent/voltagent.service.ts` | Main chat orchestration | **Working** - 1068 lines, has `createStreamContext()` |
| `backend/src/modules/ai/voltagent/voltagent.controller.ts` | API endpoints | **Working** - `/chat/stream/v3` implements SSE correctly |
| `backend/src/modules/ai/voltagent/services/chat-prepare.service.ts` | Context building | **Working** |
| `backend/src/modules/ai/voltagent/services/chat-context-builder.service.ts` | Memory + RAG enhancement | **Working** |
| `backend/src/modules/ai/voltagent/services/agent-metrics.service.ts` | Prometheus instrumentation | **Working** (from Phase 01) |

### Key Findings from Code Audit

**Already Implemented (no work needed):**
- AI SDK v6 `useChat` with `DefaultChatTransport` - line 117 in use-voltagent-chat.ts
- Streaming via SSE with `toUIMessageStream()` - line 190 in controller
- Conversation persistence in PostgreSQL via VoltAgent Memory
- UIMessage parts structure with text and tool invocations
- Message metadata for suggestedQuestions and askUser
- Stop/abort functionality - line 478-499 in AiDashboard
- WebSocket subscription for HITL updates

**Needs Enhancement (Phase 02 scope):**
1. **Circuit breaker** - VOLT-01 deferred from Phase 01, affects graceful degradation
2. **Mobile full-screen modal** - Current uses SwipeableDrawer but not full-screen
3. **Context-aware prompts** - Currently shows static suggestions, not view-aware
4. **Error retry UI** - Has toast but no inline retry button

## 2. Vercel AI SDK Integration (2025 Best Practices)

### Current Implementation Analysis

The codebase uses AI SDK v6 patterns correctly:

```typescript
// use-voltagent-chat.ts - Already following 2025 patterns
const transport = useMemo(
  () =>
    new DefaultChatTransport({
      api: `${API_BASE_URL}/api/v1/voltagent/chat/stream/v3`,
      headers: () => ({
        Authorization: `Bearer ${getAuthToken()}`,
      }),
      prepareSendMessagesRequest: ({ messages }) => ({
        body: {
          message: extractTextFromParts(messages[messages.length - 1]),
          conversationId: conversationIdRef.current,
          locale,
        },
      }),
    }),
  [locale]
);
```

**What's Already Correct:**
- Transport-based architecture (AI SDK 5.0+)
- `prepareSendMessagesRequest` for custom body
- `experimental_throttle: 100` for render batching
- Proper status handling ('ready' | 'submitted' | 'streaming' | 'error')
- `setMessages` for conversation restoration

### AI SDK 5.0/6.0 Updates to Apply

| Feature | Current Status | Recommendation |
|---------|---------------|----------------|
| UIMessage parts | Implemented | Keep - correct pattern |
| Tool invocations | Implemented via parts | Keep - renders tool cards |
| Message metadata | Implemented | Enhance - add view context |
| `sendMessage` | Implemented | Keep |
| `stop` | Implemented | Keep |
| `regenerate` | Not used | Add for re-try UX |
| `resumeStream` | Not used | Consider for reconnection |
| `onToolCall` | Not implemented | Add if frontend tools needed |

**Key AI SDK 5.0 Change (from docs):**
> The `useChat` API has been significantly updated in AI SDK 5.0. It now uses a transport-based architecture and no longer manages input state internally.

This is already implemented correctly - input state is managed by `prompt` state in AiDashboard.

### Code Pattern Reference (from AI SDK docs)

```typescript
// Recommended 2025 pattern - already in use
const { messages, status, sendMessage, stop, regenerate, setMessages } = useChat({
  transport,
  id: conversationId,
  experimental_throttle: 100,
  onError,
  onFinish: (options) => {
    // Persist messages, trigger title generation, etc.
  },
});
```

**Confidence:** HIGH - Verified against official AI SDK documentation in node_modules.

## 3. Mobile-Responsive Patterns (375px+ Design)

### Current Mobile Implementation

```typescript
// AiDashboard/index.tsx - Current mobile handling
const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
const [widgetsDrawerOpen, setWidgetsDrawerOpen] = useState(false);

// SwipeableDrawer for sidebar widgets
<SwipeableDrawer
  anchor="right"
  PaperProps={{
    sx: { width: { xs: '85vw', sm: 380 }, maxWidth: 400 }
  }}
>
```

**Issues with Current Approach:**
1. Chat area is NOT full-screen on mobile - wastes header space
2. Input area not fixed to bottom (can scroll away)
3. No keyboard handling for iOS viewport
4. SwipeableDrawer is for widgets, not chat itself

### Recommended Full-Screen Modal Pattern

Based on 2025 chat UI patterns, implement:

```typescript
// Pattern: Full-screen chat on mobile
{isMobile && (
  <Dialog
    fullScreen
    open={true}
    TransitionComponent={Slide}
    TransitionProps={{ direction: 'up' }}
  >
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: '100dvh', // Use dvh for iOS viewport
      overflow: 'hidden',
    }}>
      {/* Header - fixed 56px */}
      <AppBar position="static" sx={{ height: 56 }} />

      {/* Messages - flex: 1, scrollable */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <ChatMessages />
      </Box>

      {/* Input - fixed at bottom */}
      <Box sx={{
        position: 'sticky',
        bottom: 0,
        bgcolor: 'background.paper',
        pb: 'env(safe-area-inset-bottom)', // iOS safe area
      }}>
        <ChatInput />
      </Box>
    </Box>
  </Dialog>
)}
```

### Mobile Breakpoints

| Breakpoint | Width | Pattern |
|------------|-------|---------|
| xs | 0-375px | Full-screen modal, compact header |
| sm | 375-600px | Full-screen modal, standard header |
| md | 600-900px | Optional full-screen or side panel |
| lg+ | 900px+ | Desktop layout with sidebar widgets |

### iOS Viewport Fix (POLISH-01 from v2.1)

```css
/* Required for iOS keyboard handling */
height: 100dvh; /* Dynamic viewport height */
padding-bottom: env(safe-area-inset-bottom);

/* Prevent zoom on input focus */
input, textarea {
  font-size: 16px; /* Prevents iOS zoom */
}
```

**Confidence:** MEDIUM - Based on web patterns, needs testing on real iOS devices.

## 4. Error Handling & Circuit Breaker (VOLT-01)

### Current Error Handling

```typescript
// use-voltagent-chat.ts - Current error handling
const chat = useChat({
  transport,
  onError, // Passed from AiDashboard
});

// AiDashboard/index.tsx
onError: (error) => {
  logger.error('[AiDashboard] Chat error:', error);
  toast.error(t.ai?.errors?.chatFailed || 'Failed to send message. Please try again.');
},
```

**Issues:**
1. No retry button - user must manually re-send
2. No distinction between transient vs permanent errors
3. VOLT-01 circuit breaker not integrated (deferred from Phase 01)

### Circuit Breaker Integration (from Phase 01 AUDIT.md)

**VOLT-01 Status:** Deferred to Phase 02

From the audit:
> The `createUnifiedAgent()` function creates agents that call LLM providers directly without circuit breaker protection. When Mistral API has transient failures, agents continue sending requests, potentially causing cascade failures.

**Required Integration:**

```typescript
// Backend: voltagent.service.ts
// Add to createStreamContext() and chat()
if (this.mistralService?.isCircuitOpen()) {
  // Return graceful fallback
  return {
    text: this.mistralService.getGracefulTimeoutResponse(message, locale),
    fromCache: false,
  };
}

// Frontend: Error categorization
interface ChatError {
  code: 'RATE_LIMIT' | 'TIMEOUT' | 'CIRCUIT_OPEN' | 'NETWORK' | 'UNKNOWN';
  retryable: boolean;
  retryAfterMs?: number;
}
```

### Graceful Degradation Pattern

```typescript
// Frontend error handling with retry
const [lastError, setLastError] = useState<ChatError | null>(null);

const handleRetry = useCallback(() => {
  if (lastError?.retryable && lastPrompt) {
    setLastError(null);
    sendMessage(lastPrompt);
  }
}, [lastError, lastPrompt, sendMessage]);

// UI: Inline retry button
{lastError?.retryable && (
  <Button onClick={handleRetry} startIcon={<RefreshCw />}>
    {t.ai?.actions?.retry || 'Retry'}
  </Button>
)}
```

### Backend Circuit Breaker (from MistralService)

The backend already has a partial circuit breaker in `mistral.service.ts`:

```typescript
// Already exists - needs integration with VoltAgent hooks
private llmCircuitBreaker = new LlmCircuitBreaker({
  failureThreshold: 3,
  recoveryTimeout: 30000,
  halfOpenMaxRequests: 1,
});

recordLlmFailure(): void { ... }
recordLlmSuccess(): void { ... }
isCircuitOpen(): boolean { ... }
```

**Phase 02 Task:** Wire this into `VoltAgentService.createStreamContext()` for fail-fast behavior.

**Confidence:** HIGH - Pattern verified from Phase 01 audit and existing MistralService code.

## 5. Integration Architecture (VoltAgent -> Vercel AI SDK)

### Current Flow (Verified)

```
Frontend                          Backend
--------                          -------
useVoltAgentChat()
  |
  v
DefaultChatTransport
  |
  v
POST /api/v1/voltagent/chat/stream/v3
  |                                |
  |                                v
  |                          VoltAgentController.streamChatV3()
  |                                |
  |                                v
  |                          VoltAgentService.createStreamContext()
  |                                |
  |                                v
  |                          ChatPrepareService.prepare()
  |                                |
  |                                v
  |                          UnifiedAgent.streamText()
  |                                |
  |                                v
  |                          VoltAgent toUIMessageStream()
  |                                |
  |<-- SSE stream ----------------+
  |
  v
useChat().messages (UIMessage[])
  |
  v
ChatMessages.tsx renders parts
```

### Key Integration Points

1. **Transport -> Controller:** Custom body via `prepareSendMessagesRequest`
2. **Controller -> Service:** `createStreamContext()` returns raw VoltAgent result
3. **Service -> Agent:** `ctx.agent.streamText()` with VoltAgent Memory
4. **Agent -> Stream:** `streamResult.toUIMessageStream()` with metadata callback
5. **Stream -> Frontend:** SSE via `res.write(encoder.encode(sseData))`

### Contextual Prompts Integration

To make suggested prompts context-aware, add view context to the transport:

```typescript
// Frontend: Pass current view context
prepareSendMessagesRequest: ({ messages }) => ({
  body: {
    message: extractTextFromParts(messages[messages.length - 1]),
    conversationId: conversationIdRef.current,
    locale,
    // NEW: View context for contextual prompts
    viewContext: {
      currentView: 'inbox', // or 'calendar', 'contacts', 'thread'
      selectedEmailId: selectedEmail?.id,
      selectedFolderId: currentFolder?.id,
    },
  },
}),

// Backend: Generate context-aware suggestions
// In ChatResponseProcessorService or a new SuggestedPromptsService
getSuggestedPrompts(viewContext: ViewContext): string[] {
  switch (viewContext.currentView) {
    case 'inbox':
      return ['Summarize unread emails', 'Show urgent messages', 'Draft replies'];
    case 'calendar':
      return ["What's on my schedule today?", 'Find meeting conflicts', 'Schedule focus time'];
    case 'thread':
      return ['Summarize this thread', 'Draft a reply', 'Extract action items'];
    default:
      return ['How can I help?'];
  }
}
```

**Confidence:** HIGH - Architecture verified from codebase analysis.

## 6. Recommended Approach

### Plan Structure for Phase 02

**Plan 02-01: Circuit Breaker Integration (VOLT-01)**
- Wire MistralService.isCircuitOpen() into createStreamContext()
- Add graceful timeout response (already exists in MistralService)
- Frontend error categorization with retryable flag
- Add retry button to error state

**Plan 02-02: Contextual Prompts Enhancement (CHAT-02)**
- Add viewContext to chat transport body
- Create SuggestedPromptsService for context-aware suggestions
- Update QuickActions component to be view-aware
- Pass suggestions via message metadata (already supported)

**Plan 02-03: Mobile Full-Screen + Error UX (CHAT-03)**
- Implement full-screen Dialog pattern for mobile
- Fix iOS viewport issues (100dvh, safe-area-inset)
- Add inline retry button for transient errors
- Polish touch gestures and keyboard handling

### Do NOT Hand-Roll

| Problem | Use Instead | Why |
|---------|-------------|-----|
| Chat streaming | Vercel AI SDK useChat | Already implemented, battle-tested |
| Message persistence | VoltAgent Memory | Already implemented with PostgreSQL |
| SSE protocol | toUIMessageStream() | VoltAgent handles protocol compliance |
| Mobile modal | MUI Dialog fullScreen | MUI handles accessibility, transitions |
| Error retry | useChat.regenerate() | AI SDK native method |

### Enhancements vs Rewrites

| Component | Action | Rationale |
|-----------|--------|-----------|
| use-voltagent-chat.ts | KEEP | Solid AI SDK v6 integration |
| AiDashboard/index.tsx | ENHANCE | Add mobile full-screen mode |
| ChatMessages.tsx | KEEP | Proper UIMessage parts rendering |
| voltagent.controller.ts | ENHANCE | Add circuit breaker check |
| QuickActions.tsx | ENHANCE | Make context-aware |

## 7. Risks & Mitigations

### Risk 1: Circuit Breaker Over-Triggering

**Risk:** Circuit breaker opens too aggressively, blocking all AI for minor hiccups.
**Probability:** Medium
**Mitigation:**
- Use conservative thresholds (3+ failures in 30s)
- Implement per-user circuit breakers (not global)
- Add manual reset capability for admins
- Monitor with Prometheus metrics (already instrumented)

### Risk 2: iOS Viewport Issues

**Risk:** Input field hidden behind keyboard on iOS Safari.
**Probability:** High (known iOS issue)
**Mitigation:**
- Use `100dvh` not `100vh` for dynamic viewport
- Apply `env(safe-area-inset-bottom)` padding
- Test on real iOS devices (simulators insufficient)
- Consider `@supports` CSS fallbacks

### Risk 3: Context Loading Latency

**Risk:** Context-aware prompts add latency to first response.
**Probability:** Low
**Mitigation:**
- Generate prompts asynchronously after first message
- Cache prompts per view (5-minute TTL)
- Show skeleton while loading prompts
- Fallback to static prompts if context fetch fails

### Risk 4: Streaming Interruption

**Risk:** Network blips cause partial messages, UI hangs.
**Probability:** Medium
**Mitigation:**
- useChat.resumeStream() for reconnection (AI SDK feature)
- Store partial response in state for recovery
- Add "Connection lost" indicator with auto-retry
- Backend idempotency via conversationId

## Common Pitfalls (from FEATURES.md)

### Pitfall 1: Pure Chat for Everything

**From research:** "Chat is a bad UI pattern for development tools" - users prefer structured UIs with AI suggestions.

**Avoidance:** MailAgent already follows the "structured UI + AI suggestions" pattern via QuickActions and command palette. Enhance this, don't regress to pure chat.

### Pitfall 2: Silent AI Confabulation

**From research:** LLMs invent facts without citations.

**Avoidance:** Already implemented via RAG context. Ensure suggested prompts reference real data ("You have 5 unread emails from John" not just "Ask about John").

### Pitfall 3: Overly Anthropomorphic Design

**From research:** Chatbot avatars and theatrical "typing..." delays feel uncanny.

**Avoidance:** Current TypingIndicator shows actual agent action ("Searching emails...") not fake typing. Keep this pattern.

## Performance Targets (from FEATURES.md)

| Metric | Target | Measurement |
|--------|--------|-------------|
| First token latency | <500ms | Prometheus histogram (already instrumented) |
| Token streaming rate | 20-50 tokens/sec | LLM provider metric |
| Mobile input focus | <100ms | User perception |
| Error retry | Instant | Frontend state management |

## Sources

### Primary (HIGH confidence)
- Vercel AI SDK v6 documentation: `frontend/node_modules/ai/docs/07-reference/02-ai-sdk-ui/01-use-chat.mdx`
- VoltAgent integration: `frontend/hooks/use-voltagent-chat.ts` (verified working)
- Phase 01 AUDIT.md: VOLT-01 circuit breaker requirements
- Phase 01 VERIFICATION.md: Infrastructure readiness confirmed

### Secondary (MEDIUM confidence)
- [Vercel AI SDK 5.0 Blog](https://vercel.com/blog/ai-sdk-5)
- [AI SDK useChat Reference](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)
- [16 Chat UI Design Patterns 2025](https://bricxlabs.com/blogs/message-screen-ui-deisgn)
- [MUI Dialog fullScreen](https://mui.com/material-ui/react-dialog/)

### Circuit Breaker Patterns (MEDIUM confidence)
- [Retries, Fallbacks, Circuit Breakers in LLM Apps](https://portkey.ai/blog/retries-fallbacks-and-circuit-breakers-in-llm-apps/)
- [Circuit Breaker for LLM with Retry - TypeScript](https://medium.com/@spacholski99/circuit-breaker-for-llm-with-retry-and-backoff-anthropic-api-example-typescript-1f99a0a0cf87)
- [Building Bulletproof LLM Applications](https://medium.com/google-cloud/building-bulletproof-llm-applications-a-guide-to-applying-sre-best-practices-1564b72fd22e)

## Metadata

**Confidence breakdown:**
- Current codebase analysis: HIGH - All files read and verified
- AI SDK integration: HIGH - Documentation in node_modules confirmed
- Mobile patterns: MEDIUM - Based on web research, needs device testing
- Circuit breaker: HIGH - Pattern exists in codebase, needs wiring

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (30 days - stable patterns)

---

## RESEARCH COMPLETE

**Phase:** 02 - AI Chat Overhaul
**Confidence:** HIGH

### Key Findings

1. **Existing implementation is solid** - AI SDK v6 with useChat already working correctly
2. **VOLT-01 circuit breaker** is the critical deferred item from Phase 01 affecting error handling
3. **Mobile UX** needs full-screen modal pattern, not SwipeableDrawer
4. **Contextual prompts** require viewContext passing through transport
5. **No major rewrites needed** - enhance existing components

### File Created

`D:\MailAgent\.planning\phases\02-ai-chat-overhaul\02-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | AI SDK v6 already implemented and verified |
| Architecture | HIGH | Codebase analysis confirms working integration |
| Mobile Patterns | MEDIUM | Web patterns, needs device testing |
| Circuit Breaker | HIGH | Pattern exists in MistralService, needs wiring |

### Open Questions

1. iOS Safari viewport testing required on real devices
2. Circuit breaker thresholds may need tuning based on production traffic
3. Context-aware prompt generation might benefit from caching strategy

### Ready for Planning

Research complete. Planner can now create PLAN.md files for:
- 02-01: Circuit Breaker Integration (VOLT-01)
- 02-02: Contextual Prompts Enhancement (CHAT-02)
- 02-03: Mobile Full-Screen + Error UX (CHAT-03)
