/**
 * Label Picker Dialog
 *
 * Dialog for managing labels on emails.
 * Shows a list of available labels with checkboxes.
 * Supports both adding and removing labels.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Checkbox,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Alert,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { Tag, Search, Check, Plus, MoreHorizontal } from 'lucide-react';
import { useLocale } from '@/lib/hooks/use-locale';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLabels, useBulkAddLabels, useBulkRemoveLabels } from '@/hooks/queries';
import { localizeAiLabel } from '@/lib/email-triage/ai-display';
import { LabelContextMenu } from './LabelContextMenu';
import type { Label } from '@/lib/api/labels';

interface LabelPickerDialogProps {
  open: boolean;
  onClose: () => void;
  emailIds: string[];
  onSuccess?: () => void;
  /** Labels currently on the selected emails (for remove functionality) */
  currentLabelIds?: string[];
  /** T-0902: Provider type — shows local-only notice for IMAP accounts */
  providerType?: string;
}

export function LabelPickerDialog({
  open,
  onClose,
  emailIds,
  onSuccess,
  currentLabelIds = [],
  providerType,
}: LabelPickerDialogProps) {
  const t = useTranslations();
  const { locale } = useLocale();

  // Fetch labels
  const { data: labels, isLoading: isLoadingLabels } = useLabels();

  // Selected labels state (what user wants after changes)
  const [selected, setSelected] = useState<Set<string>>(new Set(currentLabelIds));
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Context menu state for edit/delete
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuLabel, setMenuLabel] = useState<Label | null>(null);

  // Bulk mutations
  const bulkAddLabels = useBulkAddLabels();
  const bulkRemoveLabels = useBulkRemoveLabels();
  const isSubmitting = bulkAddLabels.isPending || bulkRemoveLabels.isPending;

  // Track initial state to calculate diff
  const [initialLabels, setInitialLabels] = useState<Set<string>>(new Set(currentLabelIds));

  // Reset state when dialog opens
  const handleEnter = useCallback(() => {
    const initial = new Set(currentLabelIds);
    setInitialLabels(initial);
    setSelected(new Set(initial));
    setSearch('');
    setError(null);
  }, [currentLabelIds]);

  // Filter labels by search
  const filteredLabels = useMemo(() => {
    if (!labels) return [];
    if (!search.trim()) return labels;
    const searchLower = search.toLowerCase();
    return labels.filter((label) =>
      label.name.toLowerCase().includes(searchLower) ||
      localizeAiLabel(label.name, locale).toLowerCase().includes(searchLower)
    );
  }, [labels, search, locale]);

  // Toggle label selection
  const handleToggle = useCallback((labelId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(labelId)) {
        next.delete(labelId);
      } else {
        next.add(labelId);
      }
      return next;
    });
  }, []);

  // Open context menu for label edit/delete
  const handleLabelMenu = useCallback((event: React.MouseEvent<HTMLElement>, label: Label) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuLabel(label);
  }, []);

  // Close context menu
  const handleMenuClose = useCallback(() => {
    setMenuAnchor(null);
  }, []);

  // Calculate changes
  const changes = useMemo(() => {
    const toAdd: string[] = [];
    const toRemove: string[] = [];

    // Labels to add: in selected but not in initial
    selected.forEach((id) => {
      if (!initialLabels.has(id)) {
        toAdd.push(id);
      }
    });

    // Labels to remove: in initial but not in selected
    initialLabels.forEach((id) => {
      if (!selected.has(id)) {
        toRemove.push(id);
      }
    });

    return { toAdd, toRemove, hasChanges: toAdd.length > 0 || toRemove.length > 0 };
  }, [selected, initialLabels]);

  // Submit label changes
  const handleSubmit = useCallback(async () => {
    if (!changes.hasChanges) {
      onClose();
      return;
    }

    try {
      // Execute add and remove in parallel
      const promises: Promise<unknown>[] = [];

      if (changes.toAdd.length > 0) {
        promises.push(
          bulkAddLabels.mutateAsync({
            emailIds,
            labelIds: changes.toAdd,
          })
        );
      }

      if (changes.toRemove.length > 0) {
        promises.push(
          bulkRemoveLabels.mutateAsync({
            emailIds,
            labelIds: changes.toRemove,
          })
        );
      }

      await Promise.all(promises);
      onSuccess?.();
      onClose();
    } catch {
      setError(t.email?.labels?.errors?.addFailed || 'Failed to update labels. Please try again.');
    }
  }, [changes, emailIds, bulkAddLabels, bulkRemoveLabels, onSuccess, onClose, t]);

  const emailCount = emailIds.length;
  const selectedCount = selected.size;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        transition: {
          onEnter: handleEnter,
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Tag size={20} />
        {t.email?.labels?.addLabels || 'Add Labels'}
      </DialogTitle>

      <DialogContent dividers>
        {/* Email count info */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {emailCount === 1
            ? t.email?.labels?.addToEmail || 'Add labels to 1 email'
            : (t.email?.labels?.addToEmails || 'Add labels to {count} emails').replace(
                '{count}',
                String(emailCount)
              )}
        </Typography>

        {/* T-0902: IMAP local-only notice */}
        {providerType === 'imap' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {t.email?.labels?.imapLocalOnly || 'Labels on this account are local only and will not sync to the mail server.'}
          </Alert>
        )}

        {/* Search */}
        <TextField
          size="small"
          fullWidth
          placeholder={t.email?.labels?.searchLabels || 'Search labels...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={18} />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
        />

        {/* Error */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Loading */}
        {isLoadingLabels ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : filteredLabels.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary">
              {search
                ? t.email?.labels?.noLabelsFound || 'No labels found'
                : t.email?.labels?.noLabels || 'No labels created yet'}
            </Typography>
          </Box>
        ) : (
          <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
            {filteredLabels.map((label) => {
              const isSelected = selected.has(label.id);
              return (
                <ListItem
                  key={label.id}
                  disablePadding
                  secondaryAction={
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={(e) => handleLabelMenu(e, label)}
                      sx={{
                        opacity: 0,
                        '.MuiListItem-root:hover &, .MuiListItem-root:focus-within &': { opacity: 1 },
                        '@media (hover: none)': { opacity: 1 },
                        p: 0.5,
                      }}
                    >
                      <MoreHorizontal size={16} />
                    </IconButton>
                  }
                  sx={{
                    '&:hover .MuiIconButton-root': { opacity: 1 },
                  }}
                >
                  <ListItemButton onClick={() => handleToggle(label.id)} dense sx={{ pr: 5 }}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Checkbox
                        edge="start"
                        checked={isSelected}
                        tabIndex={-1}
                        disableRipple
                        size="small"
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            label={localizeAiLabel(label.name, locale)}
                            size="small"
                            sx={{
                              backgroundColor: label.color?.backgroundColor || '#9E9E9E',
                              color: label.color?.textColor || '#fff',
                              fontWeight: 500,
                            }}
                          />
                          {label._count?.emailLabels !== undefined && (
                            <Typography variant="caption" color="text.secondary">
                              ({label._count.emailLabels})
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}

        {/* Selected count */}
        {selectedCount > 0 && (
          <Typography variant="body2" color="primary" sx={{ mt: 1 }}>
            {selectedCount === 1
              ? t.email?.labels?.labelSelected || '1 label selected'
              : (t.email?.labels?.labelsSelected || '{count} labels selected').replace(
                  '{count}',
                  String(selectedCount)
                )}
          </Typography>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          {t.common.cancel}
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isSubmitting || !changes.hasChanges}
          startIcon={
            isSubmitting ? (
              <CircularProgress size={16} />
            ) : changes.hasChanges ? (
              <Check size={16} />
            ) : (
              <Plus size={16} />
            )
          }
        >
          {isSubmitting
            ? t.common.saving || 'Saving...'
            : changes.hasChanges
              ? t.common.apply || 'Apply'
              : t.email?.labels?.addSelected || 'Add Labels'}
        </Button>
      </DialogActions>

      {/* Context menu for edit/delete label */}
      <LabelContextMenu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        label={menuLabel}
      />
    </Dialog>
  );
}

export default LabelPickerDialog;
