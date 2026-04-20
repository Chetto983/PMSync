import React, { useState, useCallback } from 'react';
import {
  Box,
  Button,
  IconButton,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Tooltip,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { Bookmark, Plus, Pin, Sparkles } from 'lucide-react';
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
  const theme = useTheme();
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
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
        <Bookmark size={16} />
        <Skeleton width={80} height={24} variant="rounded" />
        <Skeleton width={80} height={24} variant="rounded" />
      </Box>
    );
  }

  return (
    <>
      <Box
        sx={{
          mb: 2,
          p: 1.5,
          borderRadius: 3,
          border: 1,
          borderColor: 'divider',
          bgcolor: alpha(theme.palette.background.paper, 0.82),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 1.25 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: 2,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: alpha(theme.palette.primary.light, 0.16),
                color: 'primary.main',
              }}
            >
              <Bookmark size={16} />
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {tv.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t.tasks.workspaceView.savedViewsHint}
              </Typography>
            </Box>
          </Box>

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

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            size="small"
            variant={!activeViewId ? 'contained' : 'outlined'}
            color={!activeViewId ? 'primary' : 'inherit'}
            onClick={onClearView}
            startIcon={<Sparkles size={14} />}
            sx={{ borderRadius: 999, textTransform: 'none', fontWeight: 700 }}
          >
            {t.tasks.workspaceView.defaultViewLabel}
          </Button>

          {(views ?? []).map((view: TaskSmartView) => {
            const isActive = activeViewId === view.id;
            return (
              <Box
                key={view.id}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  pl: 1.25,
                  pr: 0.5,
                  py: 0.5,
                  borderRadius: 999,
                  border: 1,
                  borderColor: isActive ? 'primary.main' : 'divider',
                  bgcolor: isActive ? alpha(theme.palette.primary.light, 0.14) : 'transparent',
                }}
              >
                {view.isPinned && <Pin size={12} />}
                <Button
                  size="small"
                  variant="text"
                  color="inherit"
                  onClick={() => onApplyView(view)}
                  sx={{
                    minWidth: 0,
                    px: 0,
                    py: 0,
                    textTransform: 'none',
                    fontWeight: isActive ? 800 : 600,
                    color: 'text.primary',
                  }}
                >
                  {view.name}
                </Button>
                <Tooltip title={tv.deleteTitle}>
                  <IconButton
                    size="small"
                    onClick={() => setDeleteTarget(view)}
                    aria-label={tv.deleteViewAriaLabel.replace('{name}', view.name)}
                  >
                    <Plus size={12} style={{ transform: 'rotate(45deg)' }} />
                  </IconButton>
                </Tooltip>
              </Box>
            );
          })}
        </Box>
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
