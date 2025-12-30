/**
 * Folder Delete Dialog Component
 *
 * Uses reusable ConfirmDialog for folder deletion.
 */

import React, { useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import { Folder } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useDeleteFolder } from '@/hooks/queries';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Folder as FolderType } from '@/lib/api/folders';

interface FolderDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  folder: FolderType | null;
}

export function FolderDeleteDialog({
  open,
  onClose,
  folder,
}: FolderDeleteDialogProps) {
  const t = useTranslations();
  const deleteFolder = useDeleteFolder();

  const handleConfirm = useCallback(async () => {
    if (!folder) return;
    try {
      await deleteFolder.mutateAsync({
        folderId: folder.id,
        providerId: folder.providerId,
      });
      onClose();
    } catch {
      // Error handled by mutation
    }
  }, [folder, deleteFolder, onClose]);

  if (!folder) return null;

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={handleConfirm}
      title={t.folders?.deleteFolder || 'Elimina cartella'}
      message={t.folders?.deleteConfirmation || 'Sei sicuro di voler eliminare questa cartella?'}
      confirmText={t.common?.delete || 'Elimina'}
      cancelText={t.common?.cancel || 'Annulla'}
      confirmColor="error"
      isLoading={deleteFolder.isPending}
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
        <Folder size={16} />
        <Typography variant="body2" fontWeight={500}>
          {folder.name}
        </Typography>
      </Box>
      <Typography
        variant="caption"
        color="error"
        sx={{ mt: 1.5, display: 'block' }}
      >
        {t.folders?.deleteWarning ||
          'Attenzione: le email in questa cartella potrebbero essere eliminate.'}
      </Typography>
    </ConfirmDialog>
  );
}

export default FolderDeleteDialog;
