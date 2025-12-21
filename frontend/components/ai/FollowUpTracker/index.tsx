'use client';

import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Search,
  Clock,
  Bell,
  CheckCircle,
  AlertTriangle,
  Calendar,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useFollowUpsList,
  usePendingFollowUps,
  useOverdueFollowUps,
  useFollowUpStats,
  useResolveFollowUp,
  useSnoozeFollowUp,
} from '@/hooks/queries';
import { FollowUpList } from './FollowUpList';

// Date helper functions (replacing date-fns)
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type TabValue = 'all' | 'pending' | 'overdue' | 'resolved';

export function FollowUpTracker() {
  const theme = useTheme();
  const t = useTranslations();
  const router = useRouter();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabValue>('pending');
  const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false);
  const [snoozeTargetId, setSnoozeTargetId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Queries
  const { data: allData, isLoading: allLoading, error: allError, refetch: refetchAll } =
    useFollowUpsList(undefined, 100);
  const { data: pendingData, isLoading: pendingLoading, error: pendingError, refetch: refetchPending } =
    usePendingFollowUps(50);
  const { data: overdueData, isLoading: overdueLoading, error: overdueError, refetch: refetchOverdue } =
    useOverdueFollowUps(50);
  const { data: stats } = useFollowUpStats();

  // Mutations
  const resolveFollowUp = useResolveFollowUp();
  const snoozeFollowUp = useSnoozeFollowUp();

  // Get current data based on tab
  const currentData = useMemo(() => {
    switch (activeTab) {
      case 'all':
        return { data: allData, isLoading: allLoading, error: allError, refetch: refetchAll };
      case 'pending':
        return { data: pendingData, isLoading: pendingLoading, error: pendingError, refetch: refetchPending };
      case 'overdue':
        return { data: overdueData, isLoading: overdueLoading, error: overdueError, refetch: refetchOverdue };
      case 'resolved':
        // Filter resolved from all data
        const resolvedFollowUps = allData?.followUps.filter(f => f.status === 'RESOLVED') || [];
        return {
          data: { followUps: resolvedFollowUps, count: resolvedFollowUps.length },
          isLoading: allLoading,
          error: allError,
          refetch: refetchAll,
        };
      default:
        return { data: pendingData, isLoading: pendingLoading, error: pendingError, refetch: refetchPending };
    }
  }, [activeTab, allData, pendingData, overdueData, allLoading, pendingLoading, overdueLoading, allError, pendingError, overdueError, refetchAll, refetchPending, refetchOverdue]);

  // Filter by search
  const filteredFollowUps = useMemo(() => {
    if (!currentData.data?.followUps) return [];
    if (!searchQuery.trim()) return currentData.data.followUps;

    const query = searchQuery.toLowerCase();
    return currentData.data.followUps.filter((f) =>
      f.email?.subject?.toLowerCase().includes(query) ||
      f.email?.from?.toLowerCase().includes(query) ||
      f.reason?.toLowerCase().includes(query)
    );
  }, [currentData.data?.followUps, searchQuery]);

  // Handlers
  const handleResolve = async (id: string) => {
    setResolvingId(id);
    try {
      await resolveFollowUp.mutateAsync(id);
    } finally {
      setResolvingId(null);
    }
  };

  const handleOpenSnooze = (id: string) => {
    setSnoozeTargetId(id);
    setSnoozeDialogOpen(true);
  };

  const handleSnooze = async (days: number) => {
    if (!snoozeTargetId) return;

    const newDate = days === 7
      ? addWeeks(new Date(), 1)
      : addDays(new Date(), days);

    try {
      await snoozeFollowUp.mutateAsync({
        id: snoozeTargetId,
        dueDate: newDate.toISOString(),
      });
      setSnoozeDialogOpen(false);
      setSnoozeTargetId(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleViewEmail = (emailId: string) => {
    router.push(`/dashboard/email?id=${emailId}`);
  };

  const handleTabChange = (_: React.SyntheticEvent, newValue: TabValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 3,
              bgcolor: alpha(theme.palette.warning.main, 0.1),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'warning.main',
            }}
          >
            <Bell size={24} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {t.ai.followUpTracker.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t.ai.followUpTracker.subtitle}
            </Typography>
          </Box>
        </Box>

        {/* Stats */}
        {stats && (
          <Box sx={{ display: 'flex', gap: 3, mt: 2, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Clock size={16} color={theme.palette.warning.main} />
              <Typography variant="body2" color="text.secondary">
                <strong>{stats.pending}</strong> {t.ai.followUpTracker.stats.pending.toLowerCase()}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AlertTriangle size={16} color={theme.palette.error.main} />
              <Typography variant="body2" color="text.secondary">
                <strong>{stats.overdue}</strong> {t.ai.followUpTracker.stats.overdue.toLowerCase()}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Calendar size={16} color={theme.palette.info.main} />
              <Typography variant="body2" color="text.secondary">
                <strong>{stats.dueToday}</strong> {t.ai.followUpTracker.stats.dueToday.toLowerCase()}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircle size={16} color={theme.palette.success.main} />
              <Typography variant="body2" color="text.secondary">
                <strong>{stats.resolved}</strong> {t.ai.followUpTracker.stats.resolved.toLowerCase()}
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      {/* Search & Tabs */}
      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          size="small"
          placeholder={t.ai.followUpTracker.searchPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={18} />
              </InputAdornment>
            ),
          }}
          sx={{
            mb: 2,
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
            },
          }}
        />

        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': {
              minHeight: 40,
              textTransform: 'none',
              fontWeight: 500,
            },
          }}
        >
          <Tab
            value="pending"
            label={`${t.ai.followUpTracker.tabs.pending} (${stats?.pending || 0})`}
          />
          <Tab
            value="overdue"
            label={`${t.ai.followUpTracker.tabs.overdue} (${stats?.overdue || 0})`}
          />
          <Tab
            value="resolved"
            label={t.ai.followUpTracker.tabs.resolved}
          />
          <Tab
            value="all"
            label={t.ai.followUpTracker.tabs.all}
          />
        </Tabs>
      </Box>

      {/* Follow-up List */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <FollowUpList
          followUps={filteredFollowUps}
          isLoading={currentData.isLoading}
          error={currentData.error}
          onResolve={handleResolve}
          onSnooze={handleOpenSnooze}
          onViewEmail={handleViewEmail}
          resolvingId={resolvingId}
          onRetry={() => currentData.refetch()}
        />
      </Box>

      {/* Snooze Dialog */}
      <Dialog
        open={snoozeDialogOpen}
        onClose={() => setSnoozeDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t.ai.followUpTracker.snooze.title}</DialogTitle>
        <DialogContent>
          <List>
            <ListItemButton onClick={() => handleSnooze(1)}>
              <ListItemIcon>
                <Calendar size={20} />
              </ListItemIcon>
              <ListItemText
                primary={t.ai.followUpTracker.snooze.tomorrow}
                secondary={formatDate(addDays(new Date(), 1))}
              />
            </ListItemButton>
            <ListItemButton onClick={() => handleSnooze(7)}>
              <ListItemIcon>
                <Calendar size={20} />
              </ListItemIcon>
              <ListItemText
                primary={t.ai.followUpTracker.snooze.nextWeek}
                secondary={formatDate(addWeeks(new Date(), 1))}
              />
            </ListItemButton>
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSnoozeDialogOpen(false)}>
            {t.common.cancel}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default FollowUpTracker;
