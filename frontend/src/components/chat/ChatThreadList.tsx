'use client';

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  createContext,
  useContext,
} from 'react';
import {
  ThreadListPrimitive,
  ThreadListItemPrimitive,
} from '@assistant-ui/react';
import { useThreadListItemRuntime } from '@assistant-ui/react';
import type { ThreadListItemRuntime } from '@assistant-ui/react';
import { Plus, Trash2, MessageSquare } from 'lucide-react';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { useTranslations } from '@/lib/hooks/use-translations';
import { aiChatApi } from '@/lib/api/ai';

/* ------------------------------------------------------------------ */
/*  Selection context — shared between header and each thread item    */
/* ------------------------------------------------------------------ */

interface SelectionCtx {
  selectedIds: Set<string>;
  allRegisteredIds: () => string[];
  toggle: (id: string) => void;
  clear: () => void;
  selectAll: () => void;
  register: (id: string, rt: ThreadListItemRuntime) => void;
  unregister: (id: string) => void;
  bulkDeletePending: boolean;
}

const SelectionContext = createContext<SelectionCtx>({
  selectedIds: new Set(),
  allRegisteredIds: () => [],
  toggle: () => {},
  clear: () => {},
  selectAll: () => {},
  register: () => {},
  unregister: () => {},
  bulkDeletePending: false,
});

/* ------------------------------------------------------------------ */
/*  Thread list item — checkbox + title + single-delete               */
/* ------------------------------------------------------------------ */

function ThreadListItem() {
  const t = useTranslations();
  const runtime = useThreadListItemRuntime();
  const ctx = useContext(SelectionContext);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const itemId = runtime.getState().remoteId ?? runtime.getState().id;

  useEffect(() => {
    ctx.register(itemId, runtime);
    return () => ctx.unregister(itemId);
  }, [itemId, runtime]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSelected = ctx.selectedIds.has(itemId);

  const handleCheckbox = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      ctx.toggle(itemId);
    },
    [ctx, itemId],
  );

  const handleDeleteClick = useCallback(() => setConfirmOpen(true), []);
  const handleConfirmDelete = useCallback(() => {
    setConfirmOpen(false);
    void runtime.delete();
  }, [runtime]);
  const handleCancelDelete = useCallback(() => setConfirmOpen(false), []);

  return (
    <>
      <ThreadListItemPrimitive.Root
        className={`chat-thread-item group ${isSelected ? 'chat-thread-item--selected' : ''}`}
      >
        <span
          className="chat-thread-item-checkbox"
          onClick={handleCheckbox}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={isSelected}
            size="small"
            tabIndex={-1}
            disableRipple
            sx={{ p: 0.5 }}
            inputProps={{ 'aria-label': 'Select conversation' }}
          />
        </span>

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
                <Typography component="span" variant="body2" color="text.secondary">
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
            {t.chat.threadList.deleteConfirmDescription ??
              'This conversation will be permanently deleted. This action cannot be undone.'}
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

/* ------------------------------------------------------------------ */
/*  Conversation sidebar with header + bulk actions + thread list     */
/* ------------------------------------------------------------------ */

export function ChatThreadList() {
  const t = useTranslations();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const runtimeMapRef = useRef(new Map<string, ThreadListItemRuntime>());

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  const allRegisteredIds = useCallback(
    () => Array.from(runtimeMapRef.current.keys()),
    [],
  );

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(runtimeMapRef.current.keys()));
  }, []);

  const register = useCallback((id: string, rt: ThreadListItemRuntime) => {
    runtimeMapRef.current.set(id, rt);
  }, []);

  const unregister = useCallback((id: string) => {
    runtimeMapRef.current.delete(id);
  }, []);

  const handleBulkDeleteClick = useCallback(() => setBulkConfirmOpen(true), []);

  const handleBulkConfirm = useCallback(async () => {
    setBulkConfirmOpen(false);
    setBulkDeletePending(true);

    const ids = Array.from(selectedIds);

    // 1. Single API call to delete all conversations from backend
    try {
      await aiChatApi.bulkDeleteConversations(ids);
    } catch {
      // Continue — remove from UI even if API partially failed
    }

    // 2. Remove each from assistant-ui's local thread list
    //    The adapter's delete() will 404 silently since backend rows are already gone
    for (const id of ids) {
      const rt = runtimeMapRef.current.get(id);
      if (rt) {
        try { await rt.delete(); } catch { /* already gone */ }
      }
    }

    setSelectedIds(new Set());
    setBulkDeletePending(false);
  }, [selectedIds]);

  const handleBulkCancel = useCallback(() => setBulkConfirmOpen(false), []);

  const hasSelection = selectedIds.size > 0;
  /* eslint-disable react-hooks/refs -- runtimeMapRef is stable; reading .size during render is intentional */
  const registeredCount = runtimeMapRef.current.size;
  const allSelected = hasSelection && selectedIds.size >= registeredCount;
  /* eslint-enable react-hooks/refs */
  const someSelected = hasSelection && !allSelected;

  const handleSelectAllCheckbox = useCallback(() => {
    if (allSelected) {
      clear();
    } else {
      selectAll();
    }
  }, [allSelected, clear, selectAll]);

  const ctxValue: SelectionCtx = {
    selectedIds,
    allRegisteredIds,
    toggle,
    clear,
    selectAll,
    register,
    unregister,
    bulkDeletePending,
  };

  return (
    <SelectionContext.Provider value={ctxValue}>
      <ThreadListPrimitive.Root className="chat-sidebar-root">
        {/* Header */}
        <div className="chat-sidebar-header">
          {/* Select-all checkbox */}
          <span
            className="chat-sidebar-select-all"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onChange={handleSelectAllCheckbox}
              size="small"
              disableRipple
              sx={{ p: 0.5 }}
              inputProps={{
                'aria-label': allSelected
                  ? (t.emailList?.deselectAll ?? 'Deselect all')
                  : (t.emailList?.selectAll ?? 'Select all'),
              }}
            />
          </span>

          {hasSelection ? (
            <>
              <Typography
                variant="body2"
                color="primary"
                sx={{ fontWeight: 500, fontSize: '0.82rem' }}
              >
                {(t.chat.threadList.selected ?? '{count} selected').replace(
                  '{count}',
                  selectedIds.size.toString(),
                )}
              </Typography>
              <div className="chat-sidebar-bulk-actions">
                <button
                  type="button"
                  className="chat-sidebar-bulk-delete-btn"
                  aria-label={t.chat.threadList.bulkDelete ?? 'Delete selected'}
                  onClick={handleBulkDeleteClick}
                  disabled={bulkDeletePending}
                >
                  <Trash2 size={14} />
                  <span>{t.common.delete}</span>
                </button>
                <button
                  type="button"
                  className="chat-sidebar-bulk-cancel-btn"
                  onClick={clear}
                >
                  {t.common.cancel}
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="chat-sidebar-title">
                {t.chat.threadList.title}
              </h2>
              <ThreadListPrimitive.New
                className="chat-sidebar-new-btn"
                aria-label={t.chat.threadList.newChat}
              >
                <Plus size={14} strokeWidth={2.5} />
              </ThreadListPrimitive.New>
            </>
          )}
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

      {/* Bulk delete confirmation dialog */}
      <Dialog open={bulkConfirmOpen} onClose={handleBulkCancel} maxWidth="xs" fullWidth>
        <DialogTitle>
          {t.chat.threadList.bulkDeleteConfirm ?? 'Delete conversations?'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {(t.chat.threadList.bulkDeleteConfirmDescription ??
              '{count} conversations will be permanently deleted. This action cannot be undone.'
            ).replace('{count}', selectedIds.size.toString())}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleBulkCancel}>{t.common.cancel}</Button>
          <Button onClick={handleBulkConfirm} color="error" variant="contained">
            {t.common.delete}
          </Button>
        </DialogActions>
      </Dialog>
    </SelectionContext.Provider>
  );
}
