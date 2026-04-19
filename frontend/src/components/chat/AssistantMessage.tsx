'use client';

import React, { Suspense } from 'react';
import { MessagePrimitive } from '@assistant-ui/react';
import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot } from 'lucide-react';
import Alert from '@mui/material/Alert';
import { useMessageError } from '@assistant-ui/core/react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ChatActionBar } from './ChatActionBar';
import { ChatBranchPicker } from './ChatBranchPicker';
import { ChatReasoningGroup } from './ChatReasoningGroup';
import { TOOL_RENDERERS, FallbackToolRenderer } from './tool-uis';
import { ToolErrorBoundary } from './tool-uis/shared/ToolErrorBoundary';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MarkdownText = MarkdownTextPrimitive as any;
const remarkPlugins = [remarkGfm];
const MarkdownWithStreaming = (props: object) => (
  <MarkdownText {...props} className="aui-md" remarkPlugins={remarkPlugins} />
);

/** Renders a single reasoning part's text inside the ReasoningGroup. */
function ReasoningText({ text }: { type: 'reasoning'; text: string }) {
  if (!text) return null;
  return <p className="chat-cot-text">{text}</p>;
}

/**
 * Dispatching tool renderer: routes tool calls to specific renderers by name,
 * falling back to FallbackToolRenderer for unregistered tools.
 * Wrapped in ToolErrorBoundary so malformed data doesn't crash the chat.
 */
function ToolDispatcher(props: ToolCallMessagePartProps) {
  const t = useTranslations();
  const Renderer = (TOOL_RENDERERS as Record<string, React.ComponentType<ToolCallMessagePartProps> | undefined>)[props.toolName];
  if (Renderer) {
    return (
      <ToolErrorBoundary
        toolName={props.toolName}
        errorLabel={t.errors.somethingWentWrong}
        fallbackMessage={t.errors.unexpectedError}
      >
        <Suspense fallback={<ToolLoadingSkeleton />}><Renderer {...props} /></Suspense>
      </ToolErrorBoundary>
    );
  }
  return <FallbackToolRenderer {...props} />;
}

function ToolLoadingSkeleton() {
  return <div className="chat-tool-skeleton" />;
}

/**
 * Inline error alert: renders when the message has error status.
 */
function MessageErrorAlert() {
  const error = useMessageError();
  if (!error) return null;

  const text = typeof error === 'string' ? error : 'An error occurred';
  return (
    <Alert severity="error" variant="outlined" sx={{ mt: 1, fontSize: '0.85rem' }}>
      {text}
    </Alert>
  );
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
  const t = useTranslations();

  return (
    <MessagePrimitive.Root className="chat-message-row chat-message-assistant group">
      <div className="chat-message-avatar">
        <Bot size={16} />
      </div>
      <div className="chat-message-main">
        <div className="chat-assistant-meta">
          <span className="chat-assistant-name">{t.ai.overlay.title}</span>
        </div>
        <div className="chat-assistant-bubble">
          <MessagePrimitive.Content
            components={{
              Text: MarkdownWithStreaming,
              Reasoning: ReasoningText,
              ReasoningGroup: ChatReasoningGroup,
              tools: {
                Fallback: ToolDispatcher,
              },
            }}
          />
          <MessageErrorAlert />
        </div>
        <div className="chat-message-actions chat-message-actions-assistant">
          <ChatActionBar />
          <ChatBranchPicker />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}
