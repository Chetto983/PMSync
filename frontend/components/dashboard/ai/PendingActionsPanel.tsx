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
  TextField,
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
  Edit3,
} from 'lucide-react';
import type { PendingAction, AgentInfo } from '@/lib/api/ai';
import { useTranslations } from '@/lib/hooks/use-translations';
import { logger } from '@/lib/logger';

export interface PendingActionsPanelProps {
  /** Pending actions */
  actions: PendingAction[];
  /** Agent metadata for tooltips */
  agentInfoMap?: Record<string, AgentInfo>;
  /** Loading state */
  loading?: boolean;
  /** Callback to approve action - should return Promise for proper error handling */
  onApprove?: (actionId: string, payload?: Record<string, any>) => void | Promise<void>;
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

  const t = useTranslations();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
  const [processingIds, setProcessingIds] = React.useState<Set<string>>(new Set());
  const [editModeIds, setEditModeIds] = React.useState<Set<string>>(new Set());
  const [editedPayloads, setEditedPayloads] = React.useState<Record<string, Record<string, any>>>({});

  const toggleEditMode = (id: string, initialPayload: Record<string, any>) => {
    const next = new Set(editModeIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      if (!editedPayloads[id]) {
        setEditedPayloads(prev => ({ ...prev, [id]: { ...initialPayload } }));
      }
    }
    setEditModeIds(next);
  };

  const handlePayloadChange = (id: string, key: string, value: any) => {
    setEditedPayloads(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [key]: value
      }
    }));
  };

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
      const payload = editedPayloads[actionId];
      await onApprove?.(actionId, payload);
    } catch (error) {
      logger.error(`Failed to approve action ${actionId}`, { error });
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
      logger.error(`Failed to reject action ${actionId}`, { error });
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
            {t.ai?.pendingActions ?? 'Pending Actions'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {actions.length === 0
              ? (t.ai?.allClear ?? 'All clear')
              : `${actions.length} ${t.ai?.awaitingApproval ?? 'awaiting approval'}`}
          </Typography>
        </Box>

        {onRefresh && (
          <Tooltip title={t.common?.refresh ?? 'Refresh'}>
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
                        <Tooltip title={t.ai?.highSeverityRequiresReview ?? 'High severity - requires review'}>
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

                    {/* Reasoning Section */}
                    {(action.reasoningSteps || action.suspendReason) && (
                      <Box sx={{ mb: 1.5, p: 1, bgcolor: alpha(theme.palette.info.main, 0.04), borderRadius: 1, borderLeft: '3px solid', borderColor: 'info.main' }}>
                        <Typography variant="caption" sx={{ color: 'info.main', fontWeight: 600, display: 'block', mb: 0.25 }}>
                          AI Reasoning
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', display: 'block' }}>
                          {action.reasoningSteps || action.suspendReason}
                        </Typography>
                      </Box>
                    )}

                    {/* Payload Preview */}
                    <Box sx={{ mb: 1.5, p: 1, bgcolor: 'action.hover', borderRadius: 0.5 }}>
                      {Object.entries(editedPayloads[action.id] || action.payload)
                        .filter(([key]) => ['to', 'subject', 'body', 'title', 'location', 'attendees'].includes(key))
                        .map(([key, value]) => {
                          const isEditing = editModeIds.has(action.id);
                          const isMultiline = key === 'body';

                          return (
                            <Box key={key} sx={{ mb: 1 }}>
                              <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.25, textTransform: 'capitalize' }}>
                                {key}:
                              </Typography>
                              {isEditing ? (
                                <TextField
                                  fullWidth
                                  size="small"
                                  multiline={isMultiline}
                                  rows={isMultiline ? 3 : 1}
                                  value={Array.isArray(value) ? value.join(', ') : (value as string || '')}
                                  onChange={(e) => {
                                    const val = ['to', 'attendees'].includes(key)
                                      ? e.target.value.split(',').map(s => s.trim())
                                      : e.target.value;
                                    handlePayloadChange(action.id, key, val);
                                  }}
                                  sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.75rem', bgcolor: 'background.paper' } }}
                                />
                              ) : (
                                <Typography variant="caption" color="text.primary" sx={{ display: 'block', whiteSpace: isMultiline ? 'pre-wrap' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {Array.isArray(value) ? value.join(', ') : String(value)}
                                </Typography>
                              )}
                            </Box>
                          );
                        })}

                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                        <Button
                          size="small"
                          variant="text"
                          startIcon={<Edit3 size={14} />}
                          onClick={() => toggleEditMode(action.id, action.payload)}
                          sx={{ fontSize: '0.65rem', textTransform: 'none', py: 0 }}
                        >
                          {editModeIds.has(action.id) ? 'Done Editing' : 'Edit Details'}
                        </Button>
                      </Box>
                    </Box>

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
                        {isMobile ? (t.common?.yes ?? 'OK') : (t.ai?.approve ?? 'Approve')}
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
                        {isMobile ? (t.common?.no ?? 'No') : (t.ai?.reject ?? 'Reject')}
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
