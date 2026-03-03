'use client';

import { ThreadPrimitive } from '@assistant-ui/react';
import { ArrowDown } from 'lucide-react';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatComposer } from './ChatComposer';
import { ChatSuggestions } from './ChatSuggestions';
import { AssistantMessage } from './AssistantMessage';
import { UserMessage } from './UserMessage';

/**
 * Main chat thread: scrollable message area + sticky composer footer.
 * Messages constrained to max-w-3xl for readability.
 */
export function ChatThread() {
  return (
    <ThreadPrimitive.Root className="flex flex-col h-full bg-background">
      {/* Scrollable message viewport */}
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto scroll-smooth aui-thread-viewport">
        <ThreadPrimitive.Empty>
          <ChatEmptyState />
        </ThreadPrimitive.Empty>
        <div className="max-w-3xl mx-auto w-full px-4">
          <ThreadPrimitive.Messages
            components={{ UserMessage, AssistantMessage }}
          />
        </div>
      </ThreadPrimitive.Viewport>

      {/* Sticky footer: scroll-to-bottom + suggestions + composer */}
      <ThreadPrimitive.ViewportFooter className="sticky bottom-0 bg-gradient-to-b from-transparent via-background/80 to-background pt-6">
        <div className="max-w-3xl mx-auto w-full relative">
          <ThreadPrimitive.ScrollToBottom className="absolute -top-4 left-1/2 -translate-x-1/2 inline-flex items-center justify-center size-8 rounded-full border border-border bg-card shadow-sm hover:bg-muted transition-colors z-10">
            <ArrowDown className="h-4 w-4" />
          </ThreadPrimitive.ScrollToBottom>
          <ChatSuggestions />
          <ChatComposer />
        </div>
      </ThreadPrimitive.ViewportFooter>
    </ThreadPrimitive.Root>
  );
}
