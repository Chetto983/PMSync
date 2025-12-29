/**
 * Folder Context Menu Component
 *
 * Context menu for folder actions (rename, delete).
 * Can be triggered by right-click or menu button.
 *
 * Features:
 * - Rename folder (opens FolderDialog)
 * - Delete folder with confirmation
 * - Clean MUI Menu design
 *
 * @see D:\MailAgent\frontend\components\email\labels\LabelContextMenu.tsx
 */

import React, { useState, useCallback } from 'react';
import {
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  CircularProgress,
  Typography,
  Box,
} from '@mui/material';
import { Pencil, Trash2, Folder, AlertTriangle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useDeleteFolder } from '@/hooks/queries';
import { FolderDialog } from './FolderDialog';
import type { Folder as FolderType } from '@/lib/api/folders';

interface FolderContextMenuProps {
  /** Anchor element for menu positioning */
  anchorEl: HTMLElement | null;
  /** Whether menu is open */
  open: boolean;
  /** Callback when menu closes */
  onClose: () => void;
  /** The folder being acted upon */
  folder: FolderType | null;
  /** Position for context menu (right-click) */
  position?: { x: number; y: number };
}

/**
 * FolderContextMenu - Actions menu for folder management
 */
export function FolderContextMenu({
  anchorEl,
  open,
  onClose,
  folder,
  position,
}: FolderContextMenuProps) {
  const t = useTranslations();
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const deleteFolder = useDeleteFolder();

  // Track pending dialog to open after menu closes
  const [pendingDialog, setPendingDialog] = useState<'rename' | 'delete' | null>(null);

  // Check if folder can be deleted (not special use folders)
  const canDelete = folder && !folder.specialUse;
  const canRename = folder && !folder.specialUse;

  // Handle rename click
  const handleRename = useCallback(() => {
    setPendingDialog('rename');
    onClose();
  }, [onClose]);

  // Handle delete click
  const handleDeleteClick = useCallback(() => {
    setPendingDialog('delete');
    onClose();
  }, [onClose]);

  // Handle menu close transition complete - open dialog after menu is fully closed
  const handleMenuExited = useCallback(() => {
    if (pendingDialog === 'rename') {
      setRenameDialogOpen(true);
    } else if (pendingDialog === 'delete') {
      setDeleteDialogOpen(true);
    }
    setPendingDialog(null);
  }, [pendingDialog]);

  // Handle delete confirmation
  const handleDeleteConfirm = useCallback(async () => {
    if (!folder) return;

    try {
      await deleteFolder.mutateAsync({
        folderId: folder.id,
        providerId: folder.providerId,
      });
      setDeleteDialogOpen(false);
    } catch (error) {
      // Error is handled by the mutation
      console.error('Failed to delete folder:', error);
    }
  }, [folder, deleteFolder]);

  // Handle close dialogs
  const handleRenameDialogClose = useCallback(() => {
    setRenameDialogOpen(false);
  }, []);

  const handleDeleteDialogClose = useCallback(() => {
    if (!deleteFolder.isPending) {
      setDeleteDialogOpen(false);
    }
  }, [deleteFolder.isPending]);

  // Don't render if no folder
  if (!folder) return null;

  // Determine anchor position
  const anchorPosition = position
    ? { top: position.y, left: position.x }
    : undefined;

  return (
    <>
      {/* Context Menu */}
      <Menu
        anchorEl={position ? undefined : anchorEl}
        anchorReference={position ? 'anchorPosition' : 'anchorEl'}
        anchorPosition={anchorPosition}
        open={open}
        onClose={onClose}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
        disableRestoreFocus
        slotProps={{
          paper: {
            sx: {
              minWidth: 160,
              borderRadius: 2,
              boxShadow: 3,
            },
          },
        }}
        TransitionProps={{
          onExited: handleMenuExited,
          timeout: 150, // Speed up menu close animation
        }}
      >
        {/* Rename Option */}
        {canRename && (
          <MenuItem onClick={handleRename}>
            <ListItemIcon>
              <Pencil size={16} />
            </ListItemIcon>
            <ListItemText>
              {t.common?.rename || 'Rinomina'}
            </ListItemText>
          </MenuItem>
        )}

        {/* Delete Option - Only for non-special folders */}
        {canDelete && (
          <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}>
            <ListItemIcon>
              <Trash2 size={16} color="inherit" />
            </ListItemIcon>
            <ListItemText>
              {t.common?.delete || 'Elimina'}
            </ListItemText>
          </MenuItem>
        )}

        {/* Message if no actions available */}
        {!canRename && !canDelete && (
          <MenuItem disabled>
            <ListItemText>
              <Typography variant="body2" color="text.secondary">
                {t.folders?.noActionsAvailable || 'Nessuna azione disponibile'}
              </Typography>
            </ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Rename Dialog */}
      <FolderDialog
        open={renameDialogOpen}
        onClose={handleRenameDialogClose}
        folder={folder}
      />

      {/* Delete Confirmation Dialog - keepMounted for faster subsequent opens */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteDialogClose}
        maxWidth="xs"
        fullWidth
        keepMounted
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AlertTriangle size={20} color="#f44336" />
            <Typography variant="h6" component="span">
              {t.folders?.deleteFolder || 'Elimina cartella'}
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t.folders?.deleteConfirmation ||
              'Sei sicuro di voler eliminare questa cartella?'}
          </DialogContentText>
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
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={handleDeleteDialogClose}
            disabled={deleteFolder.isPending}
            color="inherit"
          >
            {t.common?.cancel || 'Annulla'}
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            disabled={deleteFolder.isPending}
            variant="contained"
            color="error"
            startIcon={
              deleteFolder.isPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <Trash2 size={16} />
              )
            }
          >
            {t.common?.delete || 'Elimina'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default FolderContextMenu;
