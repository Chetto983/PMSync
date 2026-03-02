'use client';

import {
  MessagePrimitive,
  ActionBarPrimitive,
} from '@assistant-ui/react';
import { Pencil } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ChatBranchPicker } from './ChatBranchPicker';

/**
 * User message: right-aligned primary-colored bubble with edit action.
 */
export function UserMessage() {
  const t = useTranslations();

  return (
    <MessagePrimitive.Root className="chat-msg chat-msg-user group">
      <div className="chat-msg-user-bubble">
        <MessagePrimitive.Content />
      </div>
      <div className="chat-msg-actions chat-msg-actions-end">
        <ActionBarPrimitive.Root className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <ActionBarPrimitive.Edit
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label={t.chat.actions.edit}
          >
            <Pencil className="h-3 w-3" />
          </ActionBarPrimitive.Edit>
        </ActionBarPrimitive.Root>
        <ChatBranchPicker />
      </div>
    </MessagePrimitive.Root>
  );
}
