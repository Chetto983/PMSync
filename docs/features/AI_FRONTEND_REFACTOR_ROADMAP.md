# AI Frontend Refactor Roadmap

## Overview

**Goal:** Replace buggy custom AI chat components with optimized AI SDK patterns
**Timeline:** 2-3 days
**Impact:** 50-70% latency reduction, 80% code reduction
**UI Framework:** MUI (Material UI) - keeping existing styling
**AI SDK:** @ai-sdk/react useChat with proper streaming

> **Note:** AI Elements requires shadcn/ui which conflicts with MUI. Using AI SDK
> patterns directly with MUI components instead.

## Progress Tracking (2026-01-28)

- [x] Memory stored: `ai-frontend-refactor-roadmap` in `mailagent` namespace
- [x] Agent spawned: `agent-1769632564066-18e4p7` (coder/sonnet)
- [ ] Phase 1: Create AiChat with MUI + AI SDK
- [ ] Phase 2: Create AiChatMessages with streaming
- [ ] Phase 3: Create AiChatInput optimized
- [ ] Phase 4: Create MentionPopover debounced
- [ ] Phase 5: Wire HITL actions
- [ ] Phase 6: Test all flows

---

## Current State (BROKEN)

| Component | Lines | Issues |
|-----------|-------|--------|

| `MentionInput.tsx` | 540 | API spam on keystrokes, laggy |
| `ChatMessages.tsx` | 490 | Rendering issues, complex state |
| `use-voltagent-chat.ts` | 390 | Custom transport, state bugs |
| `ToolActivityCard.tsx` | ~200 | Manual tool rendering |
| `InlineActionCard.tsx` | ~150 | HITL card (keep) |
| **Total** | **~1770** | **Unmaintainable** |

---

## Target State (AI Elements)

| Component | Source | Lines |
|-----------|--------|-------|

| `Conversation` | AI Elements | ~50 (wrapper) |
| `Message` | AI Elements | ~30 (wrapper) |
| `PromptInput` | AI Elements | ~50 (wrapper) |
| `Response` | AI Elements | Built-in streaming |
| `Tool` | AI Elements | Built-in tool UI |
| **Total** | | **~150** |

---

## Phase 1: Installation & Setup (Day 1 Morning)

### 1.1 Install AI Elements

```bash
cd frontend

# Initialize shadcn/ui if not done
npx shadcn@latest init

# Install AI Elements components
npx ai-elements@latest add conversation message prompt-input response tool
```

### 1.2 Verify Dependencies

```json
// package.json - ensure these are present
{
  "dependencies": {
    "@ai-sdk/react": "^1.x",
    "ai": "^4.x"
  }
}
```

### 1.3 Configure Tailwind (if needed)

```js
// tailwind.config.js
module.exports = {
  content: [
    './components/**/*.{js,ts,jsx,tsx}',
    './components/ai-elements/**/*.{js,ts,jsx,tsx}', // Add this
  ],
}
```

---

## Phase 2: Create New Chat Component (Day 1 Afternoon)

### 2.1 New File Structure

frontend/components/ai/
├── AiChat/
│   ├── index.tsx           # Main chat component (NEW)
│   ├── AiChatInput.tsx     # PromptInput wrapper (NEW)
│   ├── AiChatMessages.tsx  # Conversation wrapper (NEW)
│   ├── MentionPopover.tsx  # @ and # mentions (EXTRACTED)
│   └── HitlActionCard.tsx  # HITL approval (KEEP)
├── AiDashboard/            # OLD - deprecate after migration
│   └── ... (keep for reference)

### 2.2 Main Chat Component

```tsx
// frontend/components/ai/AiChat/index.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { Conversation, ConversationContent } from '@/components/ai-elements/conversation';
import { AiChatInput } from './AiChatInput';
import { AiChatMessages } from './AiChatMessages';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface AiChatProps {
  conversationId?: string;
  onConversationIdChange?: (id: string) => void;
}

export function AiChat({ conversationId, onConversationIdChange }: AiChatProps) {
  const {
    messages,
    status,
    error,
    input,
    setInput,
    append,
    stop,
    reload,
  } = useChat({
    api: `${API_URL}/api/v1/voltagent/chat/stream/v3`,
    id: conversationId,
    headers: {
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: {
      conversationId,
      locale: 'it', // or detect from settings
    },
    experimental_throttle: 100, // Smooth streaming
    onFinish: (message) => {
      // Handle HITL actions if present
      console.log('Message finished:', message);
    },
  });

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    await append({ role: 'user', content: text });
  };

  return (
    <div className="flex flex-col h-full">
      <Conversation className="flex-1 overflow-hidden">
        <ConversationContent>
          <AiChatMessages
            messages={messages}
            status={status}
            conversationId={conversationId}
          />
        </ConversationContent>
      </Conversation>

      <AiChatInput
        value={input}
        onChange={setInput}
        onSend={handleSend}
        isLoading={status === 'streaming' || status === 'submitted'}
        onStop={stop}
      />
    </div>
  );
}

function getAuthToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const stored = localStorage.getItem('auth-storage');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.token || '';
    }
  } catch { }
  return '';
}

export default AiChat;
```

### 2.3 Messages Component

```tsx
// frontend/components/ai/AiChat/AiChatMessages.tsx
'use client';

import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Tool } from '@/components/ai-elements/tool';
import { Loader2, Bot, User } from 'lucide-react';
import { HitlActionCard } from './HitlActionCard';
import type { Message as ChatMessage } from '@ai-sdk/react';

interface AiChatMessagesProps {
  messages: ChatMessage[];
  status: 'idle' | 'streaming' | 'submitted' | 'error';
  conversationId?: string;
}

export function AiChatMessages({ messages, status, conversationId }: AiChatMessagesProps) {
  return (
    <>
      {messages.map((message, index) => (
        <Message
          key={message.id || index}
          from={message.role}
          className={message.role === 'user' ? 'justify-end' : 'justify-start'}
        >
          {/* Avatar */}
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            message.role === 'user'
              ? 'bg-primary/10 text-primary'
              : 'bg-gradient-to-br from-primary to-secondary text-white'
          }`}>
            {message.role === 'user' ? <User size={16} /> : <Bot size={16} />}
          </div>

          <MessageContent>
            {/* Tool calls */}
            {message.toolInvocations?.map((tool) => (
              <Tool
                key={tool.toolCallId}
                name={tool.toolName}
                args={tool.args}
                result={tool.result}
                state={tool.state}
              />
            ))}

            {/* Text response with streaming markdown */}
            <MessageResponse>
              {message.content}
            </MessageResponse>
          </MessageContent>
        </Message>
      ))}

      {/* Loading indicator */}
      {(status === 'streaming' || status === 'submitted') && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Thinking...</span>
        </div>
      )}

      {/* HITL Actions */}
      {conversationId && (
        <HitlActionCard conversationId={conversationId} />
      )}
    </>
  );
}
```

### 2.4 Input Component with Mentions

```tsx
// frontend/components/ai/AiChat/AiChatInput.tsx
'use client';

import { useState, useRef, useCallback } from 'react';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
} from '@/components/ai-elements/prompt-input';
import { MentionPopover, type MentionResult } from './MentionPopover';
import { Send, Square } from 'lucide-react';

interface AiChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  isLoading?: boolean;
  onStop?: () => void;
  placeholder?: string;
}

export function AiChatInput({
  value,
  onChange,
  onSend,
  isLoading,
  onStop,
  placeholder = 'Type @ for contacts, # for accounts...',
}: AiChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [mentionState, setMentionState] = useState<{
    type: 'contact' | 'provider' | null;
    query: string;
    position: number;
  } | null>(null);

  // Detect @ or # triggers
  const handleChange = useCallback((newValue: string) => {
    onChange(newValue);

    const cursorPos = inputRef.current?.selectionStart || newValue.length;

    // Find mention trigger
    for (let i = cursorPos - 1; i >= 0; i--) {
      const char = newValue[i];
      if (char === ' ' || char === '\n') break;
      if (char === '@') {
        setMentionState({
          type: 'contact',
          query: newValue.slice(i + 1, cursorPos),
          position: i,
        });
        return;
      }
      if (char === '#') {
        setMentionState({
          type: 'provider',
          query: newValue.slice(i + 1, cursorPos),
          position: i,
        });
        return;
      }
    }
    setMentionState(null);
  }, [onChange]);

  // Insert selected mention
  const handleMentionSelect = useCallback((result: MentionResult) => {
    if (!mentionState) return;

    const before = value.slice(0, mentionState.position);
    const after = value.slice(inputRef.current?.selectionStart || value.length);
    const insertText = result.type === 'contact'
      ? result.email
      : `[${result.displayName}]`;

    onChange(`${before}${insertText} ${after}`);
    setMentionState(null);
    inputRef.current?.focus();
  }, [mentionState, value, onChange]);

  const handleSubmit = useCallback(() => {
    if (!value.trim() || isLoading) return;
    onSend(value);
    onChange('');
  }, [value, isLoading, onSend, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !mentionState) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit, mentionState]);

  return (
    <div className="relative border-t p-4">
      <PromptInput className="relative">
        <PromptInputTextarea
          ref={inputRef}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          className="pr-12"
        />

        {isLoading ? (
          <button
            onClick={onStop}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <Square size={16} />
          </button>
        ) : (
          <PromptInputSubmit
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <Send size={16} />
          </PromptInputSubmit>
        )}
      </PromptInput>

      {/* Mention autocomplete */}
      {mentionState && (
        <MentionPopover
          type={mentionState.type}
          query={mentionState.query}
          onSelect={handleMentionSelect}
          onClose={() => setMentionState(null)}
        />
      )}
    </div>
  );
}
```

---

## Phase 3: Mention Popover (Day 2 Morning)

### 3.1 Extract Mention Logic

```tsx
// frontend/components/ai/AiChat/MentionPopover.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { contactsApi } from '@/lib/api/contacts';
import { providersApi } from '@/lib/api/providers';
import { User, Mail, Building2 } from 'lucide-react';
import { useState, useEffect } from 'react';

export interface MentionResult {
  type: 'contact' | 'provider';
  id: string;
  displayName: string;
  email: string;
}

interface MentionPopoverProps {
  type: 'contact' | 'provider' | null;
  query: string;
  onSelect: (result: MentionResult) => void;
  onClose: () => void;
}

export function MentionPopover({ type, query, onSelect, onClose }: MentionPopoverProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Debounced query for contacts
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Contact search
  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ['mentions', 'contacts', debouncedQuery],
    queryFn: async () => {
      const result = await contactsApi.listContacts({ search: debouncedQuery, limit: 10 });
      return result.contacts.filter(c => c.emails?.length > 0);
    },
    enabled: type === 'contact',
    staleTime: 60 * 1000,
  });

  // Provider list
  const { data: providers = [], isLoading: providersLoading } = useQuery({
    queryKey: ['mentions', 'providers'],
    queryFn: () => providersApi.getProviders(),
    enabled: type === 'provider',
    staleTime: 5 * 60 * 1000,
  });

  const items = type === 'contact'
    ? contacts.map(c => ({
        type: 'contact' as const,
        id: c.id,
        displayName: c.displayName || `${c.firstName} ${c.lastName}`.trim(),
        email: c.emails?.[0]?.value || '',
        icon: c.company ? <Building2 size={16} /> : <User size={16} />,
      }))
    : providers
        .filter(p => !query || p.email.toLowerCase().includes(query.toLowerCase()))
        .map(p => ({
          type: 'provider' as const,
          id: p.id,
          displayName: p.displayName || p.email,
          email: p.email,
          icon: <Mail size={16} />,
        }));

  const isLoading = contactsLoading || providersLoading;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && items[selectedIndex]) {
        e.preventDefault();
        onSelect(items[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedIndex, onSelect, onClose]);

  if (!type) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover border rounded-lg shadow-lg max-h-64 overflow-y-auto">
      {/* Header */}
      <div className="px-3 py-2 border-b bg-muted/50 text-xs font-medium text-muted-foreground uppercase">
        {type === 'contact' ? '@ Select Contact' : '# Select Account'}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="p-4 text-center text-muted-foreground">Loading...</div>
      )}

      {/* Items */}
      {!isLoading && items.length > 0 && (
        <div className="py-1">
          {items.map((item, index) => (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              className={`w-full px-3 py-2 flex items-center gap-3 text-left hover:bg-accent ${
                index === selectedIndex ? 'bg-accent' : ''
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{item.displayName}</div>
                <div className="text-sm text-muted-foreground truncate">{item.email}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && items.length === 0 && (
        <div className="p-4 text-center text-muted-foreground">
          {type === 'contact' ? 'No contacts found' : 'No accounts found'}
        </div>
      )}

      {/* Keyboard hints */}
      <div className="px-3 py-2 border-t bg-muted/50 text-xs text-muted-foreground flex gap-4">
        <span>↑↓ navigate</span>
        <span>↵ select</span>
        <span>esc close</span>
      </div>
    </div>
  );
}
```

---

## Phase 4: HITL Integration (Day 2 Afternoon)

### 4.1 Keep Existing HITL Card

The `InlineActionCard.tsx` component works well - just integrate it:

```tsx
// frontend/components/ai/AiChat/HitlActionCard.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { multiAgentApi } from '@/lib/api/ai';
import { InlineActionCard } from '../AiDashboard/InlineActionCard';

interface HitlActionCardProps {
  conversationId: string;
}

export function HitlActionCard({ conversationId }: HitlActionCardProps) {
  const { data: actions = [] } = useQuery({
    queryKey: ['ai', 'pendingActions', conversationId],
    queryFn: async () => {
      const response = await multiAgentApi.getPendingActions({ limit: 50 });
      return (response.data?.actions || []).filter(
        a => a.sessionId === conversationId && (!a.status || a.status === 'PENDING')
      );
    },
    staleTime: 5 * 1000,
    refetchInterval: 5 * 1000,
  });

  if (actions.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {actions.map(action => (
        <InlineActionCard key={action.id} action={action} />
      ))}
    </div>
  );
}
```

---

## Phase 5: Migration & Cleanup (Day 3)

### 5.1 Update Page to Use New Component

```tsx
// frontend/pages/dashboard/ai.tsx (or app router equivalent)
import { AiChat } from '@/components/ai/AiChat';

export default function AiPage() {
  return (
    <div className="h-screen flex flex-col">
      <AiChat />
    </div>
  );
}
```

### 5.2 Deprecate Old Components

```bash
# Move old components to deprecated folder
mkdir -p frontend/components/ai/_deprecated
mv frontend/components/ai/AiDashboard frontend/components/ai/_deprecated/
```

### 5.3 Delete After Verification

After 1 week of testing, delete:
- `frontend/components/ai/_deprecated/`

---

## Checklist

### Phase 1: Setup

- [ ] Install AI Elements CLI
- [ ] Add conversation component
- [ ] Add message component
- [ ] Add prompt-input component
- [ ] Add response component
- [ ] Add tool component
- [ ] Verify Tailwind config

### Phase 2: Core Components

- [ ] Create AiChat/index.tsx
- [ ] Create AiChatMessages.tsx
- [ ] Create AiChatInput.tsx
- [ ] Wire up useChat hook
- [ ] Test basic chat flow

### Phase 3: Mentions

- [ ] Create MentionPopover.tsx
- [ ] Add contact search (debounced)
- [ ] Add provider list
- [ ] Keyboard navigation
- [ ] Test @ and # triggers

### Phase 4: HITL

- [ ] Create HitlActionCard.tsx
- [ ] Wire up pending actions query
- [ ] Test approve/reject flow

### Phase 5: Migration

- [ ] Update AI page
- [ ] Test all flows
- [ ] Move old components
- [ ] Update any imports
- [ ] Performance test

---

## Expected Results

| Metric | Before | After |
|--------|--------|-------|

| Input latency | 200-500ms | <50ms |
| Streaming smoothness | Choppy | Smooth |
| Code lines | ~1770 | ~400 |
| Bundle size | Large | Smaller (tree-shaking) |
| Maintainability | Low | High |

---

## Sources

- [AI Elements GitHub](https://github.com/vercel/ai-elements)
- [Vercel AI Elements Docs](https://vercel.com/changelog/introducing-ai-elements)
- [AI SDK useChat](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)
- [AI SDK Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
