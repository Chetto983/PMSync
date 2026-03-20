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
  const isDueToday = dueDate && dueDate.toDateString() === now.toDateString() && followUp.status === 'PENDING';
  const isResolved = followUp.status === 'RESOLVED';
  const formattedDate = dueDate
    ? format(dueDate, dueDate.getFullYear() !== now.getFullYear() ? 'MMM d, yyyy' : 'MMM d')
    : null;
  const accentColor = isOverdue ? theme.palette.error.main : isDueToday ? theme.palette.warning.main : isResolved ? theme.palette.success.main : 'transparent';
  const hasAccent = isOverdue || isDueToday || isResolved;
  const hasExtras = !!(followUp.waitingFor?.length || followUp.commitments?.length || followUp.actionItems?.length || followUp.reason);

  const handleCardClick = (e: React.MouseEvent) => {
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
        transition: [
          transition,
          'box-shadow 0.2s ease, border-color 0.2s ease, transform 0.15s ease',
        ]
          .filter(Boolean)
          .join(', '),
        opacity: isDragging ? 0.4 : isResolved ? 0.75 : 1,
        cursor: 'grab',
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: isSelected
          ? theme.palette.primary.main
          : isOverdue
            ? alpha(theme.palette.error.main, 0.2)
            : alpha(theme.palette.divider, 0.6),
        borderLeft: hasAccent ? `3px solid ${accentColor}` : undefined,
        bgcolor: isOverdue
          ? alpha(theme.palette.error.main, 0.04)
          : 'background.paper',
        boxShadow: isSelected
          ? `0 0 0 2px ${alpha(theme.palette.primary.main, 0.2)}, 0 4px 12px ${alpha(theme.palette.common.black, 0.08)}`
          : `0 1px 3px ${alpha(theme.palette.common.black, 0.06)}, 0 1px 2px ${alpha(theme.palette.common.black, 0.04)}`,
        px: 2,
        py: 1.5,
        '&:hover, &:focus-within': {
          borderColor: isSelected
            ? theme.palette.primary.main
            : alpha(theme.palette.primary.main, 0.3),
          boxShadow: `0 4px 16px ${alpha(theme.palette.common.black, 0.1)}, 0 2px 4px ${alpha(theme.palette.common.black, 0.06)}`,
          transform: 'translateY(-1px)',
          '& .card-actions': { opacity: 1 },
        },
        '&:active': { cursor: 'grabbing', transform: 'none' },
      }}
      {...attributes}
      {...listeners}
    >
      {/* ── Surface ── */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              color: 'text.primary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: '0.875rem',
              lineHeight: 1.4,
            }}
          >
            {followUp.email?.subject || t.ai.followUpTracker.noReason}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block',
              mt: 0.25,
              fontSize: '0.75rem',
              lineHeight: 1.4,
            }}
          >
            {followUp.email?.from || followUp.email?.to?.join(', ') || ''}
          </Typography>
        </Box>

        {/* Quick actions — visible on hover */}
        <Box
          className="card-actions"
          sx={{
            display: 'flex',
            gap: 0.25,
            flexShrink: 0,
            opacity: 0,
            transition: 'opacity 0.15s ease',
          }}
        >
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
                  color: 'text.disabled',
                  '&:hover': {
                    color: 'success.main',
                    bgcolor: alpha(theme.palette.success.main, 0.08),
                  },
                }}
              >
                <Check size={15} />
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
                  color: 'text.disabled',
                  '&:hover': {
                    color: 'warning.main',
                    bgcolor: alpha(theme.palette.warning.main, 0.08),
                  },
                }}
              >
                <Clock size={15} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* ── Meta row ── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          mt: 1.25,
          flexWrap: 'wrap',
        }}
      >
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
            variant="filled"
            sx={{
              height: 22,
              fontSize: '0.6875rem',
              fontWeight: 500,
              '& .MuiChip-icon': { fontSize: 10 },
              bgcolor:
                followUp.followUpType === 'WAITING_FOR'
                  ? alpha(theme.palette.info.main, 0.08)
                  : alpha(theme.palette.secondary.main, 0.08),
              color:
                followUp.followUpType === 'WAITING_FOR'
                  ? theme.palette.info.dark
                  : theme.palette.secondary.dark,
            }}
          />
        )}
        {isOverdue && (
          <Chip
            size="small"
            icon={<AlertTriangle size={10} />}
            label={t.ai.followUpTracker.overdueWarning}
            sx={{
              height: 22,
              fontSize: '0.6875rem',
              fontWeight: 600,
              bgcolor: alpha(theme.palette.error.main, 0.08),
              color: theme.palette.error.dark,
              '& .MuiChip-icon': { fontSize: 10, color: theme.palette.error.dark },
            }}
          />
        )}
        {isDueToday && !isOverdue && (
          <Chip
            size="small"
            icon={<Clock size={10} />}
            label={t.ai.followUpTracker.dueTodayWarning}
            sx={{
              height: 22,
              fontSize: '0.6875rem',
              fontWeight: 600,
              bgcolor: alpha(theme.palette.warning.main, 0.08),
              color: theme.palette.warning.dark,
              '& .MuiChip-icon': { fontSize: 10, color: theme.palette.warning.dark },
            }}
          />
        )}
        <Box sx={{ flex: 1 }} />
        {formattedDate && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Calendar
              size={12}
              color={isOverdue ? theme.palette.error.main : theme.palette.text.disabled}
            />
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.75rem',
                color: isOverdue ? 'error.main' : 'text.disabled',
                fontWeight: isOverdue ? 600 : 400,
              }}
            >
              {formattedDate}
            </Typography>
          </Box>
        )}
        {hasExtras && (
          <Box
            sx={{
              color: 'text.disabled',
              display: 'flex',
              alignItems: 'center',
              ml: 0.25,
            }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </Box>
        )}
      </Box>

      {/* ── Expanded details ── */}
      <Collapse in={expanded} timeout={200}>
        <Box
          sx={{
            mt: 1.5,
            pt: 1.5,
            borderTop: '1px solid',
            borderColor: alpha(theme.palette.divider, 0.4),
          }}
        >
          {followUp.reason && (
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                display: 'block',
                mb: 1.25,
                lineHeight: 1.6,
                fontSize: '0.8125rem',
              }}
            >
              {followUp.reason}
            </Typography>
          )}
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
          {followUp.actionItems && followUp.actionItems.length > 0 && (
            <ExtractionBlock
              icon={<ListTodo size={12} />}
              color={theme.palette.success.main}
              title={t.ai.followUpTracker.extraction?.actionItems || 'Action items'}
              items={followUp.actionItems.slice(0, 3).map((a) => a.action)}
            />
          )}
          {followUp.detectedDeadline && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                mt: 0.75,
                mb: 1,
                px: 1,
                py: 0.5,
                bgcolor: alpha(theme.palette.info.main, 0.06),
                borderRadius: 1.5,
              }}
            >
              <Sparkles size={12} color={theme.palette.info.main} />
              <Typography variant="caption" sx={{ color: 'info.main', fontWeight: 500, fontSize: '0.75rem' }}>
                {t.ai.followUpTracker.deadline.detected}:{' '}
                {format(new Date(followUp.detectedDeadline), 'MMM d')}
              </Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 0.5, mt: 1.25 }}>
            <Tooltip title={t.ai.followUpTracker.actions.view}>
              <IconButton
                size="small"
                onClick={handleViewEmail}
                sx={{
                  width: 30,
                  height: 30,
                  color: 'text.secondary',
                  '&:hover': { color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.08) },
                }}
              >
                <Mail size={15} />
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
                  sx={{
                    width: 30,
                    height: 30,
                    color: 'text.secondary',
                    '&:hover': { color: 'error.main', bgcolor: alpha(theme.palette.error.main, 0.08) },
                  }}
                >
                  <Trash2 size={15} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}

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
        gap: 1,
        mb: 1,
        px: 1.25,
        py: 1,
        bgcolor: alpha(color, 0.04),
        borderRadius: 2,
        border: `1px solid ${alpha(color, 0.08)}`,
      }}
    >
      <Box sx={{ color, mt: 0.25, flexShrink: 0 }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            color,
            fontSize: '0.6875rem',
            display: 'block',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            mb: 0.25,
          }}
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
              fontSize: '0.75rem',
              lineHeight: 1.5,
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
