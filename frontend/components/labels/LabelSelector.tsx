import React, { useState, useEffect } from 'react';
import {
  Box,
  Chip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  Tooltip,
  IconButton,
  CircularProgress,
} from '@mui/material';
import { Tag, Plus, X, Check, Settings } from 'lucide-react';
import { useLabelStore } from '@/stores/label-store';
import { useTranslations } from '@/lib/hooks/use-translations';

interface LabelSelectorProps {
  /**
   * Currently selected label IDs
   */
  selectedLabelIds: string[];

  /**
   * Callback when labels change
   */
  onLabelsChange: (labelIds: string[]) => void;

  /**
   * Whether to show as chips or icon button
   */
  variant?: 'chips' | 'button';

  /**
   * Callback to open label manager
   */
  onManageLabels?: () => void;

  /**
   * Whether the selector is disabled
   */
  disabled?: boolean;

  /**
   * Optional: Pass selected labels directly (from email.emailLabels)
   * This allows showing labels even if labelStore is not populated
   */
  selectedLabels?: Array<{ id: string; name: string; color?: { backgroundColor: string; textColor: string } | null }>;
}

/**
 * LabelSelector - Component for selecting and managing labels on emails
 *
 * Features:
 * - Display current labels as chips
 * - Add/remove labels via dropdown menu
 * - Option to manage labels (opens LabelManager)
 * - Two variants: chips or icon button
 */
export const LabelSelector: React.FC<LabelSelectorProps> = ({
  selectedLabelIds,
  onLabelsChange,
  variant = 'chips',
  onManageLabels,
  disabled = false,
  selectedLabels: passedSelectedLabels,
}) => {
  const t = useTranslations();
  const labelsCopy = t.dashboard.labels;
  const { labels, fetchLabels, isLoading } = useLabelStore();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  // Load labels on mount (for dropdown menu)
  useEffect(() => {
    if (labels.length === 0) {
      fetchLabels();
    }
  }, [labels.length, fetchLabels]);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleToggleLabel = (labelId: string) => {
    if (selectedLabelIds.includes(labelId)) {
      // Remove label
      onLabelsChange(selectedLabelIds.filter((id) => id !== labelId));
    } else {
      // Add label
      onLabelsChange([...selectedLabelIds, labelId]);
    }
  };

  const handleRemoveLabel = (labelId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    onLabelsChange(selectedLabelIds.filter((id) => id !== labelId));
  };

  // Use passed selectedLabels if available, otherwise filter from store
  const selectedLabels = passedSelectedLabels && passedSelectedLabels.length > 0
    ? passedSelectedLabels
    : labels.filter((label) => selectedLabelIds.includes(label.id));

  if (variant === 'button') {
    return (
      <>
        <Tooltip title={labelsCopy.manageLabelsTooltip}>
          <IconButton size="small" onClick={handleClick} disabled={disabled || isLoading}>
            {isLoading ? <CircularProgress size={18} /> : <Tag size={18} />}
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          PaperProps={{
            sx: { minWidth: 200, maxHeight: 400 },
          }}
        >
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {labelsCopy.addRemoveLabels}
            </Typography>
          </Box>
          <Divider />
          {labels.length === 0 ? (
            <MenuItem disabled>
              <Typography variant="body2" color="text.secondary">
                {labelsCopy.noLabelsAvailable}
              </Typography>
            </MenuItem>
          ) : (
            labels.map((label) => (
              <MenuItem
                key={label.id}
                onClick={() => handleToggleLabel(label.id)}
              >
                <ListItemIcon>
                  {selectedLabelIds.includes(label.id) ? (
                    <Check size={18} />
                  ) : (
                    <Box sx={{ width: 18 }} />
                  )}
                </ListItemIcon>
                <Chip
                  size="small"
                  label={label.name}
                  sx={{
                    bgcolor: label.color?.backgroundColor || '#9E9E9E',
                    color: label.color?.textColor || '#fff',
                    fontWeight: 500,
                  }}
                />
              </MenuItem>
            ))
          )}
          {onManageLabels && (
            <>
              <Divider />
              <MenuItem onClick={onManageLabels}>
                <ListItemIcon>
                  <Settings size={18} />
                </ListItemIcon>
                <ListItemText>{labelsCopy.manageLabelsTooltip}</ListItemText>
              </MenuItem>
            </>
          )}
        </Menu>
      </>
    );
  }

  // Chips variant
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
      {selectedLabels.map((label) => (
        <Chip
          key={label.id}
          size="small"
          icon={<Tag size={12} />}
          label={label.name}
          onDelete={(e) => handleRemoveLabel(label.id, e)}
          deleteIcon={<X size={14} />}
          disabled={disabled}
          sx={{
            bgcolor: label.color?.backgroundColor || '#9E9E9E',
            color: label.color?.textColor || '#fff',
            fontWeight: 500,
            '& .MuiChip-icon': {
              color: label.color?.textColor || '#fff',
            },
            '& .MuiChip-deleteIcon': {
              color: label.color?.textColor || '#fff',
              '&:hover': {
                color: '#f0f0f0',
              },
            },
          }}
        />
      ))}
      <Tooltip title={labelsCopy.addLabelText}>
        <IconButton
          size="small"
          onClick={handleClick}
          disabled={disabled || isLoading}
          sx={{
            width: 24,
            height: 24,
            border: '1px dashed',
            borderColor: 'divider',
          }}
        >
          {isLoading ? <CircularProgress size={14} /> : <Plus size={14} />}
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: { minWidth: 200, maxHeight: 400 },
        }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {labelsCopy.addLabelText}
          </Typography>
        </Box>
        <Divider />
        {labels.length === 0 ? (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              {labelsCopy.noLabelsAvailable}
            </Typography>
          </MenuItem>
        ) : (
          labels
            .filter((label) => !selectedLabelIds.includes(label.id))
            .map((label) => (
              <MenuItem
                key={label.id}
                onClick={() => {
                  handleToggleLabel(label.id);
                  handleClose();
                }}
              >
                <Chip
                  size="small"
                  label={label.name}
                  sx={{
                    bgcolor: label.color?.backgroundColor || '#9E9E9E',
                    color: label.color?.textColor || '#fff',
                    fontWeight: 500,
                  }}
                />
              </MenuItem>
            ))
        )}
        {onManageLabels && (
          <>
            <Divider />
            <MenuItem onClick={onManageLabels}>
              <ListItemIcon>
                <Settings size={18} />
              </ListItemIcon>
              <ListItemText>{labelsCopy.manageLabelsTooltip}</ListItemText>
            </MenuItem>
          </>
        )}
      </Menu>
    </Box>
  );
};
