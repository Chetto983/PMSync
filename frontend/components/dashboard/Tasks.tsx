import React, { useState, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Skeleton,
  Alert,
  Button,
  ListItemIcon,
} from '@mui/material';
import { Clock, CheckSquare, AlertCircle, CheckCircle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  usePendingFollowUps,
  useFollowUpStats,
  type EmailFollowUp,
} from '@/hooks/queries/use-follow-ups';

type FilterType = 'all' | 'today' | 'upcoming';

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isFuture(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return d >= tomorrow;
}

function isOverdue(followUp: EmailFollowUp): boolean {
  if (!followUp.dueDate || followUp.status !== 'PENDING') return false;
  const d = new Date(followUp.dueDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return d < now;
}

function getStatusIcon(followUp: EmailFollowUp) {
  if (isOverdue(followUp)) {
    return <AlertCircle size={20} color="var(--mui-palette-error-main)" />;
  }
  if (followUp.followUpType === 'WAITING_FOR') {
    return <Clock size={20} color="var(--mui-palette-info-main)" />;
  }
  if (followUp.followUpType === 'TODO') {
    return <CheckSquare size={20} color="var(--mui-palette-secondary-main)" />;
  }
  return <Clock size={20} color="var(--mui-palette-warning-main)" />;
}

function getDescription(
  followUp: EmailFollowUp,
  commitmentPrefix: string,
  waitingOnPrefix: string,
): string {
  if (followUp.reason) return followUp.reason;
  if (followUp.commitments?.length) {
    return `${commitmentPrefix} ${followUp.commitments[0].commitment}`;
  }
  if (followUp.waitingFor?.length) {
    return `${waitingOnPrefix} ${followUp.waitingFor[0].waitingFor}`;
  }
  return '';
}

function getTypeChipColor(
  followUp: EmailFollowUp,
): 'info' | 'secondary' | 'warning' {
  if (followUp.followUpType === 'WAITING_FOR') return 'info';
  if (followUp.followUpType === 'TODO') return 'secondary';
  return 'warning';
}

export function Tasks() {
  const t = useTranslations();
  const [filter, setFilter] = useState<FilterType>('all');
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = usePendingFollowUps(50, false);
  const { data: stats } = useFollowUpStats();

  const followUps = data?.followUps ?? [];

  const filtered = useMemo(() => {
    if (filter === 'today') {
      return followUps.filter((fu) => fu.dueDate && isToday(fu.dueDate));
    }
    if (filter === 'upcoming') {
      return followUps.filter((fu) => fu.dueDate && isFuture(fu.dueDate));
    }
    return followUps;
  }, [followUps, filter]);

  const allCount = stats?.pending ?? 0;
  const todayCount = stats?.dueToday ?? 0;
  const upcomingCount = Math.max(
    0,
    (stats?.pending ?? 0) - (stats?.overdue ?? 0) - (stats?.dueToday ?? 0),
  );

  const filters: Array<{ key: FilterType; label: string; count: number }> = [
    { key: 'all', label: t.tasks.allTasks, count: allCount },
    { key: 'today', label: t.tasks.today, count: todayCount },
    { key: 'upcoming', label: t.tasks.upcoming, count: upcomingCount },
  ];

  return (
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Sidebar */}
      <Paper
        sx={{
          width: 240,
          borderRadius: 0,
          borderRight: 1,
          borderColor: 'divider',
          display: { xs: 'none', md: 'block' },
          p: 2,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
          {t.tasks.workspace}
        </Typography>
        <List sx={{ p: 0 }}>
          {filters.map((f) => (
            <ListItemButton
              key={f.key}
              selected={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              <ListItemText primary={f.label} />
              <ListItemSecondaryAction>
                <Chip size="small" label={f.count} />
              </ListItemSecondaryAction>
            </ListItemButton>
          ))}
        </List>
      </Paper>

      {/* Main Content */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          p: 4,
          overflow: 'auto',
        }}
      >
        {/* Loading */}
        {isLoading && (
          <Box>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton
                key={i}
                variant="rectangular"
                height={72}
                width="100%"
                sx={{ borderRadius: 1, mb: 1 }}
              />
            ))}
          </Box>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetch()}>
                {t.common.retryLoading}
              </Button>
            }
          >
            {t.tasks.errorLoading}
          </Alert>
        )}

        {/* Empty state */}
        {!isLoading && !isError && followUps.length === 0 && (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: 'action.hover',
                mb: 2,
              }}
            >
              <CheckCircle size={32} strokeWidth={1.5} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              {t.tasks.emptyTitle}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ textAlign: 'center', maxWidth: 360 }}
            >
              {t.tasks.emptyDescription}
            </Typography>
          </Box>
        )}

        {/* Data */}
        {!isLoading && !isError && followUps.length > 0 && (
          <>
            {/* Stats bar */}
            {stats && (
              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                <Chip
                  variant="outlined"
                  size="small"
                  label={t.tasks.statsPending.replace(
                    '{count}',
                    String(stats.pending),
                  )}
                />
                <Chip
                  variant="outlined"
                  size="small"
                  color="error"
                  label={t.tasks.statsOverdue.replace(
                    '{count}',
                    String(stats.overdue),
                  )}
                />
              </Box>
            )}

            {/* No filter results */}
            {filtered.length === 0 && (
              <Box
                sx={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  {t.tasks.noFilterResults}
                </Typography>
              </Box>
            )}

            {/* Follow-up list */}
            {filtered.map((followUp) => (
              <Paper
                key={followUp.id}
                data-testid="follow-up-item"
                variant="outlined"
                sx={{
                  p: 2,
                  mb: 1,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 2,
                }}
              >
                {/* Status icon */}
                <ListItemIcon sx={{ minWidth: 'auto', mt: 0.5 }}>
                  {getStatusIcon(followUp)}
                </ListItemIcon>

                {/* Center content */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    color="text.primary"
                    sx={{ fontWeight: 500 }}
                    noWrap
                  >
                    {followUp.email?.subject ?? 'Untitled'}
                  </Typography>
                  {getDescription(
                    followUp,
                    t.tasks.commitmentPrefix,
                    t.tasks.waitingOnPrefix,
                  ) && (
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {getDescription(
                        followUp,
                        t.tasks.commitmentPrefix,
                        t.tasks.waitingOnPrefix,
                      )}
                    </Typography>
                  )}
                  {followUp.email?.from && (
                    <Typography variant="caption" color="text.disabled">
                      {followUp.email.from}
                    </Typography>
                  )}
                </Box>

                {/* Right chips */}
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 0.5,
                  }}
                >
                  <Chip
                    size="small"
                    color={getTypeChipColor(followUp)}
                    label={
                      followUp.followUpType === 'WAITING_FOR'
                        ? t.tasks.waitingFor
                        : t.tasks.todo
                    }
                  />
                  {followUp.dueDate && (
                    <Chip
                      size="small"
                      color={
                        isOverdue(followUp)
                          ? 'error'
                          : isToday(followUp.dueDate)
                            ? 'warning'
                            : 'default'
                      }
                      label={
                        isOverdue(followUp)
                          ? t.tasks.overdue
                          : isToday(followUp.dueDate)
                            ? t.tasks.dueToday
                            : new Date(followUp.dueDate).toLocaleDateString()
                      }
                    />
                  )}
                </Box>
              </Paper>
            ))}
          </>
        )}
      </Box>
    </Box>
  );
}
