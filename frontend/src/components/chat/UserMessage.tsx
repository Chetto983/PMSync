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
    <MessagePrimitive.Root className="flex flex-col items-end py-5 group border-t first:border-t-0 border-border/30">
      <div className="max-w-[85%] bg-muted text-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed">
        <MessagePrimitive.Content />
      </div>
      <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <ActionBarPrimitive.Root className="inline-flex items-center gap-1">
          <ActionBarPrimitive.Edit
            className="inline-flex size-7 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:border-border/80 hover:bg-muted/75 hover:text-foreground"
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
