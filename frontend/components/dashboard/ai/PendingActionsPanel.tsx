'use client';

import React from 'react';
import {
  Box,
  Typography,
  Button,
  Skeleton,
  Chip,
  IconButton,
  Tooltip,
  Collapse,
  Badge,
  alpha,
  useTheme,
  useMediaQuery,
  Stack,
} from '@mui/material';
import {
  Clock,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Mail,
  Calendar,
  Users,
  Bot,
  AlertTriangle,
} from 'lucide-react';
import type { PendingAction, AgentInfo } from '@/lib/api/ai';

export interface PendingActionsPanelProps {
  /** Pending actions */
  actions: PendingAction[];
  /** Agent metadata for tooltips */
  agentInfoMap?: Record<string, AgentInfo>;
  /** Loading state */
  loading?: boolean;
  /** Callback to approve action - should return Promise for proper error handling */
  onApprove?: (actionId: string) => void | Promise<void>;
  /** Callback to reject action - should return Promise for proper error handling */
  onReject?: (actionId: string) => void | Promise<void>;
  /** Callback to refresh */
  onRefresh?: () => void;
  /** Callback for errors during approve/reject */
  onError?: (error: Error, actionId: string, type: 'approve' | 'reject') => void;
  /** Default expanded */
  defaultExpanded?: boolean;
}

export function PendingActionsPanel({
  actions: actionsProp,
  loading = false,
  agentInfoMap,
  onApprove,
  onReject,
  onRefresh,
  onError,
  defaultExpanded = true,
}: PendingActionsPanelProps) {
  // Ensure actions is always an array (handles undefined, null, or invalid values)
  const actions = Array.isArray(actionsProp) ? actionsProp : [];

  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
  const [processingIds, setProcessingIds] = React.useState<Set<string>>(new Set());

  const getAgentIcon = (agentName: string) => {
    switch (agentName) {
      case 'EmailAgent': return <Mail size={14} />;
      case 'CalendarAgent': return <Calendar size={14} />;
      case 'ContactsAgent': return <Users size={14} />;
      default: return <Bot size={14} />;
    }
  };

  const getSeverityColor = (severity: string): 'error' | 'warning' | 'success' => {
    switch (severity) {
      case 'HIGH': return 'error';
      case 'MEDIUM': return 'warning';
      default: return 'success';
    }
  };

  const formatActionType = (type: string) => {
    return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const handleApprove = async (actionId: string) => {
    setProcessingIds((prev) => new Set(prev).add(actionId));
    try {
      await onApprove?.(actionId);
    } catch (error) {
      console.error(`Failed to approve action ${actionId}:`, error);
      onError?.(error instanceof Error ? error : new Error(String(error)), actionId, 'approve');
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(actionId);
        return next;
      });
    }
  };

  const handleReject = async (actionId: string) => {
    setProcessingIds((prev) => new Set(prev).add(actionId));
    try {
      await onReject?.(actionId);
    } catch (error) {
      console.error(`Failed to reject action ${actionId}:`, error);
      onError?.(error instanceof Error ? error : new Error(String(error)), actionId, 'reject');
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(actionId);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: { xs: 2, sm: 3 }, borderRadius: 1.5, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
        <Skeleton variant="text" width="40%" height={28} sx={{ mb: 2 }} />
        <Stack spacing={2}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 1 }} />
          ))}
        </Stack>
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
        boxShadow: isDark ? `0 4px 24px ${alpha(theme.palette.warning.main, 0.1)}` : `0 2px 8px ${alpha(theme.palette.common.black, 0.08)}`,
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
          '&:hover': { bgcolor: alpha(theme.palette.warning.main, 0.04) },
        }}
      >
        <Badge badgeContent={actions.length} color="warning" max={99}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 1,
              background: `linear-gradient(135deg, ${theme.palette.warning.main} 0%, ${alpha(theme.palette.warning.main, 0.7)} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: theme.palette.common.white,
              boxShadow: `0 4px 14px ${alpha(theme.palette.warning.main, 0.4)}`,
            }}
          >
            <Clock size={20} />
          </Box>
        </Badge>

        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Pending Actions
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {actions.length === 0 ? 'All clear' : `${actions.length} awaiting approval`}
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
        <Box sx={{ p: { xs: 1.5, sm: 2 }, maxHeight: { xs: 300, sm: 400 }, overflow: 'auto' }}>
          {actions.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.success.main, 0.1),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 2,
                  color: 'success.main',
                }}
              >
                <CheckCircle size={24} />
              </Box>
              <Typography variant="body2" color="text.secondary">
                No pending actions
              </Typography>
            </Box>
          ) : (
            <Stack spacing={1.5}>
              {actions.map((action) => {
                const isProcessing = processingIds.has(action.id);
                const severityColor = getSeverityColor(action.severity);

                return (
                  <Box
                    key={action.id}
                    sx={{
                      p: { xs: 1.5, sm: 2 },
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.default',
                      opacity: isProcessing ? 0.6 : 1,
                      transition: 'all 0.2s',
                      '&:hover': { borderColor: alpha(theme.palette[severityColor].main, 0.3) },
                    }}
                  >
                    {/* Action Header */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Chip
                        size="small"
                        label={formatActionType(action.actionType)}
                        color={severityColor}
                        sx={{ fontWeight: 500, fontSize: '0.7rem' }}
                      />
                      {action.severity === 'HIGH' && (
                        <Tooltip title="High severity - requires review">
                          <AlertTriangle size={14} color={theme.palette.error.main} />
                        </Tooltip>
                      )}
                    </Box>

                    {/* Agent Info */}
                    <Tooltip
                      title={
                        agentInfoMap?.[action.agentName]
                          ? `${agentInfoMap[action.agentName].description} • Intents: ${agentInfoMap[action.agentName].supportedIntents.join(', ')}`
                          : undefined
                      }
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                        {getAgentIcon(action.agentName)}
                        <Typography variant="caption" color="text.secondary">
                          {action.agentName} • {Math.round((action.adjustedConfidence ?? action.confidence ?? 0.8) * 100)}% confidence
                        </Typography>
                      </Box>
                    </Tooltip>

                    {/* Payload Preview */}
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        display: 'block',
                        mb: 1.5,
                        p: 1,
                        bgcolor: 'action.hover',
                        borderRadius: 0.5,
                        fontFamily: 'monospace',
                        fontSize: '0.65rem',
                        maxHeight: 50,
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                      }}
                    >
                      {JSON.stringify(action.payload, null, 2).slice(0, 120)}...
                    </Typography>

                    {/* Action Buttons */}
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        startIcon={<CheckCircle size={14} />}
                        onClick={() => handleApprove(action.id)}
                        disabled={isProcessing}
                        sx={{ flex: 1, textTransform: 'none', fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
                      >
                        {isMobile ? 'OK' : 'Approve'}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<XCircle size={14} />}
                        onClick={() => handleReject(action.id)}
                        disabled={isProcessing}
                        sx={{ flex: 1, textTransform: 'none', fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
                      >
                        {isMobile ? 'No' : 'Reject'}
                      </Button>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

export default PendingActionsPanel;
