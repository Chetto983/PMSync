'use client';

import React from 'react';
import { Box, Typography, Paper, LinearProgress, Skeleton, alpha, useTheme } from '@mui/material';
import { Brain, TrendingUp, MessageSquare, Mail } from 'lucide-react';
import { useQuery, queryOptions } from '@tanstack/react-query';
import { useTranslations } from '@/lib/hooks/use-translations';
import { multiAgentApi } from '@/lib/api/ai';

function learningStatsOptions() {
  return queryOptions({
    queryKey: ['ai', 'learningStats'],
    queryFn: async () => {
      const response = await multiAgentApi.getLearningStats();
      const stats = response.data?.stats || [];

      const totalAttempts = stats.reduce((sum: number, s) => sum + s.totalAttempts, 0);
      // Calculate successful based on success rate * attempts
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
    if (learningProgress < 20) return t.ai?.writingStyleLearningLow || 'Sto imparando - continua a usarmi';
    if (learningProgress < 60) return t.ai?.writingStyleLearningMedium || 'Sto capendo il tuo stile';
    return t.ai?.writingStyleLearningHigh || 'Conosco bene il tuo stile';
  };

  if (isLoading) {
    return (
      <Paper
        elevation={0}
        sx={{
          borderRadius: 4,
          border: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.08),
          p: 2.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: 2 }} />
          <Box sx={{ flex: 1 }}>
            <Skeleton width="50%" height={20} />
            <Skeleton width="70%" height={14} sx={{ mt: 0.5 }} />
          </Box>
        </Box>
        <Skeleton variant="rounded" height={60} sx={{ borderRadius: 2 }} />
      </Paper>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 4,
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.08),
        bgcolor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.08),
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, #7c3aed 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
          }}
        >
          <Brain size={20} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {t.ai?.writingStyleLearning || 'Apprendimento AI'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {getLearningMessage()}
          </Typography>
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ p: 2 }}>
        {/* Main Progress */}
        <Box sx={{ mb: 2.5 }}>
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
              height: 8,
              borderRadius: 4,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              '& .MuiLinearProgress-bar': {
                borderRadius: 4,
                background: `linear-gradient(90deg, ${theme.palette.primary.main} 0%, #7c3aed 100%)`,
              },
            }}
          />
        </Box>

        {/* Stats Grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.primary.main, 0.05),
              textAlign: 'center',
            }}
          >
            <MessageSquare size={16} style={{ color: theme.palette.primary.main, marginBottom: 4 }} />
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
              {totalAttempts}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t.ai?.learning?.interactions || 'Interactions'}
            </Typography>
          </Box>

          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.success.main, 0.05),
              textAlign: 'center',
            }}
          >
            <TrendingUp size={16} style={{ color: theme.palette.success.main, marginBottom: 4 }} />
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
              {successRate}%
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t.ai?.learning?.successRate || 'Success rate'}
            </Typography>
          </Box>

          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: alpha('#7c3aed', 0.05),
              textAlign: 'center',
            }}
          >
            <Mail size={16} style={{ color: '#7c3aed', marginBottom: 4 }} />
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
              {data?.successfulAttempts ?? 0}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t.ai?.learned || 'Apprese'}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}

export default LearningWidget;
