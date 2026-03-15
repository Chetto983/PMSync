import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  CircularProgress,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useCreateReminder } from '@/hooks/queries/use-reminders';

interface ReminderCreateDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ReminderCreateDialog({ open, onClose }: ReminderCreateDialogProps) {
  const t = useTranslations();
  const tr = t.ai.reminders.createDialog;
  const [inputUtente, setInputUtente] = useState('');
  const createMutation = useCreateReminder();

  const handleCreate = () => {
    if (!inputUtente.trim()) return;
    createMutation.mutate(
      { inputUtente: inputUtente.trim() },
      {
        onSuccess: () => {
          setInputUtente('');
          onClose();
        },
      },
    );
  };

  const handleClose = () => {
    if (!createMutation.isPending) {
      setInputUtente('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{tr.title}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={3}
          maxRows={6}
          placeholder={tr.placeholder}
          helperText={tr.hint}
          value={inputUtente}
          onChange={(e) => setInputUtente(e.target.value)}
          disabled={createMutation.isPending}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={createMutation.isPending}>
          {tr.cancel}
        </Button>
        <Button
          variant="contained"
          onClick={handleCreate}
          disabled={!inputUtente.trim() || createMutation.isPending}
          startIcon={createMutation.isPending ? <CircularProgress size={16} /> : undefined}
        >
          {tr.create}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
