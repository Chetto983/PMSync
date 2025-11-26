'use client';

import React from 'react';
import {
  Box,
  Typography,
  Skeleton,
  IconButton,
  Tooltip,
  Collapse,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Mail,
  Calendar,
  Users,
  Bot,
  BookOpen,
  MessageSquare,
} from 'lucide-react';

export interface AgentActivityData {
  agentName: string;
  totalAttempts: number;
  approvalRate: number;
  actionTypes: string[];
}

export interface AgentActivityChartProps {
  /** Activity data by agent */
  data: AgentActivityData[];
  /** Loading state */
  loading?: boolean;
  /** Callback to refresh */
  onRefresh?: () => void;
  /** Default expanded */
  defaultExpanded?: boolean;
}

export function AgentActivityChart({
  data,
  loading = false,
  onRefresh,
  defaultExpanded = true,
}: AgentActivityChartProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);

  const maxAttempts = Math.max(...data.map((d) => d.totalAttempts), 1);

  const getAgentIcon = (agentName: string) => {
    switch (agentName) {
      case 'EmailAgent': return <Mail size={16} />;
      case 'CalendarAgent': return <Calendar size={16} />;
      case 'ContactsAgent': return <Users size={16} />;
      case 'KnowledgeAgent': return <BookOpen size={16} />;
      case 'GeneralAgent': return <MessageSquare size={16} />;
      default: return <Bot size={16} />;
    }
  };

  const getAgentColor = (agentName: string) => {
    switch (agentName) {
      case 'EmailAgent': return theme.palette.primary.main;
      case 'CalendarAgent': return theme.palette.success.main;
      case 'ContactsAgent': return theme.palette.info.main;
      case 'KnowledgeAgent': return theme.palette.warning.main;
      case 'GeneralAgent': return theme.palette.secondary?.main || theme.palette.grey[500];
      default: return theme.palette.grey[500];
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: { xs: 2, sm: 3 }, borderRadius: 1.5, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
        <Skeleton variant="text" width="40%" height={28} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />
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
        boxShadow: isDark ? `0 4px 24px ${alpha(theme.palette.primary.main, 0.1)}` : `0 2px 8px ${alpha(theme.palette.common.black, 0.08)}`,
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
          '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1,
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${alpha(theme.palette.primary.main, 0.7)} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: theme.palette.common.white,
            boxShadow: `0 4px 14px ${alpha(theme.palette.primary.main, 0.4)}`,
          }}
        >
          <BarChart3 size={20} />
        </Box>

        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Agent Activity
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {data.reduce((sum, d) => sum + d.totalAttempts, 0)} total actions
          </Typography>
        </Box>

        {onRefresh && (
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); onRefresh(); }}>
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
          {data.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <BarChart3 size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
              <Typography variant="body2" color="text.secondary">
                No activity data yet
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {data.map((agent) => {
                const color = getAgentColor(agent.agentName);
                const barWidth = (agent.totalAttempts / maxAttempts) * 100;

                return (
                  <Box key={agent.agentName}>
                    {/* Agent Name & Stats */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ color }}>{getAgentIcon(agent.agentName)}</Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {agent.agentName.replace('Agent', '')}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {agent.totalAttempts} actions • {agent.approvalRate.toFixed(0)}% approved
                      </Typography>
                    </Box>

                    {/* Bar */}
                    <Box
                      sx={{
                        height: isMobile ? 20 : 28,
                        borderRadius: 0.5,
                        bgcolor: alpha(color, 0.1),
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      <Box
                        sx={{
                          width: `${barWidth}%`,
                          height: '100%',
                          background: `linear-gradient(90deg, ${color} 0%, ${alpha(color, 0.7)} 100%)`,
                          borderRadius: 0.5,
                          transition: 'width 0.5s ease-out',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          pr: 1,
                        }}
                      >
                        {barWidth > 20 && (
                          <Typography
                            variant="caption"
                            sx={{
                              color: theme.palette.common.white,
                              fontWeight: 600,
                              fontSize: '0.65rem',
                            }}
                          >
                            {agent.totalAttempts}
                          </Typography>
                        )}
                      </Box>
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

export default AgentActivityChart;
