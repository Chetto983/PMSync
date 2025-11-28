import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Skeleton,
  Collapse,
  IconButton,
  Tooltip,
  LinearProgress,
  alpha,
} from '@mui/material';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Mail,
  Clock,
  TrendingUp,
  Brain,
  AlertCircle,
  Zap,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { multiAgentApi } from '@/lib/api/multi-agent';
import { aiApi } from '@/lib/api/ai';

interface AiInsightsWidgetProps {
  /** Number of unread emails for context */
  unreadCount: number;
  /** Translation object */
  t: any;
}

interface InboxInsights {
  summary: string;
  urgentCount: number;
  actionNeeded: number;
  categories: { name: string; count: number }[];
}

export function AiInsightsWidget({ unreadCount, t }: AiInsightsWidgetProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<InboxInsights | null>(null);
  const [pendingActionsCount, setPendingActionsCount] = useState(0);
  const [writingStyleProgress, setWritingStyleProgress] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadInsights = useCallback(async () => {
    setLoading(true);
    try {
      // Load pending actions count
      const actionsResponse = await multiAgentApi.getPendingActions({ status: 'PENDING' });
      setPendingActionsCount(actionsResponse.data?.length || 0);

      // Load writing style progress
      try {
        const learningResponse = await multiAgentApi.getLearningStats();
        const profiles = learningResponse.data?.profiles || [];
        const totalAttempts = profiles.reduce(
          (sum: number, p: any) => sum + p.approvalCount + p.rejectionCount,
          0
        );
        // Progress based on learning samples (100 samples = 100%)
        setWritingStyleProgress(Math.min(100, totalAttempts));
      } catch {
        setWritingStyleProgress(0);
      }

      // Generate AI insights summary
      if (unreadCount > 0) {
        try {
          // Use compose API to generate a quick summary prompt
          const summaryResponse = await aiApi.composeEmail({
            prompt: `Briefly summarize what the user should focus on today with ${unreadCount} unread emails. Be concise, 1-2 sentences.`,
            locale: (t as any)?.locale || 'en',
          });

          setInsights({
            summary: summaryResponse.data?.body || getDefaultSummary(unreadCount, t),
            urgentCount: Math.floor(unreadCount * 0.1), // Estimate
            actionNeeded: Math.floor(unreadCount * 0.3), // Estimate
            categories: [
              { name: t?.dashboard?.home?.sections?.priorityInbox || 'Priority', count: Math.floor(unreadCount * 0.2) },
              { name: 'Updates', count: Math.floor(unreadCount * 0.4) },
              { name: 'Promotions', count: Math.floor(unreadCount * 0.4) },
            ],
          });
        } catch {
          setInsights({
            summary: getDefaultSummary(unreadCount, t),
            urgentCount: 0,
            actionNeeded: 0,
            categories: [],
          });
        }
      } else {
        setInsights({
          summary: t?.common?.allCaughtUp || 'All caught up! No unread emails.',
          urgentCount: 0,
          actionNeeded: 0,
          categories: [],
        });
      }

      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to load AI insights:', error);
    } finally {
      setLoading(false);
    }
  }, [unreadCount, t]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  const getDefaultSummary = (count: number, translations: any) => {
    if (count === 0) return translations?.common?.allCaughtUp || 'All caught up!';
    if (count === 1) return translations?.dashboard?.home?.sections?.aiAssistMessageSingular?.replace('{count}', '1') || 'You have 1 unread email to review.';
    return translations?.dashboard?.home?.sections?.aiAssistMessage?.replace('{count}', count.toString())?.replace('{plural}', 's') || `You have ${count} unread emails to review.`;
  };

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          background: (theme) =>
            `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          color: 'white',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Sparkles size={20} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {t?.dashboard?.home?.sections?.aiInsights || 'AI Insights'}
            </Typography>
            {pendingActionsCount > 0 && (
              <Chip
                size="small"
                label={pendingActionsCount}
                sx={{
                  height: 20,
                  bgcolor: 'warning.main',
                  color: 'warning.contrastText',
                  fontWeight: 600,
                }}
              />
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Tooltip title={t?.common?.refresh || 'Refresh'}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  loadInsights();
                }}
                disabled={loading}
                sx={{ color: 'white' }}
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </IconButton>
            </Tooltip>
            <IconButton size="small" sx={{ color: 'white' }}>
              {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </IconButton>
          </Box>
        </Box>
      </Box>

      {/* Content */}
      <Collapse in={expanded}>
        <Box sx={{ p: 2 }}>
          {loading ? (
            <Box>
              <Skeleton variant="text" width="80%" height={24} sx={{ mb: 1 }} />
              <Skeleton variant="text" width="60%" height={20} />
              <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                <Skeleton variant="rounded" width={80} height={32} />
                <Skeleton variant="rounded" width={80} height={32} />
              </Box>
            </Box>
          ) : (
            <>
              {/* Summary */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ color: 'text.primary', lineHeight: 1.6 }}>
                  {insights?.summary}
                </Typography>
              </Box>

              {/* Quick Stats */}
              {unreadCount > 0 && (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 1,
                    mb: 2,
                  }}
                >
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: (theme) => alpha(theme.palette.error.main, 0.1),
                      textAlign: 'center',
                    }}
                  >
                    <AlertCircle size={16} style={{ color: 'var(--mui-palette-error-main)' }} />
                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'error.main' }}>
                      {insights?.urgentCount || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t?.ai?.urgent || 'Urgent'}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: (theme) => alpha(theme.palette.warning.main, 0.1),
                      textAlign: 'center',
                    }}
                  >
                    <Clock size={16} style={{ color: 'var(--mui-palette-warning-main)' }} />
                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'warning.main' }}>
                      {insights?.actionNeeded || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t?.ai?.actionNeeded || 'Action'}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: (theme) => alpha(theme.palette.info.main, 0.1),
                      textAlign: 'center',
                    }}
                  >
                    <Mail size={16} style={{ color: 'var(--mui-palette-info-main)' }} />
                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'info.main' }}>
                      {unreadCount}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t?.ai?.unread || 'Unread'}
                    </Typography>
                  </Box>
                </Box>
              )}

              {/* Pending Actions Alert */}
              {pendingActionsCount > 0 && (
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 1,
                    bgcolor: (theme) => alpha(theme.palette.warning.main, 0.1),
                    border: 1,
                    borderColor: 'warning.main',
                    mb: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  <Zap size={18} style={{ color: 'var(--mui-palette-warning-main)' }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {pendingActionsCount} {t?.ai?.pendingActions || 'pending AI actions'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t?.ai?.pendingActionsHint || 'Review and approve AI suggestions'}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="contained"
                    color="warning"
                    onClick={() => router.push('/dashboard/ai')}
                  >
                    {t?.common?.review || 'Review'}
                  </Button>
                </Box>
              )}

              {/* Writing Style Learning Progress */}
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Brain size={14} />
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {t?.ai?.writingStyleLearning || 'Writing Style Learning'}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={writingStyleProgress}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                  }}
                />
                <Typography variant="caption" color="text.secondary">
                  {writingStyleProgress < 20
                    ? t?.ai?.writingStyleLearningLow || 'Just getting started - send more emails to improve'
                    : writingStyleProgress < 60
                    ? t?.ai?.writingStyleLearningMedium || 'Learning your style - keep it up!'
                    : t?.ai?.writingStyleLearningHigh || 'AI has learned your writing style well'}
                </Typography>
              </Box>

              {/* Quick Actions */}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<TrendingUp size={14} />}
                  onClick={() => router.push('/dashboard/ai')}
                >
                  {t?.dashboard?.home?.sections?.analyzeInbox || 'Analyze Inbox'}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Sparkles size={14} />}
                  onClick={() => router.push('/dashboard/ai')}
                >
                  {t?.dashboard?.home?.sections?.smartCompose || 'Smart Compose'}
                </Button>
              </Box>

              {/* Last updated */}
              {lastRefresh && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 2, textAlign: 'right' }}
                >
                  {t?.ai?.lastUpdated || 'Updated'}{' '}
                  {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Typography>
              )}
            </>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
