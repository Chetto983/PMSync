'use client';

import React from 'react';
import {
  Box,
  Typography,
  IconButton,
  Chip,
  alpha,
  useTheme,
  Tooltip,
} from '@mui/material';
import {
  Check,
  Clock,
  Mail,
  AlertTriangle,
  Trash2,
  Hourglass,
} from 'lucide-react';
import { format } from 'date-fns';
import { it as itLocale } from 'date-fns/locale';
import { useLocale } from '@/lib/hooks/use-locale';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { EmailFollowUp } from '@/hooks/queries';

interface FollowUpCardProps {
  followUp: EmailFollowUp;
  onResolve?: (id: string) => void;
  onSnooze?: (id: string) => void;
  onViewEmail?: (emailId: string) => void;
  onDelete?: (id: string) => void;
  isResolving?: boolean;
  isSelected?: boolean;
}

export function FollowUpCard({
  followUp,
  onResolve,
  onSnooze,
  onViewEmail,
  onDelete,
  isResolving,
  isSelected,
}: FollowUpCardProps) {
  const theme = useTheme();
  const t = useTranslations();
  const { locale } = useLocale();
  const dl = locale === 'it' ? { locale: itLocale } : undefined;

  const now = new Date();
  const dueDate = followUp.dueDate ? new Date(followUp.dueDate) : null;
  const isOverdue = dueDate && dueDate < now && followUp.status === 'PENDING';
  const isDueToday = dueDate && dueDate.toDateString() === now.toDateString() && followUp.status === 'PENDING';
  const isResolved = followUp.status === 'RESOLVED';
  const formattedDate = dueDate
    ? format(dueDate, dueDate.getFullYear() !== now.getFullYear() ? 'MMM d, yyyy' : 'MMM d', dl)
    : null;

  const accentColor = isOverdue
    ? theme.palette.error.main
    : isDueToday
      ? theme.palette.warning.main
      : isResolved
        ? theme.palette.success.main
        : 'transparent';
  const hasAccent = isOverdue || isDueToday || isResolved;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.5,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: isSelected
          ? theme.palette.primary.main
          : alpha(theme.palette.divider, 0.6),
        borderLeft: hasAccent ? `3px solid ${accentColor}` : undefined,
        bgcolor: isOverdue
          ? alpha(theme.palette.error.main, 0.03)
          : 'background.paper',
        opacity: isResolved ? 0.7 : isResolving ? 0.5 : 1,
        transition: 'all 0.15s ease',
        '&:hover, &:focus-within': {
          borderColor: isSelected
            ? theme.palette.primary.main
            : alpha(theme.palette.primary.main, 0.3),
          bgcolor: isOverdue
            ? alpha(theme.palette.error.main, 0.05)
            : alpha(theme.palette.action.hover, 0.04),
          '& .card-actions': { opacity: 1 },
        },
      }}
    >
      {/* Left: subject + metadata */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          noWrap
          sx={{ fontWeight: 600, fontSize: '0.875rem', lineHeight: 1.4 }}
        >
          {followUp.email?.subject || t.ai.followUpTracker.noReason}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
          {followUp.email?.from && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
              {followUp.email.from}
            </Typography>
          )}
          {followUp.reason && (
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 300,
              }}
            >
              {followUp.reason}
            </Typography>
          )}
        </Box>
        {/* Chips row */}
        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, flexWrap: 'wrap' }}>
          {followUp.followUpType && (
            <Chip
              label={
                followUp.followUpType === 'WAITING_FOR'
                  ? t.ai.followUpTracker.types.waitingFor
                  : t.ai.followUpTracker.types.todo
              }
              size="small"
              sx={{
                height: 20,
                fontSize: '0.6875rem',
                fontWeight: 600,
                bgcolor: alpha(theme.palette.primary.main, 0.08),
                color: theme.palette.primary.main,
              }}
            />
          )}
          {isOverdue && (
            <Chip
              icon={<AlertTriangle size={12} />}
              label={t.ai.followUpTracker.overdueWarning}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.6875rem',
                fontWeight: 600,
                bgcolor: alpha(theme.palette.error.main, 0.08),
                color: theme.palette.error.main,
                '& .MuiChip-icon': { color: 'inherit', ml: 0.5 },
              }}
            />
          )}
          {isDueToday && !isOverdue && (
            <Chip
              icon={<Clock size={12} />}
              label={t.ai.followUpTracker.dueTodayWarning}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.6875rem',
                fontWeight: 600,
                bgcolor: alpha(theme.palette.warning.main, 0.08),
                color: theme.palette.warning.main,
                '& .MuiChip-icon': { color: 'inherit', ml: 0.5 },
              }}
            />
          )}
        </Box>
      </Box>

      {/* Center: due date */}
      {formattedDate && (
        <Typography
          variant="caption"
          sx={{
            color: isOverdue ? 'error.main' : isDueToday ? 'warning.main' : 'text.secondary',
            fontWeight: isOverdue || isDueToday ? 600 : 400,
            fontSize: '0.75rem',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {formattedDate}
        </Typography>
      )}

      {/* Right: actions (visible on hover) */}
      <Box
        className="card-actions"
        sx={{
          display: 'flex',
          gap: 0.25,
          flexShrink: 0,
          opacity: { xs: 1, md: 0 },
          transition: 'opacity 0.15s ease',
        }}
      >
        {!isResolved && onResolve && (
          <Tooltip title={t.ai.followUpTracker.actions.resolve}>
            <IconButton
              size="small"
              onClick={() => onResolve(followUp.id)}
              disabled={isResolving}
              sx={{ color: 'success.main' }}
            >
              <Check size={16} />
            </IconButton>
          </Tooltip>
        )}
        {!isResolved && onSnooze && (
          <Tooltip title={t.ai.followUpTracker.actions.snooze}>
            <IconButton size="small" onClick={() => onSnooze(followUp.id)}>
              <Hourglass size={16} />
            </IconButton>
          </Tooltip>
        )}
        {onViewEmail && followUp.emailId && (
          <Tooltip title={t.ai.followUpTracker.actions.view}>
            <IconButton
              size="small"
              onClick={() => onViewEmail(followUp.emailId)}
              sx={{ color: 'text.secondary' }}
            >
              <Mail size={16} />
            </IconButton>
          </Tooltip>
        )}
        {onDelete && (
          <Tooltip title={t.ai.followUpTracker.actions.delete}>
            <IconButton
              size="small"
              onClick={() => onDelete(followUp.id)}
              sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
            >
              <Trash2 size={16} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}

export default FollowUpCard;
