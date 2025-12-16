'use client';

import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Chip,
  Skeleton,
  Button,
  alpha,
} from '@mui/material';
import { Bell, Mail, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useFollowUps, type FollowUp } from '@/hooks/queries';

interface FollowUpWidgetProps {
  limit?: number;
  showHeader?: boolean;
}

export function FollowUpWidget({ limit = 5, showHeader = true }: FollowUpWidgetProps) {
  const router = useRouter();
  const t = useTranslations();
  const { data, isLoading } = useFollowUps({ limit });

  const wt = t.dashboard.widgets.followUps;

  const formatTimeAgo = (dueDate: string) => {
    const date = new Date(dueDate);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return wt.today;
    if (days === 1) return wt.yesterday;
    if (days < 7) return wt.daysAgo.replace('{days}', String(days));
    if (days < 30) return wt.weeksAgo.replace('{weeks}', String(Math.floor(days / 7)));
    return date.toLocaleDateString(t.locale, { month: 'short', day: 'numeric' });
  };

  const handleClick = (followUp: FollowUp) => {
    router.push(`/dashboard/email?id=${followUp.emailId}`);
  };

  const followUps = data?.followUps || [];
  const pendingCount = data?.pendingCount || 0;
  const overdueCount = data?.overdueCount || 0;

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
              bgcolor: (theme) => alpha(theme.palette.info.main, 0.1),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'info.main',
            }}
          >
            <Bell size={18} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {wt.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {pendingCount > 0
                ? overdueCount > 0
                  ? wt.subtitleWithOverdue
                      .replace('{pendingCount}', String(pendingCount))
                      .replace('{overdueCount}', String(overdueCount))
                  : wt.subtitle.replace('{pendingCount}', String(pendingCount))
                : wt.noPending}
            </Typography>
          </Box>
          {overdueCount > 0 && (
            <Chip
              icon={<AlertCircle size={12} />}
              label={overdueCount}
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
              <Skeleton variant="circular" width={40} height={40} />
              <Box sx={{ flex: 1 }}>
                <Skeleton width="70%" height={20} />
                <Skeleton width="50%" height={16} />
              </Box>
            </Box>
          ))}
        </Box>
      ) : followUps.length === 0 ? (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <CheckCircle2 size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
          <Typography variant="body2" color="text.secondary">
            {wt.noPending}
          </Typography>
        </Box>
      ) : (
        <List sx={{ p: 0 }}>
          {followUps.map((followUp) => (
            <ListItemButton
              key={followUp.id}
              onClick={() => handleClick(followUp)}
              sx={{
                py: 1.5,
                px: 2,
                borderBottom: 1,
                borderColor: 'divider',
                '&:last-child': { borderBottom: 0 },
              }}
            >
              <ListItemAvatar sx={{ minWidth: 44 }}>
                <Avatar sx={{ width: 36, height: 36, fontSize: '0.875rem' }}>
                  {followUp.contactName?.[0]?.toUpperCase() || 'U'}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Mail size={14} style={{ opacity: 0.5 }} />
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{ flex: 1, fontWeight: followUp.status === 'overdue' ? 600 : 400 }}
                    >
                      {followUp.contactName}
                    </Typography>
                  </Box>
                }
                secondary={
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {followUp.subject}
                  </Typography>
                }
              />
              <Box sx={{ textAlign: 'right' }}>
                <Typography
                  variant="caption"
                  color={followUp.status === 'overdue' ? 'error' : 'text.secondary'}
                  sx={{ display: 'block' }}
                >
                  {formatTimeAgo(followUp.dueDate)}
                </Typography>
                {followUp.status === 'overdue' && (
                  <Chip
                    size="small"
                    label={wt.overdue}
                    color="error"
                    sx={{ fontSize: '0.6rem', height: 18, mt: 0.5 }}
                  />
                )}
              </Box>
            </ListItemButton>
          ))}
        </List>
      )}

      <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <Button
          fullWidth
          size="small"
          endIcon={<ArrowRight size={14} />}
          onClick={() => router.push('/dashboard?view=followups')}
        >
          {wt.viewAll}
        </Button>
      </Box>
    </Box>
  );
}

export default FollowUpWidget;
