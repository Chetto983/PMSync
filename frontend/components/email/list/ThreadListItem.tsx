/**
 * Thread List Item Component
 *
 * Single email row with 3-line layout (Outlook-inspired):
 * Line 1: Avatar + Sender + Labels + Date
 * Line 2: Subject
 * Line 3: Snippet
 *
 * Features:
 * - Checkbox (hidden until hover)
 * - Action buttons on hover (flag, archive, delete)
 * - Unread indicator
 * - Optimized with React.memo
 */

import { memo, MouseEvent, useRef, useCallback } from 'react';
import {
  Box,
  Checkbox,
  Typography,
  Avatar,
  IconButton,
  Chip,
  Fade,
  Tooltip,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { Flag, Paperclip, Archive, Trash2, FolderInput, Zap } from 'lucide-react';
import { emailThreadOptions } from '@/hooks/queries/use-emails';

// AI Priority configuration (1 = highest/critical, 5 = lowest/minimal)
const AI_PRIORITY_CONFIG: Record<number, { color: 'error' | 'warning' | 'info' | 'success' | 'default' }> = {
  1: { color: 'error' },
  2: { color: 'warning' },
  3: { color: 'info' },
  4: { color: 'success' },
  5: { color: 'default' },
};

// AI Sentiment to color mapping
const AI_SENTIMENT_CONFIG: Record<string, 'error' | 'warning' | 'success' | 'default'> = {
  urgent: 'error',
  negative: 'warning',
  positive: 'success',
  neutral: 'default',
};
import { useTranslations } from '@/lib/hooks/use-translations';
import { stringToColor } from '@/lib/utils/gravatar';

export interface ThreadListItemData {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
  isFlagged: boolean;
  hasAttachments: boolean;
  threadCount?: number;
  labels?: { id: string; name: string; color: string }[];
  avatarUrl?: string;
  providerId?: string; // For drag-and-drop provider validation
  // AI Auto-Triage fields (populated when email has been analyzed)
  aiPriority?: number | null; // 1-5 scale (1 = critical, 5 = minimal)
  aiSentiment?: string | null; // 'positive' | 'negative' | 'neutral' | 'urgent'
  aiLabels?: string[]; // AI-suggested labels like ['Follow-up', 'Important']
}

interface ThreadListItemProps {
  thread: ThreadListItemData;
  isSelected: boolean;
  isHovered: boolean;
  /** Keyboard navigation focus state */
  isFocused?: boolean;
  onSelect: (id: string, checked: boolean, event?: React.MouseEvent) => void;
  onClick: (id: string) => void;
  onFlag: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  /** Move to folder (mobile - opens folder picker) */
  onMove?: (id: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/**
 * Single email row with 3-line layout and hover actions
 *
 * Performance optimized with React.memo - only re-renders
 * when props change
 */
export const ThreadListItem = memo(function ThreadListItem({
  thread,
  isSelected,
  isHovered,
  isFocused = false,
  onSelect,
  onClick,
  onFlag,
  onArchive,
  onDelete,
  onMove,
  onMouseEnter,
  onMouseLeave,
}: ThreadListItemProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const prefetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced prefetch handler - 300ms delay to avoid prefetch spam
  const handleMouseEnter = useCallback(() => {
    onMouseEnter();
    // Debounce prefetch to avoid spam on quick mouse movements
    prefetchTimeoutRef.current = setTimeout(async () => {
      await queryClient.prefetchQuery({
        ...emailThreadOptions(thread.id),
        staleTime: 30 * 1000, // Only prefetch if data older than 30s
      });
    }, 300);
  }, [onMouseEnter, thread.id, queryClient]);

  const handleMouseLeave = useCallback(() => {
    onMouseLeave();
    // Cancel pending prefetch if mouse leaves quickly
    if (prefetchTimeoutRef.current) {
      clearTimeout(prefetchTimeoutRef.current);
      prefetchTimeoutRef.current = null;
    }
  }, [onMouseLeave]);

  const handleCheckboxChange = (e: MouseEvent) => {
    e.stopPropagation();
    onSelect(thread.id, !isSelected, e);
  };

  const handleRowClick = () => {
    onClick(thread.id);
  };

  const handleFlag = (e: MouseEvent) => {
    e.stopPropagation();
    onFlag(thread.id);
  };

  const handleArchive = (e: MouseEvent) => {
    e.stopPropagation();
    onArchive(thread.id);
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    onDelete(thread.id);
  };

  const handleMove = (e: MouseEvent) => {
    e.stopPropagation();
    onMove?.(thread.id);
  };

  // Get initials for avatar fallback
  const getInitials = (name: string) => {
    // Robustly handle "Name <email" format even if truncated
    const cleanName = name.split('<')[0].trim().replace(/^"|"$/g, '');
    const parts = cleanName.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return cleanName.slice(0, 2).toUpperCase();
  };

  // Format sender for display
  const formatSender = (from: string) => {
    const name = from.split('<')[0].trim().replace(/^"|"$/g, '');
    if (name) return name;
    return from;
  };

  return (
    <Box
      data-testid="thread-list-item"
      data-focused={isFocused ? 'true' : undefined}
      onClick={handleRowClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.5,
        minHeight: 96,
        cursor: 'pointer',
        position: 'relative',
        bgcolor: thread.isUnread
          ? (theme) => `${theme.palette.primary.main}0A` // 4% alpha of primary color
          : isSelected
            ? 'action.selected'
            : isFocused
              ? 'action.focus'
              : 'transparent',
        transition: 'background-color 0.15s ease, outline 0.15s ease',
        borderBottom: 1,
        borderColor: 'divider',
        // Keyboard focus indicator (Phase 9)
        outline: isFocused ? 2 : 0,
        outlineColor: 'primary.main',
        outlineOffset: -2,
        '&:hover': {
          bgcolor: isSelected ? 'action.selected' : 'action.hover',
        },
      }}
    >
      {/* Checkbox - hidden until hover or selected */}
      <Fade in={isHovered || isSelected}>
        <Box sx={{ width: 40, flexShrink: 0 }}>
          <Checkbox
            checked={isSelected}
            onClick={handleCheckboxChange}
            size="small"
            sx={{ p: 0.5 }}
          />
        </Box>
      </Fade>

      {/* Avatar - small 28px */}
      <Avatar
        src={thread.avatarUrl}
        sx={{
          width: 28,
          height: 28,
          fontSize: '0.75rem',
          flexShrink: 0,
          bgcolor: thread.avatarUrl ? undefined : stringToColor(thread.from),
        }}
      >
        {getInitials(thread.from)}
      </Avatar>

      {/* Content - 3 lines */}
      <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {/* Line 1: Sender + Labels + Date */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            mb: 0.5,
            minWidth: 0,
          }}
        >
          <Tooltip title={thread.from} placement="right">
            <Typography
              variant="body2"
              component="span"
              noWrap
              sx={{
                fontWeight: thread.isUnread ? 600 : 400,
                fontSize: '0.875rem',
                flex: '1 1 auto',
                minWidth: 0,
              }}
            >
              {formatSender(thread.from)}
            </Typography>
          </Tooltip>

          {/* AI Priority Badge */}
          {thread.aiPriority && thread.aiPriority <= 3 && (
            <Tooltip title={t.emailList.aiPriority.replace('{priority}', String(thread.aiPriority))}>
              <Chip
                icon={<Zap size={12} />}
                label={thread.aiPriority}
                size="small"
                color={AI_PRIORITY_CONFIG[thread.aiPriority]?.color || 'default'}
                sx={{
                  height: 18,
                  fontSize: '0.625rem',
                  fontWeight: 600,
                  '& .MuiChip-label': { px: 0.5 },
                  '& .MuiChip-icon': { ml: 0.5, mr: -0.5 },
                }}
              />
            </Tooltip>
          )}

          {/* AI Sentiment Badge (only show if not neutral) */}
          {thread.aiSentiment && thread.aiSentiment !== 'neutral' && (
            <Chip
              label={t.emailList.aiSentiment[thread.aiSentiment as keyof typeof t.emailList.aiSentiment] || thread.aiSentiment}
              size="small"
              color={AI_SENTIMENT_CONFIG[thread.aiSentiment] || 'default'}
              variant="outlined"
              sx={{
                height: 16,
                fontSize: '0.5625rem',
                '& .MuiChip-label': { px: 0.5 },
              }}
            />
          )}

          {/* Labels (includes AI-suggested labels that user has accepted) */}
          {thread.labels && thread.labels.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
              {thread.labels.slice(0, 2).map((label) => (
                <Chip
                  key={label.id}
                  label={label.name}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.6875rem',
                    bgcolor: label.color,
                    color: 'white',
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />
              ))}
            </Box>
          )}

          {/* Indicators */}
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexShrink: 0 }}>
            {thread.hasAttachments && (
              <Paperclip
                data-testid="attachment-icon"
                size={14}
                strokeWidth={2}
                style={{ color: 'var(--mui-palette-text-secondary)' }}
              />
            )}
            {thread.threadCount && thread.threadCount > 1 && (
              <Chip
                label={thread.threadCount}
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.6875rem',
                  '& .MuiChip-label': { px: 0.75 },
                }}
              />
            )}
          </Box>

          {/* Date */}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              fontSize: '0.75rem',
              flexShrink: 0,
              ml: 'auto',
            }}
          >
            {thread.date}
          </Typography>
        </Box>

        {/* Line 2: Subject */}
        <Typography
          variant="body2"
          color="text.primary"
          sx={{
            fontWeight: thread.isUnread ? 500 : 400,
            fontSize: '0.8125rem',
            mb: 0.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {thread.subject || t.common.noSubject}
        </Typography>

        {/* Line 3: Snippet */}
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            fontSize: '0.8125rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {thread.snippet}
        </Typography>
      </Box>

      {/* Action buttons - always visible on mobile, hover reveal on desktop */}
      <Box
        className="thread-action-bar"
        sx={{
          position: 'absolute',
          right: { xs: 8, md: 16 },
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          gap: 0.5,
          bgcolor: 'background.paper',
          borderRadius: 1,
          boxShadow: 1,
          p: 0.5,
          // Mobile: always visible, Desktop: hover reveal
          opacity: { xs: 1, md: isHovered ? 1 : 0 },
          visibility: { xs: 'visible', md: isHovered ? 'visible' : 'hidden' },
          transition: 'opacity 0.2s ease, visibility 0.2s ease',
        }}
      >
          {/* Flag */}
          <IconButton
            size="small"
            onClick={handleFlag}
            sx={{ p: 0.5 }}
            aria-label={thread.isFlagged ? t.emailList.unflagged : t.emailList.flagged}
          >
            <Flag
              data-testid="flag-icon"
              size={18}
              fill={thread.isFlagged ? 'currentColor' : 'none'}
              strokeWidth={2}
              style={{
                color: thread.isFlagged ? 'var(--mui-palette-error-main)' : 'currentColor',
              }}
            />
          </IconButton>

          {/* Archive */}
          <IconButton
            size="small"
            onClick={handleArchive}
            sx={{ p: 0.5 }}
            aria-label={t.emailList.archive}
          >
            <Archive size={18} strokeWidth={2} />
          </IconButton>

          {/* Move to folder - mobile friendly alternative to drag */}
          {onMove && (
            <IconButton
              size="small"
              onClick={handleMove}
              sx={{ p: 0.5 }}
              aria-label={t.emailList?.moveToFolder || 'Move to folder'}
            >
              <FolderInput size={18} strokeWidth={2} />
            </IconButton>
          )}

          {/* Delete */}
          <IconButton
            size="small"
            onClick={handleDelete}
            sx={{ p: 0.5, color: 'error.main' }}
            aria-label={t.emailList.delete}
          >
            <Trash2 size={18} strokeWidth={2} />
          </IconButton>
        </Box>
    </Box>
  );
});

export default ThreadListItem;
