'use client';

import { useState, useCallback } from 'react';
import {
  ThreadListPrimitive,
  ThreadListItemPrimitive,
} from '@assistant-ui/react';
import { useThreadListItemRuntime } from '@assistant-ui/react';
import { Plus, Trash2, MessageSquare } from 'lucide-react';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Thread list item with hover delete and confirmation dialog.
 */
function ThreadListItem() {
  const t = useTranslations();
  const runtime = useThreadListItemRuntime();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDeleteClick = useCallback(() => {
    setConfirmOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    setConfirmOpen(false);
    void runtime.delete();
  }, [runtime]);

  const handleCancelDelete = useCallback(() => {
    setConfirmOpen(false);
  }, []);

  return (
    <>
      <ThreadListItemPrimitive.Root className="chat-thread-item group">
        <ThreadListItemPrimitive.Trigger className="chat-thread-item-trigger">
          <span className="chat-thread-item-icon">
            <MessageSquare
              size={14}
              style={{ flexShrink: 0, color: 'var(--mui-palette-text-secondary)' }}
            />
          </span>
          <span className="chat-thread-item-title">
            <ThreadListItemPrimitive.Title
              fallback={
                <Typography
                  component="span"
                  variant="body2"
                  color="text.secondary"
                >
                  {t.chat.threadList.newChat}
                </Typography>
              }
            />
          </span>
        </ThreadListItemPrimitive.Trigger>
        <button
          type="button"
          className="chat-thread-item-delete"
          aria-label={t.chat.threadList.deleteConfirm}
          onClick={handleDeleteClick}
        >
          <Trash2 size={14} />
        </button>
      </ThreadListItemPrimitive.Root>

      <Dialog open={confirmOpen} onClose={handleCancelDelete} maxWidth="xs" fullWidth>
        <DialogTitle>{t.chat.threadList.deleteConfirm}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t.chat.threadList.deleteConfirmDescription ?? 'This conversation will be permanently deleted. This action cannot be undone.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>{t.common.cancel}</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">
            {t.common.delete}
          </Button>
        </DialogActions>
      </Dialog>
    </>
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
          <Plus size={14} strokeWidth={2.5} />
        </ThreadListPrimitive.New>
      </div>

      {/* Thread items */}
      <div className="chat-sidebar-scroll">
        <ThreadListPrimitive.Items
          components={{ ThreadListItem }}
        />
        <div className="chat-sidebar-empty">
          <div className="chat-sidebar-empty-icon">
            <MessageSquare size={20} />
          </div>
          <Typography
            variant="body2"
            color="text.secondary"
            className="chat-sidebar-empty-text"
          >
            {t.chat.threadList.noConversations ?? 'No conversations yet'}
          </Typography>
        </div>
      </div>
    </ThreadListPrimitive.Root>
  );
}
