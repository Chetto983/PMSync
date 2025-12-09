import React, { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormGroup,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Alert,
  Box,
  Chip,
} from '@mui/material';
import { labelsApi, type Label } from '@/lib/api/labels';
import { useTranslations } from '@/lib/hooks/use-translations';

interface LabelSelectorDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (labelIds: string[]) => void;
  selectedCount: number;
}

/**
 * LabelSelectorDialog - Dialog for selecting labels to apply to emails
 *
 * Features:
 * - Lists all available labels
 * - Multi-selection with checkboxes
 * - Loading and error states
 */
export const LabelSelectorDialog: React.FC<LabelSelectorDialogProps> = ({
  open,
  onClose,
  onSelect,
  selectedCount,
}) => {
  const t = useTranslations();
  const [labels, setLabels] = useState<Label[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load labels when dialog opens
  useEffect(() => {
    if (open) {
      loadLabels();
    } else {
      // Reset selection when dialog closes
      setSelectedLabels(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const loadLabels = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await labelsApi.listLabels();
      setLabels(response.labels || []);
    } catch (err) {
      logger.error('Failed to load labels', { error: err });
      setError(t.email.messages.loadLabelsFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleLabel = (labelId: string) => {
    const newSelection = new Set(selectedLabels);
    if (newSelection.has(labelId)) {
      newSelection.delete(labelId);
    } else {
      newSelection.add(labelId);
    }
    setSelectedLabels(newSelection);
  };

  const handleApply = () => {
    onSelect(Array.from(selectedLabels));
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {t.email.bulkBar.addLabels} ({selectedCount} selected)
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : labels.length === 0 ? (
          <Alert severity="info">{t.email.labels.noLabels}</Alert>
        ) : (
          <FormGroup>
            {labels.map((label) => (
              <FormControlLabel
                key={label.id}
                control={
                  <Checkbox
                    checked={selectedLabels.has(label.id)}
                    onChange={() => handleToggleLabel(label.id)}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      label={label.name}
                      size="small"
                      sx={{
                        bgcolor: label.color?.backgroundColor || '#9E9E9E',
                        color: label.color?.textColor || '#fff',
                      }}
                    />
                  </Box>
                }
              />
            ))}
          </FormGroup>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t.common.cancel}</Button>
        <Button
          onClick={handleApply}
          variant="contained"
          disabled={selectedLabels.size === 0 || loading}
        >
          {t.common.save}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
