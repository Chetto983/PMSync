import React from 'react';
import { Box, IconButton, Tooltip, Stack, Button, Divider, useTheme } from '@mui/material';
import {
  ArrowLeft,
  Reply,
  ReplyAll,
  Forward,
  Archive,
  Trash2,
  MoreHorizontal,
  FolderInput,
  Flag,
  Mail,
  MailOpen,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { Email } from '@/stores/email-store';

interface ThreadToolbarProps {
  email: Email;
  onClose?: () => void;
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  onDelete?: () => void;
  onArchive?: () => void;
  onToggleImportant?: () => void;
  onToggleRead?: () => void;
  onMoveToFolder?: () => void;
  onPrint?: () => void;
  isMobile?: boolean;
}

/**
 * ThreadToolbar - Outlook-style top toolbar for thread display
 *
 * Actions at thread level:
 * - Back/Close
 * - Reply / Reply All
 * - Forward
 * - Delete (prominent, red)
 * - Archive
 * - Star
 * - Mark read/unread
 * - More options
 */
export const ThreadToolbar: React.FC<ThreadToolbarProps> = ({
  email,
  onClose,
  onReply,
  onReplyAll,
  onForward,
  onDelete,
  onArchive,
  onToggleImportant,
  onToggleRead,
  onMoveToFolder,
  onPrint,
  isMobile = false,
}) => {
  const t = useTranslations();
  const theme = useTheme();

  const isFlagged = email.isStarred || email.isImportant || email.isFlagged;
  const isRead = email.isRead;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: { xs: 1, sm: 2 },
        py: 1,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        minHeight: 48,
      }}
    >
      {/* Left Section: Close + Primary Actions */}
      <Stack direction="row" alignItems="center" spacing={0.5}>
        {/* Close/Back Button */}
        {onClose && (
          <Tooltip title={t.common.close}>
            <IconButton
              onClick={onClose}
              size="small"
              sx={{
                mr: 1,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <ArrowLeft size={20} />
            </IconButton>
          </Tooltip>
        )}

        {!isMobile && (
          <>
            {/* Reply Button */}
            {onReply && (
              <Tooltip title={t.email.view.reply}>
                <Button
                  size="small"
                  variant="text"
                  onClick={onReply}
                  startIcon={<Reply size={16} />}
                  sx={{
                    textTransform: 'none',
                    color: 'text.secondary',
                    px: 1.5,
                    minWidth: 'auto',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  {t.email.view.reply}
                </Button>
              </Tooltip>
            )}

            {/* Reply All Button */}
            {onReplyAll && (
              <Tooltip title={t.email.view.replyAll}>
                <Button
                  size="small"
                  variant="text"
                  onClick={onReplyAll}
                  startIcon={<ReplyAll size={16} />}
                  sx={{
                    textTransform: 'none',
                    color: 'text.secondary',
                    px: 1.5,
                    minWidth: 'auto',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  {t.email.view.replyAll}
                </Button>
              </Tooltip>
            )}

            {/* Forward Button */}
            {onForward && (
              <Tooltip title={t.email.view.forward}>
                <Button
                  size="small"
                  variant="text"
                  onClick={onForward}
                  startIcon={<Forward size={16} />}
                  sx={{
                    textTransform: 'none',
                    color: 'text.secondary',
                    px: 1.5,
                    minWidth: 'auto',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  {t.email.view.forward}
                </Button>
              </Tooltip>
            )}
          </>
        )}

        {/* Mobile: Compact Buttons */}
        {isMobile && (
          <>
            <Tooltip title={t.email.view.reply}>
              <IconButton onClick={onReply} size="small">
                <Reply size={18} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t.email.view.replyAll}>
              <IconButton onClick={onReplyAll} size="small">
                <ReplyAll size={18} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t.email.view.forward}>
              <IconButton onClick={onForward} size="small">
                <Forward size={18} />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Stack>

      {/* Center Section: Labels */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, px: 2, overflow: 'hidden' }}>
        {email.emailLabels?.map(({ label }) => (
          <Tooltip key={label.id} title={label.name}>
            <Box
              sx={{
                bgcolor: label.color?.backgroundColor || theme.palette.action.selected,
                color: label.color?.textColor || theme.palette.text.primary,
                px: 1,
                py: 0.5,
                borderRadius: 1,
                fontSize: '0.75rem',
                fontWeight: 500,
                maxWidth: 150,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'inline-block',
              }}
            >
              {label.name}
            </Box>
          </Tooltip>
        ))}
      </Stack>

      {/* Right Section: Actions */}
      <Stack direction="row" alignItems="center" spacing={0.5}>
        {/* Delete Button - Prominent Red */}
        {onDelete && (
          <Tooltip title={t.email.bulkBar.delete}>
            <IconButton
              onClick={onDelete}
              size="small"
              sx={{
                bgcolor: 'error.light',
                color: 'error.contrastText',
                '&:hover': {
                  bgcolor: 'error.main',
                },
                borderRadius: 1.5,
                p: 0.75,
              }}
            >
              <Trash2 size={18} />
            </IconButton>
          </Tooltip>
        )}

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 24, alignSelf: 'center' }} />

        {/* Archive Button */}
        {onArchive && (
          <Tooltip title={t.email.bulkBar.archive}>
            <IconButton
              onClick={onArchive}
              size="small"
              sx={{ '&:hover': { bgcolor: 'action.hover' } }}
            >
              <Archive size={18} />
            </IconButton>
          </Tooltip>
        )}

        {/* Move to Folder */}
        {onMoveToFolder && (
          <Tooltip title={t.email.bulkBar.moveToFolder}>
            <IconButton
              onClick={onMoveToFolder}
              size="small"
              sx={{ '&:hover': { bgcolor: 'action.hover' } }}
            >
              <FolderInput size={18} />
            </IconButton>
          </Tooltip>
        )}

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 24, alignSelf: 'center' }} />

        {/* Flag Toggle (like Outlook) - uses onToggleImportant to toggle isFlagged */}
        {onToggleImportant && (
          <Tooltip title={isFlagged ? t.email.bulkBar.unmarkImportant : t.email.bulkBar.markImportant}>
            <IconButton
              onClick={onToggleImportant}
              size="small"
              sx={{
                '&:hover': { bgcolor: isFlagged ? 'warning.light' : 'action.hover' },
              }}
            >
              <Flag
                size={18}
                fill={isFlagged ? theme.palette.warning.main : 'none'}
                color={isFlagged ? theme.palette.warning.main : 'currentColor'}
              />
            </IconButton>
          </Tooltip>
        )}

        {/* Read/Unread Toggle */}
        {onToggleRead && (
          <Tooltip title={isRead ? t.email.bulkBar.markUnread : t.email.bulkBar.markRead}>
            <IconButton
              onClick={onToggleRead}
              size="small"
              sx={{ '&:hover': { bgcolor: 'action.hover' } }}
            >
              {isRead ? <Mail size={18} /> : <MailOpen size={18} />}
            </IconButton>
          </Tooltip>
        )}

        {/* More Options */}
        {onPrint && (
          <Tooltip title={t.email.bulkBar.moreActions}>
            <IconButton
              onClick={onPrint}
              size="small"
              sx={{ '&:hover': { bgcolor: 'action.hover' } }}
            >
              <MoreHorizontal size={18} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </Box>
  );
};

export default ThreadToolbar;
