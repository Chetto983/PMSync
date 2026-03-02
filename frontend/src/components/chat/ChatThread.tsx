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
    <ThreadPrimitive.Root className="chat-thread">
      {/* Scrollable message viewport */}
      <ThreadPrimitive.Viewport className="chat-viewport aui-thread-viewport">
        <ThreadPrimitive.Empty>
          <ChatEmptyState />
        </ThreadPrimitive.Empty>
        <div className="chat-messages-container">
          <ThreadPrimitive.Messages
            components={{ UserMessage, AssistantMessage }}
          />
        </div>
      </ThreadPrimitive.Viewport>

      {/* Sticky footer: scroll-to-bottom + suggestions + composer */}
      <ThreadPrimitive.ViewportFooter className="chat-footer">
        <div className="chat-footer-inner">
          <ThreadPrimitive.ScrollToBottom className="chat-scroll-btn">
            <ArrowDown className="h-4 w-4" />
          </ThreadPrimitive.ScrollToBottom>
          <ChatSuggestions />
          <ChatComposer />
        </div>
      </ThreadPrimitive.ViewportFooter>
    </ThreadPrimitive.Root>
  );
}
