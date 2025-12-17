'use client';

import React from 'react';
import {
  Box,
  Typography,
  Avatar,
  Chip,
  Skeleton,
  Button,
  alpha,
  useTheme,
} from '@mui/material';
import { Bell, Mail, ArrowRight, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
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
  const theme = useTheme();
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
        height: '100%',
        borderRadius: 4,
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.08),
        bgcolor: 'background.paper',
        overflow: 'hidden',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          borderColor: alpha(theme.palette.info.main, 0.2),
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
              bgcolor: alpha(theme.palette.info.main, 0.1),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'info.main',
            }}
          >
            <Bell size={20} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
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
              sx={{
                bgcolor: alpha(theme.palette.error.main, 0.1),
                color: 'error.main',
                fontWeight: 600,
                fontSize: '0.75rem',
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
                  <Skeleton width="50%" height={14} sx={{ mt: 0.5 }} />
                </Box>
              </Box>
            ))}
          </Box>
        ) : followUps.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: 3,
                bgcolor: alpha(theme.palette.info.main, 0.08),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 2,
              }}
            >
              <CheckCircle2 size={28} style={{ opacity: 0.5, color: theme.palette.info.main }} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {wt.noPending}
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<Mail size={16} />}
              onClick={() => router.push('/dashboard/email')}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                bgcolor: 'info.main',
                '&:hover': { bgcolor: 'info.dark' },
              }}
            >
              {wt.viewAll}
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {followUps.slice(0, 4).map((followUp) => {
              const isOverdue = followUp.status === 'overdue';
              return (
                <Box
                  key={followUp.id}
                  onClick={() => handleClick(followUp)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.5,
                    borderRadius: 2.5,
                    cursor: 'pointer',
                    bgcolor: isOverdue ? alpha(theme.palette.error.main, 0.06) : 'transparent',
                    border: '1px solid',
                    borderColor: isOverdue ? alpha(theme.palette.error.main, 0.15) : 'transparent',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      bgcolor: alpha(theme.palette.info.main, 0.06),
                    },
                  }}
                >
                  <Avatar
                    sx={{
                      width: 40,
                      height: 40,
                      bgcolor: isOverdue
                        ? alpha(theme.palette.error.main, 0.1)
                        : alpha(theme.palette.info.main, 0.1),
                      color: isOverdue ? 'error.main' : 'info.main',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    {followUp.contactName?.[0]?.toUpperCase() || 'U'}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: isOverdue ? 600 : 500,
                        fontSize: '0.875rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {followUp.contactName}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        mt: 0.25,
                      }}
                    >
                      {followUp.subject}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                    <Box
                      component="span"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        color: isOverdue ? 'error.main' : 'text.secondary',
                        fontSize: '0.7rem',
                      }}
                    >
                      <Clock size={10} />
                      {formatTimeAgo(followUp.dueDate)}
                    </Box>
                    {isOverdue && (
                      <Chip
                        label={wt.overdue}
                        size="small"
                        sx={{
                          bgcolor: 'error.main',
                          color: 'white',
                          fontSize: '0.6rem',
                          fontWeight: 700,
                          height: 18,
                        }}
                      />
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Footer */}
      {followUps.length > 0 && (
        <Box sx={{ px: 2.5, pb: 2 }}>
          <Button
            fullWidth
            size="small"
            endIcon={<ArrowRight size={16} />}
            onClick={() => router.push('/dashboard?view=followups')}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 500,
              color: 'info.main',
              bgcolor: alpha(theme.palette.info.main, 0.06),
              '&:hover': {
                bgcolor: alpha(theme.palette.info.main, 0.12),
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

export default FollowUpWidget;
