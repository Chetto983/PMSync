'use client';

import { MessagePrimitive } from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import { Bot } from 'lucide-react';
import { ChatActionBar } from './ChatActionBar';
import { ChatBranchPicker } from './ChatBranchPicker';
import { ChatChainOfThought } from './ChatChainOfThought';
import { HitlApprovalCard } from './HitlApprovalCard';
import { useAiActions } from '@/hooks/ai/use-ai-actions';

// MarkdownTextPrimitive reads content from context internally,
// so it's compatible as a TextMessagePartComponent at runtime
// despite the type signature mismatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MarkdownText = MarkdownTextPrimitive as any;

/**
 * HITL: poll-based pending actions (functional mechanism -- works with current backend).
 * Renders HitlApprovalCard for each pending action. Shows nothing when no actions pending.
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
 * Assistant message with bot avatar, streaming markdown content,
 * chain-of-thought reasoning, action bar, branch picker, and HITL approval cards.
 *
 * Uses `ChainOfThought` component slot which handles both reasoning
 * and tool-call parts in a collapsible accordion.
 */
export function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="group flex gap-3 py-4 px-1">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <MessagePrimitive.Content
          components={{
            Text: MarkdownText,
            ChainOfThought: ChatChainOfThought,
          }}
        />
        {/* HITL: poll-based pending actions (functional mechanism -- works with current backend) */}
        <HitlPendingActions />
        <div className="flex items-center gap-2">
          <ChatActionBar />
          <ChatBranchPicker />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}
