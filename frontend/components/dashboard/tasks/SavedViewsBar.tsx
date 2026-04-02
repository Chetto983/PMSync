import React, { useState, useCallback } from 'react';
import {
  Box,
  Chip,
  IconButton,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Tooltip,
  Avatar,
} from '@mui/material';
import { Bookmark, Plus, Pin } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useSmartViews, useDeleteSmartView } from '@/hooks/queries/use-tasks';
import { useGlobalToast } from '@/lib/context/toast-context';
import type { TaskSmartView, ListTasksQuery } from '@/lib/api/tasks';

interface SavedViewsBarProps {
  activeViewId: string | null;
  onApplyView: (view: TaskSmartView) => void;
  onClearView: () => void;
  onSaveClick: () => void;
  currentFilters: Partial<ListTasksQuery>;
}

export function SavedViewsBar({
  activeViewId,
  onApplyView,
  onClearView,
  onSaveClick,
}: SavedViewsBarProps) {
  const t = useTranslations();
  const tv = t.tasks.smartViews;
  const toast = useGlobalToast();
  const { data: views, isLoading, isError } = useSmartViews();
  const deleteSmartView = useDeleteSmartView();

  const [deleteTarget, setDeleteTarget] = useState<TaskSmartView | null>(null);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteSmartView.mutateAsync(deleteTarget.id);
      toast.success(tv.deleteSuccess);
      if (activeViewId === deleteTarget.id) onClearView();
    } catch {
      toast.error(tv.deleteError);
    }
    setDeleteTarget(null);
  }, [deleteTarget, deleteSmartView, toast, tv, activeViewId, onClearView]);

  if (isError) return null;

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
        <Bookmark size={16} />
        <Skeleton width={80} height={24} variant="rounded" />
        <Skeleton width={80} height={24} variant="rounded" />
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
        <Tooltip title={tv.title}>
          <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary' }}>
            <Bookmark size={16} />
          </Box>
        </Tooltip>

        {(views ?? []).map((view: TaskSmartView) => {
          const isActive = activeViewId === view.id;
          return (
            <Chip
              key={view.id}
              label={view.name}
              size="small"
              variant={isActive ? 'filled' : 'outlined'}
              color={isActive ? 'success' : 'default'}
              onClick={() => onApplyView(view)}
              onDelete={() => setDeleteTarget(view)}
              avatar={
                view.isPinned ? (
                  <Avatar sx={{ bgcolor: 'transparent', width: 18, height: 18 }}>
                    <Pin size={12} />
                  </Avatar>
                ) : undefined
              }
              aria-label={tv.deleteViewAriaLabel.replace('{name}', view.name)}
            />
          );
        })}

        <Tooltip title={tv.saveView}>
          <IconButton
            size="small"
            onClick={onSaveClick}
            aria-label={tv.addViewAriaLabel}
          >
            <Plus size={16} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        maxWidth="xs"
      >
        <DialogTitle>{tv.deleteTitle}</DialogTitle>
        <DialogContent>
          <Typography>{tv.deleteConfirm}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>
            {t.common.cancel}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDelete}
            disabled={deleteSmartView.isPending}
          >
            {tv.deleteTitle}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
