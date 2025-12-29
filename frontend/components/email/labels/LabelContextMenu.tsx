/**
 * Label Context Menu Component
 *
 * Context menu for label actions (edit, delete).
 * Can be triggered by right-click or menu button.
 *
 * Features:
 * - Edit label (opens LabelDialog)
 * - Delete label with confirmation
 * - Clean MUI Menu design
 *
 * @see D:\MailAgent\esempio\Zero-staging\apps\mail\components\context\label-sidebar-context.tsx
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
import { Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useDeleteLabel } from '@/hooks/queries';
import { LabelDialog } from './LabelDialog';
import type { Label } from '@/lib/api/labels';

interface LabelContextMenuProps {
  /** Anchor element for menu positioning */
  anchorEl: HTMLElement | null;
  /** Whether menu is open */
  open: boolean;
  /** Callback when menu closes */
  onClose: () => void;
  /** The label being acted upon */
  label: Label | null;
  /** Position for context menu (right-click) */
  position?: { x: number; y: number };
}

/**
 * LabelContextMenu - Actions menu for label management
 */
export function LabelContextMenu({
  anchorEl,
  open,
  onClose,
  label,
  position,
}: LabelContextMenuProps) {
  const t = useTranslations();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const deleteLabel = useDeleteLabel();

  // Track pending dialog to open after menu closes
  const [pendingDialog, setPendingDialog] = useState<'edit' | 'delete' | null>(null);

  // Handle edit click
  const handleEdit = useCallback(() => {
    setPendingDialog('edit');
    onClose();
  }, [onClose]);

  // Handle delete click
  const handleDeleteClick = useCallback(() => {
    setPendingDialog('delete');
    onClose();
  }, [onClose]);

  // Handle menu close transition complete - open dialog after menu is fully closed
  const handleMenuExited = useCallback(() => {
    if (pendingDialog === 'edit') {
      setEditDialogOpen(true);
    } else if (pendingDialog === 'delete') {
      setDeleteDialogOpen(true);
    }
    setPendingDialog(null);
  }, [pendingDialog]);

  // Handle delete confirmation
  const handleDeleteConfirm = useCallback(async () => {
    if (!label) return;

    try {
      await deleteLabel.mutateAsync(label.id);
      setDeleteDialogOpen(false);
    } catch (error) {
      // Error is handled by the mutation
      console.error('Failed to delete label:', error);
    }
  }, [label, deleteLabel]);

  // Handle close dialogs
  const handleEditDialogClose = useCallback(() => {
    setEditDialogOpen(false);
  }, []);

  const handleDeleteDialogClose = useCallback(() => {
    if (!deleteLabel.isPending) {
      setDeleteDialogOpen(false);
    }
  }, [deleteLabel.isPending]);

  // Don't render if no label
  if (!label) return null;

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
        {/* Edit Option */}
        <MenuItem onClick={handleEdit}>
          <ListItemIcon>
            <Pencil size={16} />
          </ListItemIcon>
          <ListItemText>
            {t.common?.edit || 'Modifica'}
          </ListItemText>
        </MenuItem>

        {/* Delete Option - Only for USER labels */}
        {label.type !== 'SYSTEM' && (
          <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}>
            <ListItemIcon>
              <Trash2 size={16} color="inherit" />
            </ListItemIcon>
            <ListItemText>
              {t.common?.delete || 'Elimina'}
            </ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Edit Dialog - keepMounted for faster subsequent opens */}
      <LabelDialog
        open={editDialogOpen}
        onClose={handleEditDialogClose}
        label={label}
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
              {t.email?.labels?.deleteLabel || 'Elimina etichetta'}
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t.email?.labels?.deleteConfirmation ||
              'Sei sicuro di voler eliminare questa etichetta?'}
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
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: 0.5,
                bgcolor: label.color?.backgroundColor || '#9e9e9e',
              }}
            />
            <Typography variant="body2" fontWeight={500}>
              {label.name}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
            {t.email?.labels?.deleteWarning ||
              'Le email con questa etichetta non verranno eliminate.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={handleDeleteDialogClose}
            disabled={deleteLabel.isPending}
            color="inherit"
          >
            {t.common?.cancel || 'Annulla'}
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            disabled={deleteLabel.isPending}
            variant="contained"
            color="error"
            startIcon={
              deleteLabel.isPending ? (
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

export default LabelContextMenu;
