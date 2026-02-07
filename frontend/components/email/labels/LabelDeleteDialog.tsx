/**
 * Label Delete Dialog Component
 *
 * Uses reusable ConfirmDialog for label deletion.
 * Shows subtree warning when deleting a parent label with children.
 */

import React, { useCallback, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { Tag, AlertTriangle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useDeleteLabel, useLabels } from '@/hooks/queries';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { getDescendantIdsFlat } from '@/lib/label-tree-utils';
import type { Label } from '@/lib/api/labels';

interface LabelDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  label: Label | null;
}

export function LabelDeleteDialog({
  open,
  onClose,
  label,
}: LabelDeleteDialogProps) {
  const t = useTranslations();
  const deleteLabel = useDeleteLabel();
  const { data: allLabels } = useLabels();

  // Compute descendant info
  const descendants = useMemo(() => {
    if (!label || !allLabels) return { count: 0, names: [] as string[] };
    const userLabels = allLabels.filter((l) => l.type === 'USER');
    const ids = getDescendantIdsFlat(userLabels, label.id);
    const names = ids
      .map((id) => userLabels.find((l) => l.id === id)?.name)
      .filter(Boolean) as string[];
    return { count: ids.length, names };
  }, [label, allLabels]);

  const handleConfirm = useCallback(async () => {
    if (!label) return;
    try {
      await deleteLabel.mutateAsync(label.id);
      onClose();
    } catch {
      // Error handled by mutation
    }
  }, [label, deleteLabel, onClose]);

  if (!label) return null;

  const hasChildren = descendants.count > 0;
  const displayNames = descendants.names.slice(0, 5);
  const extraCount = descendants.count - displayNames.length;

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={handleConfirm}
      title={t.email?.labels?.deleteLabel || 'Delete label'}
      message={
        t.email?.labels?.deleteConfirmation ||
        'Are you sure you want to delete this label?'
      }
      confirmText={t.common?.delete || 'Delete'}
      cancelText={t.common?.cancel || 'Cancel'}
      confirmColor="error"
      isLoading={deleteLabel.isPending}
      variant="danger"
    >
      {/* Label being deleted */}
      <Box
        sx={{
          mt: 2,
          p: 1.5,
          bgcolor: 'action.hover',
          borderRadius: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Tag
          size={16}
          color={label.color?.backgroundColor || '#9e9e9e'}
          fill={label.color?.backgroundColor || '#9e9e9e'}
        />
        <Typography variant="body2" fontWeight={500}>
          {label.name}
        </Typography>
      </Box>

      {/* Subtree warning */}
      {hasChildren && (
        <Box
          sx={{
            mt: 2,
            p: 1.5,
            bgcolor: (theme) => theme.palette.warning.main + '14',
            borderRadius: 1,
            border: 1,
            borderColor: 'warning.main',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <AlertTriangle size={16} />
            <Typography variant="body2" fontWeight={600}>
              {(
                t.email?.labels?.deleteSubtreeWarning ||
                'This will also delete {count} child label(s). Emails with these labels will simply lose the label.'
              ).replace('{count}', String(descendants.count))}
            </Typography>
          </Box>
          <Box sx={{ pl: 3 }}>
            {displayNames.map((name) => (
              <Typography
                key={name}
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block' }}
              >
                {name}
              </Typography>
            ))}
            {extraCount > 0 && (
              <Typography variant="caption" color="text.secondary">
                +{extraCount} more
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {/* Standard warning */}
      {!hasChildren && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 1.5, display: 'block' }}
        >
          {t.email?.labels?.deleteWarning ||
            'Emails with this label will not be deleted.'}
        </Typography>
      )}
    </ConfirmDialog>
  );
}

export default LabelDeleteDialog;
