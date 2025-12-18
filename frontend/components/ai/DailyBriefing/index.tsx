'use client';

import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Skeleton,
  Collapse,
  alpha,
  Chip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Sun,
  Moon,
  Sunset,
  X,
  ChevronDown,
  ChevronUp,
  Mail,
  Clock,
  Bell,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useBriefing, useRecentUnreadEmails, type Email } from '@/hooks/queries';

interface DailyBriefingProps {
  userName?: string;
  onDismiss?: () => void;
}

// Check if dismissed for today
function getInitialDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  const dismissedDate = localStorage.getItem('briefing-dismissed');
  return dismissedDate === new Date().toDateString();
}

export function DailyBriefing({ userName, onDismiss }: DailyBriefingProps) {
  const t = useTranslations();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const router = useRouter();
  const { data: briefing, isLoading, refetch, isRefetching } = useBriefing();
  const { data: unreadData } = useRecentUnreadEmails({ limit: 5 });
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(getInitialDismissed);

  const urgentEmails = unreadData?.emails || [];

  const getTimeIcon = () => {
    const hour = new Date().getHours();
    if (hour < 12) return <Sun size={20} />;
    if (hour < 18) return <Sunset size={20} />;
    return <Moon size={20} />;
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    const name = userName || 'there';
    if (hour < 12) return `${t.greetings.morning}, ${name}!`;
    if (hour < 18) return `${t.greetings.afternoon}, ${name}!`;
    return `${t.greetings.evening}, ${name}!`;
  };

  const handleDismiss = () => {
    localStorage.setItem('briefing-dismissed', new Date().toDateString());
    setDismissed(true);
    onDismiss?.();
  };

  const handleRefresh = () => {
    refetch();
  };

  const handleEmailClick = (email: Email) => {
    router.push(`/dashboard/email?id=${email.id}`);
  };

  // Build summary - translated properly
  const buildSummary = () => {
    if (!briefing) return '';
    const wt = t.dashboard.widgets.briefing;
    const parts: string[] = [];

    if (briefing.urgentEmails > 0) {
      parts.push(`${briefing.urgentEmails} ${briefing.urgentEmails > 1 ? wt.urgentEmailsPlural : wt.urgentEmails}`);
    }
    if (briefing.deadlinesToday > 0) {
      parts.push(`${briefing.deadlinesToday} ${briefing.deadlinesToday > 1 ? wt.deadlinesPlural : wt.deadlines} ${wt.today}`);
    }
    if (briefing.pendingFollowUps > 0) {
      parts.push(`${briefing.pendingFollowUps} ${briefing.pendingFollowUps > 1 ? wt.followUpsPlural : wt.followUps}`);
    }

    if (parts.length === 0) return wt.noItems;
    return parts.join(' • ');
  };

  if (dismissed) return null;

  const wt = t.dashboard.widgets.briefing;

  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.08),
        mb: 3,
        bgcolor: 'background.paper',
        boxShadow: `0 4px 20px ${alpha(theme.palette.common.black, 0.04)}`,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2.5,
          py: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          borderBottom: expanded ? '1px solid' : 'none',
          borderColor: alpha(theme.palette.divider, 0.06),
          cursor: 'pointer',
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.04)} 0%, ${alpha('#7c3aed', 0.04)} 100%)`,
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2.5,
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, #7c3aed 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
          }}
        >
          {getTimeIcon()}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          {isLoading ? (
            <>
              <Skeleton width={120} height={24} />
              <Skeleton width={100} height={16} />
            </>
          ) : (
            <>
              <Typography variant="subtitle1" noWrap sx={{
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                fontSize: { xs: '0.875rem', sm: '0.95rem' },
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                <Sparkles size={16} />
                {wt.title}
              </Typography>
              {!isMobile && (
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                  {getGreeting()}
                </Typography>
              )}
            </>
          )}
        </Box>

        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            handleRefresh();
          }}
          disabled={isRefetching}
          sx={{ mr: 0.5 }}
        >
          <RefreshCw size={16} className={isRefetching ? 'animate-spin' : ''} />
        </IconButton>

        <IconButton size="small" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </IconButton>

        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            handleDismiss();
          }}
          sx={{ ml: 0.5 }}
        >
          <X size={16} />
        </IconButton>
      </Box>

      {/* Content */}
      <Collapse in={expanded}>
        <Box sx={{ px: 2.5, py: 2 }}>
          {isLoading ? (
            <>
              <Skeleton width="100%" height={24} sx={{ mb: 2 }} />
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} width={80} height={32} sx={{ borderRadius: 2 }} />
                ))}
              </Box>
            </>
          ) : (
            <>
              {/* Summary - translated */}
              <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                {buildSummary()}
              </Typography>

              {/* Quick Stats */}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                {briefing && briefing.urgentEmails > 0 && (
                  <Chip
                    icon={<Mail size={14} />}
                    label={`${briefing.urgentEmails} ${wt.urgentEmails}`}
                    size="small"
                    sx={{
                      bgcolor: alpha(theme.palette.error.main, 0.1),
                      color: 'error.main',
                      fontWeight: 600,
                      '& .MuiChip-icon': { color: 'inherit' },
                    }}
                  />
                )}
                {briefing && briefing.deadlinesToday > 0 && (
                  <Chip
                    icon={<Clock size={14} />}
                    label={`${briefing.deadlinesToday} ${briefing.deadlinesToday > 1 ? wt.deadlinesPlural : wt.deadlines}`}
                    size="small"
                    sx={{
                      bgcolor: alpha(theme.palette.warning.main, 0.1),
                      color: 'warning.main',
                      fontWeight: 600,
                      '& .MuiChip-icon': { color: 'inherit' },
                    }}
                  />
                )}
                {briefing && briefing.pendingFollowUps > 0 && (
                  <Chip
                    icon={<Bell size={14} />}
                    label={`${briefing.pendingFollowUps} ${briefing.pendingFollowUps > 1 ? wt.followUpsPlural : wt.followUps}`}
                    size="small"
                    sx={{
                      bgcolor: alpha(theme.palette.info.main, 0.1),
                      color: 'info.main',
                      fontWeight: 600,
                      '& .MuiChip-icon': { color: 'inherit' },
                    }}
                  />
                )}
                {briefing &&
                  briefing.urgentEmails === 0 &&
                  briefing.deadlinesToday === 0 &&
                  briefing.pendingFollowUps === 0 && (
                    <Chip
                      icon={<AlertTriangle size={14} />}
                      label={wt.noItems}
                      size="small"
                      sx={{
                        bgcolor: alpha(theme.palette.success.main, 0.1),
                        color: 'success.main',
                        fontWeight: 600,
                        '& .MuiChip-icon': { color: 'inherit' },
                      }}
                    />
                  )}
              </Box>

              {/* Today's Highlights - Clickable Email Items */}
              {urgentEmails.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, mb: 1.5, display: 'block', color: 'text.secondary' }}>
                    {wt.todaysHighlights}
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {urgentEmails.slice(0, 3).map((email) => (
                      <Box
                        key={email.id}
                        onClick={() => handleEmailClick(email)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          p: 1.5,
                          borderRadius: 2,
                          cursor: 'pointer',
                          bgcolor: alpha(theme.palette.primary.main, 0.04),
                          border: '1px solid',
                          borderColor: alpha(theme.palette.primary.main, 0.08),
                          transition: 'all 0.15s ease',
                          '&:hover': {
                            bgcolor: alpha(theme.palette.primary.main, 0.08),
                            borderColor: alpha(theme.palette.primary.main, 0.15),
                            transform: 'translateX(4px)',
                          },
                        }}
                      >
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: 1.5,
                            bgcolor: alpha(theme.palette.primary.main, 0.1),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'primary.main',
                            flexShrink: 0,
                          }}
                        >
                          <Mail size={16} />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 600,
                              fontSize: '0.8rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {email.from.name || email.from.email}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: 'block',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {email.subject}
                          </Typography>
                        </Box>
                        <ArrowRight size={16} style={{ color: theme.palette.text.secondary, flexShrink: 0 }} />
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}

              {/* Actions */}
              <Box sx={{
                display: 'flex',
                gap: 1,
                mt: 2.5,
                flexDirection: { xs: 'column', sm: 'row' },
                justifyContent: 'flex-end'
              }}>
                <Button
                  size="small"
                  fullWidth={isMobile}
                  onClick={handleDismiss}
                  sx={{
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 500,
                    color: 'text.secondary',
                    order: { xs: 2, sm: 1 }
                  }}
                >
                  {wt.dismiss}
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  fullWidth={isMobile}
                  onClick={() => router.push('/dashboard/email')}
                  sx={{
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 600,
                    background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, #7c3aed 100%)`,
                    order: { xs: 1, sm: 2 }
                  }}
                >
                  {wt.showDetails}
                </Button>
              </Box>
            </>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

export default DailyBriefing;
