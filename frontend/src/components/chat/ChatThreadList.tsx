'use client';

import {
  ThreadListPrimitive,
  ThreadListItemPrimitive,
} from '@assistant-ui/react';
import { Plus, Trash2, MessageSquare } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Thread list item with hover delete.
 */
function ThreadListItem() {
  const t = useTranslations();

  return (
    <ThreadListItemPrimitive.Root className="relative flex items-center rounded-lg border border-transparent transition-colors hover:border-border/70 hover:bg-muted/60 data-[active=true]:border-primary/30 data-[active=true]:bg-primary/10 group">
      <ThreadListItemPrimitive.Trigger className="flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2.5 text-left">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/90">
          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </span>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-foreground/90">
          <ThreadListItemPrimitive.Title
            fallback={
              <span className="text-muted-foreground italic">
                {t.chat.threadList.newChat}
              </span>
            }
          />
        </span>
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
 * Conversation sidebar with header + scrollable thread list.
 */
export function ChatThreadList() {
  const t = useTranslations();

  return (
    <ThreadListPrimitive.Root className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-3.5 border-b border-border/50">
        <h2 className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {t.chat.threadList.title}
        </h2>
        <ThreadListPrimitive.New
          className="inline-flex items-center justify-center size-7 rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          aria-label={t.chat.threadList.newChat}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        </ThreadListPrimitive.New>
      </div>

      {/* Thread items */}
      <div className="flex-1 overflow-y-auto px-2 py-2.5 chat-sidebar-scroll">
        <ThreadListPrimitive.Items
          components={{ ThreadListItem }}
        />
      </div>
    </ThreadListPrimitive.Root>
  );
}
