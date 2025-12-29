/**
 * Label Dialog Component
 *
 * Dialog for creating and editing email labels.
 * Uses controlled state for simple form management.
 *
 * Features:
 * - Create new labels
 * - Edit existing labels
 * - Color picker integration
 * - Name validation
 *
 * @see D:\MailAgent\esempio\Zero-staging\apps\mail\components\labels\label-dialog.tsx
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
} from '@mui/material';
import { Tag } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useCreateLabel, useUpdateLabel } from '@/hooks/queries';
import { LabelColorPicker } from './LabelColorPicker';
import { DEFAULT_LABEL_COLOR, type LabelColor } from '@/lib/label-colors';
import type { Label } from '@/lib/api/labels';

interface LabelDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog closes */
  onClose: () => void;
  /** Label to edit (null for create mode) */
  label?: Label | null;
  /** Callback after successful save */
  onSuccess?: (label: Label) => void;
}

/**
 * LabelDialog - Create/Edit label dialog
 *
 * Modes:
 * - Create: No label prop, creates new label
 * - Edit: Label prop provided, updates existing
 */
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

  // Reset form when dialog opens or label changes
  useEffect(() => {
    if (open) {
      if (label) {
        setName(label.name);
        setColor(label.color || DEFAULT_LABEL_COLOR);
      } else {
        setName('');
        setColor(DEFAULT_LABEL_COLOR);
      }
      setError(null);
    }
  }, [open, label]);

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    // Validate name
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
        // Update existing label
        const response = await updateLabel.mutateAsync({
          labelId: label.id,
          dto: { name: trimmedName, color },
        });
        onSuccess?.(response.label);
      } else {
        // Create new label
        const response = await createLabel.mutateAsync({
          name: trimmedName,
          color,
        });
        onSuccess?.(response.label);
      }
      onClose();
    } catch (err) {
      setError(
        t.email?.labels?.errors?.saveFailed ||
          'Errore durante il salvataggio. Riprova.'
      );
    }
  }, [name, color, isEditMode, label, createLabel, updateLabel, onClose, onSuccess, t]);

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
          <Tag size={20} />
          <Typography variant="h6" component="span">
            {isEditMode
              ? t.email?.labels?.editLabel || 'Modifica etichetta'
              : t.email?.labels?.createLabel || 'Nuova etichetta'}
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

        {/* Name Field */}
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
          onKeyPress={handleKeyPress}
          disabled={isLoading}
          error={!!error && !name.trim()}
          sx={{ mb: 3 }}
          slotProps={{
            input: {
              sx: { borderRadius: 1.5 },
            },
          }}
        />

        {/* Color Picker */}
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
        <Button
          onClick={handleClose}
          disabled={isLoading}
          color="inherit"
        >
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
