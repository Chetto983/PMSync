'use client';

import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Chip,
  alpha,
  useTheme,
  Tooltip,
  Collapse,
} from '@mui/material';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Check,
  Clock,
  Mail,
  AlertTriangle,
  Calendar,
  Hourglass,
  ListTodo,
  Target,
  ChevronDown,
  ChevronUp,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { EmailFollowUp } from '@/hooks/queries';

interface KanbanCardProps {
  followUp: EmailFollowUp;
  onResolve?: (id: string) => void;
  onSnooze?: (id: string) => void;
  onViewEmail?: (emailId: string) => void;
  onDelete?: (id: string) => void;
  isResolving?: boolean;
  isSelected?: boolean;
}

/**
 * Compact card with progressive disclosure.
 * Surface: subject, sender, due date, urgency indicator.
 * Expand: reason, extraction data, action items, confidence.
 */
export function KanbanCard({
  followUp,
  onResolve,
  onSnooze,
  onViewEmail,
  onDelete,
  isResolving,
  isSelected,
}: KanbanCardProps) {
  const theme = useTheme();
  const t = useTranslations();
  const [expanded, setExpanded] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: followUp.id });

  const now = new Date();
  const dueDate = followUp.dueDate ? new Date(followUp.dueDate) : null;
  const isOverdue = dueDate && dueDate < now && followUp.status === 'PENDING';
  const isDueToday =
    dueDate &&
    dueDate.toDateString() === now.toDateString() &&
    followUp.status === 'PENDING';

  const formattedDate = dueDate
    ? format(dueDate, dueDate.getFullYear() !== now.getFullYear() ? 'MMM d, yyyy' : 'MMM d')
    : null;

  // Semantic border color
  const borderColor = isOverdue
    ? alpha(theme.palette.error.main, 0.4)
    : isDueToday
      ? alpha(theme.palette.warning.main, 0.4)
      : followUp.status === 'RESOLVED'
        ? alpha(theme.palette.success.main, 0.3)
        : alpha(theme.palette.divider, 0.4);

  const hasExtras =
    (followUp.waitingFor && followUp.waitingFor.length > 0) ||
    (followUp.commitments && followUp.commitments.length > 0) ||
    (followUp.actionItems && followUp.actionItems.length > 0) ||
    followUp.reason;

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate on button clicks
    if ((e.target as HTMLElement).closest('button')) return;
    setExpanded((prev) => !prev);
  };

  const handleViewEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onViewEmail && followUp.emailId) onViewEmail(followUp.emailId);
  };

  return (
    <Box
      ref={setNodeRef}
      onClick={handleCardClick}
      sx={{
        transform: transform ? CSS.Transform.toString(transform) : undefined,
        transition,
        opacity: isDragging ? 0.4 : 1,
        cursor: 'grab',
        borderRadius: 2.5,
        border: '1px solid',
        borderColor,
        borderLeft: isOverdue
          ? `3px solid ${theme.palette.error.main}`
          : isDueToday
            ? `3px solid ${theme.palette.warning.main}`
            : followUp.status === 'RESOLVED'
              ? `3px solid ${theme.palette.success.main}`
              : '1px solid',
        borderLeftColor: isOverdue
          ? theme.palette.error.main
          : isDueToday
            ? theme.palette.warning.main
            : followUp.status === 'RESOLVED'
              ? theme.palette.success.main
              : borderColor,
        bgcolor: isOverdue
          ? alpha(theme.palette.error.main, 0.02)
          : 'background.paper',
        outline: isSelected ? `2px solid ${theme.palette.primary.main}` : 'none',
        outlineOffset: 1,
        p: 1.5,
        '&:hover': {
          borderColor: alpha(theme.palette.primary.main, 0.4),
          boxShadow: `0 2px 8px ${alpha(theme.palette.common.black, 0.06)}`,
        },
        '&:active': { cursor: 'grabbing' },
      }}
      {...attributes}
      {...listeners}
    >
      {/* ── Surface layer: always visible ── */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Subject */}
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              color: 'text.primary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: '0.825rem',
            }}
          >
            {followUp.email?.subject || t.ai.followUpTracker.noReason}
          </Typography>

          {/* Sender / recipient line */}
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block',
              mt: 0.25,
            }}
          >
            {followUp.email?.from || followUp.email?.to?.join(', ') || ''}
          </Typography>
        </Box>

        {/* Quick actions */}
        <Box sx={{ display: 'flex', gap: 0.25, flexShrink: 0, ml: 0.5 }}>
          {followUp.status === 'PENDING' && onResolve && (
            <Tooltip title={t.ai.followUpTracker.actions.resolve}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onResolve(followUp.id);
                }}
                disabled={isResolving}
                sx={{
                  width: 28,
                  height: 28,
                  opacity: 0.5,
                  '&:hover': { opacity: 1, color: 'success.main' },
                }}
              >
                <Check size={14} />
              </IconButton>
            </Tooltip>
          )}
          {followUp.status === 'PENDING' && onSnooze && (
            <Tooltip title={t.ai.followUpTracker.actions.snooze}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onSnooze(followUp.id);
                }}
                sx={{
                  width: 28,
                  height: 28,
                  opacity: 0.5,
                  '&:hover': { opacity: 1, color: 'warning.main' },
                }}
              >
                <Clock size={14} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* ── Meta row: badges + date ── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          mt: 1,
          flexWrap: 'wrap',
        }}
      >
        {/* Type badge */}
        {followUp.followUpType && (
          <Chip
            size="small"
            icon={
              followUp.followUpType === 'WAITING_FOR' ? (
                <Hourglass size={10} />
              ) : (
                <ListTodo size={10} />
              )
            }
            label={
              followUp.followUpType === 'WAITING_FOR'
                ? t.ai.followUpTracker.types.waitingFor
                : t.ai.followUpTracker.types.todo
            }
            variant="outlined"
            sx={{
              height: 20,
              fontSize: '0.65rem',
              '& .MuiChip-icon': { fontSize: 10 },
              color:
                followUp.followUpType === 'WAITING_FOR'
                  ? 'info.main'
                  : 'secondary.main',
              borderColor:
                followUp.followUpType === 'WAITING_FOR'
                  ? 'info.main'
                  : 'secondary.main',
            }}
          />
        )}

        {/* Overdue / due today */}
        {isOverdue && (
          <Chip
            size="small"
            icon={<AlertTriangle size={10} />}
            label={t.ai.followUpTracker.overdueWarning}
            color="error"
            sx={{ height: 20, fontSize: '0.65rem', '& .MuiChip-icon': { fontSize: 10 } }}
          />
        )}
        {isDueToday && !isOverdue && (
          <Chip
            size="small"
            icon={<Clock size={10} />}
            label={t.ai.followUpTracker.dueTodayWarning}
            color="warning"
            sx={{ height: 20, fontSize: '0.65rem', '& .MuiChip-icon': { fontSize: 10 } }}
          />
        )}

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Due date */}
        {formattedDate && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Calendar size={11} color={theme.palette.text.secondary} />
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.65rem',
                color: isOverdue ? 'error.main' : 'text.secondary',
                fontWeight: isOverdue ? 600 : 400,
              }}
            >
              {formattedDate}
            </Typography>
          </Box>
        )}

        {/* Expand indicator */}
        {hasExtras && (
          <Box
            sx={{
              color: 'text.disabled',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </Box>
        )}
      </Box>

      {/* ── Expanded layer: details on click ── */}
      <Collapse in={expanded} timeout={200}>
        <Box sx={{ mt: 1.5, pt: 1, borderTop: 1, borderColor: 'divider' }}>
          {/* Reason */}
          {followUp.reason && (
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', display: 'block', mb: 1, lineHeight: 1.5 }}
            >
              {followUp.reason}
            </Typography>
          )}

          {/* Waiting For */}
          {followUp.waitingFor && followUp.waitingFor.length > 0 && (
            <ExtractionBlock
              icon={<Hourglass size={12} />}
              color={theme.palette.warning.main}
              title={t.ai.followUpTracker.extraction?.waitingFor || 'Waiting for'}
              items={followUp.waitingFor.slice(0, 3).map(
                (w) => `${w.waitingFor}${w.fromWhom ? ` (${w.fromWhom})` : ''}`,
              )}
            />
          )}

          {/* Commitments */}
          {followUp.commitments && followUp.commitments.length > 0 && (
            <ExtractionBlock
              icon={<Target size={12} />}
              color={theme.palette.info.main}
              title={t.ai.followUpTracker.extraction?.commitments || 'Commitments'}
              items={followUp.commitments.slice(0, 3).map(
                (c) => `${c.commitment}${c.deadline ? ` (by ${c.deadline})` : ''}`,
              )}
            />
          )}

          {/* Action Items */}
          {followUp.actionItems && followUp.actionItems.length > 0 && (
            <ExtractionBlock
              icon={<ListTodo size={12} />}
              color={theme.palette.success.main}
              title={t.ai.followUpTracker.extraction?.actionItems || 'Action items'}
              items={followUp.actionItems.slice(0, 3).map((a) => a.action)}
            />
          )}

          {/* Detected deadline */}
          {followUp.detectedDeadline && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, mb: 1 }}>
              <Sparkles size={11} color={theme.palette.info.main} />
              <Typography variant="caption" sx={{ color: 'info.main', fontWeight: 500 }}>
                {t.ai.followUpTracker.deadline.detected}:{' '}
                {format(new Date(followUp.detectedDeadline), 'MMM d')}
              </Typography>
            </Box>
          )}

          {/* Bottom actions */}
          <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
            <Tooltip title={t.ai.followUpTracker.actions.view}>
              <IconButton size="small" onClick={handleViewEmail} sx={{ width: 28, height: 28 }}>
                <Mail size={14} />
              </IconButton>
            </Tooltip>
            {onDelete && (
              <Tooltip title={t.ai.followUpTracker.actions.delete}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(followUp.id);
                  }}
                  sx={{ width: 28, height: 28, '&:hover': { color: 'error.main' } }}
                >
                  <Trash2 size={14} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}

/** Small extraction data block */
function ExtractionBlock({
  icon,
  color,
  title,
  items,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  items: string[];
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 0.75,
        mb: 1,
        p: 0.75,
        bgcolor: alpha(color, 0.06),
        borderRadius: 1.5,
      }}
    >
      <Box sx={{ color, mt: 0.25, flexShrink: 0 }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{ fontWeight: 600, color, fontSize: '0.65rem', display: 'block' }}
        >
          {title}
        </Typography>
        {items.map((item, idx) => (
          <Typography
            key={idx}
            variant="caption"
            sx={{
              display: 'block',
              color: 'text.secondary',
              fontSize: '0.65rem',
              lineHeight: 1.4,
            }}
          >
            {item}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

export default KanbanCard;
