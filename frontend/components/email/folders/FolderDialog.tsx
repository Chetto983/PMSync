/**
 * Folder Dialog Component
 *
 * Dialog for creating and renaming email folders.
 * Uses key prop for state reset on folder change.
 */

import React, { useState, useCallback, useMemo } from 'react';
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
  open: boolean;
  onClose: () => void;
  folder?: FolderType | null;
  providerId?: string;
  onSuccess?: (folder: { id: string; name: string; path: string }) => void;
}

export function FolderDialog({
  open,
  onClose,
  folder,
  providerId: initialProviderId,
  onSuccess,
}: FolderDialogProps) {
  const t = useTranslations();
  const isEditMode = !!folder;

  // Fetch providers
  const { data: foldersData } = useFolders();
  const providers = useMemo(
    () => foldersData?.providers || [],
    [foldersData?.providers]
  );

  // Form state
  const [name, setName] = useState('');
  const [providerId, setProviderId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Mutations
  const createFolder = useCreateFolder();
  const renameFolder = useRenameFolder();
  const isLoading = createFolder.isPending || renameFolder.isPending;

  // Sync providerId when initialProviderId changes or dialog opens
  React.useEffect(() => {
    if (open) {
      setName(folder?.name ?? '');
      setProviderId(
        folder?.providerId ?? initialProviderId ?? providers[0]?.id ?? ''
      );
      setError(null);
    }
  }, [open, folder, initialProviderId, providers]);

  // Reset form when dialog opens (for transition animation timing)
  const handleEnter = useCallback(() => {
    // Form state is now synced via useEffect, but keep this for backwards compat
    if (!providerId && (initialProviderId || providers[0]?.id)) {
      setProviderId(
        folder?.providerId ?? initialProviderId ?? providers[0]?.id ?? ''
      );
    }
  }, [folder, initialProviderId, providers, providerId]);

  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError(t.folders?.errors?.nameRequired || 'Il nome è obbligatorio');
      return;
    }

    if (!isEditMode && !providerId) {
      setError(t.folders?.errors?.providerRequired || 'Seleziona un account');
      return;
    }

    try {
      if (isEditMode && folder) {
        const response = await renameFolder.mutateAsync({
          folderId: folder.id,
          newName: trimmedName,
          providerId: folder.providerId,
        });
        onSuccess?.(response);
      } else {
        const response = await createFolder.mutateAsync({
          name: trimmedName,
          providerId,
        });
        onSuccess?.(response);
      }
      onClose();
    } catch {
      setError(
        t.folders?.errors?.saveFailed ||
          'Errore durante il salvataggio. Riprova.'
      );
    }
  }, [
    name,
    providerId,
    isEditMode,
    folder,
    createFolder,
    renameFolder,
    onClose,
    onSuccess,
    t,
  ]);

  const handleClose = useCallback(() => {
    if (!isLoading) {
      onClose();
    }
  }, [isLoading, onClose]);

  const handleKeyDown = useCallback(
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
      slotProps={{
        paper: { sx: { borderRadius: 2 } },
        transition: { onEnter: handleEnter },
      }}
    >
      <DialogTitle sx={{ pb: 2, pt: 2.5, px: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {isEditMode ? <Folder size={20} /> : <FolderPlus size={20} />}
          <Typography variant="h6" component="span">
            {isEditMode
              ? t.folders?.renameFolder || 'Rinomina cartella'
              : t.folders?.createFolder || 'Nuova cartella'}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 0, px: 3, pb: 2 }}>
        {error && (
          <Alert
            severity="error"
            sx={{ mb: 2 }}
            onClose={() => setError(null)}
          >
            {error}
          </Alert>
        )}

        {!isEditMode && providers.length > 1 && (
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>{t.folders?.selectAccount || 'Account'}</InputLabel>
            <Select
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
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          error={!!error && !name.trim()}
        />

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

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 2, gap: 1 }}>
        <Button
          onClick={handleClose}
          disabled={isLoading}
          color="inherit"
          sx={{ minWidth: 80 }}
        >
          {t.common?.cancel || 'Annulla'}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isLoading || !name.trim() || (!isEditMode && !providerId)}
          variant="contained"
          sx={{ minWidth: 80 }}
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
