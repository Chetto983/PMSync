/**
 * Label Dialog Component
 *
 * Dialog for creating and editing email labels.
 * Supports parent label selection for nesting.
 * Uses slotProps.transition.onEnter for form reset.
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
import { Tag } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useCreateLabel, useUpdateLabel, useLabels } from '@/hooks/queries';
import { LabelColorPicker } from './LabelColorPicker';
import { DEFAULT_LABEL_COLOR, type LabelColor } from '@/lib/label-colors';
import { getDescendantIdsFlat, MAX_DEPTH } from '@/lib/label-tree-utils';
import type { Label } from '@/lib/api/labels';

interface LabelDialogProps {
  open: boolean;
  onClose: () => void;
  label?: Label | null;
  onSuccess?: (label: Label) => void;
  /** Pre-selected parent ID (e.g., from "Add child label" action) */
  defaultParentId?: string;
}

export function LabelDialog({
  open,
  onClose,
  label,
  onSuccess,
  defaultParentId,
}: LabelDialogProps) {
  const t = useTranslations();
  const isEditMode = !!label;

  // Fetch all labels for parent dropdown
  const { data: allLabels } = useLabels();

  // Form state
  const [name, setName] = useState('');
  const [color, setColor] = useState<LabelColor>(DEFAULT_LABEL_COLOR);
  const [parentId, setParentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mutations
  const createLabel = useCreateLabel();
  const updateLabel = useUpdateLabel();
  const isLoading = createLabel.isPending || updateLabel.isPending;

  // Available parents: USER labels, exclude self and descendants (prevent circular)
  const availableParents = useMemo(() => {
    if (!allLabels) return [];
    const userLabels = allLabels.filter((l) => l.type === 'USER' && !l.isArchived);

    if (!isEditMode || !label) return userLabels;

    // Exclude self and all descendants
    const descendantIds = new Set(getDescendantIdsFlat(userLabels, label.id));
    descendantIds.add(label.id);

    return userLabels.filter((l) => !descendantIds.has(l.id));
  }, [allLabels, isEditMode, label]);

  // Reset form when dialog opens
  const handleEnter = useCallback(() => {
    setName(label?.name ?? '');
    setColor(label?.color ?? DEFAULT_LABEL_COLOR);
    setParentId(label?.parentId ?? defaultParentId ?? null);
    setError(null);
  }, [label, defaultParentId]);

  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError(t.email?.labels?.errors?.nameRequired || 'Name is required');
      return;
    }

    if (trimmedName.length < 2) {
      setError(
        t.email?.labels?.errors?.nameTooShort ||
          'Name must be at least 2 characters',
      );
      return;
    }

    try {
      if (isEditMode && label) {
        const response = await updateLabel.mutateAsync({
          labelId: label.id,
          dto: {
            name: trimmedName,
            color,
            parentId: parentId ?? null,
          },
        });
        onSuccess?.(response.label);
      } else {
        const response = await createLabel.mutateAsync({
          name: trimmedName,
          color,
          parentId: parentId ?? undefined,
        });
        onSuccess?.(response.label);
      }
      onClose();
    } catch (err: unknown) {
      // Check for 409 Conflict (duplicate name)
      const apiErr = err as { response?: { status?: number } };
      if (apiErr?.response?.status === 409) {
        setError(
          t.email?.labels?.errors?.nameExists ||
            'A label with this name already exists.',
        );
      } else {
        setError(
          t.email?.labels?.errors?.saveFailed ||
            'Failed to save. Please try again.',
        );
      }
    }
  }, [
    name,
    color,
    parentId,
    isEditMode,
    label,
    createLabel,
    updateLabel,
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
    [handleSubmit, isLoading],
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
              ? t.email?.labels?.editLabel || 'Edit Label'
              : t.email?.labels?.createLabel || 'Create Label'}
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
          label={t.email?.labels?.nameLabel || 'Name'}
          placeholder={
            t.email?.labels?.namePlaceholder || 'e.g. Work, Personal...'
          }
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          error={!!error && !name.trim()}
          sx={{ mb: 2 }}
        />

        {/* Parent label dropdown */}
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>
            {t.email?.labels?.parentLabel || 'Parent Label'}
          </InputLabel>
          <Select
            value={parentId ?? ''}
            onChange={(e) => setParentId(e.target.value || null)}
            label={t.email?.labels?.parentLabel || 'Parent Label'}
            disabled={isLoading}
          >
            <MenuItem value="">
              {t.email?.labels?.noParent || 'None (top level)'}
            </MenuItem>
            {availableParents.map((parent) => (
              <MenuItem
                key={parent.id}
                value={parent.id}
                disabled={parent.level >= MAX_DEPTH - 1}
              >
                {'  '.repeat(parent.level)}
                {parent.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <LabelColorPicker
          selectedColor={color}
          onColorSelect={setColor}
          showCustom={false}
        />

        {/* Preview */}
        <Box sx={{ mt: 3 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mb: 1, display: 'block' }}
          >
            {t.email?.labels?.preview || 'Preview'}
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
            {name.trim() || t.email?.labels?.namePlaceholder || 'Label name'}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={isLoading} color="inherit">
          {t.common?.cancel || 'Cancel'}
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
            ? t.common?.save || 'Save'
            : t.email?.labels?.create || 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default LabelDialog;
