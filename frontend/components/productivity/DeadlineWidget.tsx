'use client';

import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  Skeleton,
  Button,
  alpha,
} from '@mui/material';
import { Clock, AlertTriangle, Calendar, ArrowRight, CheckCircle2 } from 'lucide-react';
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

  const getPriorityColor = (priority: string, overdue: boolean): 'error' | 'warning' | 'default' => {
    if (overdue) return 'error';
    switch (priority) {
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getPriorityLabel = (priority: string, overdue: boolean) => {
    if (overdue) return wt.overdue;
    switch (priority) {
      case 'high':
        return wt.priority.high;
      case 'medium':
        return wt.priority.medium;
      default:
        return wt.priority.low;
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'calendar':
        return <Calendar size={16} />;
      case 'task':
        return <CheckCircle2 size={16} />;
      default:
        return <Clock size={16} />;
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
        borderRadius: 3,
        overflow: 'hidden',
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {showHeader && (
        <Box
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              bgcolor: (theme) => alpha(theme.palette.warning.main, 0.1),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'warning.main',
            }}
          >
            <Clock size={18} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
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
              color="error"
            />
          )}
        </Box>
      )}

      {isLoading ? (
        <Box sx={{ p: 2 }}>
          {[1, 2, 3].map((i) => (
            <Box key={i} sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Skeleton variant="circular" width={32} height={32} />
              <Box sx={{ flex: 1 }}>
                <Skeleton width="70%" height={20} />
                <Skeleton width="40%" height={16} />
              </Box>
            </Box>
          ))}
        </Box>
      ) : deadlines.length === 0 ? (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <CheckCircle2 size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
          <Typography variant="body2" color="text.secondary">
            {wt.noUpcoming}
          </Typography>
        </Box>
      ) : (
        <List sx={{ p: 0 }}>
          {deadlines.map((deadline) => {
            const overdue = isOverdue(deadline.dueDate);
            return (
              <ListItemButton
                key={deadline.id}
                onClick={() => handleClick(deadline)}
                sx={{
                  py: 1.5,
                  px: 2,
                  borderBottom: 1,
                  borderColor: 'divider',
                  '&:last-child': { borderBottom: 0 },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {getSourceIcon(deadline.source)}
                </ListItemIcon>
                <ListItemText
                  primary={deadline.title}
                  secondary={formatDueDate(deadline.dueDate)}
                  primaryTypographyProps={{
                    variant: 'body2',
                    fontWeight: overdue ? 600 : 400,
                    noWrap: true,
                  }}
                  secondaryTypographyProps={{
                    variant: 'caption',
                    color: overdue ? 'error' : 'text.secondary',
                  }}
                />
                <Chip
                  size="small"
                  label={getPriorityLabel(deadline.priority, overdue)}
                  color={getPriorityColor(deadline.priority, overdue)}
                  sx={{ fontSize: '0.65rem', height: 20 }}
                />
              </ListItemButton>
            );
          })}
        </List>
      )}

      <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <Button
          fullWidth
          size="small"
          endIcon={<ArrowRight size={14} />}
          onClick={() => router.push('/dashboard?view=deadlines')}
        >
          {wt.viewAll}
        </Button>
      </Box>
    </Box>
  );
}

export default DeadlineWidget;
