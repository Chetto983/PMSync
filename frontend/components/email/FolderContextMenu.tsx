'use client';

import React from 'react';
import { Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import { FolderPlus, Edit3, Trash2, RefreshCw, FolderInput } from 'lucide-react';
import type { Folder } from '@/lib/api/folders';

interface FolderContextMenuProps {
  anchorEl: HTMLElement | null;
  folder: Folder | null;
  providerId?: string;
  providerEmail?: string;
  onClose: () => void;
  onCreateFolder: (parentPath?: string) => void;
  onRenameFolder: (folder: Folder) => void;
  onDeleteFolder: (folder: Folder) => void;
  onRefreshFolder?: (folder: Folder) => void;
  onMoveEmails?: (folder: Folder) => void;
}

export function FolderContextMenu({
  anchorEl,
  folder,
  // These props are available for future use (e.g., displaying provider info)
  providerId: _providerId,
  providerEmail: _providerEmail,
  onClose,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onRefreshFolder,
  onMoveEmails,
}: FolderContextMenuProps) {
  const open = Boolean(anchorEl);

  // Suppress unused variable warnings
  void _providerId;
  void _providerEmail;

  // Check if folder is a system folder that cannot be deleted/renamed
  const isSystemFolder = !!(folder?.specialUse && [
    'INBOX',
    'SENT',
    'DRAFTS',
    'TRASH',
    'SPAM',
    'JUNK',
    'ARCHIVE',
  ].includes(folder.specialUse));

  const handleCreateSubfolder = () => {
    onCreateFolder(folder?.path);
    onClose();
  };

  const handleRename = () => {
    if (folder) {
      onRenameFolder(folder);
    }
    onClose();
  };

  const handleDelete = () => {
    if (folder) {
      onDeleteFolder(folder);
    }
    onClose();
  };

  const handleRefresh = () => {
    if (folder && onRefreshFolder) {
      onRefreshFolder(folder);
    }
    onClose();
  };

  const handleMoveEmails = () => {
    if (folder && onMoveEmails) {
      onMoveEmails(folder);
    }
    onClose();
  };

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'left',
      }}
      transformOrigin={{
        vertical: 'top',
        horizontal: 'left',
      }}
      slotProps={{
        paper: {
          sx: {
            minWidth: 180,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            borderRadius: 1.5,
          },
        },
      }}
    >
      {/* Create subfolder option */}
      <MenuItem onClick={handleCreateSubfolder}>
        <ListItemIcon>
          <FolderPlus size={18} />
        </ListItemIcon>
        <ListItemText>Create Subfolder</ListItemText>
      </MenuItem>

      {/* Move emails to folder */}
      {onMoveEmails && (
        <MenuItem onClick={handleMoveEmails}>
          <ListItemIcon>
            <FolderInput size={18} />
          </ListItemIcon>
          <ListItemText>Move Emails Here</ListItemText>
        </MenuItem>
      )}

      {/* Refresh folder */}
      {onRefreshFolder && (
        <MenuItem onClick={handleRefresh}>
          <ListItemIcon>
            <RefreshCw size={18} />
          </ListItemIcon>
          <ListItemText>Refresh</ListItemText>
        </MenuItem>
      )}

      <Divider />

      {/* Rename option - disabled for system folders */}
      <MenuItem onClick={handleRename} disabled={isSystemFolder}>
        <ListItemIcon>
          <Edit3 size={18} />
        </ListItemIcon>
        <ListItemText>
          Rename
          {isSystemFolder && (
            <span style={{ fontSize: '0.75rem', color: '#999', marginLeft: 8 }}>
              (System folder)
            </span>
          )}
        </ListItemText>
      </MenuItem>

      {/* Delete option - disabled for system folders */}
      <MenuItem
        onClick={handleDelete}
        disabled={isSystemFolder}
        sx={{
          color: isSystemFolder ? 'text.disabled' : 'error.main',
          '&:hover': {
            bgcolor: isSystemFolder ? undefined : 'error.light',
          },
        }}
      >
        <ListItemIcon sx={{ color: isSystemFolder ? 'text.disabled' : 'error.main' }}>
          <Trash2 size={18} />
        </ListItemIcon>
        <ListItemText>
          Delete
          {isSystemFolder && (
            <span style={{ fontSize: '0.75rem', color: '#999', marginLeft: 8 }}>
              (System folder)
            </span>
          )}
        </ListItemText>
      </MenuItem>
    </Menu>
  );
}

export default FolderContextMenu;
