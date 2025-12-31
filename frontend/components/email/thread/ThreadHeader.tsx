/**
 * Thread Header Component (Outlook Classic Style)
 *
 * Reusable header for email thread view with:
 * - Back navigation
 * - Subject line
 * - Message count
 * - Toolbar actions (Reply, Forward, Delete, etc.)
 * - Expand/Collapse controls
 */

import { Box, Typography, IconButton, Button, Tooltip, Menu, MenuItem, Divider } from '@mui/material';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Reply,
  Forward,
  Trash2,
  Archive,
  FolderInput,
  Tag,
  Mail,
  MailOpen,
  Flag,
  MoreHorizontal,
  Printer,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useState } from 'react';

export interface ThreadHeaderProps {
  subject: string;
  messageCount: number;
  allExpanded: boolean;
  allCollapsed: boolean;
  onBack: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onReply?: () => void;
  onForward?: () => void;
  onDelete?: () => void;
  onArchive?: () => void;
  onMove?: () => void;
  onMarkRead?: () => void;
  onMarkUnread?: () => void;
  onFlag?: () => void;
  onUnflag?: () => void;
  onAddLabels?: () => void;
  onPrint?: () => void;
}

export function ThreadHeader({
  subject,
  messageCount,
  allExpanded,
  allCollapsed,
  onBack,
  onExpandAll,
  onCollapseAll,
  onReply,
  onForward,
  onDelete,
  onArchive,
  onMove,
  onMarkRead,
  onMarkUnread,
  onFlag,
  onUnflag,
  onAddLabels,
  onPrint,
}: ThreadHeaderProps) {
  const t = useTranslations();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleAction = (action?: () => void) => {
    handleMenuClose();
    action?.();
  };

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {/* Top row: Back + Subject */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 1.5,
        }}
      >
        <IconButton
          size="small"
          onClick={onBack}
          aria-label={t.common?.backToLogin || 'Back'}
          sx={{ flexShrink: 0 }}
        >
          <ArrowLeft size={20} />
        </IconButton>

        <Typography
          variant="h6"
          sx={{
            flex: 1,
            fontSize: '1.125rem',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'text.primary',
          }}
        >
          {subject}
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ flexShrink: 0, fontSize: '0.8125rem' }}
        >
          {messageCount === 1
            ? t.threadView?.messageCount?.replace('{count}', '1') || '1 message'
            : t.threadView?.messageCountPlural?.replace('{count}', String(messageCount)) || `${messageCount} messages`}
        </Typography>
      </Box>

      {/* Toolbar row: Actions */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1.5,
          py: 0.75,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
        }}
      >
        {/* Primary actions */}
        {onReply && (
          <Tooltip title={t.threadMessage?.reply || 'Reply'}>
            <IconButton size="small" onClick={onReply}>
              <Reply size={18} />
            </IconButton>
          </Tooltip>
        )}
        {onForward && (
          <Tooltip title={t.threadMessage?.forward || 'Forward'}>
            <IconButton size="small" onClick={onForward}>
              <Forward size={18} />
            </IconButton>
          </Tooltip>
        )}

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 24, alignSelf: 'center' }} />

        {onArchive && (
          <Tooltip title={t.threadActions?.archiveThread || 'Archive'}>
            <IconButton size="small" onClick={onArchive}>
              <Archive size={18} />
            </IconButton>
          </Tooltip>
        )}
        {onDelete && (
          <Tooltip title={t.threadActions?.deleteThread || 'Delete'}>
            <IconButton size="small" onClick={onDelete} sx={{ color: 'error.main' }}>
              <Trash2 size={18} />
            </IconButton>
          </Tooltip>
        )}

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 24, alignSelf: 'center' }} />

        {onFlag && (
          <Tooltip title={t.threadActions?.flagThread || 'Flag'}>
            <IconButton size="small" onClick={onFlag}>
              <Flag size={18} />
            </IconButton>
          </Tooltip>
        )}
        {onMove && (
          <Tooltip title={t.threadActions?.moveThread || 'Move'}>
            <IconButton size="small" onClick={onMove}>
              <FolderInput size={18} />
            </IconButton>
          </Tooltip>
        )}
        {onAddLabels && (
          <Tooltip title={t.threadActions?.addLabelsThread || 'Labels'}>
            <IconButton size="small" onClick={onAddLabels}>
              <Tag size={18} />
            </IconButton>
          </Tooltip>
        )}

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Expand/Collapse controls */}
        {messageCount > 1 && (
          <>
            {!allExpanded && (
              <Button
                size="small"
                startIcon={<ChevronDown size={16} />}
                onClick={onExpandAll}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.8125rem',
                  minWidth: 'auto',
                  px: 1,
                }}
              >
                {t.threadView?.expandAll || 'Expand all'}
              </Button>
            )}
            {!allCollapsed && (
              <Button
                size="small"
                startIcon={<ChevronUp size={16} />}
                onClick={onCollapseAll}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.8125rem',
                  minWidth: 'auto',
                  px: 1,
                }}
              >
                {t.threadView?.collapseAll || 'Collapse all'}
              </Button>
            )}
          </>
        )}

        {/* More actions menu */}
        <IconButton
          size="small"
          onClick={handleMenuOpen}
          aria-label={t.threadView?.actionsLabel || 'More actions'}
        >
          <MoreHorizontal size={18} />
        </IconButton>

        <Menu
          anchorEl={anchorEl}
          open={menuOpen}
          onClose={handleMenuClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {onMarkRead && (
            <MenuItem onClick={() => handleAction(onMarkRead)}>
              <MailOpen size={16} style={{ marginRight: 8 }} />
              {t.threadActions?.markThreadRead || 'Mark as read'}
            </MenuItem>
          )}
          {onMarkUnread && (
            <MenuItem onClick={() => handleAction(onMarkUnread)}>
              <Mail size={16} style={{ marginRight: 8 }} />
              {t.threadActions?.markThreadUnread || 'Mark as unread'}
            </MenuItem>
          )}
          {onUnflag && (
            <>
              <Divider />
              <MenuItem onClick={() => handleAction(onUnflag)}>
                <Flag size={16} style={{ marginRight: 8 }} />
                {t.threadActions?.unflagThread || 'Remove flag'}
              </MenuItem>
            </>
          )}
          {onPrint && (
            <>
              <Divider />
              <MenuItem onClick={() => handleAction(onPrint)}>
                <Printer size={16} style={{ marginRight: 8 }} />
                {'Print'}
              </MenuItem>
            </>
          )}
        </Menu>
      </Box>
    </Box>
  );
}

export default ThreadHeader;
