/**
 * FollowUpWidget - Pending follow-ups with snooze functionality
 */

'use client';

import { useState, useCallback } from 'react';
import { useFollowUps, useSnoozeFollowUp } from '@/hooks/queries';
import { useTranslations } from '@/lib/hooks/use-translations';
import { BaseWidget } from './BaseWidget';
import {
  Typography,
  List,
  ListItem,
  ListItemText,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  Tooltip,
} from '@mui/material';
import { formatDistanceToNow, addHours, startOfTomorrow, nextMonday } from 'date-fns';
import { it as itLocale } from 'date-fns/locale';
import { useLocale } from '@/lib/hooks/use-locale';
import { Clock, Bell, BellOff } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function FollowUpWidget() {
  const t = useTranslations();
  const { locale } = useLocale();
  const dl = locale === 'it' ? { locale: itLocale } : undefined;
  const router = useRouter();
  const { data, isLoading, error, refetch } = useFollowUps({ limit: 5 });
  const snoozeMutation = useSnoozeFollowUp();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>, id: string) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedId(id);
  }, []);

  const handleMenuClose = useCallback(() => {
    setAnchorEl(null);
    setSelectedId(null);
  }, []);

  const handleSnooze = useCallback(async (hours: number | 'tomorrow' | 'nextWeek') => {
    if (!selectedId) return;

    let dueDate: Date;
    if (hours === 'tomorrow') {
      dueDate = startOfTomorrow();
      dueDate.setHours(9, 0, 0, 0); // 9 AM tomorrow
    } else if (hours === 'nextWeek') {
      dueDate = nextMonday(new Date());
      dueDate.setHours(9, 0, 0, 0); // 9 AM next Monday
    } else {
      dueDate = addHours(new Date(), hours);
    }

    try {
      await snoozeMutation.mutateAsync({ id: selectedId, dueDate: dueDate.toISOString() });
      refetch();
    } catch {
      // Error handled by mutation
    }

    handleMenuClose();
  }, [selectedId, snoozeMutation, refetch, handleMenuClose]);

  const wt = t.dashboard.widgets.followUps;
  const snoozeText = t.ai?.followUpTracker?.snooze || {
    title: 'Snooze',
    oneHour: '1 hour',
    fourHours: '4 hours',
    tomorrow: 'Tomorrow morning',
    nextWeek: 'Next week',
  };

  return (
    <BaseWidget
      id="follow-ups"
      title={wt.title}
      loading={isLoading}
      error={error?.message}
      rawError={error}
      onRefresh={() => refetch()}
      actions={
        data?.overdueCount ? (
          <Chip label={`${data.overdueCount} ${t.dashboard.widgets.common.overdue}`} size="small" color="error" />
        ) : null
      }
    >
      {data && data.followUps.length > 0 ? (
        <List dense disablePadding>
          {data.followUps.map((followUp) => (
            <ListItem
              key={followUp.id}
              disablePadding
              sx={{
                mb: 1,
                cursor: 'pointer',
                borderRadius: 1,
                '&:hover': { bgcolor: 'action.hover' },
                px: 1,
                py: 0.5,
              }}
              onClick={() => followUp.emailId && router.push(`/dashboard/email?id=${followUp.emailId}`)}
              secondaryAction={
                <Tooltip title={snoozeText.title}>
                  <IconButton
                    size="small"
                    onClick={(e) => handleMenuOpen(e, followUp.id)}
                    sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
                  >
                    <Clock size={16} />
                  </IconButton>
                </Tooltip>
              }
            >
              <ListItemText
                primary={followUp.subject}
                secondary={`${followUp.contactName} • ${formatDistanceToNow(new Date(followUp.dueDate), { addSuffix: true })}`}
                slotProps={{
                  primary: {
                    variant: 'body2',
                    noWrap: true,
                    sx: { pr: 4 },
                  },
                  secondary: {
                    variant: 'caption',
                    noWrap: true,
                    color: followUp.status === 'overdue' ? 'error' : 'text.secondary',
                  },
                }}
              />
            </ListItem>
          ))}
        </List>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {wt.noPending}
        </Typography>
      )}

      {/* Snooze Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={() => handleSnooze(1)}>
          <ListItemIcon><Clock size={16} /></ListItemIcon>
          {snoozeText.oneHour || '1 hour'}
        </MenuItem>
        <MenuItem onClick={() => handleSnooze(4)}>
          <ListItemIcon><Clock size={16} /></ListItemIcon>
          {snoozeText.fourHours || '4 hours'}
        </MenuItem>
        <MenuItem onClick={() => handleSnooze('tomorrow')}>
          <ListItemIcon><Bell size={16} /></ListItemIcon>
          {snoozeText.tomorrow}
        </MenuItem>
        <MenuItem onClick={() => handleSnooze('nextWeek')}>
          <ListItemIcon><BellOff size={16} /></ListItemIcon>
          {snoozeText.nextWeek}
        </MenuItem>
      </Menu>
    </BaseWidget>
  );
}
