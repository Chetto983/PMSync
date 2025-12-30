/**
 * Folder Context Menu Component
 *
 * Simple context menu for folder actions using MUI Menu.
 * Pattern: menu closes first, dialog opens via setTimeout(0).
 *
 * @see https://github.com/mui/material-ui/issues/6648
 */

import React, { useState, useCallback } from 'react';
import {
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { FolderDialog } from './FolderDialog';
import { FolderDeleteDialog } from './FolderDeleteDialog';
import type { Folder } from '@/lib/api/folders';

interface FolderContextMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  folder: Folder | null;
  position?: { x: number; y: number };
}

export function FolderContextMenu({
  anchorEl,
  open,
  onClose,
  folder,
  position,
}: FolderContextMenuProps) {
  const t = useTranslations();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Can only rename/delete non-system folders
  const canModify = folder && !folder.isSystem;

  const handleRename = useCallback(() => {
    onClose();
    setTimeout(() => setRenameOpen(true), 0);
  }, [onClose]);

  const handleDelete = useCallback(() => {
    onClose();
    setTimeout(() => setDeleteOpen(true), 0);
  }, [onClose]);

  if (!folder) return null;

  const anchorPosition = position
    ? { top: position.y, left: position.x }
    : undefined;

  return (
    <>
      <Menu
        anchorEl={position ? undefined : anchorEl}
        anchorReference={position ? 'anchorPosition' : 'anchorEl'}
        anchorPosition={anchorPosition}
        open={open}
        onClose={onClose}
        slotProps={{
          paper: { sx: { minWidth: 160, borderRadius: 2 } },
        }}
      >
        {canModify ? (
          <>
            <MenuItem onClick={handleRename}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <Pencil size={16} />
              </ListItemIcon>
              <ListItemText>{t.common?.rename || 'Rename'}</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
              <ListItemIcon sx={{ color: 'inherit', minWidth: 32 }}>
                <Trash2 size={16} />
              </ListItemIcon>
              <ListItemText>{t.common?.delete || 'Delete'}</ListItemText>
            </MenuItem>
          </>
        ) : (
          <MenuItem disabled>
            <ListItemText sx={{ color: 'text.secondary' }}>
              {t.folders?.noActionsAvailable || 'Nessuna azione'}
            </ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Rename Dialog */}
      <FolderDialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        folder={folder}
      />

      {/* Delete Dialog */}
      <FolderDeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        folder={folder}
      />
    </>
  );
}

export default FolderContextMenu;
