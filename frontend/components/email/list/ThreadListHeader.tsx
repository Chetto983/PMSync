/**
 * Thread List Header Component
 *
 * Toolbar for email list with bulk actions:
 * - Select all / Deselect all
 * - Bulk actions (read, unread, archive, delete, move, label)
 * - Selected count indicator
 * - Refresh button
 *
 * Design: Clean toolbar with MUI theme tokens
 */

import { Box, Checkbox, IconButton, Typography, Tooltip, Divider } from '@mui/material';
import {
  RefreshCw,
  Mail,
  MailOpen,
  Archive,
  Trash2,
  FolderInput,
  Tag,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

interface ThreadListHeaderProps {
  /** Total number of emails in list */
  totalCount: number;
  /** Number of selected emails */
  selectedCount: number;
  /** All emails are selected */
  allSelected: boolean;
  /** Some (but not all) emails are selected */
  someSelected: boolean;
  /** Loading state for refresh */
  isRefreshing?: boolean;
  /** Callbacks */
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onRefresh: () => void;
  onMarkAsRead: () => void;
  onMarkAsUnread: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onMoveToFolder: () => void;
  onAddLabel: () => void;
}

/**
 * Email list toolbar with bulk action controls
 *
 * Shows different UI based on selection state:
 * - No selection: Just refresh button
 * - Has selection: Bulk action buttons
 */
export function ThreadListHeader({
  totalCount,
  selectedCount,
  allSelected,
  someSelected,
  isRefreshing,
  onSelectAll,
  onDeselectAll,
  onRefresh,
  onMarkAsRead,
  onMarkAsUnread,
  onArchive,
  onDelete,
  onMoveToFolder,
  onAddLabel,
}: ThreadListHeaderProps) {
  const t = useTranslations();

  const hasSelection = selectedCount > 0;

  const handleCheckboxChange = () => {
    if (allSelected) {
      onDeselectAll();
    } else {
      onSelectAll();
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 1,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        minHeight: 56,
      }}
    >
      {/* Select all checkbox */}
      <Checkbox
        checked={allSelected}
        indeterminate={someSelected && !allSelected}
        onChange={handleCheckboxChange}
        size="small"
        disabled={totalCount === 0}
        sx={{ p: 0.5 }}
      />

      {/* Selected count or total count */}
      {hasSelection ? (
        <Typography variant="body2" color="primary" sx={{ fontWeight: 500 }}>
          {t.emailList.selected.replace('{count}', selectedCount.toString())}
        </Typography>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {totalCount} {totalCount === 1 ? 'email' : 'emails'}
        </Typography>
      )}

      {/* Bulk actions - show when emails are selected */}
      {hasSelection && (
        <>
          <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

          {/* Mark as read */}
          <Tooltip title={t.emailList.markAsRead}>
            <IconButton size="small" onClick={onMarkAsRead} sx={{ p: 0.5 }}>
              <MailOpen size={18} strokeWidth={2} />
            </IconButton>
          </Tooltip>

          {/* Mark as unread */}
          <Tooltip title={t.emailList.markAsUnread}>
            <IconButton size="small" onClick={onMarkAsUnread} sx={{ p: 0.5 }}>
              <Mail size={18} strokeWidth={2} />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Archive */}
          <Tooltip title={t.emailList.archive}>
            <IconButton size="small" onClick={onArchive} sx={{ p: 0.5 }}>
              <Archive size={18} strokeWidth={2} />
            </IconButton>
          </Tooltip>

          {/* Delete */}
          <Tooltip title={t.emailList.delete}>
            <IconButton
              size="small"
              onClick={onDelete}
              sx={{ p: 0.5, color: 'error.main' }}
            >
              <Trash2 size={18} strokeWidth={2} />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Move to folder */}
          <Tooltip title={t.emailList.moveToFolder}>
            <IconButton size="small" onClick={onMoveToFolder} sx={{ p: 0.5 }}>
              <FolderInput size={18} strokeWidth={2} />
            </IconButton>
          </Tooltip>

          {/* Add label */}
          <Tooltip title={t.emailList.addLabel}>
            <IconButton size="small" onClick={onAddLabel} sx={{ p: 0.5 }}>
              <Tag size={18} strokeWidth={2} />
            </IconButton>
          </Tooltip>
        </>
      )}

      {/* Spacer */}
      <Box sx={{ flex: 1 }} />

      {/* Refresh button - always visible */}
      <Tooltip title={t.emailList.refresh}>
        <IconButton
          size="small"
          onClick={onRefresh}
          disabled={isRefreshing}
          sx={{ p: 0.5 }}
        >
          <RefreshCw
            size={18}
            strokeWidth={2}
            style={{
              animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
            }}
          />
        </IconButton>
      </Tooltip>

      {/* Spin animation for refresh icon */}
      <style jsx global>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </Box>
  );
}

export default ThreadListHeader;
