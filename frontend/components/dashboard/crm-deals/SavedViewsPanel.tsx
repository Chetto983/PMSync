import React, { useState, useCallback } from 'react';
import {
  Box,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  Skeleton,
  IconButton,
  Tooltip,
} from '@mui/material';
import { Bookmark, Plus, X } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useGlobalToast } from '@/lib/context/toast-context';
import {
  useSavedViews,
  useCreateSavedView,
  useDeleteSavedView,
} from '@/hooks/queries/use-crm-pipelines';
import type { CrmSavedView } from '@/lib/api/crm-pipelines';

interface SavedViewsPanelProps {
  pipelineId: string;
  currentFilters: Record<string, unknown>;
  onApplyView: (filters: Record<string, unknown>) => void;
}

export function SavedViewsPanel({
  pipelineId,
  currentFilters,
  onApplyView,
}: SavedViewsPanelProps) {
  const t = useTranslations();
  const tv = t.crmPipelines?.savedViews;
  const toast = useGlobalToast();

  const { data: views, isLoading } = useSavedViews(pipelineId);
  const createView = useCreateSavedView(pipelineId);
  const deleteView = useDeleteSavedView(pipelineId);

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (!viewName.trim()) return;
    try {
      await createView.mutateAsync({
        name: viewName.trim(),
        filters: currentFilters,
      });
      toast.success(tv?.createSuccess ?? 'View saved');
      setSaveDialogOpen(false);
      setViewName('');
    } catch {
      toast.error(tv?.createError ?? 'Failed to save view');
    }
  }, [viewName, currentFilters, createView, toast, tv]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteView.mutateAsync(deleteTarget);
      toast.success(tv?.deleteSuccess ?? 'View deleted');
      if (activeViewId === deleteTarget) setActiveViewId(null);
    } catch {
      toast.error(tv?.deleteError ?? 'Failed to delete view');
    }
    setDeleteTarget(null);
  }, [deleteTarget, deleteView, toast, tv, activeViewId]);

  const handleApply = useCallback(
    (view: CrmSavedView) => {
      setActiveViewId(view.id);
      onApplyView(view.filters);
      toast.success(tv?.applied ?? 'View applied');
    },
    [onApplyView, toast, tv],
  );

  if (!pipelineId) return null;

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Bookmark size={16} />
        <Skeleton width={80} height={24} />
        <Skeleton width={80} height={24} />
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Tooltip title={tv?.title ?? 'Saved Views'}>
          <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary' }}>
            <Bookmark size={16} />
          </Box>
        </Tooltip>

        {(views ?? []).map((view: CrmSavedView) => (
          <Chip
            key={view.id}
            label={view.name}
            size="small"
            variant={activeViewId === view.id ? 'filled' : 'outlined'}
            color={activeViewId === view.id ? 'primary' : 'default'}
            onClick={() => handleApply(view)}
            onDelete={() => setDeleteTarget(view.id)}
            deleteIcon={
              <Tooltip title={tv?.delete ?? 'Delete'}>
                <X size={14} />
              </Tooltip>
            }
          />
        ))}

        <Tooltip title={tv?.saveCurrentView ?? 'Save Current View'}>
          <IconButton
            size="small"
            onClick={() => setSaveDialogOpen(true)}
            aria-label={tv?.saveCurrentView ?? 'Save Current View'}
          >
            <Plus size={16} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Save View Dialog */}
      <Dialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{tv?.saveCurrentView ?? 'Save Current View'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label={tv?.nameLabel ?? 'View Name'}
            placeholder={tv?.namePlaceholder ?? 'e.g. High-value deals this quarter'}
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
            sx={{ mt: 1 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            {tv?.filters ?? 'Filters'}: {Object.keys(currentFilters).filter(k => currentFilters[k] != null).join(', ') || '—'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>
            {t.common?.cancel ?? 'Cancel'}
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!viewName.trim() || createView.isPending}
          >
            {tv?.save ?? 'Save View'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        maxWidth="xs"
      >
        <DialogTitle>{tv?.delete ?? 'Delete'}</DialogTitle>
        <DialogContent>
          <Typography>{tv?.deleteConfirm ?? 'Are you sure you want to delete this saved view?'}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>
            {t.common?.cancel ?? 'Cancel'}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDelete}
            disabled={deleteView.isPending}
          >
            {tv?.delete ?? 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
