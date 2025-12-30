/**
 * Label Context Menu Component
 *
 * Simple context menu for label actions using MUI Menu.
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
import { LabelDialog } from './LabelDialog';
import { LabelDeleteDialog } from './LabelDeleteDialog';
import type { Label } from '@/lib/api/labels';

interface LabelContextMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  label: Label | null;
  position?: { x: number; y: number };
}

export function LabelContextMenu({
  anchorEl,
  open,
  onClose,
  label,
  position,
}: LabelContextMenuProps) {
  const t = useTranslations();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleEdit = useCallback(() => {
    onClose();
    setTimeout(() => setEditOpen(true), 0);
  }, [onClose]);

  const handleDelete = useCallback(() => {
    onClose();
    setTimeout(() => setDeleteOpen(true), 0);
  }, [onClose]);

  if (!label) return null;

  const anchorPosition = position
    ? { top: position.y, left: position.x }
    : undefined;

  // System labels can only be edited, not deleted
  const canDelete = label.type !== 'SYSTEM';

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
        <MenuItem onClick={handleEdit}>
          <ListItemIcon sx={{ minWidth: 32 }}>
            <Pencil size={16} />
          </ListItemIcon>
          <ListItemText>{t.common?.edit || 'Edit'}</ListItemText>
        </MenuItem>

        {canDelete && (
          <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
            <ListItemIcon sx={{ color: 'inherit', minWidth: 32 }}>
              <Trash2 size={16} />
            </ListItemIcon>
            <ListItemText>{t.common?.delete || 'Delete'}</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Edit Dialog */}
      <LabelDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        label={label}
      />

      {/* Delete Dialog */}
      <LabelDeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        label={label}
      />
    </>
  );
}

export default LabelContextMenu;
