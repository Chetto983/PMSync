/**
 * Folder Dialog Component
 *
 * Dialog for creating and renaming email folders.
 * Uses controlled state for simple form management.
 *
 * Features:
 * - Create new folders (requires provider selection)
 * - Rename existing folders
 * - Name validation
 *
 * @see D:\MailAgent\frontend\components\email\labels\LabelDialog.tsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { FolderPlus, Folder } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useFolders, useCreateFolder, useRenameFolder } from '@/hooks/queries';
import type { Folder as FolderType, Provider } from '@/lib/api/folders';

interface FolderDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog closes */
  onClose: () => void;
  /** Folder to edit (null for create mode) */
  folder?: FolderType | null;
  /** Pre-selected provider ID for create mode */
  providerId?: string;
  /** Callback after successful save */
  onSuccess?: (folder: { id: string; name: string; path: string }) => void;
}

/**
 * FolderDialog - Create/Rename folder dialog
 *
 * Modes:
 * - Create: No folder prop, creates new folder in selected provider
 * - Rename: Folder prop provided, renames existing folder
 */
export function FolderDialog({
  open,
  onClose,
  folder,
  providerId: initialProviderId,
  onSuccess,
}: FolderDialogProps) {
  const t = useTranslations();
  const isEditMode = !!folder;

  // Form state
  const [name, setName] = useState('');
  const [providerId, setProviderId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fetch providers for create mode
  const { data: foldersData } = useFolders();
  const providers = foldersData?.providers || [];

  // Mutations
  const createFolder = useCreateFolder();
  const renameFolder = useRenameFolder();

  const isLoading = createFolder.isPending || renameFolder.isPending;

  // Reset form when dialog opens or folder changes
  useEffect(() => {
    if (open) {
      if (folder) {
        setName(folder.name);
        setProviderId(folder.providerId);
      } else {
        setName('');
        setProviderId(initialProviderId || providers[0]?.id || '');
      }
      setError(null);
    }
  }, [open, folder, initialProviderId, providers]);

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    // Validate name
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t.folders?.errors?.nameRequired || 'Il nome è obbligatorio');
      return;
    }

    if (trimmedName.length < 1) {
      setError(t.folders?.errors?.nameTooShort || 'Il nome deve essere almeno 1 carattere');
      return;
    }

    // Validate provider for create mode
    if (!isEditMode && !providerId) {
      setError(t.folders?.errors?.providerRequired || 'Seleziona un account');
      return;
    }

    try {
      if (isEditMode && folder) {
        // Rename existing folder
        const response = await renameFolder.mutateAsync({
          folderId: folder.id,
          newName: trimmedName,
          providerId: folder.providerId,
        });
        onSuccess?.(response);
      } else {
        // Create new folder
        const response = await createFolder.mutateAsync({
          name: trimmedName,
          providerId,
        });
        onSuccess?.(response);
      }
      onClose();
    } catch (err) {
      setError(
        t.folders?.errors?.saveFailed ||
          'Errore durante il salvataggio. Riprova.'
      );
    }
  }, [name, providerId, isEditMode, folder, createFolder, renameFolder, onClose, onSuccess, t]);

  // Handle close
  const handleClose = useCallback(() => {
    if (!isLoading) {
      onClose();
    }
  }, [isLoading, onClose]);

  // Handle key press for Enter to submit
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isLoading) {
        handleSubmit();
      }
    },
    [handleSubmit, isLoading]
  );

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      keepMounted
      PaperProps={{
        sx: { borderRadius: 2 },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isEditMode ? <Folder size={20} /> : <FolderPlus size={20} />}
          <Typography variant="h6" component="span">
            {isEditMode
              ? t.folders?.renameFolder || 'Rinomina cartella'
              : t.folders?.createFolder || 'Nuova cartella'}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Provider Select (only for create mode) */}
        {!isEditMode && providers.length > 1 && (
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel id="provider-select-label">
              {t.folders?.selectAccount || 'Account'}
            </InputLabel>
            <Select
              labelId="provider-select-label"
              value={providerId}
              label={t.folders?.selectAccount || 'Account'}
              onChange={(e) => {
                setProviderId(e.target.value);
                setError(null);
              }}
              disabled={isLoading}
            >
              {providers.map((provider: Provider) => (
                <MenuItem key={provider.id} value={provider.id}>
                  {provider.displayName || provider.email}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {/* Name Field */}
        <TextField
          autoFocus
          fullWidth
          label={t.folders?.nameLabel || 'Nome cartella'}
          placeholder={t.folders?.namePlaceholder || 'es. Progetti, Clienti...'}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyPress={handleKeyPress}
          disabled={isLoading}
          error={!!error && !name.trim()}
          slotProps={{
            input: {
              sx: { borderRadius: 1.5 },
            },
          }}
        />

        {/* Folder path preview for create mode */}
        {!isEditMode && providerId && name.trim() && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {t.folders?.willBeCreatedAs || 'Sarà creata come'}:
            </Typography>
            <Box
              sx={{
                mt: 0.5,
                p: 1,
                bgcolor: 'action.hover',
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Folder size={16} />
              <Typography variant="body2" fontFamily="monospace">
                {name.trim()}
              </Typography>
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={handleClose}
          disabled={isLoading}
          color="inherit"
        >
          {t.common?.cancel || 'Annulla'}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isLoading || !name.trim() || (!isEditMode && !providerId)}
          variant="contained"
          startIcon={
            isLoading ? <CircularProgress size={16} color="inherit" /> : null
          }
        >
          {isEditMode
            ? t.common?.save || 'Salva'
            : t.folders?.create || 'Crea'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default FolderDialog;
