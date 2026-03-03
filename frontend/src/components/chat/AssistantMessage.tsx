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
 * Left-aligned with primary avatar, prose-styled content.
 */
export function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex gap-3 py-5 group border-t first:border-t-0 border-border/30">
      <div className="size-7 rounded-lg bg-primary flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
        <Bot className="h-4 w-4 text-primary-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm leading-relaxed text-foreground prose prose-sm max-w-none">
          <MessagePrimitive.Content
            components={{
              Text: MarkdownText,
              ChainOfThought: ChatChainOfThought,
            }}
          />
        </div>
        <HitlPendingActions />
        <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <ChatActionBar />
          <ChatBranchPicker />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}
