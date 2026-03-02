'use client';

import {
  MessagePrimitive,
  ActionBarPrimitive,
} from '@assistant-ui/react';
import { Pencil } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ChatBranchPicker } from './ChatBranchPicker';

/**
 * User message display with right-aligned layout and edit capability.
 * Edit button lets users modify a previous message (creates a branch).
 */
export function UserMessage() {
  const t = useTranslations();

  return (
    <MessagePrimitive.Root className="group flex flex-col items-end py-4 px-1">
      <div className="max-w-[85%] rounded-2xl bg-primary/10 px-4 py-2.5">
        <MessagePrimitive.Content />
      </div>
      <div className="flex items-center gap-2 mt-1">
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
