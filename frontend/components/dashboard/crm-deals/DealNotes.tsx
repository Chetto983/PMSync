import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  TextField,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useDealNotes,
  useCreateDealNote,
  useUpdateDealNote,
  useDeleteDealNote,
} from '@/hooks/queries/use-crm-deals';
import { useGlobalToast } from '@/lib/context/toast-context';
import type { CrmActivity } from '@/lib/api/crm-deals';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function NoteItem({
  note,
  dealId,
  translations,
}: {
  note: CrmActivity;
  dealId: string;
  translations: Record<string, string | undefined> | undefined;
}) {
  const toast = useGlobalToast();
  const updateNote = useUpdateDealNote(dealId);
  const deleteNote = useDeleteDealNote(dealId);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content ?? '');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleSave = async () => {
    if (!draft.trim()) return;
    try {
      await updateNote.mutateAsync({ noteId: note.id, dto: { content: draft } });
      toast.success(translations?.updated ?? 'Note updated');
      setEditing(false);
    } catch {
      toast.error(translations?.updateError ?? 'Failed to update note');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteNote.mutateAsync(note.id);
      toast.success(translations?.deleted ?? 'Note deleted');
    } catch {
      toast.error(translations?.deleteError ?? 'Failed to delete note');
    } finally {
      setDeleteOpen(false);
    }
  };

  if (editing) {
    return (
      <Paper variant="outlined" sx={{ p: 2, mb: 1.5 }}>
        <TextField
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          fullWidth
          multiline
          rows={3}
          size="small"
          autoFocus
        />
        <Box sx={{ display: 'flex', gap: 1, mt: 1, justifyContent: 'flex-end' }}>
          <Button
            size="small"
            onClick={() => { setDraft(note.content ?? ''); setEditing(false); }}
            disabled={updateNote.isPending}
          >
            {translations?.cancel ?? 'Cancel'}
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={handleSave}
            disabled={updateNote.isPending || !draft.trim()}
          >
            {translations?.save ?? 'Save'}
          </Button>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {note.content}
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
            {formatDate(note.createdAt)}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5, ml: 1 }}>
          <IconButton
            size="small"
            onClick={() => { setDraft(note.content ?? ''); setEditing(true); }}
            aria-label={translations?.edit ?? 'Edit'}
            sx={{ minWidth: 44, minHeight: 44 }}
          >
            <Pencil size={14} />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => setDeleteOpen(true)}
            aria-label={translations?.delete ?? 'Delete'}
            sx={{ minWidth: 44, minHeight: 44 }}
          >
            <Trash2 size={14} />
          </IconButton>
        </Box>
      </Box>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs">
        <DialogTitle>{translations?.delete ?? 'Delete'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {translations?.deleteConfirm ?? 'Delete this note?'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleteNote.isPending}>
            {translations?.cancel ?? 'Cancel'}
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={deleteNote.isPending}
          >
            {translations?.delete ?? 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export function DealNotes({ dealId }: { dealId: string }) {
  const t = useTranslations();
  const tn = t.crmDeals?.detail?.notes;
  const toast = useGlobalToast();
  const { data: notes, isLoading } = useDealNotes(dealId);
  const createNote = useCreateDealNote(dealId);

  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState('');

  const handleCreate = async () => {
    if (!newContent.trim()) return;
    try {
      await createNote.mutateAsync({ content: newContent });
      toast.success(tn?.created ?? 'Note added');
      setNewContent('');
      setAdding(false);
    } catch {
      toast.error(tn?.createError ?? 'Failed to add note');
    }
  };

  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Skeleton width="30%" height={24} sx={{ mb: 2 }} />
        <Skeleton width="100%" height={60} sx={{ mb: 1 }} />
        <Skeleton width="100%" height={60} />
      </Paper>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
          {tn?.title ?? 'Notes'}
        </Typography>
        {!adding && (
          <Button
            size="small"
            startIcon={<Plus size={16} />}
            onClick={() => setAdding(true)}
          >
            {tn?.addNote ?? 'Add Note'}
          </Button>
        )}
      </Box>

      {adding && (
        <Paper variant="outlined" sx={{ p: 2, mb: 1.5 }}>
          <TextField
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder={tn?.placeholder ?? 'Write a note...'}
            fullWidth
            multiline
            rows={3}
            size="small"
            autoFocus
          />
          <Box sx={{ display: 'flex', gap: 1, mt: 1, justifyContent: 'flex-end' }}>
            <Button
              size="small"
              onClick={() => { setNewContent(''); setAdding(false); }}
              disabled={createNote.isPending}
            >
              {tn?.cancel ?? 'Cancel'}
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleCreate}
              disabled={createNote.isPending || !newContent.trim()}
            >
              {tn?.save ?? 'Save'}
            </Button>
          </Box>
        </Paper>
      )}

      {(!notes || notes.length === 0) && !adding ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="subtitle2" color="text.secondary">
            {tn?.empty ?? 'No notes yet'}
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1.5 }}>
            {tn?.emptyDescription ?? 'Add a note to keep track of important details.'}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Plus size={16} />}
            onClick={() => setAdding(true)}
          >
            {tn?.addNote ?? 'Add Note'}
          </Button>
        </Paper>
      ) : (
        notes?.map((note) => (
          <NoteItem
            key={note.id}
            note={note}
            dealId={dealId}
            translations={tn}
          />
        ))
      )}
    </Box>
  );
}
