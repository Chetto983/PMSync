'use client';

import React from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  IconButton,
  Chip,
  alpha,
  useTheme,
  Tooltip,
} from '@mui/material';
import { Check, Clock, Mail, AlertTriangle, Trash2, Hourglass } from 'lucide-react';
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
  followUp, onResolve, onSnooze, onViewEmail, onDelete, isResolving, isSelected,
}: FollowUpCardProps) {
  const theme = useTheme();
  const t = useTranslations();
  const { locale } = useLocale();
  const dl = locale === 'it' ? { locale: itLocale } : undefined;

  const now = new Date();
  const dueDate = followUp.dueDate ? new Date(followUp.dueDate) : null;
  const isOverdue = !!(dueDate && dueDate < now && followUp.status !== 'RESOLVED' && followUp.status !== 'EXPIRED');
  const isDueToday = !!(dueDate && dueDate.toDateString() === now.toDateString() && followUp.status === 'PENDING');
  const isResolved = followUp.status === 'RESOLVED' || followUp.status === 'EXPIRED';
  const formattedDate = dueDate
    ? format(dueDate, dueDate.getFullYear() !== now.getFullYear() ? 'MMM d, yyyy' : 'MMM d', dl)
    : null;

  return (
    <Card
      variant="outlined"
      sx={{
        opacity: isResolved ? 0.6 : isResolving ? 0.5 : 1,
        transition: 'all 0.15s ease',
        borderColor: isSelected
          ? theme.palette.primary.main
          : undefined,
        borderLeft: isOverdue
          ? `3px solid ${theme.palette.error.main}`
          : isDueToday
            ? `3px solid ${theme.palette.warning.main}`
            : undefined,
        '&:hover, &:focus-within': {
          borderColor: isSelected
            ? theme.palette.primary.main
            : alpha(theme.palette.primary.main, 0.3),
          '& .card-actions': { opacity: 1 },
        },
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        {/* Row 1: Subject + actions */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
              {followUp.email?.subject || t.ai.followUpTracker.noReason}
            </Typography>
            {followUp.email?.from && (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.25 }}>
                {followUp.email.from}
              </Typography>
            )}
          </Box>
          {/* Actions — hover reveal on desktop, always visible on mobile */}
          <Box
            className="card-actions"
            sx={{
              display: 'flex', gap: 0.25, flexShrink: 0,
              opacity: { xs: 1, md: 0 }, transition: 'opacity 0.15s ease',
            }}
          >
            {!isResolved && onResolve && (
              <Tooltip title={t.ai.followUpTracker.actions.resolve}>
                <IconButton size="small" onClick={() => onResolve(followUp.id)} disabled={isResolving} sx={{ color: 'success.main' }}>
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
                <IconButton size="small" onClick={() => onViewEmail(followUp.emailId)} sx={{ color: 'text.secondary' }}>
                  <Mail size={16} />
                </IconButton>
              </Tooltip>
            )}
            {onDelete && (
              <Tooltip title={t.ai.followUpTracker.actions.delete}>
                <IconButton size="small" onClick={() => onDelete(followUp.id)} sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}>
                  <Trash2 size={16} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        {/* Row 2: Chips + date */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1, flexWrap: 'wrap' }}>
          {followUp.followUpType && (
            <Chip
              label={followUp.followUpType === 'WAITING_FOR' ? t.ai.followUpTracker.types.waitingFor : t.ai.followUpTracker.types.todo}
              size="small"
              sx={{ height: 22, fontSize: '0.6875rem', fontWeight: 600, bgcolor: alpha(theme.palette.primary.main, 0.08), color: theme.palette.primary.main }}
            />
          )}
          {isOverdue && (
            <Chip
              icon={<AlertTriangle size={12} />}
              label={t.ai.followUpTracker.overdueWarning}
              size="small"
              color="error"
              sx={{ height: 22, fontSize: '0.6875rem', '& .MuiChip-icon': { color: 'inherit', ml: 0.5 } }}
            />
          )}
          {isDueToday && !isOverdue && (
            <Chip
              icon={<Clock size={12} />}
              label={t.ai.followUpTracker.dueTodayWarning}
              size="small"
              color="warning"
              sx={{ height: 22, fontSize: '0.6875rem', '& .MuiChip-icon': { color: 'inherit', ml: 0.5 } }}
            />
          )}
          {isResolved && (
            <Chip
              label={t.ai.followUpTracker.status[followUp.status] || followUp.status}
              size="small"
              variant="outlined"
              sx={{ height: 22, fontSize: '0.6875rem' }}
            />
          )}
          {formattedDate && (
            <Typography
              variant="caption"
              sx={{
                ml: 'auto',
                color: isOverdue ? 'error.main' : isDueToday ? 'warning.main' : 'text.secondary',
                fontWeight: isOverdue || isDueToday ? 600 : 400,
                fontSize: '0.75rem',
                whiteSpace: 'nowrap',
              }}
            >
              {formattedDate}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

export default FollowUpCard;
