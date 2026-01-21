'use client';

import React, { useMemo } from 'react';
import { Box, Typography, LinearProgress, Skeleton, alpha, useTheme, Chip, Tooltip } from '@mui/material';
import { Brain, CheckCircle2, TrendingUp, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from '@/lib/hooks/use-translations';
import { voltAgentApi } from '@/lib/api/ai';
import { CollapsibleWidget } from './CollapsibleWidget';

/**
 * Learning Widget - Shows AI learning progress
 *
 * Displays:
 * - Overall approval rate (how often user approves AI suggestions)
 * - Overall success rate (how often approved actions succeed)
 * - Total interactions count
 * - Writing style calibration progress
 *
 * Uses EXISTING backend endpoints:
 * - /stats/action-counts - for APPROVED/REJECTED counts
 * - /stats/writing-style - for writing sample count
 * - /feedback - for success rate calculation
 */
export function LearningWidget() {
  const theme = useTheme();
  const t = useTranslations();

  // Fetch action counts by status (APPROVED, REJECTED, etc.)
  const { data: countsData, isLoading: loadingCounts } = useQuery({
    queryKey: ['ai', 'actionCounts'],
    queryFn: async () => {
      const response = await voltAgentApi.getActionCounts();
      return response.data?.counts;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch feedback history for success rate calculation
  const { data: feedbackData, isLoading: loadingFeedback } = useQuery({
    queryKey: ['ai', 'feedback', { limit: 100 }],
    queryFn: async () => {
      const response = await voltAgentApi.getFeedback({ limit: 100 });
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch writing style profile (secondary metric)
  const { data: writingStyleData, isLoading: loadingStyle } = useQuery({
    queryKey: ['ai', 'writingStyle'],
    queryFn: async () => {
      const response = await voltAgentApi.getWritingStyle();
      return response.data?.profile;
    },
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = loadingCounts || loadingFeedback || loadingStyle;

  // Calculate metrics from existing data
  const { totalAttempts, approvalRate, successRate } = useMemo(() => {
    const approved = countsData?.APPROVED || 0;
    const rejected = countsData?.REJECTED || 0;
    const total = approved + rejected;

    // Approval rate = approved / total decisions * 100
    const appRate = total > 0 ? (approved / total) * 100 : 0;

    // Success rate from feedback history
    const feedback = feedbackData?.feedback || [];
    const successfulCount = feedback.filter(f => f.wasSuccessful).length;
    const executedCount = feedback.filter(f => f.wasApproved).length;
    const succRate = executedCount > 0 ? (successfulCount / executedCount) * 100 : 0;

    return { totalAttempts: total, approvalRate: appRate, successRate: succRate };
  }, [countsData, feedbackData]);

  const writingSampleCount = writingStyleData?.sampleCount || 0;

  // Calculate overall learning score (weighted average)
  // 50% approval rate + 30% success rate + 20% writing style calibration
  const writingCalibration = Math.min(100, (writingSampleCount / 50) * 100);
  const learningScore = totalAttempts > 0
    ? Math.round((approvalRate * 0.5) + (successRate * 0.3) + (writingCalibration * 0.2))
    : Math.round(writingCalibration * 0.2); // Only writing style if no interactions

  const getLearningMessage = () => {
    if (totalAttempts === 0) {
      return t.ai?.learning?.noData || 'Start chatting to train AI';
    }
    if (learningScore < 30) return t.ai?.learning?.early || 'Learning your preferences...';
    if (learningScore < 60) return t.ai?.learning?.improving || 'Getting better at helping you';
    if (learningScore < 80) return t.ai?.learning?.good || 'Well calibrated';
    return t.ai?.learning?.excellent || 'Highly personalized';
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

  // Collapsed summary - show learning score
  const collapsedSummary = (
    <Chip
      size="small"
      label={`${learningScore}%`}
      sx={{
        bgcolor: learningScore >= 60
          ? alpha(theme.palette.success.main, 0.15)
          : alpha(theme.palette.warning.main, 0.15),
        color: learningScore >= 60
          ? theme.palette.success.main
          : theme.palette.warning.main,
        fontWeight: 700,
        fontSize: '0.7rem',
      }}
    />
  );

  return (
    <CollapsibleWidget
      title={t.ai?.learning?.title || 'AI Learning'}
      subtitle={getLearningMessage()}
      icon={<Brain size={18} />}
      defaultExpanded={false}
      collapsedSummary={collapsedSummary}
    >
      <Box sx={{ p: 2 }}>
        {/* Main Learning Progress */}
        <Box sx={{ mb: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TrendingUp size={12} />
              {t.ai?.learning?.overallProgress || 'Learning Score'}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>
              {learningScore}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={learningScore}
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

        {/* Stats Grid */}
        {totalAttempts > 0 ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
            {/* Approval Rate */}
            <Tooltip title={t.ai?.learning?.approvalTooltip || 'How often you approve AI suggestions'}>
              <Box sx={{ textAlign: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.5 }}>
                  <CheckCircle2 size={14} style={{ color: theme.palette.success.main }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.2 }}>
                  {Math.round(approvalRate)}%
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  {t.ai?.learning?.approved || 'Approved'}
                </Typography>
              </Box>
            </Tooltip>

            {/* Success Rate */}
            <Tooltip title={t.ai?.learning?.successTooltip || 'How often approved actions succeed'}>
              <Box sx={{ textAlign: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.5 }}>
                  <Zap size={14} style={{ color: theme.palette.warning.main }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.2 }}>
                  {Math.round(successRate)}%
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  {t.ai?.learning?.success || 'Success'}
                </Typography>
              </Box>
            </Tooltip>

            {/* Total Interactions */}
            <Tooltip title={t.ai?.learning?.interactionsTooltip || 'Total AI action attempts'}>
              <Box sx={{ textAlign: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.5 }}>
                  <Brain size={14} style={{ color: theme.palette.primary.main }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.2 }}>
                  {totalAttempts}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  {t.ai?.learning?.actions || 'Actions'}
                </Typography>
              </Box>
            </Tooltip>
          </Box>
        ) : (
          /* No interactions yet - show writing style only */
          <Box sx={{ textAlign: 'center', py: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {t.ai?.learning?.noInteractions || 'No AI actions yet. Use chat to train the AI.'}
            </Typography>
            {writingSampleCount > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                  {t.ai?.learning?.writingStyle || 'Writing style'}: {writingSampleCount}/50 {t.ai?.learning?.emailsAnalyzed || 'emails'}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={writingCalibration}
                  sx={{
                    height: 4,
                    borderRadius: 2,
                    bgcolor: alpha(theme.palette.info.main, 0.1),
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 2,
                      bgcolor: theme.palette.info.main,
                    },
                  }}
                />
              </Box>
            )}
          </Box>
        )}
      </Box>
    </CollapsibleWidget>
  );
}

export default LearningWidget;
