import React, { useCallback } from 'react';
import {
  Box,
  Menu,
  MenuItem,
  Divider,
  Typography,
  Chip,
  CircularProgress,
} from '@mui/material';
import { Mail } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { formatDateInTz } from '@/lib/utils/format-date-tz';

interface HeaderNotification {
  id: string;
  subject: string;
  sender: string;
  receivedAt?: string;
}

export interface NotificationBellProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  notifications: HeaderNotification[];
  notificationsLoading: boolean;
  unreadCount: number;
  onViewAll: () => void;
  onNotificationClick: (notificationId: string) => void;
}

export function NotificationBell({
  anchorEl,
  onClose,
  notifications,
  notificationsLoading,
  unreadCount,
  onViewAll,
  onNotificationClick,
}: NotificationBellProps) {
  const t = useTranslations();
  const tz = useUserTimezone();

  const formatRelativeTime = useCallback((isoDate?: string) => {
    if (!isoDate) {
      return '';
    }
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return t.timeAgo.justNow;
    if (diffMinutes < 60) return t.timeAgo.minutesAgo.replace('{minutes}', diffMinutes.toString());
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return t.timeAgo.hoursAgo.replace('{hours}', diffHours.toString());
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return t.timeAgo.daysAgo.replace('{days}', diffDays.toString());
    return formatDateInTz(date, tz);
  }, [t.timeAgo]);

  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      transformOrigin={{ horizontal: 'right', vertical: 'top' }}
      anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      PaperProps={{
        sx: {
          mt: 1.5,
          minWidth: 340,
          maxHeight: 420,
          borderRadius: 2,
          boxShadow: 3,
        },
      }}
    >
      {/* Header */}
      <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {t.nav.notifications}
        </Typography>
        {unreadCount > 0 && (
          <Chip
            size="small"
            label={`${unreadCount} ${t.ai?.unread || 'new'}`}
            color="primary"
            sx={{ height: 22, fontSize: '0.7rem' }}
          />
        )}
      </Box>
      <Divider />

      {/* Content */}
      {notificationsLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      )}
      {!notificationsLoading && notifications.length === 0 && (
        <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
          <Mail size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
          <Typography variant="body2" color="text.secondary">
            {t.common.allCaughtUp}
          </Typography>
        </Box>
      )}
      {!notificationsLoading &&
        notifications.map((notification) => (
          <MenuItem
            key={notification.id}
            onClick={() => {
              onClose();
              onNotificationClick(notification.id);
            }}
            sx={{
              py: 1.5,
              px: 2,
              borderBottom: 1,
              borderColor: 'divider',
              '&:last-of-type': { borderBottom: 0 },
            }}
          >
            <Box sx={{ width: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, mr: 1 }} noWrap>
                  {notification.sender}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatRelativeTime(notification.receivedAt)}
                </Typography>
              </Box>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {notification.subject}
              </Typography>
            </Box>
          </MenuItem>
        ))}

      {/* Footer */}
      <Divider />
      <MenuItem
        onClick={() => {
          onViewAll();
          onClose();
        }}
        sx={{
          justifyContent: 'center',
          py: 1.5,
          color: 'primary.main',
          fontWeight: 600,
        }}
      >
        {t.dashboard?.home?.sections?.viewAllEmails || 'View All Emails'}
      </MenuItem>
    </Menu>
  );
}
