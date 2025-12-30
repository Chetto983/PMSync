/**
 * Label Dialog Component
 *
 * Dialog for creating and editing email labels.
 * Uses slotProps.transition.onEnter for form reset.
 */

import React, { useState, useCallback } from 'react';
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
} from '@mui/material';
import { Tag } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useCreateLabel, useUpdateLabel } from '@/hooks/queries';
import { LabelColorPicker } from './LabelColorPicker';
import { DEFAULT_LABEL_COLOR, type LabelColor } from '@/lib/label-colors';
import type { Label } from '@/lib/api/labels';

interface LabelDialogProps {
  open: boolean;
  onClose: () => void;
  label?: Label | null;
  onSuccess?: (label: Label) => void;
}

export function LabelDialog({
  open,
  onClose,
  label,
  onSuccess,
}: LabelDialogProps) {
  const t = useTranslations();
  const isEditMode = !!label;

  // Form state
  const [name, setName] = useState('');
  const [color, setColor] = useState<LabelColor>(DEFAULT_LABEL_COLOR);
  const [error, setError] = useState<string | null>(null);

  // Mutations
  const createLabel = useCreateLabel();
  const updateLabel = useUpdateLabel();
  const isLoading = createLabel.isPending || updateLabel.isPending;

  // Reset form when dialog opens
  const handleEnter = useCallback(() => {
    setName(label?.name ?? '');
    setColor(label?.color ?? DEFAULT_LABEL_COLOR);
    setError(null);
  }, [label]);

  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError(t.email?.labels?.errors?.nameRequired || 'Il nome è obbligatorio');
      return;
    }

    if (trimmedName.length < 2) {
      setError(t.email?.labels?.errors?.nameTooShort || 'Il nome deve essere almeno 2 caratteri');
      return;
    }

    try {
      if (isEditMode && label) {
        const response = await updateLabel.mutateAsync({
          labelId: label.id,
          dto: { name: trimmedName, color },
        });
        onSuccess?.(response.label);
      } else {
        const response = await createLabel.mutateAsync({
          name: trimmedName,
          color,
        });
        onSuccess?.(response.label);
      }
      onClose();
    } catch (err: unknown) {
      // Check for 409 Conflict (duplicate name)
      const error = err as { response?: { status?: number } };
      if (error?.response?.status === 409) {
        setError(t.email?.labels?.errors?.nameExists || 'Esiste già un\'etichetta con questo nome.');
      } else {
        setError(
          t.email?.labels?.errors?.saveFailed ||
            'Errore durante il salvataggio. Riprova.'
        );
      }
    }
  }, [name, color, isEditMode, label, createLabel, updateLabel, onClose, onSuccess, t]);

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
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tag size={20} />
          <Typography variant="h6" component="span">
            {isEditMode
              ? t.email?.labels?.editLabel || 'Modifica etichetta'
              : t.email?.labels?.createLabel || 'Nuova etichetta'}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert
            severity="error"
            sx={{ mb: 2 }}
            onClose={() => setError(null)}
          >
            {error}
          </Alert>
        )}

        <TextField
          autoFocus
          fullWidth
          label={t.email?.labels?.nameLabel || 'Nome'}
          placeholder={t.email?.labels?.namePlaceholder || 'es. Lavoro, Personale...'}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          error={!!error && !name.trim()}
          sx={{ mb: 3 }}
        />

        <LabelColorPicker
          selectedColor={color}
          onColorSelect={setColor}
          showCustom={true}
        />

        {/* Preview */}
        <Box sx={{ mt: 3 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            {t.email?.labels?.preview || 'Anteprima'}
          </Typography>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1.5,
              py: 0.5,
              bgcolor: color.backgroundColor,
              color: color.textColor,
              borderRadius: 1,
              fontSize: '0.75rem',
              fontWeight: 500,
            }}
          >
            <Tag size={12} />
            {name.trim() || t.email?.labels?.namePlaceholder || 'Nome etichetta'}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={isLoading} color="inherit">
          {t.common?.cancel || 'Annulla'}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isLoading || !name.trim()}
          variant="contained"
          startIcon={
            isLoading ? <CircularProgress size={16} color="inherit" /> : null
          }
        >
          {isEditMode
            ? t.common?.save || 'Salva'
            : t.email?.labels?.create || 'Crea'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default LabelDialog;
