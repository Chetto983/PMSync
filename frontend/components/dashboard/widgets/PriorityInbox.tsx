'use client';

import React from 'react';
import {
  Box,
  Typography,
  Avatar,
  Chip,
  Button,
  Skeleton,
  alpha,
  useTheme,
} from '@mui/material';
import { ArrowRight, Mail, Clock, Star } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useImportantEmails, type Email } from '@/hooks/queries';

interface PriorityInboxProps {
  limit?: number;
}

/**
 * PriorityInbox - Shows IMPORTANT emails (starred OR flagged)
 * Provider-agnostic "important" concept that works across Gmail, Outlook, IMAP
 */
export function PriorityInbox({ limit = 5 }: PriorityInboxProps) {
  const router = useRouter();
  const t = useTranslations();
  const theme = useTheme();
  // Use important emails (starred OR flagged) - provider-agnostic
  const { data, isLoading } = useImportantEmails({ limit });

  const emails = data?.emails || [];

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
    <Box
      sx={{
        height: '100%',
        borderRadius: 4,
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.08),
        bgcolor: 'background.paper',
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          transform: 'translateY(-4px)',
          borderColor: alpha(theme.palette.primary.main, 0.3),
          boxShadow: `0 20px 40px ${alpha(theme.palette.common.black, 0.08)}`,
        },
      }}
    >
      {/* Header */}
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
            bgcolor: alpha(theme.palette.primary.main, 0.1), // Using primary/cyan instead of warning for consistency
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'primary.main',
          }}
        >
          <Star size={20} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
            {t.email.quickFilters.important}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t.dashboard.home.sections.priorityEmails}
          </Typography>
        </Box>
        {emails.length > 0 && (
          <Chip
            label={emails.length}
            size="small"
            sx={{
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              color: 'primary.main',
              fontWeight: 600,
              fontSize: '0.75rem',
            }}
          />
        )}
      </Box>

      {/* Content */}
      <Box sx={{ p: 2 }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[1, 2, 3].map((i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1.5 }}>
                <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: 2 }} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="70%" height={18} />
                  <Skeleton width="90%" height={14} sx={{ mt: 0.5 }} />
                  <Skeleton width="60%" height={12} sx={{ mt: 0.25 }} />
                </Box>
              </Box>
            ))}
          </Box>
        ) : emails.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: 3,
                bgcolor: alpha(theme.palette.primary.main, 0.08),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 2,
              }}
            >
              <Star size={28} style={{ opacity: 0.5, color: theme.palette.primary.main }} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t.dashboard.home.sections.noStarredEmails || 'No starred emails'}
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
                bgcolor: 'primary.main',
                '&:hover': { bgcolor: 'primary.dark' },
              }}
            >
              {t.dashboard.home.sections.viewAllEmails}
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {emails.slice(0, 4).map((email) => {
              const isUnread = !email.isRead;
              return (
                <Box
                  key={email.id}
                  onClick={() => handleEmailClick(email)}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1.5,
                    p: 1.5,
                    borderRadius: 2.5,
                    cursor: 'pointer',
                    bgcolor: isUnread ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
                    border: '1px solid',
                    borderColor: isUnread ? alpha(theme.palette.primary.main, 0.12) : 'transparent',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      bgcolor: alpha(theme.palette.primary.main, 0.06),
                    },
                  }}
                >
                  <Avatar
                    sx={{
                      width: 40,
                      height: 40,
                      bgcolor: isUnread
                        ? alpha(theme.palette.primary.main, 0.15)
                        : alpha(theme.palette.grey[500], 0.1),
                      color: isUnread ? 'primary.main' : 'text.secondary',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    {email.from.name?.[0]?.toUpperCase() || 'U'}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: isUnread ? 600 : 500,
                          fontSize: '0.875rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}
                      >
                        {email.from.name}
                      </Typography>
                      {email.isStarred && (
                        <Star size={14} fill={theme.palette.primary.main} color={theme.palette.primary.main} style={{ flexShrink: 0 }} />
                      )}
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: isUnread ? 600 : 400,
                        fontSize: '0.8rem',
                        color: 'text.primary',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        mb: 0.25,
                      }}
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
                        fontSize: '0.75rem',
                      }}
                    >
                      {email.preview}
                    </Typography>
                  </Box>
                  <Box
                    component="span"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      color: 'text.secondary',
                      fontSize: '0.7rem',
                      flexShrink: 0,
                    }}
                  >
                    <Clock size={10} />
                    {formatTimeAgo(email.date)}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Footer */}
      {emails.length > 0 && (
        <Box sx={{ px: 2.5, pb: 2 }}>
          <Button
            fullWidth
            size="small"
            endIcon={<ArrowRight size={16} />}
            onClick={() => router.push('/dashboard/email?filter=starred')}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 500,
              color: 'primary.main',
              bgcolor: alpha(theme.palette.primary.main, 0.06),
              '&:hover': {
                bgcolor: alpha(theme.palette.primary.main, 0.12),
              },
            }}
          >
            {t.dashboard.home.sections.viewStarredEmails}
          </Button>
        </Box>
      )}
    </Box>
  );
}

export default PriorityInbox;
