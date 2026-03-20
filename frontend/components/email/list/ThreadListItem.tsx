/**
 * Thread List Item — Compact 2-line layout (Superhuman-inspired)
 *
 * Line 1: Sender + tiny indicators (flag, attachment, count) + Date
 * Line 2: Subject — snippet (merged, single truncated line)
 * Line 3: Priority / sentiment / user-labels (only when present — rare)
 *
 * Design decisions:
 * - Unread: 3px left accent border (not background tint)
 * - AI-suggested labels hidden in list (noise) — visible in detail view
 * - Action bar: hover on desktop, selected-row on touch so bulk flows stay reachable
 * - Checkbox: always reachable on touch, hover/selection on desktop
 * - ~52px row height for high information density
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
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { Flag, Paperclip, Archive, Trash2, FolderInput, Zap } from 'lucide-react';
import { emailThreadOptions } from '@/hooks/queries/use-emails';
import { useTranslations } from '@/lib/hooks/use-translations';
import { stringToColor } from '@/lib/utils/gravatar';

/** Hide snippet when identical/subset of subject */
function isSnippetRedundant(subject: string, snippet: string): boolean {
  if (!subject || !snippet) return false;
  const s = subject.toLowerCase().trim();
  const p = snippet.toLowerCase().trim();
  if (s === p || s.includes(p) || p.includes(s)) return true;
  if (p.startsWith(s.slice(0, Math.min(s.length, 40)))) return true;
  return false;
}

/** Extract clean display name from "Name <email>" format */
function formatSender(from: string): string {
  const name = from.split('<')[0].trim().replace(/^"|"$/g, '');
  return name || from;
}

/** Get initials from sender string */
function getInitials(from: string): string {
  const clean = from.split('<')[0].trim().replace(/^"|"$/g, '');
  const parts = clean.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

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
  providerId?: string;
  folder?: string;
  aiPriority?: number | null;
  aiSentiment?: string | null;
  aiLabels?: string[];
}

interface ThreadListItemProps {
  thread: ThreadListItemData;
  isSelected: boolean;
  isHovered: boolean;
  isFocused?: boolean;
  onSelect: (id: string, checked: boolean, event?: React.MouseEvent) => void;
  onClick: (id: string) => void;
  onFlag: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onMove?: (id: string) => void;
  onMouseEnter: (id: string) => void;
  onMouseLeave: () => void;
}

export const ThreadListItem = memo<ThreadListItemProps>(function ThreadListItem({
  thread, isSelected, isHovered, isFocused = false,
  onSelect, onClick, onFlag, onArchive, onDelete, onMove,
  onMouseEnter, onMouseLeave,
}: ThreadListItemProps) {
  const t = useTranslations();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const prefetchRef = useRef<NodeJS.Timeout | null>(null);
  const isNarrowViewport = useMediaQuery(theme.breakpoints.down('md'));
  const hasTouchPointer = useMediaQuery('(hover: none), (pointer: coarse)');
  const isTouchLayout = isNarrowViewport || hasTouchPointer;

  // Debounced prefetch on hover (300ms)
  const handleMouseEnter = useCallback(() => {
    onMouseEnter(thread.id);
    prefetchRef.current = setTimeout(async () => {
      await queryClient.prefetchQuery({
        ...emailThreadOptions(thread.id),
        staleTime: 30_000,
      });
    }, 300);
  }, [onMouseEnter, thread.id, queryClient]);

  const handleMouseLeave = useCallback(() => {
    onMouseLeave();
    if (prefetchRef.current) {
      clearTimeout(prefetchRef.current);
      prefetchRef.current = null;
    }
  }, [onMouseLeave]);

  const stop = (e: MouseEvent) => e.stopPropagation();
  const handleCheckbox = (e: MouseEvent) => { stop(e); onSelect(thread.id, !isSelected, e); };
  const handleClick = () => onClick(thread.id);
  const handleFlag = (e: MouseEvent) => { stop(e); onFlag(thread.id); };
  const handleArchive = (e: MouseEvent) => { stop(e); onArchive(thread.id); };
  const handleDelete = (e: MouseEvent) => { stop(e); onDelete(thread.id); };
  const handleMove = (e: MouseEvent) => { stop(e); onMove?.(thread.id); };

  // Actionable indicators — only show when meaningful (rare)
  const hasP = thread.aiPriority != null && thread.aiPriority <= 2;
  const hasS = thread.aiSentiment === 'urgent' || thread.aiSentiment === 'negative';
  const userLabels = (thread.labels || []).slice(0, 2);
  const showIndicators = hasP || hasS || userLabels.length > 0;
  const showSelectionAffordance = isTouchLayout || isHovered || isSelected;
  const showQuickActions = isHovered || (isTouchLayout && isSelected);

  // Snippet: merge with subject on line 2 if non-redundant
  const showSnippet = thread.snippet && !isSnippetRedundant(thread.subject, thread.snippet);

  return (
    <Box
      data-testid="thread-list-item"
      data-focused={isFocused ? 'true' : undefined}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1,
        minHeight: 52,
        cursor: 'pointer',
        position: 'relative',
        // Unread accent: 3px left border (transparent when read for alignment)
        borderLeft: 3,
        borderLeftColor: thread.isUnread ? 'primary.main' : 'transparent',
        // Row divider
        borderBottom: '1px solid',
        borderBottomColor: 'divider',
        bgcolor: isSelected
          ? 'action.selected'
          : isFocused
            ? 'action.focus'
            : 'transparent',
        transition: 'background-color 0.15s ease',
        outline: isFocused ? 2 : 0,
        outlineColor: 'primary.main',
        outlineOffset: -2,
        '&:hover': {
          bgcolor: isSelected ? 'action.selected' : 'action.hover',
        },
      }}
      >
        {/* Checkbox — visible on hover or when selected */}
      <Fade in={showSelectionAffordance}>
        <Box sx={{ width: 36, flexShrink: 0 }}>
          <Checkbox
            checked={isSelected}
            onClick={handleCheckbox}
            size="small"
            sx={{ p: 0.5 }}
          />
        </Box>
      </Fade>

      {/* Avatar — 28px with color hash */}
      <Avatar
        src={thread.avatarUrl}
        sx={{
          width: 28,
          height: 28,
          fontSize: '0.7rem',
          flexShrink: 0,
          bgcolor: thread.avatarUrl ? undefined : stringToColor(thread.from),
        }}
      >
        {getInitials(thread.from)}
      </Avatar>

      {/* Content — 2-line compact layout */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* Line 1: Sender + micro-indicators + date */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
          <Tooltip title={thread.from} placement="right">
            <Typography
              variant="body2"
              component="span"
              noWrap
              sx={{
                fontWeight: thread.isUnread ? 700 : 400,
                fontSize: '0.8125rem',
                flex: '1 1 auto',
                minWidth: 0,
              }}
            >
              {formatSender(thread.from)}
            </Typography>
          </Tooltip>

          {/* Micro-indicators: flag, attachment, thread count */}
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexShrink: 0 }}>
            {thread.isFlagged && (
              <Flag
                size={12}
                fill="var(--mui-palette-error-main)"
                style={{ color: 'var(--mui-palette-error-main)' }}
              />
            )}
            {thread.hasAttachments && (
              <Paperclip
                data-testid="attachment-icon"
                size={12}
                style={{ color: 'var(--mui-palette-text-disabled)' }}
              />
            )}
            {thread.threadCount && thread.threadCount > 1 && (
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontSize: '0.675rem', fontWeight: 600, lineHeight: 1 }}
              >
                {thread.threadCount}
              </Typography>
            )}
          </Box>

          {/* Date — pinned right */}
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{
              fontSize: '0.6875rem',
              flexShrink: 0,
              whiteSpace: 'nowrap',
              ml: 'auto',
            }}
          >
            {thread.date}
          </Typography>
        </Box>

        {/* Line 2: Subject — snippet (merged into one truncated line) */}
        <Typography
          variant="body2"
          noWrap
          sx={{
            fontSize: '0.8125rem',
            fontWeight: thread.isUnread ? 500 : 400,
            color: 'text.secondary',
          }}
        >
          <Box component="span" sx={{ color: 'text.primary' }}>
            {thread.subject || t.common.noSubject}
          </Box>
          {showSnippet && (
            <Box component="span" sx={{ color: 'text.disabled' }}>
              {' \u2014 '}{thread.snippet}
            </Box>
          )}
        </Typography>

        {/* Line 3: Priority / sentiment / user labels (only when present) */}
        {showIndicators && (
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25, alignItems: 'center' }}>
            {hasP && (
              <Chip
                icon={<Zap size={9} />}
                label={`P${thread.aiPriority}`}
                size="small"
                color={thread.aiPriority === 1 ? 'error' : 'warning'}
                sx={{
                  height: 16,
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  '& .MuiChip-label': { px: 0.4 },
                  '& .MuiChip-icon': { ml: 0.3, mr: -0.4 },
                }}
              />
            )}
            {hasS && (
              <Chip
                label={
                  t.emailList.aiSentiment[
                    thread.aiSentiment as keyof typeof t.emailList.aiSentiment
                  ] || thread.aiSentiment
                }
                size="small"
                color={thread.aiSentiment === 'urgent' ? 'error' : 'warning'}
                variant="outlined"
                sx={{
                  height: 16,
                  fontSize: '0.575rem',
                  '& .MuiChip-label': { px: 0.4 },
                }}
              />
            )}
            {userLabels.map((label) => (
              <Chip
                key={label.id}
                label={label.name}
                size="small"
                sx={{
                  height: 16,
                  fontSize: '0.6rem',
                  bgcolor: label.color,
                  color: 'white',
                  '& .MuiChip-label': { px: 0.5 },
                }}
              />
            ))}
          </Box>
        )}
      </Box>

      {/* Touch layouts need a visible path into bulk actions; desktop keeps hover density. */}
      <Fade in={showQuickActions}>
        <Box
          className="thread-action-bar"
          sx={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            gap: 0.25,
            bgcolor: 'background.paper',
            borderRadius: 1,
            boxShadow: 2,
            p: 0.25,
          }}
        >
          <IconButton
            size="small"
            onClick={handleFlag}
            sx={{ p: 0.5 }}
            aria-label={thread.isFlagged ? t.emailList.unflagged : t.emailList.flagged}
          >
            <Flag
              data-testid="flag-icon"
              size={16}
              fill={thread.isFlagged ? 'currentColor' : 'none'}
              strokeWidth={2}
              style={{
                color: thread.isFlagged ? 'var(--mui-palette-error-main)' : 'currentColor',
              }}
            />
          </IconButton>
          <IconButton
            size="small"
            onClick={handleArchive}
            sx={{ p: 0.5 }}
            aria-label={t.emailList.archive}
          >
            <Archive size={16} strokeWidth={2} />
          </IconButton>
          {onMove && (
            <IconButton
              size="small"
              onClick={handleMove}
              sx={{ p: 0.5 }}
              aria-label={t.emailList?.moveToFolder || 'Move to folder'}
            >
              <FolderInput size={16} strokeWidth={2} />
            </IconButton>
          )}
          <IconButton
            size="small"
            onClick={handleDelete}
            sx={{ p: 0.5, color: 'error.main' }}
            aria-label={t.emailList.delete}
          >
            <Trash2 size={16} strokeWidth={2} />
          </IconButton>
        </Box>
      </Fade>
    </Box>
  );
}, (prev, next) => (
  prev.thread.id === next.thread.id &&
  prev.thread.from === next.thread.from &&
  prev.thread.subject === next.thread.subject &&
  prev.thread.snippet === next.thread.snippet &&
  prev.thread.date === next.thread.date &&
  prev.thread.isUnread === next.thread.isUnread &&
  prev.thread.isFlagged === next.thread.isFlagged &&
  prev.thread.hasAttachments === next.thread.hasAttachments &&
  prev.thread.threadCount === next.thread.threadCount &&
  prev.thread.aiPriority === next.thread.aiPriority &&
  prev.thread.aiSentiment === next.thread.aiSentiment &&
  prev.isSelected === next.isSelected &&
  prev.isHovered === next.isHovered &&
  prev.isFocused === next.isFocused
));

ThreadListItem.displayName = 'ThreadListItem';

export default ThreadListItem;
