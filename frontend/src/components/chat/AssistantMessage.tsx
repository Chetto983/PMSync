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
import { ChatAccessGateActions, useChatAccessState } from './ChatAccessGate';
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
  const t = useTranslations();
  const error = useMessageError();
  const access = useChatAccessState();
  if (!error) return null;

  const rawText = typeof error === 'string'
    ? error
    : (error instanceof Error ? error.message : String(error));
  const statusMatch = rawText.match(/\b(401|403|404|429|500|502|503|504)\b/);
  const isAccessBlocked403 = statusMatch?.[1] === '403' && access.isBlocked;

  return (
    <div className="chat-system-card chat-system-card-error">
      <div className="chat-system-card-header">
        <span className="chat-system-card-title">
          {isAccessBlocked403 ? access.title : t.ai.overlay.errorGeneric}
        </span>
        {statusMatch ? (
          <span className="chat-system-card-badge">{statusMatch[1]}</span>
        ) : null}
      </div>
      <Alert severity="error" variant="standard" sx={{ p: 0, fontSize: '0.84rem', bgcolor: 'transparent' }}>
        {isAccessBlocked403 ? access.body : t.ai.overlay.errorConnection}
      </Alert>
      {isAccessBlocked403 ? <ChatAccessGateActions state={access} compact /> : null}
    </div>
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
      <div className="chat-message-main">
        <div className="chat-assistant-meta">
          <div className="chat-message-avatar">
            <Bot size={15} />
          </div>
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
