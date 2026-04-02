import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControlLabel,
  Switch,
  Typography,
  Box,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useCreateSmartView } from '@/hooks/queries/use-tasks';
import { useGlobalToast } from '@/lib/context/toast-context';
import type { ListTasksQuery } from '@/lib/api/tasks';

interface SavedViewDialogProps {
  open: boolean;
  onClose: () => void;
  currentFilters: Partial<ListTasksQuery>;
}

function summarizeFilters(
  filters: Partial<ListTasksQuery>,
): string {
  const parts: string[] = [];
  if (filters.sourceType?.length) parts.push(`Type: ${filters.sourceType.join(', ')}`);
  if (filters.status?.length) parts.push(`Status: ${filters.status.join(', ')}`);
  if (filters.priority?.length) parts.push(`Priority: ${filters.priority.join(', ')}`);
  if (filters.dueBefore) parts.push(`Due before: ${filters.dueBefore}`);
  if (filters.dueAfter) parts.push(`Due after: ${filters.dueAfter}`);
  if (filters.contactId) parts.push(`Contact: ${filters.contactId}`);
  return parts.length > 0 ? parts.join(', ') : 'All tasks';
}

export function SavedViewDialog({ open, onClose, currentFilters }: SavedViewDialogProps) {
  const t = useTranslations();
  const tv = t.tasks.smartViews;
  const toast = useGlobalToast();
  const createSmartView = useCreateSmartView();

  const [name, setName] = useState('');
  const [isPinned, setIsPinned] = useState(false);

  const handleClose = useCallback(() => {
    setName('');
    setIsPinned(false);
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) return;
    try {
      await createSmartView.mutateAsync({
        name: name.trim(),
        filters: currentFilters as Record<string, unknown>,
        isPinned,
      });
      toast.success(tv.createSuccess);
      handleClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('Maximum') || msg.includes('maximum')) {
        toast.error(tv.pinLimitReached);
      } else {
        toast.error(tv.createError);
      }
    }
  }, [name, currentFilters, isPinned, createSmartView, toast, tv, handleClose]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>{tv.saveCurrentView}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          size="small"
          label={tv.nameLabel}
          placeholder={tv.namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          sx={{ mt: 1 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          {tv.filters}: {summarizeFilters(currentFilters)}
        </Typography>
        <Box sx={{ mt: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
              />
            }
            label={tv.pinToSidebar}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>
          {t.common.cancel}
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleSubmit()}
          disabled={!name.trim() || createSmartView.isPending}
        >
          {tv.saveView}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
