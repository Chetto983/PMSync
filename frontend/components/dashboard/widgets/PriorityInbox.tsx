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
  Badge,
  Divider,
  Button,
  Skeleton,
} from '@mui/material';
import { Star, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/router';
import { DashboardCard } from '../DashboardCard';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useStarredEmails, type Email } from '@/hooks/queries';

interface PriorityInboxProps {
  limit?: number;
}

export function PriorityInbox({ limit = 5 }: PriorityInboxProps) {
  const router = useRouter();
  const t = useTranslations();
  const { data, isLoading } = useStarredEmails({ limit });

  const emails = data?.emails || [];

  const getProviderIcon = (providerType?: string) => {
    switch (providerType) {
      case 'google': return '📧';
      case 'microsoft': return '📨';
      default: return '📬';
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return t.timeAgo.justNow;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t.timeAgo.minutesAgo.replace('{minutes}', minutes.toString());
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t.timeAgo.hoursAgo.replace('{hours}', hours.toString());
    const days = Math.floor(hours / 24);
    return t.timeAgo.daysAgo.replace('{days}', days.toString());
  };

  const handleEmailClick = (email: Email) => {
    router.push(`/dashboard/email?id=${email.id}`);
  };

  return (
    <DashboardCard
      title={t.dashboard.home.sections.priorityInbox}
      subtitle={t.dashboard.home.sections.priorityInboxSubtitle}
    >
      {isLoading ? (
        <Box sx={{ py: 2 }}>
          {[1, 2, 3].map((i) => (
            <Box key={i} sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Skeleton variant="circular" width={40} height={40} />
              <Box sx={{ flex: 1 }}>
                <Skeleton width="70%" height={20} />
                <Skeleton width="90%" height={16} />
                <Skeleton width="60%" height={14} />
              </Box>
            </Box>
          ))}
        </Box>
      ) : emails.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Star size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <Typography variant="body2" color="text.secondary">
            {t.dashboard.home.sections.noStarredEmails}
          </Typography>
        </Box>
      ) : (
        <>
          <List sx={{ p: 0 }}>
            {emails.map((email, index) => (
              <React.Fragment key={email.id}>
                {index > 0 && <Divider />}
                <ListItemButton onClick={() => handleEmailClick(email)}>
                  <ListItemAvatar>
                    <Badge
                      badgeContent={getProviderIcon(email.provider?.providerType)}
                      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                      sx={{
                        '& .MuiBadge-badge': {
                          fontSize: '0.6rem',
                          minWidth: 18,
                          height: 18,
                          padding: 0,
                          backgroundColor: 'transparent',
                        },
                      }}
                    >
                      <Avatar>{email.from.name?.[0]?.toUpperCase() || 'U'}</Avatar>
                    </Badge>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: email.isRead ? 400 : 600 }}>
                          {email.from.name}
                        </Typography>
                        {email.isStarred && (
                          <Star size={14} fill="currentColor" color="#FFB300" />
                        )}
                      </Box>
                    }
                    secondary={
                      <Box>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: email.isRead ? 400 : 600, color: 'text.primary' }}
                        >
                          {email.subject}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display: '-webkit-box',
                            WebkitLineClamp: 1,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {email.preview}
                        </Typography>
                      </Box>
                    }
                  />
                  <Typography variant="caption" color="text.secondary">
                    {formatTimeAgo(email.date)}
                  </Typography>
                </ListItemButton>
              </React.Fragment>
            ))}
          </List>
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Button
              endIcon={<ArrowRight size={18} />}
              onClick={() => router.push('/dashboard/email')}
            >
              {t.dashboard.home.sections.viewAllEmails}
            </Button>
          </Box>
        </>
      )}
    </DashboardCard>
  );
}

export default PriorityInbox;
