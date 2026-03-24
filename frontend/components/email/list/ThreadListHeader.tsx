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

import { Box, Checkbox, IconButton, Typography, Tooltip, Divider, useMediaQuery, useTheme } from '@mui/material';
import {
  RefreshCw,
  Mail,
  MailOpen,
  Archive,
  Trash2,
  FolderInput,
  Tag,
  PenSquare,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { EmailSearchBar } from './EmailSearchBar';

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
  /** Bulk action in-flight */
  isBulkActionPending?: boolean;
  /** Compose callback (mobile) */
  onCompose?: () => void;
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
  isBulkActionPending = false,
  onCompose,
}: ThreadListHeaderProps) {
  const t = useTranslations();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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
      data-testid="thread-list-header"
      sx={{
        display: 'flex',
        alignItems: hasSelection ? 'center' : { xs: 'stretch', sm: 'center' },
        flexWrap: hasSelection ? 'nowrap' : { xs: 'wrap', sm: 'nowrap' },
        gap: { xs: 0.5, sm: 0.75 },
        px: { xs: 1, sm: 1.5 },
        py: 0.75,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        minHeight: { xs: 44, sm: 48 },
      }}
    >
      {/* Select all checkbox — hidden on mobile */}
      <Checkbox
        checked={allSelected}
        indeterminate={someSelected && !allSelected}
        onChange={handleCheckboxChange}
        size="small"
        disabled={totalCount === 0}
        inputProps={{ 'aria-label': allSelected ? (t.emailList?.deselectAll || 'Deselect all') : (t.emailList?.selectAll || 'Select all') }}
        sx={{ p: { xs: 1, md: 0.5 } }}
      />

      {/* Selected count or total count */}
      {hasSelection ? (
        <Typography variant="body2" color="primary" sx={{ fontWeight: 500 }}>
          {t.emailList.selected.replace('{count}', selectedCount.toString())}
        </Typography>
      ) : !isMobile ? (
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.75rem' }}>
          {(t.email?.headerStats?.totalEmails || '{count} emails').replace('{count}', totalCount.toString())}
        </Typography>
      ) : null}

      {isMobile && (
        <Box sx={{ display: hasSelection ? 'none' : 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <EmailSearchBar compact placeholder={t.email?.search?.placeholder || t.common?.searchPlaceholder} />
          <Tooltip title={t.emailList.refresh}>
            <IconButton
              data-testid="refresh-button-mobile"
              size="small"
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label={t.emailList.refresh}
              sx={{ p: { xs: 1, md: 0.5 }, alignSelf: 'center', flexShrink: 0 }}
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
          {onCompose && (
            <IconButton
              size="small"
              onClick={onCompose}
              color="primary"
              aria-label={t.common?.compose || 'Compose'}
              sx={{
                p: 1,
                alignSelf: 'center',
                flexShrink: 0,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                '&:hover': { bgcolor: 'primary.dark' },
              }}
            >
              <PenSquare size={18} />
            </IconButton>
          )}
        </Box>
      )}

      {/* Bulk actions - show when emails are selected */}
      {hasSelection && (
        <>
          <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

          {/* Mark as read */}
          <Tooltip title={t.emailList.markAsRead}>
            <IconButton
              size="small"
              onClick={onMarkAsRead}
              disabled={isBulkActionPending}
              aria-label={t.emailList.markAsRead}
              sx={{ p: { xs: 1, md: 0.5 } }}
            >
              <MailOpen size={18} strokeWidth={2} />
            </IconButton>
          </Tooltip>

          {/* Mark as unread */}
          <Tooltip title={t.emailList.markAsUnread}>
            <IconButton
              size="small"
              onClick={onMarkAsUnread}
              disabled={isBulkActionPending}
              aria-label={t.emailList.markAsUnread}
              sx={{ p: { xs: 1, md: 0.5 } }}
            >
              <Mail size={18} strokeWidth={2} />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Archive */}
          <Tooltip title={t.emailList.archive}>
            <IconButton
              size="small"
              onClick={onArchive}
              disabled={isBulkActionPending}
              aria-label={t.emailList.archive}
              sx={{ p: { xs: 1, md: 0.5 } }}
            >
              <Archive size={18} strokeWidth={2} />
            </IconButton>
          </Tooltip>

          {/* Delete */}
          <Tooltip title={t.emailList.delete}>
            <IconButton
              size="small"
              onClick={onDelete}
              disabled={isBulkActionPending}
              aria-label={t.emailList.delete}
              sx={{ p: { xs: 1, md: 0.5 }, color: 'error.main' }}
            >
              <Trash2 size={18} strokeWidth={2} />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Move to folder */}
          <Tooltip title={t.emailList.moveToFolder}>
            <IconButton
              size="small"
              onClick={onMoveToFolder}
              disabled={isBulkActionPending}
              aria-label={t.emailList.moveToFolder}
              sx={{ p: { xs: 1, md: 0.5 } }}
            >
              <FolderInput size={18} strokeWidth={2} />
            </IconButton>
          </Tooltip>

          {/* Add label */}
          <Tooltip title={t.emailList.addLabel}>
            <IconButton
              size="small"
              onClick={onAddLabel}
              disabled={isBulkActionPending}
              aria-label={t.emailList.addLabel}
              sx={{ p: { xs: 1, md: 0.5 } }}
            >
              <Tag size={18} strokeWidth={2} />
            </IconButton>
          </Tooltip>

        </>
      )}

      {/* Search bar - hide when bulk actions are showing */}
      {!hasSelection && !isMobile && (
        <>
          <Box sx={{ flex: 1 }} />
          <EmailSearchBar compact />
        </>
      )}

      {/* Spacer - only when no search (selection mode) */}
      {hasSelection && <Box sx={{ flex: 1 }} />}

      {/* Refresh button - always visible */}
      {!isMobile && (
      <Tooltip title={t.emailList.refresh}>
        <IconButton
          data-testid="refresh-button"
          size="small"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label={t.emailList.refresh}
          sx={{ p: { xs: 1, md: 0.5 } }}
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
      )}

      {/* Spin animation for refresh icon */}
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Box>
  );
}

export default ThreadListHeader;
