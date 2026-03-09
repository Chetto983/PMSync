'use client';

import {
  MessagePrimitive,
  ActionBarPrimitive,
} from '@assistant-ui/react';
import { Pencil } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ChatBranchPicker } from './ChatBranchPicker';

/**
 * User message: right-aligned muted bubble with edit action.
 */
export function UserMessage() {
  const t = useTranslations();

  return (
    <MessagePrimitive.Root className="chat-message-row chat-message-user group">
      <div className="chat-user-bubble">
        <MessagePrimitive.Content />
      </div>
      <div className="chat-message-actions chat-message-actions-end">
        <ActionBarPrimitive.Root className="chat-inline-actions">
          <ActionBarPrimitive.Edit
            className="chat-inline-action-btn"
            aria-label={t.chat.actions.edit}
          >
            <Pencil size={12} />
          </ActionBarPrimitive.Edit>
        </ActionBarPrimitive.Root>
        <ChatBranchPicker />
      </div>
    </MessagePrimitive.Root>
  );
}
