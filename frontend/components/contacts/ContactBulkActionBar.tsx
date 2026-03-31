import React, { useState } from 'react';
import { logger } from '@/lib/logger';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Tooltip,
  Divider,
  CircularProgress,
} from '@mui/material';
import { X, Trash2, Merge } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

export interface ContactBulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDelete: () => Promise<void>;
  onMerge?: () => void;
}

/**
 * ContactBulkActionBar - Action bar shown when contacts are selected
 *
 * Features:
 * - Shows selected count
 * - Select all / Clear selection
 * - Bulk delete
 * - Loading states for async operations
 */
export const ContactBulkActionBar: React.FC<ContactBulkActionBarProps> = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onDelete,
  onMerge,
}) => {
  const t = useTranslations();
  const [loading, setLoading] = useState<string | null>(null);

  const handleAction = async (action: () => Promise<void>, actionName: string) => {
    setLoading(actionName);
    try {
      await action();
    } catch (error) {
      logger.error(`Failed to ${actionName}`, { error });
    } finally {
      setLoading(null);
    }
  };

  if (selectedCount === 0) {
    return null;
  }

  return (
    <Paper
      elevation={3}
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        borderRadius: 0,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 2,
          py: 1.5,
        }}
      >
        {/* Selection Info */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton
            size="small"
            onClick={onClearSelection}
            sx={{
              color: 'inherit',
              width: { xs: 44, sm: 'auto' },
              height: { xs: 44, sm: 'auto' },
            }}
            disabled={loading !== null}
          >
            <X size={20} />
          </IconButton>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {selectedCount} {t.common?.selected || 'selected'}
          </Typography>
        </Box>

        {/* Select All Button */}
        {selectedCount < totalCount && (
          <>
            <Divider orientation="vertical" flexItem sx={{ bgcolor: 'primary.contrastText', opacity: 0.3 }} />
            <Button
              size="small"
              onClick={onSelectAll}
              sx={{
                color: 'inherit',
                textTransform: 'none',
                fontWeight: 500,
              }}
              disabled={loading !== null}
            >
              {t.common?.selectAll || 'Select all'}
            </Button>
          </>
        )}

        <Box sx={{ flex: 1 }} />

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {/* Merge (only when exactly 2 selected) */}
          {selectedCount === 2 && onMerge && (
            <Tooltip title={t.contacts?.merge?.title || 'Merge Contacts'}>
              <span>
                <IconButton
                  size="small"
                  onClick={onMerge}
                  disabled={loading !== null}
                  sx={{
                    color: 'inherit',
                    width: { xs: 44, sm: 'auto' },
                    height: { xs: 44, sm: 'auto' },
                  }}
                >
                  <Merge size={20} />
                </IconButton>
              </span>
            </Tooltip>
          )}
          {/* Delete */}
          <Tooltip title={t.common?.delete || 'Delete'}>
            <span>
              <IconButton
                size="small"
                onClick={() => handleAction(onDelete, 'delete')}
                disabled={loading !== null}
                sx={{
                  color: 'inherit',
                  width: { xs: 44, sm: 'auto' },
                  height: { xs: 44, sm: 'auto' },
                }}
              >
                {loading === 'delete' ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <Trash2 size={20} />
                )}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>
    </Paper>
  );
};

export default ContactBulkActionBar;
