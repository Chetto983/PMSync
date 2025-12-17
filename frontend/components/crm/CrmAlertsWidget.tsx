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
  LinearProgress,
  useTheme,
} from '@mui/material';
import { Users, AlertTriangle, Mail, ArrowRight, TrendingDown, CheckCircle2, Clock } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useStaleContacts, type StaleContact } from '@/hooks/queries';

interface CrmAlertsWidgetProps {
  limit?: number;
  showHeader?: boolean;
}

export function CrmAlertsWidget({ limit = 5, showHeader = true }: CrmAlertsWidgetProps) {
  const router = useRouter();
  const t = useTranslations();
  const theme = useTheme();
  const { data, isLoading } = useStaleContacts({ limit });

  const wt = t.dashboard.widgets.crm;

  const formatLastContact = (lastInteraction: string) => {
    const date = new Date(lastInteraction);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days < 30) return wt.daysAgo.replace('{days}', String(days));
    if (days < 60) return wt.monthAgo;
    if (days < 365) return wt.monthsAgo.replace('{months}', String(Math.floor(days / 30)));
    const years = Math.floor(days / 365);
    return years === 1 ? wt.yearAgo : wt.yearsAgo.replace('{years}', String(years));
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return theme.palette.success.main;
    if (score >= 40) return theme.palette.warning.main;
    return theme.palette.error.main;
  };

  const handleClick = (contact: StaleContact) => {
    router.push(`/dashboard/contacts?id=${contact.id}`);
  };

  const handleReconnect = (e: React.MouseEvent, contact: StaleContact) => {
    e.stopPropagation();
    router.push(`/dashboard/email?compose=true&to=${encodeURIComponent(contact.email)}`);
  };

  const contacts = data?.contacts || [];
  const totalStale = data?.total || 0;
  const averageScore = data?.averageScore || 0;

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
          borderColor: alpha(theme.palette.error.main, 0.2),
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
              bgcolor: alpha(theme.palette.error.main, 0.1),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'error.main',
            }}
          >
            <Users size={20} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
              {wt.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {totalStale > 0
                ? `${totalStale > 1
                    ? wt.subtitlePlural.replace('{count}', String(totalStale))
                    : wt.subtitle.replace('{count}', String(totalStale))} • ${wt.avgScore.replace('{score}', String(averageScore))}`
                : wt.allActive}
            </Typography>
          </Box>
          {totalStale > 0 && (
            <Chip
              icon={<TrendingDown size={12} />}
              label={totalStale}
              size="small"
              sx={{
                bgcolor: alpha(theme.palette.warning.main, 0.1),
                color: 'warning.main',
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
                  <Skeleton width="60%" height={18} />
                  <Skeleton width="40%" height={14} sx={{ mt: 0.5 }} />
                </Box>
              </Box>
            ))}
          </Box>
        ) : contacts.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: 3,
                bgcolor: alpha(theme.palette.success.main, 0.08),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 2,
              }}
            >
              <CheckCircle2 size={28} style={{ color: theme.palette.success.main }} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {wt.allActive}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {wt.greatJob}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {contacts.slice(0, 4).map((contact) => {
              const isVeryStale = contact.daysSinceContact > 60;
              const scoreColor = getScoreColor(contact.relationshipScore);
              return (
                <Box
                  key={contact.id}
                  onClick={() => handleClick(contact)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.5,
                    borderRadius: 2.5,
                    cursor: 'pointer',
                    bgcolor: isVeryStale ? alpha(theme.palette.error.main, 0.04) : 'transparent',
                    border: '1px solid',
                    borderColor: isVeryStale ? alpha(theme.palette.error.main, 0.12) : 'transparent',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      bgcolor: alpha(theme.palette.error.main, 0.06),
                    },
                  }}
                >
                  <Avatar
                    sx={{
                      width: 40,
                      height: 40,
                      bgcolor: alpha(scoreColor, 0.15),
                      color: scoreColor,
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    {contact.name?.[0]?.toUpperCase() || 'U'}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: isVeryStale ? 600 : 500,
                          fontSize: '0.875rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}
                      >
                        {contact.name}
                      </Typography>
                      {isVeryStale && (
                        <AlertTriangle size={14} style={{ color: theme.palette.warning.main, flexShrink: 0 }} />
                      )}
                    </Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        mb: 0.5,
                      }}
                    >
                      {contact.company || contact.email}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={contact.relationshipScore}
                        sx={{
                          flex: 1,
                          height: 4,
                          borderRadius: 2,
                          bgcolor: alpha(scoreColor, 0.1),
                          '& .MuiLinearProgress-bar': {
                            bgcolor: scoreColor,
                            borderRadius: 2,
                          },
                        }}
                      />
                      <Typography variant="caption" sx={{ color: scoreColor, fontWeight: 600, fontSize: '0.7rem' }}>
                        {contact.relationshipScore}%
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5, ml: 0.5 }}>
                    <Box
                      component="span"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        color: 'text.secondary',
                        fontSize: '0.7rem',
                      }}
                    >
                      <Clock size={10} />
                      {formatLastContact(contact.lastInteraction)}
                    </Box>
                    <Chip
                      icon={<Mail size={10} />}
                      label={wt.reconnect}
                      size="small"
                      onClick={(e) => handleReconnect(e, contact)}
                      sx={{
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        color: 'primary.main',
                        fontSize: '0.6rem',
                        fontWeight: 600,
                        height: 20,
                        '& .MuiChip-icon': { color: 'inherit' },
                        '&:hover': {
                          bgcolor: alpha(theme.palette.primary.main, 0.2),
                        },
                      }}
                    />
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Footer */}
      {contacts.length > 0 && (
        <Box sx={{ px: 2.5, pb: 2 }}>
          <Button
            fullWidth
            size="small"
            endIcon={<ArrowRight size={16} />}
            onClick={() => router.push('/dashboard/contacts?filter=stale')}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 500,
              color: 'error.main',
              bgcolor: alpha(theme.palette.error.main, 0.06),
              '&:hover': {
                bgcolor: alpha(theme.palette.error.main, 0.12),
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

export default CrmAlertsWidget;
