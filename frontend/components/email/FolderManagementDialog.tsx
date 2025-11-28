'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Box,
  alpha,
  useTheme,
} from '@mui/material';
import { FolderPlus, Edit3, Trash2, AlertTriangle } from 'lucide-react';
import { foldersApi, Folder } from '@/lib/api/folders';
import { useTranslations } from '@/lib/hooks/use-translations';

export type FolderDialogMode = 'create' | 'rename' | 'delete';

interface FolderManagementDialogProps {
  open: boolean;
  mode: FolderDialogMode;
  folder?: Folder | null;
  providerId?: string;
  providerEmail?: string;
  parentPath?: string;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * FolderManagementDialog - Dialog for folder CRUD operations
 *
 * Supports:
 * - Creating new folders
 * - Renaming existing folders
 * - Deleting folders (with confirmation)
 *
 * Uses global theme colors and translations.
 */
export function FolderManagementDialog({
  open,
  mode,
  folder,
  providerId,
  providerEmail,
  parentPath,
  onClose,
  onSuccess,
}: FolderManagementDialogProps) {
  const theme = useTheme();
  const t = useTranslations();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setName(mode === 'rename' && folder ? folder.name : '');
      setError(null);
    }
  }, [open, mode, folder]);

  const handleSubmit = async () => {
    if (mode !== 'delete' && !name.trim()) {
      setError('Folder name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (mode === 'create') {
        if (!providerId) {
          setError('Provider ID is required');
          setLoading(false);
          return;
        }
        await foldersApi.createFolder({
          name: name.trim(),
          providerId,
          parentPath,
        });
      } else if (mode === 'rename') {
        if (!folder) {
          setError('Folder is required for rename');
          setLoading(false);
          return;
        }
        await foldersApi.renameFolder(folder.id, {
          newName: name.trim(),
        });
      } else if (mode === 'delete') {
        if (!folder) {
          setError('Folder is required for delete');
          setLoading(false);
          return;
        }
        await foldersApi.deleteFolder(folder.id);
      }

      onSuccess();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Operation failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'create':
        return t.dashboard?.folders?.createFolder || 'Create Folder';
      case 'rename':
        return t.dashboard?.folders?.renameFolder || 'Rename Folder';
      case 'delete':
        return t.dashboard?.folders?.deleteFolder || 'Delete Folder';
    }
  };

  const getIcon = () => {
    const iconColor = mode === 'delete' ? theme.palette.error.main : theme.palette.primary.main;
    switch (mode) {
      case 'create':
        return <FolderPlus size={20} color={iconColor} />;
      case 'rename':
        return <Edit3 size={20} color={iconColor} />;
      case 'delete':
        return <Trash2 size={20} color={iconColor} />;
    }
  };

  const getActionButtonText = () => {
    switch (mode) {
      case 'create':
        return t.common?.create || 'Create';
      case 'rename':
        return t.common?.rename || 'Rename';
      case 'delete':
        return t.common?.delete || 'Delete';
    }
  };

  const getActionButtonColor = () => {
    return mode === 'delete' ? 'error' : 'primary';
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          pb: 2,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 1,
            bgcolor: alpha(
              mode === 'delete' ? theme.palette.error.main : theme.palette.primary.main,
              0.1
            ),
          }}
        >
          {getIcon()}
        </Box>
        <Typography variant="h6" component="span">
          {getTitle()}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {mode === 'delete' ? (
          <Box>
            <Alert
              severity="warning"
              icon={<AlertTriangle size={20} />}
              sx={{
                mb: 2,
                bgcolor: alpha(theme.palette.warning.main, 0.1),
                '& .MuiAlert-icon': {
                  color: theme.palette.warning.main,
                },
              }}
            >
              {t.dashboard?.folders?.deleteWarning ||
                'This action cannot be undone. All emails in this folder will be permanently deleted.'}
            </Alert>
            <Typography variant="body1" color="text.primary">
              {t.dashboard?.folders?.deleteConfirm || 'Are you sure you want to delete the folder'}{' '}
              <Box component="span" sx={{ fontWeight: 600, color: 'error.main' }}>
                &quot;{folder?.name}&quot;
              </Box>
              ?
            </Typography>
            {folder?.path && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  mt: 1.5,
                  display: 'block',
                  bgcolor: alpha(theme.palette.text.secondary, 0.05),
                  px: 1.5,
                  py: 0.75,
                  borderRadius: 1,
                }}
              >
                {t.common?.path || 'Path'}: {folder.path}
              </Typography>
            )}
          </Box>
        ) : (
          <Box>
            {providerEmail && (
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                <Box component="span" sx={{ fontWeight: 600 }}>
                  {t.common?.provider || 'Provider'}:
                </Box>{' '}
                {providerEmail}
              </Typography>
            )}
            {parentPath && (
              <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                <Box component="span" sx={{ fontWeight: 600 }}>
                  {t.common?.parent || 'Parent'}:
                </Box>{' '}
                {parentPath}
              </Typography>
            )}
            <TextField
              autoFocus
              fullWidth
              label={t.dashboard?.folders?.folderName || 'Folder Name'}
              placeholder={t.dashboard?.folders?.enterNewName || 'Enter folder name'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              error={!!error && !name.trim()}
              sx={{ mt: 1 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading && name.trim()) {
                  handleSubmit();
                }
              }}
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button onClick={onClose} disabled={loading}>
          {t.common?.cancel || 'Cancel'}
        </Button>
        <Button
          variant="contained"
          color={getActionButtonColor()}
          onClick={handleSubmit}
          disabled={loading || (mode !== 'delete' && !name.trim())}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {loading ? (t.common?.processing || 'Processing...') : getActionButtonText()}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default FolderManagementDialog;
