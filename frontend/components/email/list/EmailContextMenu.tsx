/**
 * Email Context Menu
 *
 * Right-click context menu for email list items.
 * Provides quick access to all email actions without hovering.
 * Fixes UX anti-pattern: hover-only access to actions (touch/keyboard inaccessible).
 */

import { Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import {
  Reply,
  ReplyAll,
  Forward,
  Flag,
  Archive,
  FolderInput,
  Tag,
  Mail,
  MailOpen,
  Trash2,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

export interface EmailContextMenuProps {
  anchorPosition: { top: number; left: number } | null;
  emailId: string | null;
  isRead?: boolean;
  isFlagged?: boolean;
  onClose: () => void;
  onOpen?: (id: string) => void;
  onReply?: (id: string) => void;
  onReplyAll?: (id: string) => void;
  onForward?: (id: string) => void;
  onFlag?: (id: string) => void;
  onArchive?: (id: string) => void;
  onMove?: (id: string) => void;
  onLabel?: (id: string) => void;
  onMarkRead?: (id: string) => void;
  onMarkUnread?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function EmailContextMenu({
  anchorPosition,
  emailId,
  isRead = true,
  isFlagged = false,
  onClose,
  onOpen,
  onReply,
  onReplyAll,
  onForward,
  onFlag,
  onArchive,
  onMove,
  onLabel,
  onMarkRead,
  onMarkUnread,
  onDelete,
}: EmailContextMenuProps) {
  const t = useTranslations();

  if (!emailId) return null;

  const action = (handler?: (id: string) => void) => () => {
    onClose();
    handler?.(emailId);
  };

  return (
    <Menu
      open={!!anchorPosition}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition ?? undefined}
      slotProps={{
        paper: {
          sx: {
            minWidth: 200,
            boxShadow: 6,
            '& .MuiMenuItem-root': {
              fontSize: '0.8125rem',
              py: 0.75,
              gap: 0.5,
            },
            '& .MuiListItemIcon-root': {
              minWidth: 28,
            },
          },
        },
      }}
    >
      {onOpen && (
        <MenuItem onClick={action(onOpen)}>
          <ListItemIcon><MailOpen size={16} /></ListItemIcon>
          <ListItemText>{t.emailList?.keyboard?.openEmail ?? 'Open'}</ListItemText>
        </MenuItem>
      )}

      {(onReply || onReplyAll || onForward) && <Divider />}

      {onReply && (
        <MenuItem onClick={action(onReply)}>
          <ListItemIcon><Reply size={16} /></ListItemIcon>
          <ListItemText>{t.threadMessage?.reply ?? 'Reply'}</ListItemText>
        </MenuItem>
      )}
      {onReplyAll && (
        <MenuItem onClick={action(onReplyAll)}>
          <ListItemIcon><ReplyAll size={16} /></ListItemIcon>
          <ListItemText>{t.threadMessage?.replyAll ?? 'Reply All'}</ListItemText>
        </MenuItem>
      )}
      {onForward && (
        <MenuItem onClick={action(onForward)}>
          <ListItemIcon><Forward size={16} /></ListItemIcon>
          <ListItemText>{t.threadMessage?.forward ?? 'Forward'}</ListItemText>
        </MenuItem>
      )}

      <Divider />

      {onFlag && (
        <MenuItem onClick={action(onFlag)}>
          <ListItemIcon>
            <Flag size={16} fill={isFlagged ? 'currentColor' : 'none'} />
          </ListItemIcon>
          <ListItemText>
            {isFlagged ? (t.emailList?.unflagged ?? 'Unflag') : (t.emailList?.flagged ?? 'Flag')}
          </ListItemText>
        </MenuItem>
      )}

      {isRead && onMarkUnread && (
        <MenuItem onClick={action(onMarkUnread)}>
          <ListItemIcon><Mail size={16} /></ListItemIcon>
          <ListItemText>{t.emailList?.markAsUnread ?? 'Mark as unread'}</ListItemText>
        </MenuItem>
      )}
      {!isRead && onMarkRead && (
        <MenuItem onClick={action(onMarkRead)}>
          <ListItemIcon><MailOpen size={16} /></ListItemIcon>
          <ListItemText>{t.emailList?.markAsRead ?? 'Mark as read'}</ListItemText>
        </MenuItem>
      )}

      {onArchive && (
        <MenuItem onClick={action(onArchive)}>
          <ListItemIcon><Archive size={16} /></ListItemIcon>
          <ListItemText>{t.emailList?.archive ?? 'Archive'}</ListItemText>
        </MenuItem>
      )}
      {onMove && (
        <MenuItem onClick={action(onMove)}>
          <ListItemIcon><FolderInput size={16} /></ListItemIcon>
          <ListItemText>{t.emailList?.moveToFolder ?? 'Move to folder'}</ListItemText>
        </MenuItem>
      )}
      {onLabel && (
        <MenuItem onClick={action(onLabel)}>
          <ListItemIcon><Tag size={16} /></ListItemIcon>
          <ListItemText>{t.emailList?.addLabel ?? 'Add label'}</ListItemText>
        </MenuItem>
      )}

      {onDelete && <Divider />}

      {onDelete && (
        <MenuItem onClick={action(onDelete)} sx={{ color: 'error.main' }}>
          <ListItemIcon sx={{ color: 'inherit' }}><Trash2 size={16} /></ListItemIcon>
          <ListItemText>{t.emailList?.delete ?? 'Delete'}</ListItemText>
        </MenuItem>
      )}
    </Menu>
  );
}

export default EmailContextMenu;
