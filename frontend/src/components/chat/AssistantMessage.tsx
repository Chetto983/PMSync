'use client';

import React from 'react';
import { MessagePrimitive } from '@assistant-ui/react';
import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import { Bot } from 'lucide-react';
import { ChatActionBar } from './ChatActionBar';
import { ChatBranchPicker } from './ChatBranchPicker';
import { ChatReasoningGroup } from './ChatReasoningGroup';
import { TOOL_RENDERERS, FallbackToolRenderer } from './tool-uis';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MarkdownText = MarkdownTextPrimitive as any;
const MarkdownWithStreaming = (props: object) => <MarkdownText {...props} className="aui-md" />;

/**
 * Dispatching tool renderer: routes tool calls to specific renderers by name,
 * falling back to FallbackToolRenderer for unregistered tools.
 */
function ToolDispatcher(props: ToolCallMessagePartProps) {
  const Renderer = (TOOL_RENDERERS as Record<string, React.ComponentType<ToolCallMessagePartProps> | undefined>)[props.toolName];
  if (Renderer) return <Renderer {...props} />;
  return <FallbackToolRenderer {...props} />;
}

/**
 * Assistant message: avatar + markdown content + action bar.
 * Left-aligned with primary avatar, prose-styled content.
 *
 * Uses StandardComponents mode:
 * - Reasoning tokens render in a collapsible ReasoningGroup
 * - Tool calls render directly in the message body (visible, not hidden)
 * - HITL approval is handled inline via SDK-native flow
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
              ReasoningGroup: ChatReasoningGroup,
              tools: {
                Fallback: ToolDispatcher,
              },
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
