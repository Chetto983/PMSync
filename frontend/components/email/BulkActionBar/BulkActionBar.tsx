import React, { useState } from 'react';
import { logger } from '@/lib/logger';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  Divider,
  CircularProgress,
  Checkbox,
} from '@mui/material';
import {
  X,
  Mail,
  MailOpen,
  Trash2,
  Star,
  Flag,
  Tag,
  FolderInput,
  MoreHorizontal,
  Archive,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

export interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onMarkRead: () => Promise<void>;
  onMarkUnread: () => Promise<void>;
  onDelete: () => Promise<void>;
  onArchive?: () => Promise<void>;
  onStar?: () => Promise<void>;
  onUnstar?: () => Promise<void>;
  onFlag?: () => Promise<void>;
  onUnflag?: () => Promise<void>;
  onAddLabels?: () => void;
  onMoveToFolder?: () => void;
}

/**
 * BulkActionBar - Outlook-style action bar for bulk email operations
 * 
 * Design principles:
 * - Positioned at TOP of email list (not floating over rows)
 * - Subtle background (not bright primary color)
 * - Clear selection count with checkbox
 * - Icons with text labels for clarity
 * - Grouped related actions
 */
export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onMarkRead,
  onMarkUnread,
  onDelete,
  onArchive,
  onStar,
  onUnstar,
  onFlag,
  onUnflag,
  onAddLabels,
  onMoveToFolder,
}) => {
  const t = useTranslations();
  const [loading, setLoading] = useState<string | null>(null);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState<null | HTMLElement>(null);

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

  const handleMoreClick = (event: React.MouseEvent<HTMLElement>) => {
    setMoreMenuAnchor(event.currentTarget);
  };

  const handleMoreClose = () => {
    setMoreMenuAnchor(null);
  };

  // Don't show if nothing selected
  if (selectedCount === 0) {
    return null;
  }

  const allSelected = selectedCount === totalCount;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 1,
        bgcolor: 'action.selected',
        borderBottom: 1,
        borderColor: 'divider',
        flexShrink: 0,
      }}
    >
      {/* Selection checkbox + count */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Checkbox
          checked={allSelected}
          indeterminate={selectedCount > 0 && !allSelected}
          onChange={() => allSelected ? onClearSelection() : onSelectAll()}
          size="small"
          disabled={loading !== null}
          sx={{ p: 0.5 }}
        />
        <Typography variant="body2" sx={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
          {selectedCount} {t.email.bulkBar.selectedLabel || 'selected'}
        </Typography>
      </Box>

      {/* Clear selection */}
      <Tooltip title={t.email.bulkBar.clearSelection || 'Clear selection'}>
        <IconButton
          size="small"
          onClick={onClearSelection}
          disabled={loading !== null}
          sx={{ color: 'text.secondary' }}
        >
          <X size={16} />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Primary Actions - Icons with labels */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {/* Mark Read */}
        <Tooltip title={t.email.bulkBar.markRead}>
          <span>
            <Button
              size="small"
              variant="text"
              onClick={() => handleAction(onMarkRead, 'markRead')}
              disabled={loading !== null}
              startIcon={loading === 'markRead' ? <CircularProgress size={14} /> : <MailOpen size={14} />}
              sx={{
                textTransform: 'none',
                minWidth: 'auto',
                color: 'text.secondary',
                '&:hover': { bgcolor: 'action.hover' },
                display: { xs: 'none', sm: 'inline-flex' },
              }}
            >
              {t.email.actions.markRead || 'Read'}
            </Button>
            <IconButton
              size="small"
              onClick={() => handleAction(onMarkRead, 'markRead')}
              disabled={loading !== null}
              sx={{
                display: { xs: 'inline-flex', sm: 'none' },
                color: 'text.secondary',
              }}
            >
              {loading === 'markRead' ? <CircularProgress size={16} /> : <MailOpen size={16} />}
            </IconButton>
          </span>
        </Tooltip>

        {/* Mark Unread */}
        <Tooltip title={t.email.bulkBar.markUnread}>
          <span>
            <Button
              size="small"
              variant="text"
              onClick={() => handleAction(onMarkUnread, 'markUnread')}
              disabled={loading !== null}
              startIcon={loading === 'markUnread' ? <CircularProgress size={14} /> : <Mail size={14} />}
              sx={{
                textTransform: 'none',
                minWidth: 'auto',
                color: 'text.secondary',
                '&:hover': { bgcolor: 'action.hover' },
                display: { xs: 'none', sm: 'inline-flex' },
              }}
            >
              {t.email.actions.markUnread || 'Unread'}
            </Button>
            <IconButton
              size="small"
              onClick={() => handleAction(onMarkUnread, 'markUnread')}
              disabled={loading !== null}
              sx={{
                display: { xs: 'inline-flex', sm: 'none' },
                color: 'text.secondary',
              }}
            >
              {loading === 'markUnread' ? <CircularProgress size={16} /> : <Mail size={16} />}
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, display: { xs: 'none', md: 'block' } }} />

        {/* Archive */}
        {onArchive && (
          <Tooltip title={t.email.actions.archive || 'Archive'}>
            <span>
              <IconButton
                size="small"
                onClick={() => handleAction(onArchive, 'archive')}
                disabled={loading !== null}
                sx={{ color: 'text.secondary' }}
              >
                {loading === 'archive' ? <CircularProgress size={16} /> : <Archive size={16} />}
              </IconButton>
            </span>
          </Tooltip>
        )}

        {/* Delete */}
        <Tooltip title={t.email.bulkBar.delete}>
          <span>
            <IconButton
              size="small"
              onClick={() => handleAction(onDelete, 'delete')}
              disabled={loading !== null}
              sx={{ color: 'error.main' }}
            >
              {loading === 'delete' ? <CircularProgress size={16} /> : <Trash2 size={16} />}
            </IconButton>
          </span>
        </Tooltip>

        {/* Move to Folder */}
        {onMoveToFolder && (
          <Tooltip title={t.email.bulkBar.moveToFolder}>
            <span>
              <IconButton
                size="small"
                onClick={onMoveToFolder}
                disabled={loading !== null}
                sx={{ color: 'text.secondary' }}
              >
                <FolderInput size={16} />
              </IconButton>
            </span>
          </Tooltip>
        )}

        {/* Labels */}
        {onAddLabels && (
          <Tooltip title={t.email.bulkBar.addLabels}>
            <span>
              <IconButton
                size="small"
                onClick={onAddLabels}
                disabled={loading !== null}
                sx={{ color: 'text.secondary' }}
              >
                <Tag size={16} />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>

      <Box sx={{ flex: 1 }} />

      {/* More Actions Menu */}
      <Tooltip title={t.email.bulkBar.moreActions}>
        <span>
          <IconButton
            size="small"
            onClick={handleMoreClick}
            disabled={loading !== null}
            sx={{ color: 'text.secondary' }}
          >
            <MoreHorizontal size={18} />
          </IconButton>
        </span>
      </Tooltip>

      <Menu
        anchorEl={moreMenuAnchor}
        open={Boolean(moreMenuAnchor)}
        onClose={handleMoreClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {onStar && (
          <MenuItem
            onClick={() => {
              handleAction(onStar, 'star');
              handleMoreClose();
            }}
            disabled={loading !== null}
          >
            <Star size={16} style={{ marginRight: 8 }} />
            {t.email.bulkBar.addStar}
          </MenuItem>
        )}
        {onUnstar && (
          <MenuItem
            onClick={() => {
              handleAction(onUnstar, 'unstar');
              handleMoreClose();
            }}
            disabled={loading !== null}
          >
            <Star size={16} style={{ marginRight: 8 }} />
            {t.email.bulkBar.removeStar}
          </MenuItem>
        )}
        {onFlag && (
          <MenuItem
            onClick={() => {
              handleAction(onFlag, 'flag');
              handleMoreClose();
            }}
            disabled={loading !== null}
          >
            <Flag size={16} style={{ marginRight: 8 }} />
            {t.email.bulkBar.markImportant}
          </MenuItem>
        )}
        {onUnflag && (
          <MenuItem
            onClick={() => {
              handleAction(onUnflag, 'unflag');
              handleMoreClose();
            }}
            disabled={loading !== null}
          >
            <Flag size={16} style={{ marginRight: 8 }} />
            {t.email.bulkBar.unmarkImportant}
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
};
