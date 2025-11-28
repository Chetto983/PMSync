'use client';

import React from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  Skeleton,
  Chip,
  IconButton,
  Tooltip,
  Collapse,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Brain,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';
import type { LearningProfile } from '@/lib/api/multi-agent';

export interface LearningProgressCardProps {
  /** Learning profiles data */
  profiles: LearningProfile[];
  /** Summary statistics */
  summary?: {
    totalAttempts: number;
    overallApprovalRate: number;
    overallSuccessRate: number;
  };
  /** Loading state */
  loading?: boolean;
  /** Callback to refresh data */
  onRefresh?: () => void;
  /** Default expanded state */
  defaultExpanded?: boolean;
}

/**
 * LearningProgressCard - Shows AI learning progress with data visualization
 * Features:
 * - Progress bars for each agent
 * - Approval/success rate metrics
 * - Mobile responsive
 * - Uses global theme
 */
export function LearningProgressCard({
  profiles: profilesProp,
  summary,
  loading = false,
  onRefresh,
  defaultExpanded = true,
}: LearningProgressCardProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);

  // Group profiles by agent
  const agentProfiles = React.useMemo(() => {
    const profiles = Array.isArray(profilesProp) ? profilesProp : [];
    const grouped: Record<string, LearningProfile[]> = {};
    profiles.forEach((profile) => {
      if (!grouped[profile.agentName]) {
        grouped[profile.agentName] = [];
      }
      grouped[profile.agentName].push(profile);
    });
    return grouped;
  }, [profilesProp]);

  // Calculate agent-level stats
  const getAgentStats = (agentProfiles: LearningProfile[]) => {
    const totalApprovals = agentProfiles.reduce((sum, p) => sum + p.approvalCount, 0);
    const totalRejections = agentProfiles.reduce((sum, p) => sum + p.rejectionCount, 0);
    const totalSuccesses = agentProfiles.reduce((sum, p) => sum + p.successCount, 0);
    const totalFailures = agentProfiles.reduce((sum, p) => sum + p.failureCount, 0);
    const total = totalApprovals + totalRejections;
    const executed = totalSuccesses + totalFailures;

    return {
      approvalRate: total > 0 ? (totalApprovals / total) * 100 : 0,
      successRate: executed > 0 ? (totalSuccesses / executed) * 100 : 0,
      total,
      executed,
      avgBoost: agentProfiles.reduce((sum, p) => sum + p.confidenceBoost, 0) / agentProfiles.length || 0,
    };
  };

  const getAgentColor = (agentName: string): 'primary' | 'success' | 'warning' | 'info' => {
    switch (agentName) {
      case 'EmailAgent':
        return 'primary';
      case 'CalendarAgent':
        return 'success';
      case 'ContactsAgent':
        return 'info';
      default:
        return 'warning';
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          p: { xs: 2, sm: 3 },
          borderRadius: 1.5,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Skeleton variant="text" width="40%" height={28} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={60} sx={{ mb: 2, borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={60} sx={{ mb: 2, borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={60} sx={{ borderRadius: 1 }} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        borderRadius: 1.5,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: isDark
          ? `0 4px 24px ${alpha(theme.palette.primary.main, 0.1)}`
          : `0 2px 8px ${alpha(theme.palette.common.black, 0.08)}`,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        onClick={() => setIsExpanded(!isExpanded)}
        sx={{
          p: { xs: 2, sm: 2.5 },
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          cursor: 'pointer',
          borderBottom: isExpanded ? '1px solid' : 'none',
          borderColor: 'divider',
          '&:hover': {
            bgcolor: alpha(theme.palette.primary.main, 0.04),
          },
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1,
            background: `linear-gradient(135deg, ${theme.palette.info.main} 0%, ${alpha(theme.palette.info.main, 0.7)} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: theme.palette.common.white,
            boxShadow: `0 4px 14px ${alpha(theme.palette.info.main, 0.4)}`,
          }}
        >
          <Brain size={20} />
        </Box>

        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
            AI Learning Progress
          </Typography>
          {summary && (
            <Typography variant="caption" color="text.secondary">
              {summary.totalAttempts} actions processed
            </Typography>
          )}
        </Box>

        {onRefresh && (
          <Tooltip title="Refresh">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onRefresh();
              }}
            >
              <RefreshCw size={16} />
            </IconButton>
          </Tooltip>
        )}

        <IconButton size="small">
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </IconButton>
      </Box>

      <Collapse in={isExpanded}>
        <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
          {/* Summary Stats */}
          {summary && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' },
                gap: { xs: 1.5, sm: 2 },
                mb: 3,
              }}
            >
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: alpha(theme.palette.success.main, 0.1),
                  textAlign: 'center',
                }}
              >
                <Typography variant={isMobile ? 'h6' : 'h5'} sx={{ fontWeight: 700, color: 'success.main' }}>
                  {summary.overallApprovalRate.toFixed(0)}%
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Approval Rate
                </Typography>
              </Box>

              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  textAlign: 'center',
                }}
              >
                <Typography variant={isMobile ? 'h6' : 'h5'} sx={{ fontWeight: 700, color: 'primary.main' }}>
                  {summary.overallSuccessRate.toFixed(0)}%
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Success Rate
                </Typography>
              </Box>

              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: alpha(theme.palette.info.main, 0.1),
                  textAlign: 'center',
                  gridColumn: { xs: '1 / -1', sm: 'auto' },
                }}
              >
                <Typography variant={isMobile ? 'h6' : 'h5'} sx={{ fontWeight: 700, color: 'info.main' }}>
                  {summary.totalAttempts}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Total Actions
                </Typography>
              </Box>
            </Box>
          )}

          {/* Agent Progress Bars */}
          {Object.entries(agentProfiles).length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Brain size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
              <Typography variant="body2" color="text.secondary">
                No learning data yet. Use the AI assistant to start training.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {Object.entries(agentProfiles).map(([agentName, agentData]) => {
                const stats = getAgentStats(agentData);
                const colorType = getAgentColor(agentName);
                const color = theme.palette[colorType].main;

                return (
                  <Box key={agentName}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {agentName.replace('Agent', '')}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          size="small"
                          icon={<CheckCircle size={12} />}
                          label={`${stats.approvalRate.toFixed(0)}%`}
                          sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            bgcolor: alpha(theme.palette.success.main, 0.1),
                            color: 'success.main',
                            '& .MuiChip-icon': { color: 'inherit' },
                          }}
                        />
                        {stats.avgBoost !== 0 && (
                          <Chip
                            size="small"
                            icon={<TrendingUp size={12} />}
                            label={`${stats.avgBoost > 0 ? '+' : ''}${(stats.avgBoost * 100).toFixed(0)}%`}
                            sx={{
                              height: 20,
                              fontSize: '0.65rem',
                              bgcolor: alpha(stats.avgBoost > 0 ? theme.palette.success.main : theme.palette.error.main, 0.1),
                              color: stats.avgBoost > 0 ? 'success.main' : 'error.main',
                              '& .MuiChip-icon': { color: 'inherit' },
                            }}
                          />
                        )}
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={stats.approvalRate}
                        sx={{
                          flex: 1,
                          height: 8,
                          borderRadius: 1,
                          bgcolor: alpha(color, 0.1),
                          '& .MuiLinearProgress-bar': {
                            borderRadius: 1,
                            bgcolor: color,
                          },
                        }}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 50, textAlign: 'right' }}>
                        {stats.total} actions
                      </Typography>
                    </Box>

                    {/* Action types breakdown */}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                      {agentData.slice(0, 3).map((profile) => (
                        <Chip
                          key={profile.id}
                          size="small"
                          label={profile.actionType.replace(/_/g, ' ').toLowerCase()}
                          sx={{
                            height: 18,
                            fontSize: '0.6rem',
                            bgcolor: alpha(color, 0.08),
                            color: 'text.secondary',
                          }}
                        />
                      ))}
                      {agentData.length > 3 && (
                        <Chip
                          size="small"
                          label={`+${agentData.length - 3} more`}
                          sx={{
                            height: 18,
                            fontSize: '0.6rem',
                            bgcolor: 'action.hover',
                            color: 'text.secondary',
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
      </Collapse>
    </Box>
  );
}

export default LearningProgressCard;
