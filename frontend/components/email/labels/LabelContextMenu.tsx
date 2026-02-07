/**
 * Label Context Menu Component
 *
 * Context menu for label actions: Edit, Add child, Change color, Move to, Delete.
 * Pattern: menu closes first, dialog opens via setTimeout(0).
 *
 * @see https://github.com/mui/material-ui/issues/6648
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material';
import { Pencil, Plus, Palette, FolderInput, Trash2 } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLabels, useMoveLabel } from '@/hooks/queries';
import { getDescendantIdsFlat, MAX_DEPTH } from '@/lib/label-tree-utils';
import { LabelDialog } from './LabelDialog';
import { LabelDeleteDialog } from './LabelDeleteDialog';
import type { Label } from '@/lib/api/labels';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LabelContextMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  label: Label | null;
  position?: { x: number; y: number };
  /** Called when "Add child label" is selected */
  onAddChild?: (parentId: string) => void;
}

// ---------------------------------------------------------------------------
// MoveToDialog
// ---------------------------------------------------------------------------

function MoveToDialog({
  open,
  onClose,
  label,
}: {
  open: boolean;
  onClose: () => void;
  label: Label;
}) {
  const t = useTranslations();
  const moveLabel = useMoveLabel();
  const { data: allLabels } = useLabels();
  const [targetParentId, setTargetParentId] = useState<string>('');

  // Reset selection when dialog opens
  const handleEnter = useCallback(() => {
    setTargetParentId(label.parentId ?? '');
  }, [label.parentId]);

  // Available targets: exclude self, descendants, and labels at max depth
  const availableTargets = useMemo(() => {
    if (!allLabels) return [];
    const userLabels = allLabels.filter(
      (l) => l.type === 'USER' && !l.isArchived,
    );
    const descendantIds = new Set(getDescendantIdsFlat(userLabels, label.id));
    descendantIds.add(label.id);

    return userLabels.filter((l) => !descendantIds.has(l.id));
  }, [allLabels, label.id]);

  const handleMove = useCallback(async () => {
    const parentId = targetParentId || null;
    // Don't move if parentId hasn't changed
    if (parentId === (label.parentId ?? null)) {
      onClose();
      return;
    }
    await moveLabel.mutateAsync({
      labelId: label.id,
      parentId,
      orderIndex: 0, // Put at beginning of new parent
    });
    onClose();
  }, [targetParentId, label, moveLabel, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: { sx: { borderRadius: 2 } },
        transition: { onEnter: handleEnter },
      }}
    >
      <DialogTitle>
        {t.email?.labels?.moveTo || 'Move to...'}
      </DialogTitle>
      <DialogContent>
        <FormControl fullWidth sx={{ mt: 1 }}>
          <InputLabel>
            {t.email?.labels?.parentLabel || 'Parent Label'}
          </InputLabel>
          <Select
            value={targetParentId}
            onChange={(e) => setTargetParentId(e.target.value as string)}
            label={t.email?.labels?.parentLabel || 'Parent Label'}
          >
            <MenuItem value="">
              {t.email?.labels?.noParent || 'None (top level)'}
            </MenuItem>
            {availableTargets.map((l) => (
              <MenuItem
                key={l.id}
                value={l.id}
                disabled={l.level >= MAX_DEPTH - 1}
              >
                {'  '.repeat(l.level)}
                {l.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          {t.common?.cancel || 'Cancel'}
        </Button>
        <Button
          onClick={handleMove}
          variant="contained"
          disabled={moveLabel.isPending}
        >
          {t.common?.save || 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// LabelContextMenu
// ---------------------------------------------------------------------------

export function LabelContextMenu({
  anchorEl,
  open,
  onClose,
  label,
  position,
  onAddChild,
}: LabelContextMenuProps) {
  const t = useTranslations();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  // "Change color" opens the edit dialog (which has the color picker)
  const [colorEditOpen, setColorEditOpen] = useState(false);

  const handleEdit = useCallback(() => {
    onClose();
    setTimeout(() => setEditOpen(true), 0);
  }, [onClose]);

  const handleAddChild = useCallback(() => {
    onClose();
    if (label && onAddChild) {
      setTimeout(() => onAddChild(label.id), 0);
    }
  }, [onClose, label, onAddChild]);

  const handleChangeColor = useCallback(() => {
    onClose();
    setTimeout(() => setColorEditOpen(true), 0);
  }, [onClose]);

  const handleMoveTo = useCallback(() => {
    onClose();
    setTimeout(() => setMoveOpen(true), 0);
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
  // Only USER labels can have children and be moved
  const canNest = label.type === 'USER';

  return (
    <>
      <Menu
        anchorEl={position ? undefined : anchorEl}
        anchorReference={position ? 'anchorPosition' : 'anchorEl'}
        anchorPosition={anchorPosition}
        open={open}
        onClose={onClose}
        slotProps={{
          paper: { sx: { minWidth: 180, borderRadius: 2 } },
        }}
      >
        <MenuItem onClick={handleEdit}>
          <ListItemIcon sx={{ minWidth: 32 }}>
            <Pencil size={16} />
          </ListItemIcon>
          <ListItemText>{t.common?.edit || 'Edit'}</ListItemText>
        </MenuItem>

        {canNest && (
          <MenuItem onClick={handleAddChild}>
            <ListItemIcon sx={{ minWidth: 32 }}>
              <Plus size={16} />
            </ListItemIcon>
            <ListItemText>
              {t.email?.labels?.addChildLabel || 'Add child label'}
            </ListItemText>
          </MenuItem>
        )}

        <MenuItem onClick={handleChangeColor}>
          <ListItemIcon sx={{ minWidth: 32 }}>
            <Palette size={16} />
          </ListItemIcon>
          <ListItemText>
            {t.email?.labels?.changeColor || 'Change color'}
          </ListItemText>
        </MenuItem>

        {canNest && (
          <MenuItem onClick={handleMoveTo}>
            <ListItemIcon sx={{ minWidth: 32 }}>
              <FolderInput size={16} />
            </ListItemIcon>
            <ListItemText>
              {t.email?.labels?.moveTo || 'Move to...'}
            </ListItemText>
          </MenuItem>
        )}

        {canDelete && <Divider />}

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

      {/* Change Color Dialog (opens edit dialog - color picker is inside) */}
      <LabelDialog
        open={colorEditOpen}
        onClose={() => setColorEditOpen(false)}
        label={label}
      />

      {/* Move To Dialog */}
      {canNest && (
        <MoveToDialog
          open={moveOpen}
          onClose={() => setMoveOpen(false)}
          label={label}
        />
      )}

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
