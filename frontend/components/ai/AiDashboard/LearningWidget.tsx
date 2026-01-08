'use client';

import React from 'react';
import { Box, Typography, LinearProgress, Skeleton, alpha, useTheme } from '@mui/material';
import { Brain, MessageSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from '@/lib/hooks/use-translations';
import { multiAgentApi } from '@/lib/api/ai';
import { CollapsibleWidget } from './CollapsibleWidget';

// NOTE: getLearningStats endpoint removed - learning is in-memory only with no API
// Writing style profile is the only persisted learning data available

export function LearningWidget() {
  const theme = useTheme();
  const t = useTranslations();

  // New: Fetch writing style profile
  const { data: writingStyleData, isLoading } = useQuery({
    queryKey: ['ai', 'writingStyle'],
    queryFn: async () => {
      const response = await multiAgentApi.getWritingStyle();
      return response.data?.profile;
    },
  });

  // Use writing style sample count as the primary progress metric (target: 50 emails)
  const sampleCount = writingStyleData?.sampleCount || 0;
  const learningProgress = Math.min(100, Math.round((sampleCount / 50) * 100)); // Cap at 100%

  // NOTE: successRate removed - learning stats endpoint doesn't exist (in-memory only)
  // We only show writing style progress now
  const totalAttempts = sampleCount;

  const getLearningMessage = () => {
    if (learningProgress < 20) return t.ai?.writingStyleLearningLow || 'Analysing your style...';
    if (learningProgress < 80) return t.ai?.writingStyleLearningMedium || 'Learning your patterns';
    return t.ai?.writingStyleLearningHigh || 'Style calibrated';
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

        {/* Compact Stats - only emails analyzed (success rate removed - no backend) */}
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MessageSquare size={14} style={{ color: theme.palette.primary.main }} />
            <Typography variant="caption">
              <strong>{totalAttempts}</strong> {t.ai?.learning?.interactions || 'emails analyzed'}
            </Typography>
          </Box>
        </Box>
      </Box>
    </CollapsibleWidget>
  );
}

export default LearningWidget;
