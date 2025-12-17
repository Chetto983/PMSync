'use client';

import React from 'react';
import { Box, Typography, LinearProgress, Skeleton, alpha, useTheme } from '@mui/material';
import { Brain, TrendingUp, MessageSquare } from 'lucide-react';
import { useQuery, queryOptions } from '@tanstack/react-query';
import { useTranslations } from '@/lib/hooks/use-translations';
import { multiAgentApi } from '@/lib/api/ai';
import { CollapsibleWidget } from './CollapsibleWidget';

function learningStatsOptions() {
  return queryOptions({
    queryKey: ['ai', 'learningStats'],
    queryFn: async () => {
      const response = await multiAgentApi.getLearningStats();
      const stats = response.data?.stats || [];

      const totalAttempts = stats.reduce((sum: number, s) => sum + s.totalAttempts, 0);
      const successfulAttempts = stats.reduce((sum: number, s) => sum + Math.round(s.successRate * s.totalAttempts), 0);
      const learningProgress = Math.min(100, totalAttempts);
      const successRate = totalAttempts > 0 ? Math.round((successfulAttempts / totalAttempts) * 100) : 0;

      return {
        totalAttempts,
        successfulAttempts,
        learningProgress,
        successRate,
        stats,
      };
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function LearningWidget() {
  const theme = useTheme();
  const t = useTranslations();
  const { data, isLoading } = useQuery(learningStatsOptions());

  const learningProgress = data?.learningProgress ?? 0;
  const successRate = data?.successRate ?? 0;
  const totalAttempts = data?.totalAttempts ?? 0;

  const getLearningMessage = () => {
    if (learningProgress < 20) return t.ai?.writingStyleLearningLow || 'Getting started';
    if (learningProgress < 60) return t.ai?.writingStyleLearningMedium || 'Learning your style';
    return t.ai?.writingStyleLearningHigh || 'Knows your style well';
  };

  if (isLoading) {
    return (
      <Box
        sx={{
          borderRadius: 4,
          border: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.08),
          p: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Skeleton variant="rounded" width={36} height={36} sx={{ borderRadius: 2 }} />
          <Box sx={{ flex: 1 }}>
            <Skeleton width="50%" height={18} />
            <Skeleton width="70%" height={12} sx={{ mt: 0.5 }} />
          </Box>
        </Box>
      </Box>
    );
  }

  // Collapsed summary - show progress percentage
  const collapsedSummary = (
    <Typography variant="caption" color="primary.main" sx={{ fontWeight: 700 }}>
      {learningProgress}%
    </Typography>
  );

  return (
    <CollapsibleWidget
      title={t.ai?.writingStyleLearning || 'AI Learning'}
      subtitle={getLearningMessage()}
      icon={<Brain size={18} />}
      defaultExpanded={false}
      collapsedSummary={collapsedSummary}
    >
      <Box sx={{ p: 2 }}>
        {/* Main Progress */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {t.ai?.learning?.overallProgress || 'Overall progress'}
            </Typography>
            <Typography variant="caption" color="primary.main" sx={{ fontWeight: 700 }}>
              {learningProgress}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={learningProgress}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              '& .MuiLinearProgress-bar': {
                borderRadius: 3,
                background: `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
              },
            }}
          />
        </Box>

        {/* Compact Stats */}
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MessageSquare size={14} style={{ color: theme.palette.primary.main }} />
            <Typography variant="caption">
              <strong>{totalAttempts}</strong> {t.ai?.learning?.interactions || 'interactions'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TrendingUp size={14} style={{ color: theme.palette.success.main }} />
            <Typography variant="caption">
              <strong>{successRate}%</strong> {t.ai?.learning?.successRate || 'success'}
            </Typography>
          </Box>
        </Box>
      </Box>
    </CollapsibleWidget>
  );
}

export default LearningWidget;
