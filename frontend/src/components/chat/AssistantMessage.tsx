'use client';

import { MessagePrimitive } from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import { Bot } from 'lucide-react';
import { ChatActionBar } from './ChatActionBar';
import { ChatBranchPicker } from './ChatBranchPicker';
import { ChatChainOfThought } from './ChatChainOfThought';
import { HitlApprovalCard } from './HitlApprovalCard';
import { useAiActions } from '@/hooks/ai/use-ai-actions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MarkdownText = MarkdownTextPrimitive as any;

/**
 * HITL: poll-based pending actions.
 */
function HitlPendingActions() {
  const { pendingActions, approveAction, rejectAction, isApproving, isRejecting } = useAiActions();
  const pending = pendingActions.filter((a) => a.status === 'PENDING');
  if (pending.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
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
    </div>
  );
}

/**
 * Assistant message: avatar + markdown content + action bar.
 * Left-aligned with gradient avatar, prose-styled content.
 */
export function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="chat-msg chat-msg-assistant group">
      <div className="chat-msg-avatar">
        <Bot className="h-4 w-4 text-white" />
      </div>
      <div className="chat-msg-body">
        <div className="chat-msg-content">
          <MessagePrimitive.Content
            components={{
              Text: MarkdownText,
              ChainOfThought: ChatChainOfThought,
            }}
          />
        </div>
        <HitlPendingActions />
        <div className="chat-msg-actions">
          <ChatActionBar />
          <ChatBranchPicker />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}
