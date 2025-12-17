'use client';

import React from 'react';
import {
  Box,
  Typography,
  Chip,
  Skeleton,
  Button,
  alpha,
  useTheme,
} from '@mui/material';
import { Clock, AlertTriangle, Calendar, ArrowRight, CheckCircle2, Target } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useDeadlines, type Deadline } from '@/hooks/queries';

interface DeadlineWidgetProps {
  limit?: number;
  showHeader?: boolean;
}

export function DeadlineWidget({ limit = 5, showHeader = true }: DeadlineWidgetProps) {
  const router = useRouter();
  const t = useTranslations();
  const theme = useTheme();
  const { data, isLoading } = useDeadlines({ limit });

  const wt = t.dashboard.widgets.deadlines;

  const formatDueDate = (dueDate: string) => {
    const date = new Date(dueDate);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (diff < 0) return wt.overdue;
    if (hours < 1) return wt.dueSoon;
    if (hours < 24) return wt.hoursLeft.replace('{hours}', String(hours));
    if (days === 0) return wt.dueToday;
    if (days === 1) return wt.dueTomorrow;
    if (days < 7) return wt.dueIn.replace('{days}', String(days));
    return date.toLocaleDateString(t.locale, { month: 'short', day: 'numeric' });
  };

  const isOverdue = (dueDate: string) => new Date(dueDate) < new Date();
  const isUrgent = (dueDate: string) => {
    const diff = new Date(dueDate).getTime() - new Date().getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    return hours > 0 && hours < 24;
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'calendar':
        return <Calendar size={18} />;
      case 'task':
        return <Target size={18} />;
      default:
        return <Clock size={18} />;
    }
  };

  const handleClick = (deadline: Deadline) => {
    if (deadline.source === 'email' && deadline.sourceId) {
      router.push(`/dashboard/email?id=${deadline.sourceId}`);
    } else if (deadline.source === 'calendar') {
      router.push('/dashboard/calendar');
    } else {
      router.push('/dashboard?view=deadlines');
    }
  };

  const deadlines = data?.deadlines || [];
  const hasOverdue = deadlines.some((d) => isOverdue(d.dueDate));

  return (
    <Box
      sx={{
        height: '100%',
        borderRadius: 4,
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.08),
        bgcolor: 'background.paper',
        overflow: 'hidden',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          borderColor: alpha(theme.palette.warning.main, 0.2),
          boxShadow: `0 8px 24px ${alpha(theme.palette.common.black, 0.06)}`,
        },
      }}
    >
      {/* Header */}
      {showHeader && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2.5,
            py: 2,
            borderBottom: '1px solid',
            borderColor: alpha(theme.palette.divider, 0.06),
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2.5,
              bgcolor: alpha(theme.palette.warning.main, 0.1),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'warning.main',
            }}
          >
            <Clock size={20} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
              {wt.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {data && data.todayCount > 0
                ? wt.subtitle
                    .replace('{todayCount}', String(data.todayCount))
                    .replace('{weekCount}', String(data.weekCount))
                : wt.noDeadlines}
            </Typography>
          </Box>
          {hasOverdue && (
            <Chip
              icon={<AlertTriangle size={12} />}
              label={wt.overdue}
              size="small"
              sx={{
                bgcolor: alpha(theme.palette.error.main, 0.1),
                color: 'error.main',
                fontWeight: 600,
                fontSize: '0.7rem',
                '& .MuiChip-icon': { color: 'inherit' },
              }}
            />
          )}
        </Box>
      )}

      {/* Content */}
      <Box sx={{ p: 2 }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[1, 2, 3].map((i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1.5 }}>
                <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: 2 }} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="70%" height={18} />
                  <Skeleton width="40%" height={14} sx={{ mt: 0.5 }} />
                </Box>
              </Box>
            ))}
          </Box>
        ) : deadlines.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: 3,
                bgcolor: alpha(theme.palette.warning.main, 0.08),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 2,
              }}
            >
              <CheckCircle2 size={28} style={{ opacity: 0.5, color: theme.palette.warning.main }} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {wt.noUpcoming}
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<Calendar size={16} />}
              onClick={() => router.push('/dashboard/calendar')}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                bgcolor: 'warning.main',
                color: 'warning.contrastText',
                '&:hover': { bgcolor: 'warning.dark' },
              }}
            >
              {wt.viewAll}
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {deadlines.slice(0, 4).map((deadline) => {
              const overdue = isOverdue(deadline.dueDate);
              const urgent = isUrgent(deadline.dueDate);
              return (
                <Box
                  key={deadline.id}
                  onClick={() => handleClick(deadline)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.5,
                    borderRadius: 2.5,
                    cursor: 'pointer',
                    bgcolor: overdue
                      ? alpha(theme.palette.error.main, 0.06)
                      : urgent
                        ? alpha(theme.palette.warning.main, 0.06)
                        : 'transparent',
                    border: '1px solid',
                    borderColor: overdue
                      ? alpha(theme.palette.error.main, 0.15)
                      : urgent
                        ? alpha(theme.palette.warning.main, 0.15)
                        : 'transparent',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      bgcolor: alpha(theme.palette.warning.main, 0.08),
                    },
                  }}
                >
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 2,
                      bgcolor: overdue
                        ? alpha(theme.palette.error.main, 0.1)
                        : urgent
                          ? alpha(theme.palette.warning.main, 0.15)
                          : alpha(theme.palette.warning.main, 0.1),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: overdue ? 'error.main' : 'warning.main',
                      flexShrink: 0,
                    }}
                  >
                    {getSourceIcon(deadline.source)}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: overdue || urgent ? 600 : 500,
                        fontSize: '0.875rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {deadline.title}
                    </Typography>
                    <Box
                      component="span"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        mt: 0.25,
                        color: overdue ? 'error.main' : urgent ? 'warning.main' : 'text.secondary',
                        fontSize: '0.75rem',
                      }}
                    >
                      <Clock size={12} />
                      {formatDueDate(deadline.dueDate)}
                    </Box>
                  </Box>
                  {(overdue || urgent || deadline.priority === 'high') && (
                    <Chip
                      label={overdue ? wt.overdue : urgent ? wt.dueSoon : wt.priority?.high || 'High'}
                      size="small"
                      sx={{
                        bgcolor: overdue ? 'error.main' : 'warning.main',
                        color: 'white',
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        height: 20,
                      }}
                    />
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Footer */}
      {deadlines.length > 0 && (
        <Box sx={{ px: 2.5, pb: 2 }}>
          <Button
            fullWidth
            size="small"
            endIcon={<ArrowRight size={16} />}
            onClick={() => router.push('/dashboard?view=deadlines')}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 500,
              color: 'warning.main',
              bgcolor: alpha(theme.palette.warning.main, 0.06),
              '&:hover': {
                bgcolor: alpha(theme.palette.warning.main, 0.12),
              },
            }}
          >
            {wt.viewAll}
          </Button>
        </Box>
      )}
    </Box>
  );
}

export default DeadlineWidget;
