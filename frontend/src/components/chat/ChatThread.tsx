'use client';

import { ThreadPrimitive } from '@assistant-ui/react';
import { ArrowDown } from 'lucide-react';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatComposer } from './ChatComposer';
import { ChatSuggestions } from './ChatSuggestions';
import { AssistantMessage } from './AssistantMessage';
import { UserMessage } from './UserMessage';

/**
 * Main chat thread composing assistant-ui ThreadPrimitive sub-components.
 * Handles viewport with auto-scroll, message rendering, scroll-to-bottom,
 * suggestions, and the composer.
 */
export function ChatThread() {
  return (
    <ThreadPrimitive.Root className="flex flex-col h-full">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
        <ThreadPrimitive.Empty>
          <ChatEmptyState />
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />
      </ThreadPrimitive.Viewport>

      <ThreadPrimitive.ViewportFooter className="sticky bottom-0 bg-background">
        <ThreadPrimitive.ScrollToBottom className="absolute -top-10 left-1/2 -translate-x-1/2 p-2 rounded-full border border-border bg-background shadow-md hover:bg-muted transition-colors">
          <ArrowDown className="h-4 w-4" />
        </ThreadPrimitive.ScrollToBottom>
        <ChatSuggestions />
        <ChatComposer />
      </ThreadPrimitive.ViewportFooter>
    </ThreadPrimitive.Root>
  );
}
