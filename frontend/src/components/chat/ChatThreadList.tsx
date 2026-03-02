'use client';

import {
  ThreadListPrimitive,
  ThreadListItemPrimitive,
} from '@assistant-ui/react';
import { Plus, Trash2, MessageSquare } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Individual thread list item rendered by ThreadListPrimitive.Items.
 * Uses ThreadListItemPrimitive sub-components for trigger, title, and delete.
 */
function ThreadListItem() {
  const t = useTranslations();

  return (
    <ThreadListItemPrimitive.Root className="group flex items-center gap-2 rounded-lg hover:bg-muted/50 transition-colors">
      <ThreadListItemPrimitive.Trigger className="flex-1 flex items-center gap-2 px-3 py-2.5 text-left min-w-0">
        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
        <ThreadListItemPrimitive.Title
          fallback={
            <span className="text-sm text-muted-foreground italic">
              {t.chat.threadList.newChat}
            </span>
          }
        />
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemPrimitive.Delete
        className="p-1.5 mr-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
        aria-label={t.chat.threadList.deleteConfirm}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </ThreadListItemPrimitive.Delete>
    </ThreadListItemPrimitive.Root>
  );
}

/**
 * Conversation sidebar using ThreadListPrimitive.
 * Shows list of threads with a "New chat" button.
 *
 * Thread list state is managed by the assistant-ui runtime.
 * Backend conversation persistence is wired through the chat transport
 * (conversations are created when messages are sent).
 *
 * NOTE: For full backend conversation loading on init (hydrating the list
 * with previously saved conversations), a ThreadHistoryAdapter or custom
 * thread list adapter needs to be wired in a follow-up plan.
 */
export function ChatThreadList() {
  const t = useTranslations();

  return (
    <ThreadListPrimitive.Root className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">
          {t.chat.threadList.title}
        </h2>
        <ThreadListPrimitive.New
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label={t.chat.threadList.newChat}
        >
          <Plus className="h-4 w-4" />
        </ThreadListPrimitive.New>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <ThreadListPrimitive.Items
          components={{ ThreadListItem }}
        />
      </div>
    </ThreadListPrimitive.Root>
  );
}
