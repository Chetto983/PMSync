/**
 * Label Delete Dialog Component
 *
 * Uses reusable ConfirmDialog for label deletion.
 */

import React, { useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import { Tag } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useDeleteLabel } from '@/hooks/queries';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
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

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={handleConfirm}
      title={t.email?.labels?.deleteLabel || 'Elimina etichetta'}
      message={t.email?.labels?.deleteConfirmation || 'Sei sicuro di voler eliminare questa etichetta?'}
      confirmText={t.common?.delete || 'Elimina'}
      cancelText={t.common?.cancel || 'Annulla'}
      confirmColor="error"
      isLoading={deleteLabel.isPending}
      variant="danger"
    >
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
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mt: 1.5, display: 'block' }}
      >
        {t.email?.labels?.deleteWarning ||
          'Le email con questa etichetta non verranno eliminate.'}
      </Typography>
    </ConfirmDialog>
  );
}

export default LabelDeleteDialog;
