import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  MenuItem,
  Box,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useCreateTask } from '@/hooks/queries/use-tasks';
import { useGlobalToast } from '@/lib/context/toast-context';
import type { UnifiedTaskPriority } from '@/lib/api/tasks';

const PRIORITY_OPTIONS: UnifiedTaskPriority[] = ['low', 'medium', 'high', 'urgent'];

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateTaskDialog({ open, onClose }: CreateTaskDialogProps) {
  const t = useTranslations();
  const toast = useGlobalToast();
  const createTask = useCreateTask();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<UnifiedTaskPriority | ''>('');
  const [dueDate, setDueDate] = useState('');

  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setPriority('');
    setDueDate('');
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) return;

    const dto: Record<string, unknown> = { title: title.trim() };
    if (description.trim()) dto.description = description.trim();
    if (priority) dto.priority = priority;
    if (dueDate) dto.dueDate = dueDate;

    try {
      await createTask.mutateAsync(dto as Parameters<typeof createTask.mutateAsync>[0]);
      toast.success(t.tasks.created);
      resetForm();
      onClose();
    } catch {
      toast.error(t.tasks.createError);
    }
  }, [title, description, priority, dueDate, createTask, toast, t, resetForm, onClose]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t.tasks.createTask}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label={t.tasks.dialog.titleLabel}
            placeholder={t.tasks.dialog.titlePlaceholder}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
            fullWidth
            inputProps={{ maxLength: 200 }}
          />
          <TextField
            label={t.tasks.dialog.descriptionLabel}
            placeholder={t.tasks.dialog.descriptionPlaceholder}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            rows={3}
            fullWidth
            inputProps={{ maxLength: 2000 }}
          />
          <TextField
            label={t.tasks.dialog.priorityLabel}
            value={priority}
            onChange={(e) => setPriority(e.target.value as UnifiedTaskPriority | '')}
            select
            fullWidth
          >
            <MenuItem value="">{t.tasks.priorities.medium} ({t.tasks.dialog.priorityLabel})</MenuItem>
            {PRIORITY_OPTIONS.map((p) => (
              <MenuItem key={p} value={p}>
                {t.tasks.priorities[p]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label={t.tasks.dialog.dueDateLabel}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t.tasks.dialog.cancel}</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!title.trim() || createTask.isPending}
        >
          {t.tasks.dialog.create}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
