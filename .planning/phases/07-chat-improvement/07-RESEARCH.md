# Phase 07: Chat Improvement - Research

**Researched:** 2026-02-07
**Domain:** AI Chat UI/UX, React Component Architecture, Modern Design Patterns
**Confidence:** MEDIUM-HIGH

## Summary

This research investigates how to implement Phase 07's requirements: wiring unused ai-elements components, modernizing message bubble design, splitting the 953-line AiDashboard monolith, and fixing scroll/UX issues.

The MailAgent codebase already contains 48 ai-elements components based on shadcn/Tailwind, but most are unused. The primary work is integration and styling rather than building new components. The AiDashboard violates the 500-line rule at 953 lines and must be split following established React patterns.

**Primary recommendation:** Wire existing Reasoning, Artifact, ChainOfThought, MessageActions, and Sources components into ChatMessages.tsx. Split AiDashboard into 5 files using feature-based organization. Modernize message bubbles to borderless Claude/ChatGPT style. Replace force-scroll with smart scroll-to-bottom button.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `motion/react` | - | Shimmer animation | Framer Motion successor, already used in shimmer.tsx |
| `@radix-ui/react-use-controllable-state` | - | Controlled/uncontrolled state | Used by Reasoning, ChainOfThought components |
| `streamdown` + plugins | - | Markdown rendering | Already integrated with code, math, mermaid, cjk |
| `@/components/ui/collapsible` | - | Collapsible sections | Radix-based, used by Reasoning/CoT |
| MUI | 5.x | Layout and forms | Main UI system |

### Supporting (For New Features)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-scroll-to-bottom` | 4.x | Smart scroll behavior | Alternative to custom implementation |
| `@assistant-ui/react` | latest | Advanced chat primitives | Future: if needing more chat features |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom scroll logic | `react-scroll-to-bottom` | Adds 3.5KB but handles edge cases |
| MUI message bubbles | Full Tailwind migration | Too large scope for Phase 07 |

## Architecture Patterns

### Recommended AiDashboard Split Structure
```
components/ai/AiDashboard/
├── index.tsx            (~200 lines) - Layout shell, composition
├── useChatController.ts (~200 lines) - State, handlers, side effects
├── ChatArea.tsx         (~150 lines) - Messages + input container
├── DesktopLayout.tsx    (~100 lines) - Grid layout for lg+
├── MobileLayout.tsx     (~100 lines) - FAB + dialog for <md
├── ChatMessages.tsx     (existing, ~344 lines)
├── TypingIndicator.tsx  (existing)
└── ...other widgets
```

### Pattern 1: Custom Hook Extraction
**What:** Extract all state management and handlers into a custom hook
**When to use:** When a component has >5 useState calls or complex side effects
**Example:**
```typescript
// useChatController.ts
export function useChatController(options: ChatControllerOptions) {
  // All useState, useEffect, useCallback from AiDashboard
  const [prompt, setPrompt] = useState('');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [askUserModalOpen, setAskUserModalOpen] = useState(false);

  // useVoltAgentChat integration
  const chatHook = useVoltAgentChat({ ... });

  // Handlers
  const handleSendMessage = useCallback(...);
  const handleNewChat = useCallback(...);

  return {
    // State
    prompt, setPrompt,
    commandPaletteOpen, setCommandPaletteOpen,
    // Chat hook values
    ...chatHook,
    // Handlers
    handleSendMessage,
    handleNewChat,
  };
}
```

### Pattern 2: Smart Scroll Behavior
**What:** Only auto-scroll when user is at bottom; show floating button when scrolled up
**When to use:** Any chat interface with streaming content
**Example:**
```typescript
// Source: react-scroll-to-bottom pattern, adapted
function useChatScroll(containerRef: RefObject<HTMLElement>) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const threshold = 100; // pixels from bottom
    const atBottom = scrollHeight - scrollTop - clientHeight < threshold;
    setIsAtBottom(atBottom);
    setShowScrollButton(!atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    containerRef.current?.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: 'smooth'
    });
  }, []);

  // Only auto-scroll if user is at bottom
  const maybeScrollToBottom = useCallback(() => {
    if (isAtBottom) scrollToBottom();
  }, [isAtBottom, scrollToBottom]);

  return { isAtBottom, showScrollButton, scrollToBottom, maybeScrollToBottom, handleScroll };
}
```

### Pattern 3: Component Wiring for Parts
**What:** Map message parts to ai-elements components
**When to use:** Rendering different content types from AI SDK message parts
**Example:**
```typescript
// ChatMessages.tsx - enhanced part rendering
{message.parts.map((part, idx) => {
  switch (part.type) {
    case 'text':
      return <MessageResponse key={idx}>{part.text}</MessageResponse>;

    case 'reasoning':
      return (
        <Reasoning key={idx} isStreaming={part.state === 'streaming'}>
          <ReasoningTrigger
            getThinkingMessage={(streaming, duration) =>
              streaming ? <Shimmer>{currentAction || 'Thinking...'}</Shimmer>
                       : `Thought for ${duration}s`
            }
          />
          <ReasoningContent>{part.text}</ReasoningContent>
        </Reasoning>
      );

    case 'tool-call':
    case 'dynamic-tool':
      return <ToolRenderer key={idx} part={part} />;

    case 'sources':
      return (
        <Sources key={idx}>
          <SourcesTrigger count={part.sources.length} />
          <SourcesContent>
            {part.sources.map(s => <Source key={s.id} href={s.url} title={s.title} />)}
          </SourcesContent>
        </Sources>
      );

    default:
      return null;
  }
})}
```

### Pattern 4: Modern Message Bubble CSS
**What:** Borderless right-aligned user messages, minimal assistant containers
**When to use:** Modernizing chat appearance to match Claude/ChatGPT
**Example:**
```typescript
// User message - borderless, right-aligned, subtle background
<Box sx={{
  ml: 'auto',               // Right align
  maxWidth: '80%',
  px: 3,
  py: 2,
  borderRadius: 3,          // Equal corners, no speech bubble
  bgcolor: alpha(theme.palette.secondary.main, 0.08), // Very subtle
  // NO border, NO solid color fill
}}>

// Assistant message - no container, just content
<Box sx={{
  maxWidth: '100%',         // Full width for content
  // NO background, NO border
  // Just proper typography spacing
}}>
```

### Anti-Patterns to Avoid
- **Speech bubble corners:** Avoid `borderBottomRightRadius: 0.5` - dated 2018 WhatsApp style
- **Solid primary fill for user:** `bgcolor: 'primary.main'` is too heavy - use subtle secondary
- **Force-scroll on every message:** Disrupts reading old messages
- **Bouncing dots for thinking:** Use Shimmer component instead

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Collapsible reasoning | Custom accordion | `Reasoning` from ai-elements | Has auto-close, duration tracking, shimmer |
| Typing indicator animation | CSS keyframes | `Shimmer` component | Framer Motion, looks modern |
| Copy/Regenerate/Feedback buttons | Custom IconButtons | `MessageActions` + `MessageAction` | Tooltips, accessibility built-in |
| Branch navigation | Custom state | `MessageBranch` components | Context-based, handles edge cases |
| Code artifact display | Inline code blocks | `Artifact` component | Header, actions, close button |
| RAG citations | Inline links | `Sources` component | Collapsible, count badge |
| Chain visualization | Sequential tools | `ChainOfThought` + steps | Status indicators, animation |

**Key insight:** The ai-elements folder contains 48 components. Only 5 are currently used in ChatMessages. The wiring is the work, not the building.

## Common Pitfalls

### Pitfall 1: Breaking Scroll Position on Resize
**What goes wrong:** Scroll position jumps when window resizes or mobile keyboard opens
**Why it happens:** scrollHeight changes but scrollTop isn't adjusted
**How to avoid:** Use `useLayoutEffect` to preserve scroll position on resize
**Warning signs:** Users lose their place after device rotation

### Pitfall 2: Shimmer Flicker on Quick Responses
**What goes wrong:** Shimmer appears for <200ms, looks like a glitch
**Why it happens:** Fast API responses don't need loading state
**How to avoid:** Add 200ms debounce before showing Shimmer
**Warning signs:** Quick flashes during fast responses

### Pitfall 3: Message Actions Overlap on Mobile
**What goes wrong:** Hover-revealed actions don't work on touch devices
**Why it happens:** No hover state on mobile
**How to avoid:** Show actions always on mobile, or use long-press
**Warning signs:** Users can't access copy/regenerate on phones

### Pitfall 4: ChainOfThought Infinite Nesting
**What goes wrong:** Every tool call gets its own ChainOfThought wrapper
**Why it happens:** No grouping logic for sequential tools
**How to avoid:** Group consecutive tool parts, only wrap when >1 tool
**Warning signs:** Excessive nesting, confusing UI

### Pitfall 5: Artifact Detection False Positives
**What goes wrong:** Short code snippets render as artifacts
**Why it happens:** Detecting `code` part type without length/context check
**How to avoid:** Only trigger artifact for: drafts, code >10 lines, explicit artifact markers
**Warning signs:** Every code block becomes a separate panel

## Code Examples

Verified patterns from official sources:

### Scroll-to-Bottom Button Implementation
```typescript
// Source: react-scroll-to-bottom pattern + custom
import { Fab, Zoom } from '@mui/material';
import { ArrowDown } from 'lucide-react';

function ScrollToBottomButton({ show, onClick }: { show: boolean; onClick: () => void }) {
  return (
    <Zoom in={show}>
      <Fab
        size="small"
        onClick={onClick}
        sx={{
          position: 'absolute',
          bottom: 80, // Above composer
          right: 24,
          bgcolor: 'background.paper',
          boxShadow: 2,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <ArrowDown size={18} />
      </Fab>
    </Zoom>
  );
}
```

### Reasoning with Dynamic Action Text
```typescript
// Source: ai-elements reasoning.tsx + extension
<Reasoning isStreaming={isStreaming}>
  <ReasoningTrigger
    getThinkingMessage={(streaming, duration) => {
      if (streaming) {
        // Dynamic action text from agent activity stream
        const action = agentSteps.find(s => s.status === 'active')?.action;
        return <Shimmer duration={1.5}>{action || 'Thinking...'}</Shimmer>;
      }
      return `Thought for ${duration} seconds`;
    }}
  />
  <ReasoningContent>{reasoningText}</ReasoningContent>
</Reasoning>
```

### assistant-ui Registry Configuration
```json
// Source: shadcn.com/docs/components-json
// Add to frontend/components.json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "registries": {
    "@assistant-ui": {
      "url": "https://r.assistant-ui.com/{name}.json"
    }
  }
  // ... rest of config
}
```

### Artifact Trigger Detection Logic
```typescript
// Source: LibreChat patterns + Claude behavior observation
function shouldRenderAsArtifact(part: MessagePart): boolean {
  // Explicit artifact markers
  if (part.type === 'artifact') return true;

  // Code blocks: >10 lines or contains class/function definitions
  if (part.type === 'code') {
    const lines = part.code.split('\n').length;
    const hasDefinitions = /^(class|function|export|import|interface|type)\s/m.test(part.code);
    return lines > 10 || hasDefinitions;
  }

  // Draft emails (from email tools)
  if (part.type === 'tool-output' && part.toolName === 'draft_email') return true;

  // Documents, tables, structured data
  if (['document', 'table', 'csv', 'json'].includes(part.type)) return true;

  return false;
}
```

### ChainOfThought Grouping Logic
```typescript
// Source: Chain-of-thought pattern + project needs
function groupToolsIntoChains(parts: MessagePart[]): (MessagePart | ChainGroup)[] {
  const result: (MessagePart | ChainGroup)[] = [];
  let currentChain: ToolPart[] = [];

  for (const part of parts) {
    if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
      currentChain.push(part);
    } else {
      // Flush chain if we have >1 tool
      if (currentChain.length > 1) {
        result.push({ type: 'chain', tools: currentChain });
      } else if (currentChain.length === 1) {
        result.push(currentChain[0]); // Single tool, no chain
      }
      currentChain = [];
      result.push(part);
    }
  }

  // Flush remaining
  if (currentChain.length > 1) {
    result.push({ type: 'chain', tools: currentChain });
  } else if (currentChain.length === 1) {
    result.push(currentChain[0]);
  }

  return result;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Solid color user bubbles | Subtle background, borderless | 2024 (Claude 3 launch) | Cleaner, less distracting |
| Speech bubble corners | Equal radius corners | 2023-2024 | Modern, less dated |
| Bouncing dots indicator | Shimmer/skeleton | 2023 | Perceived faster loading |
| Force-scroll always | Smart scroll with button | 2022+ | Better reading experience |
| Inline code blocks only | Artifact panels for large content | 2024 (Claude Artifacts) | Better structured output |

**Deprecated/outdated:**
- WhatsApp-style speech bubbles with pointed corners: looks dated
- Solid primary color fills: too heavy for modern interfaces
- CSS keyframe bouncing dots: replaced by shimmer animations

## Header Height Research

No prescriptive pixel values found in current best practices. Modern AI chat interfaces prioritize:

1. **Minimalist headers** - 40-56px range typical
2. **Functional elements in header**: model selector, share, new chat
3. **Persistent context** when needed (email subject in overlay)

**Recommendation (Claude's discretion):** Reduce from ~80px to 48-56px. Inline controls with title. Remove redundant subtitle "Email . Calendario . Contatti" - context is obvious.

## Open Questions

Things that couldn't be fully resolved:

1. **Exact assistant-ui registry URL format**
   - What we know: Uses `https://r.assistant-ui.com/{name}.json` pattern
   - What's unclear: Exact registry config in components.json
   - Recommendation: Test with `npx shadcn@latest add @assistant-ui/thread` to verify

2. **MessageBranching data source**
   - What we know: Component exists, handles prev/next navigation
   - What's unclear: How VoltAgent generates alternative responses
   - Recommendation: Wire component, populate when API provides alternatives (future)

3. **Sources component integration with RAG**
   - What we know: Component renders citations
   - What's unclear: How to extract sources from VoltAgent responses
   - Recommendation: Check if tool outputs include source metadata

## Sources

### Primary (HIGH confidence)
- ai-elements source code: `frontend/src/components/ai-elements/*.tsx` - Direct inspection
- ChatMessages.tsx: `frontend/components/ai/AiDashboard/ChatMessages.tsx` - Current implementation
- AiDashboard audit: `docs/audits/chat-ui-audit-assistant-ui-vs-mailagent.md` - Detailed analysis

### Secondary (MEDIUM confidence)
- [shadcn/ui components.json docs](https://ui.shadcn.com/docs/components-json) - Registry configuration
- [elements.ai-sdk.dev](https://elements.ai-sdk.dev) - Artifact and ChainOfThought component docs
- [assistant-ui docs](https://www.assistant-ui.com/docs) - Installation patterns
- [react-scroll-to-bottom npm](https://www.npmjs.com/package/react-scroll-to-bottom) - Smart scroll library
- [LogRocket shimmer vs spinners](https://blog.logrocket.com/ux-design/loading-spinners-purpose-alternatives/) - UX patterns

### Tertiary (LOW confidence)
- [Jotform chatbot UI trends 2026](https://www.jotform.com/ai/agents/best-chatbot-ui/) - Design trends
- [Medium refactoring article](https://code.pieces.app/blog/how-to-refactor-large-react-components) - 2700-line component refactor
- [Various CSS speech bubble examples](https://freefrontend.com/css-speech-bubbles/) - Design patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed, verified in package.json
- Architecture: MEDIUM-HIGH - Patterns from established sources, adapted to project
- Pitfalls: MEDIUM - Based on common patterns and audit document
- assistant-ui registry: MEDIUM - Documentation found but exact config needs testing

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (30 days - stable domain)
