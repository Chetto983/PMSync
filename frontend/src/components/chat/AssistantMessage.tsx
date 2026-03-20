'use client';

import { MessagePrimitive } from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import { Bot } from 'lucide-react';
import { ChatActionBar } from './ChatActionBar';
import { ChatBranchPicker } from './ChatBranchPicker';
import { ChatChainOfThought } from './ChatChainOfThought';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MarkdownText = MarkdownTextPrimitive as any;
const MarkdownWithStreaming = (props: object) => <MarkdownText {...props} className="aui-md" />;

/**
 * Assistant message: avatar + markdown content + action bar.
 * Left-aligned with primary avatar, prose-styled content.
 *
 * HITL approval is handled inline via SDK-native flow.
 */
export function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="chat-message-row chat-message-assistant group">
      <div className="chat-message-avatar">
        <Bot size={16} style={{ color: 'var(--mui-palette-primary-contrastText)' }} />
      </div>
      <div className="chat-message-main">
        <div className="chat-assistant-bubble">
          <MessagePrimitive.Content
            components={{
              Text: MarkdownWithStreaming,
              ChainOfThought: ChatChainOfThought,
            }}
          />
        </div>
        <div className="chat-message-actions">
          <ChatActionBar />
          <ChatBranchPicker />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}
