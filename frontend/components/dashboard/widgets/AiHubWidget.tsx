'use client';

import React from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Skeleton,
  LinearProgress,
  Divider,
  alpha,
} from '@mui/material';
import { Sparkles, Mail, Brain, Zap, ArrowRight, TrendingUp } from 'lucide-react';
import { useRouter } from 'next/router';
import { useQuery, queryOptions } from '@tanstack/react-query';
import { useTranslations } from '@/lib/hooks/use-translations';
import { multiAgentApi } from '@/lib/api/ai';
import { useDashboardStats } from '@/hooks/queries';

// Query options for AI stats
function aiStatsOptions() {
  return queryOptions({
    queryKey: ['ai', 'stats'],
    queryFn: async () => {
      let pendingActions = 0;
      let learningProgress = 0;
      let totalInteractions = 0;

      try {
        const actionsResponse = await multiAgentApi.getPendingActions({ status: 'PENDING' });
        pendingActions = actionsResponse.data?.total ?? actionsResponse.data?.actions?.length ?? 0;
      } catch {
        // Ignore
      }

      try {
        const learningResponse = await multiAgentApi.getLearningStats();
        const stats = learningResponse.data?.stats || [];
        totalInteractions = stats.reduce((sum: number, s) => sum + s.totalAttempts, 0);
        learningProgress = Math.min(100, totalInteractions);
      } catch {
        // Ignore
      }

      return { pendingActions, learningProgress, totalInteractions };
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function AiHubWidget() {
  const router = useRouter();
  const t = useTranslations();
  const { data: stats } = useDashboardStats();
  const { data: aiStats, isLoading } = useQuery(aiStatsOptions());

  const unreadCount = stats?.unreadEmails ?? 0;
  const pendingActions = aiStats?.pendingActions ?? 0;
  const learningProgress = aiStats?.learningProgress ?? 0;

  const getLearningMessage = () => {
    if (learningProgress < 20) return t.ai?.writingStyleLearningLow || 'Getting started - send more emails';
    if (learningProgress < 60) return t.ai?.writingStyleLearningMedium || 'Learning your style';
    return t.ai?.writingStyleLearningHigh || 'AI knows your style well';
  };

  return (
    <Box
      sx={{
        height: '100%',
        borderRadius: 4,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: (theme) => alpha(theme.palette.divider, 0.1),
        bgcolor: 'background.paper',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          transform: 'translateY(-4px)',
          borderColor: (theme) => alpha(theme.palette.primary.main, 0.3),
          boxShadow: (theme) => `0 20px 40px ${alpha(theme.palette.common.black, 0.08)}`,
        },
      }}
    >
      {/* Gradient Header */}
      <Box
        sx={{
          background: (theme) =>
            `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 50%, ${theme.palette.secondary.main} 100%)`,
          p: 2.5,
          color: 'white',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: -20,
            right: -20,
            width: 100,
            height: 100,
            borderRadius: '50%',
            bgcolor: 'rgba(255,255,255,0.1)',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            bottom: -30,
            right: 40,
            width: 60,
            height: 60,
            borderRadius: '50%',
            bgcolor: 'rgba(255,255,255,0.08)',
          }}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, position: 'relative' }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              bgcolor: 'rgba(255,255,255,0.2)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={22} />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {t.dashboard.home.sections.aiInsights || 'AI Assistant'}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              {t.dashboard.home.sections.aiInsightsSubtitle || 'Your intelligent email companion'}
            </Typography>
          </Box>
          {pendingActions > 0 && (
            <Chip
              size="small"
              label={pendingActions}
              sx={{
                ml: 'auto',
                bgcolor: 'warning.main',
                color: 'warning.contrastText',
                fontWeight: 700,
              }}
            />
          )}
        </Box>

        <Typography variant="body2" sx={{ opacity: 0.95, position: 'relative' }}>
          {unreadCount > 0
            ? (unreadCount > 1
              ? (t.dashboard.home.sections.aiAssistMessage || 'Hai {count} email non lette').replace('{count}', unreadCount.toString())
              : (t.dashboard.home.sections.aiAssistMessageSingular || 'Hai {count} email non letta').replace('{count}', unreadCount.toString()))
            : t.common.allCaughtUp}
        </Typography>
      </Box>

      {/* Content */}
      <Box sx={{ p: 2 }}>
        {isLoading ? (
          <Box>
            <Skeleton width="100%" height={60} sx={{ mb: 2, borderRadius: 2 }} />
            <Skeleton width="80%" height={20} sx={{ mb: 1 }} />
            <Skeleton width="100%" height={6} sx={{ borderRadius: 3 }} />
          </Box>
        ) : (
          <>
            {/* Pending Actions Alert */}
            {pendingActions > 0 && (
              <Box
                sx={{
                  p: 1.5,
                  mb: 2,
                  borderRadius: 2,
                  bgcolor: (theme) => alpha(theme.palette.warning.main, 0.1),
                  border: 1,
                  borderColor: (theme) => alpha(theme.palette.warning.main, 0.3),
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': {
                    bgcolor: (theme) => alpha(theme.palette.warning.main, 0.15),
                    transform: 'translateX(4px)',
                  },
                }}
                onClick={() => router.push('/dashboard/ai')}
              >
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 1.5,
                    bgcolor: 'warning.main',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                  }}
                >
                  <Zap size={18} />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {pendingActions} {t.ai?.pendingActions || 'pending actions'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t.ai?.pendingActionsHint || 'Review AI suggestions'}
                  </Typography>
                </Box>
                <ArrowRight size={16} />
              </Box>
            )}

            {/* Learning Progress */}
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Brain size={12} />
                  {t.ai?.writingStyleLearning || 'AI Learning Progress'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {learningProgress}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={learningProgress}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 3,
                    background: (theme) =>
                      `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                  },
                }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                {getLearningMessage()}
              </Typography>
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Quick Actions */}
            <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
              {t.dashboard.home.sections.quickActions || 'Quick Actions'}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Chip
                icon={<Sparkles size={14} />}
                label={t.dashboard.home.sections.smartCompose || 'Smart Compose'}
                onClick={() => router.push('/dashboard/ai')}
                sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'primary.main', color: 'white' } }}
                variant="outlined"
              />
              <Chip
                icon={<TrendingUp size={14} />}
                label={t.dashboard.home.sections.analyzeInbox || 'Analyze'}
                onClick={() => router.push('/dashboard/ai')}
                sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'primary.main', color: 'white' } }}
                variant="outlined"
              />
              <Chip
                icon={<Mail size={14} />}
                label={t.ai?.summarize || 'Summarize'}
                onClick={() => router.push('/dashboard/ai')}
                sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'primary.main', color: 'white' } }}
                variant="outlined"
              />
            </Box>

            {/* Full AI Hub Button */}
            <Button
              fullWidth
              variant="contained"
              endIcon={<ArrowRight size={16} />}
              onClick={() => router.push('/dashboard/ai')}
              sx={{
                mt: 2,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                background: (theme) =>
                  `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                '&:hover': {
                  background: (theme) =>
                    `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.secondary.dark} 100%)`,
                },
              }}
            >
              {t.dashboard.home.sections.viewSuggestions || 'Open AI Assistant'}
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
}

export default AiHubWidget;
