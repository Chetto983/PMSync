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
    <ThreadListItemPrimitive.Root className="chat-thread-item group">
      <ThreadListItemPrimitive.Trigger className="chat-thread-item-trigger">
        <span className="chat-thread-item-icon">
          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </span>
        <span className="chat-thread-item-title">
          <ThreadListItemPrimitive.Title
            fallback={
              <span className="text-muted-foreground">
                {t.chat.threadList.newChat}
              </span>
            }
          />
        </span>
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemPrimitive.Delete
        className="chat-thread-item-delete"
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
    <ThreadListPrimitive.Root className="chat-sidebar-root">
      {/* Header */}
      <div className="chat-sidebar-header">
        <h2 className="chat-sidebar-title">
          {t.chat.threadList.title}
        </h2>
        <ThreadListPrimitive.New
          className="chat-sidebar-new-btn"
          aria-label={t.chat.threadList.newChat}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        </ThreadListPrimitive.New>
      </div>

      {/* Thread items */}
      <div className="chat-sidebar-scroll">
        <ThreadListPrimitive.Items
          components={{ ThreadListItem }}
        />
        <div className="chat-sidebar-empty">
          <div className="chat-sidebar-empty-icon">
            <MessageSquare className="h-5 w-5" />
          </div>
          <p className="chat-sidebar-empty-text">
            {t.chat.threadList.noConversations ?? 'No conversations yet'}
          </p>
        </div>
      </div>
    </ThreadListPrimitive.Root>
  );
}
