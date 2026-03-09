'use client';

import { MessagePrimitive } from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import { Bot } from 'lucide-react';
import Box from '@mui/material/Box';
import { ChatActionBar } from './ChatActionBar';
import { ChatBranchPicker } from './ChatBranchPicker';
import { ChatChainOfThought } from './ChatChainOfThought';
import { HitlApprovalCard } from './HitlApprovalCard';
import { useAiActions } from '@/hooks/ai/use-ai-actions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MarkdownText = MarkdownTextPrimitive as any;
const MarkdownWithStreaming = (props: object) => <MarkdownText {...props} className="aui-md" />;

/**
 * HITL: poll-based pending actions.
 */
function HitlPendingActions() {
  const { pendingActions, approveAction, rejectAction, isApproving, isRejecting } = useAiActions();
  const pending = pendingActions.filter((a) => a.status === 'PENDING');
  if (pending.length === 0) return null;

  return (
    <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {pending.map((action) => (
        <HitlApprovalCard
          key={action.executionId}
          action={action}
          onApprove={() => approveAction(action.executionId)}
          onReject={() => rejectAction(action.executionId)}
          isApproving={isApproving}
          isRejecting={isRejecting}
        />
      ))}
    </Box>
  );
}

/**
 * Assistant message: avatar + markdown content + action bar.
 * Left-aligned with primary avatar, prose-styled content.
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
        <HitlPendingActions />
        <div className="chat-message-actions">
          <ChatActionBar />
          <ChatBranchPicker />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}
