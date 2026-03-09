'use client';

import { ThreadPrimitive } from '@assistant-ui/react';
import { ArrowDown } from 'lucide-react';
import Box from '@mui/material/Box';
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
    <ThreadPrimitive.Root className="chat-thread-root">
      {/* Scrollable message viewport */}
      <ThreadPrimitive.Viewport className="chat-thread-viewport aui-thread-viewport">
        <div className="chat-thread-inner">
          <ThreadPrimitive.Empty>
            <ChatEmptyState />
          </ThreadPrimitive.Empty>
          <div className="chat-thread-messages">
            <ThreadPrimitive.Messages
              components={{ UserMessage, AssistantMessage }}
            />
          </div>
        </div>
      </ThreadPrimitive.Viewport>

      {/* Sticky footer: scroll-to-bottom + suggestions + composer */}
      <ThreadPrimitive.ViewportFooter className="chat-thread-footer">
        <div className="chat-thread-footer-inner">
          <ThreadPrimitive.ScrollToBottom className="chat-scroll-bottom-btn">
            <Box component={ArrowDown} sx={{ width: 16, height: 16 }} />
          </ThreadPrimitive.ScrollToBottom>
          <ChatSuggestions />
          <ChatComposer />
        </div>
      </ThreadPrimitive.ViewportFooter>
    </ThreadPrimitive.Root>
  );
}
