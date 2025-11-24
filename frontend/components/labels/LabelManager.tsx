import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  List,
  ListItem,
  IconButton,
  Box,
  Typography,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import { Plus, Edit2, Trash2, X } from 'lucide-react';
import { useLabelStore } from '@/stores/label-store';
import { LabelColorPicker } from './LabelColorPicker';
import { useTranslations } from '@/lib/hooks/use-translations';
import { labelColorToHex } from '@/lib/api/labels';

interface LabelManagerProps {
  open: boolean;
  onClose: () => void;
}

const LABEL_COLORS = [
  '#F44336', // Red
  '#E91E63', // Pink
  '#9C27B0', // Purple
  '#673AB7', // Deep Purple
  '#3F51B5', // Indigo
  '#2196F3', // Blue
  '#03A9F4', // Light Blue
  '#00BCD4', // Cyan
  '#009688', // Teal
  '#4CAF50', // Green
  '#8BC34A', // Light Green
  '#CDDC39', // Lime
  '#FFEB3B', // Yellow
  '#FFC107', // Amber
  '#FF9800', // Orange
  '#FF5722', // Deep Orange
  '#795548', // Brown
  '#9E9E9E', // Grey
  '#607D8B', // Blue Grey
];

/**
 * LabelManager - Dialog for managing user labels
 *
 * Features:
 * - Create new labels with name and color
 * - Edit existing labels
 * - Delete labels
 * - Reorder labels (future: drag & drop)
 * - Color picker for labels
 */
export const LabelManager: React.FC<LabelManagerProps> = ({ open, onClose }) => {
  const t = useTranslations();
  // Use explicit selectors for better re-render reliability
  const labels = useLabelStore((state) => state.labels);
  const isLoading = useLabelStore((state) => state.isLoading);
  const error = useLabelStore((state) => state.error);
  const fetchLabels = useLabelStore((state) => state.fetchLabels);
  const createLabel = useLabelStore((state) => state.createLabel);
  const updateLabel = useLabelStore((state) => state.updateLabel);
  const deleteLabel = useLabelStore((state) => state.deleteLabel);

  const [isCreating, setIsCreating] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [labelName, setLabelName] = useState('');
  const [labelColor, setLabelColor] = useState(LABEL_COLORS[0]);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Debug: Track label changes
  useEffect(() => {
    console.log('[LabelManager] Labels changed:', labels.length, labels);
  }, [labels]);

  // Load labels when dialog opens
  useEffect(() => {
    if (open) {
      console.log('[LabelManager] Dialog opened, fetching labels');
      fetchLabels();
    }
  }, [open, fetchLabels]);

  // Reset form when closing
  useEffect(() => {
    if (!open) {
      setIsCreating(false);
      setEditingLabelId(null);
      setLabelName('');
      setLabelColor(LABEL_COLORS[0]);
      setActionError(null);
    }
  }, [open]);

  const handleCreateLabel = async () => {
    if (!labelName.trim()) {
      setActionError(t.dashboard.labels.labelNameRequired);
      return;
    }

    setActionLoading(true);
    setActionError(null);

    try {
      await createLabel(labelName.trim(), labelColor);
      // Reset form
      setLabelName('');
      setLabelColor(LABEL_COLORS[0]);
      setIsCreating(false);
    } catch (err) {
      setActionError(t.dashboard.labels.failedToCreate);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateLabel = async () => {
    if (!editingLabelId || !labelName.trim()) {
      setActionError(t.dashboard.labels.labelNameRequired);
      return;
    }

    setActionLoading(true);
    setActionError(null);

    try {
      await updateLabel(editingLabelId, labelName.trim(), labelColor);
      // Reset form
      setEditingLabelId(null);
      setLabelName('');
      setLabelColor(LABEL_COLORS[0]);
    } catch (err) {
      setActionError(t.dashboard.labels.failedToUpdate);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteLabel = async (labelId: string) => {
    if (!window.confirm(t.dashboard.labels.deleteConfirm)) {
      return;
    }

    setActionLoading(true);
    setActionError(null);

    try {
      await deleteLabel(labelId);
    } catch (err) {
      setActionError(t.dashboard.labels.failedToDelete);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartEdit = (labelId: string, name: string, color: string) => {
    setEditingLabelId(labelId);
    setLabelName(name);
    setLabelColor(color);
    setIsCreating(false);
  };

  const handleCancelEdit = () => {
    setEditingLabelId(null);
    setLabelName('');
    setLabelColor(LABEL_COLORS[0]);
    setIsCreating(false);
  };

  const handleStartCreate = () => {
    setIsCreating(true);
    setEditingLabelId(null);
    setLabelName('');
    setLabelColor(LABEL_COLORS[0]);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">{t.dashboard.labels.manageLabels}</Typography>
          <IconButton size="small" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* Error Alert */}
        {(error || actionError) && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error || actionError}
          </Alert>
        )}

        {/* Create/Edit Form */}
        {(isCreating || editingLabelId) && (
          <Box sx={{ mb: 3, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              {editingLabelId ? t.dashboard.labels.editLabel : t.dashboard.labels.createLabel}
            </Typography>
            <TextField
              fullWidth
              size="small"
              label={t.dashboard.labels.labelName}
              value={labelName}
              onChange={(e) => setLabelName(e.target.value)}
              sx={{ mb: 2 }}
              autoFocus
            />
            <LabelColorPicker
              selectedColor={labelColor}
              colors={LABEL_COLORS}
              onColorSelect={setLabelColor}
            />
            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                size="small"
                onClick={editingLabelId ? handleUpdateLabel : handleCreateLabel}
                disabled={actionLoading || !labelName.trim()}
              >
                {actionLoading ? <CircularProgress size={20} /> : editingLabelId ? t.dashboard.labels.updateButton : t.dashboard.labels.createButton}
              </Button>
              <Button variant="outlined" size="small" onClick={handleCancelEdit}>
                {t.dashboard.labels.cancelButton}
              </Button>
            </Box>
          </Box>
        )}

        {/* Create Button */}
        {!isCreating && !editingLabelId && (
          <Button
            startIcon={<Plus size={18} />}
            variant="outlined"
            fullWidth
            onClick={handleStartCreate}
            sx={{ mb: 2 }}
          >
            {t.dashboard.labels.addLabel}
          </Button>
        )}

        {/* Labels List */}
        {isLoading && labels.length === 0 ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : labels.length === 0 ? (
          <Typography color="text.secondary" textAlign="center" py={4}>
            {t.dashboard.labels.noLabels}. {t.dashboard.labels.noLabelsDescription}.
          </Typography>
        ) : (
          <List>
            {labels.map((label) => (
              <ListItem
                key={label.id}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  mb: 1,
                }}
                secondaryAction={
                  <Box>
                    <IconButton
                      size="small"
                      onClick={() => handleStartEdit(label.id, label.name, labelColorToHex(label.color))}
                      disabled={actionLoading}
                    >
                      <Edit2 size={16} />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteLabel(label.id)}
                      disabled={actionLoading}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </Box>
                }
              >
                <Box display="flex" alignItems="center" gap={1} flex={1}>
                  <Chip
                    label={label.name}
                    size="small"
                    sx={{
                      bgcolor: label.color?.backgroundColor || '#9E9E9E',
                      color: label.color?.textColor || '#fff',
                      fontWeight: 500,
                    }}
                  />
                </Box>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{t.dashboard.labels.closeButton}</Button>
      </DialogActions>
    </Dialog>
  );
};
