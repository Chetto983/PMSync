'use client';

/**
 * Agent Progress Indicator - 2025 Multi-Agent UX Pattern
 * Shows live agent chain with status, timing, and progress
 * Inspired by Victor Dibia's AutoGen UX principles
 */

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Box, Typography, LinearProgress, alpha, useTheme, Collapse } from '@mui/material';
import {
  Bot,
  Brain,
  Mail,
  Calendar,
  Users,
  Sparkles,
  CheckCircle2,
  Circle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

// Agent types that can be involved in processing
export type AgentType = 'intent' | 'email' | 'calendar' | 'contacts' | 'response';

export interface AgentStep {
  id: AgentType;
  status: 'pending' | 'active' | 'completed' | 'error';
  action?: string;
  duration?: number; // ms
  result?: string;
}

interface AgentProgressIndicatorProps {
  isActive: boolean;
  /** Optional: Real agent steps from backend streaming */
  agentSteps?: AgentStep[];
}

// Agent configuration with icons and colors
const AGENT_CONFIG: Record<AgentType, { icon: typeof Bot; color: string; label: string }> = {
  intent: { icon: Brain, color: '#55cae5', label: 'Intent Agent' },
  email: { icon: Mail, color: '#7650ce', label: 'Email Agent' },
  calendar: { icon: Calendar, color: '#b43db6', label: 'Calendar Agent' },
  contacts: { icon: Users, color: '#10b981', label: 'Contacts Agent' },
  response: { icon: Sparkles, color: '#f59e0b', label: 'Response Agent' },
};

// Simulated agent workflow (used when no real streaming data)
const SIMULATED_WORKFLOW: { agent: AgentType; action: string; duration: number }[] = [
  { agent: 'intent', action: 'Analyzing request...', duration: 800 },
  { agent: 'email', action: 'Searching inbox...', duration: 2000 },
  { agent: 'response', action: 'Composing reply...', duration: 1500 },
];

// Custom hook for animation timer
function useAnimationTimer(isRunning: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number>(0);
  const frameRef = useRef<number>(0);

  // Start/stop effect with inline tick function
  React.useEffect(() => {
    if (isRunning) {
      startTimeRef.current = Date.now();
      setElapsed(0);

      const tick = () => {
        if (startTimeRef.current > 0) {
          setElapsed(Date.now() - startTimeRef.current);
          frameRef.current = requestAnimationFrame(tick);
        }
      };

      frameRef.current = requestAnimationFrame(tick);
    } else {
      startTimeRef.current = 0;
      cancelAnimationFrame(frameRef.current);
    }
    return () => cancelAnimationFrame(frameRef.current);
  }, [isRunning]);

  return elapsed;
}

// Custom hook for step progression
function useStepProgression(isActive: boolean, externalSteps?: AgentStep[]) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);

  // Initialize steps when becoming active
  React.useEffect(() => {
    if (!isActive) {
      // Cleanup when deactivated
      if (timerRef.current) clearTimeout(timerRef.current);
      isInitializedRef.current = false;
      setSteps([]);
      setCurrentIndex(0);
      return;
    }

    // Already initialized, skip
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    // Use external steps if provided
    if (externalSteps && externalSteps.length > 0) {
      setSteps(externalSteps);
      return;
    }

    // Initialize with simulated workflow
    const initialSteps: AgentStep[] = SIMULATED_WORKFLOW.map(w => ({
      id: w.agent,
      status: 'pending' as const,
      action: w.action,
    }));
    setSteps(initialSteps);
    setCurrentIndex(0);
  }, [isActive, externalSteps]);

  // Progress through steps
  React.useEffect(() => {
    if (!isActive || steps.length === 0) return;
    if (externalSteps && externalSteps.length > 0) return; // Don't simulate if external
    if (currentIndex >= SIMULATED_WORKFLOW.length) return;

    const workflow = SIMULATED_WORKFLOW[currentIndex];
    const startTime = Date.now();

    // Mark current step as active
    setSteps(prev => prev.map((step, idx) =>
      idx === currentIndex ? { ...step, status: 'active' as const } : step
    ));

    // Complete after duration
    timerRef.current = setTimeout(() => {
      const duration = Date.now() - startTime;
      setSteps(prev => prev.map((step, idx) =>
        idx === currentIndex
          ? { ...step, status: 'completed' as const, duration }
          : step
      ));
      setCurrentIndex(prev => prev + 1);
    }, workflow.duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isActive, steps.length, currentIndex, externalSteps]);

  return { steps, currentIndex };
}

export function AgentProgressIndicator({ isActive, agentSteps: externalSteps }: AgentProgressIndicatorProps) {
  const theme = useTheme();
  const t = useTranslations();
  const [expanded, setExpanded] = useState(true);

  const elapsedTime = useAnimationTimer(isActive);
  const { steps } = useStepProgression(isActive, externalSteps);

  // Get translated agent labels
  const getAgentLabel = useCallback((agentType: AgentType): string => {
    const labels = t.ai?.chat?.agents;
    if (labels) {
      return labels[agentType] || AGENT_CONFIG[agentType].label;
    }
    return AGENT_CONFIG[agentType].label;
  }, [t]);

  // Calculate progress
  const { progress, activeStep } = useMemo(() => {
    const completed = steps.filter(s => s.status === 'completed').length;
    const prog = steps.length > 0 ? (completed / steps.length) * 100 : 0;
    const active = steps.find(s => s.status === 'active');
    return { progress: prog, activeStep: active };
  }, [steps]);

  if (!isActive) return null;

  return (
    <Box sx={{ width: '100%' }}>
      {/* Progress Container - Full Width */}
      <Box
        sx={{
          width: '100%',
          borderRadius: 3,
          bgcolor: alpha(theme.palette.background.paper, 0.98),
          border: '1px solid',
          borderColor: alpha(theme.palette.primary.main, 0.2),
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          overflow: 'hidden',
          boxShadow: `0 8px 32px ${alpha(theme.palette.common.black, 0.12)}`,
        }}
      >
        {/* Header - Always visible */}
        <Box
          onClick={() => setExpanded(!expanded)}
          sx={{
            px: { xs: 2, sm: 2.5, md: 3 },
            py: { xs: 2, md: 2.5 },
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            bgcolor: alpha(theme.palette.primary.main, 0.04),
            borderBottom: expanded ? '1px solid' : 'none',
            borderColor: alpha(theme.palette.divider, 0.08),
            transition: 'background-color 0.2s',
            '&:hover': {
              bgcolor: alpha(theme.palette.primary.main, 0.08),
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, md: 2 }, flex: 1, minWidth: 0 }}>
            {/* Animated AI Avatar - Touch-friendly 48px on all sizes */}
            <Box
              sx={{
                width: { xs: 44, md: 48 },
                height: { xs: 44, md: 48 },
                borderRadius: 2.5,
                background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                flexShrink: 0,
                boxShadow: `0 4px 24px ${alpha(theme.palette.primary.main, 0.4)}`,
                animation: 'avatar-pulse 2s ease-in-out infinite',
                '@keyframes avatar-pulse': {
                  '0%, 100%': {
                    boxShadow: `0 4px 24px ${alpha(theme.palette.primary.main, 0.4)}`,
                  },
                  '50%': {
                    boxShadow: `0 6px 32px ${alpha(theme.palette.primary.main, 0.6)}`,
                  },
                },
              }}
            >
              <Bot size={22} />
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  color: 'text.primary',
                  fontSize: { xs: '0.95rem', sm: '1rem', md: '1.1rem' },
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.ai?.chat?.progress?.working || 'PMSync AI is working...'}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                <Loader2
                  size={14}
                  style={{
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                    fontSize: { xs: '0.8rem', md: '0.9rem' },
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {activeStep?.action || (t.ai?.chat?.progress?.analyzing || 'Analyzing context...')}
                </Typography>
              </Box>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, md: 2.5 }, flexShrink: 0 }}>
            <Typography
              variant="h6"
              sx={{
                color: 'primary.main',
                fontFamily: 'monospace',
                fontSize: { xs: '0.95rem', md: '1.1rem' },
                fontWeight: 600,
              }}
            >
              {(elapsedTime / 1000).toFixed(1)}s
            </Typography>
            {expanded ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
          </Box>
        </Box>

        {/* Agent Chain - Collapsible */}
        <Collapse in={expanded}>
          <Box sx={{ p: { xs: 2, md: 3 } }}>
            {/* Agent Steps */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 1, md: 1.5 } }}>
              {steps.map((step) => {
                const config = AGENT_CONFIG[step.id];
                const Icon = config.icon;
                const isStepActive = step.status === 'active';
                const isCompleted = step.status === 'completed';
                const isPending = step.status === 'pending';

                return (
                  <Box
                    key={step.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: { xs: 1.5, md: 2 },
                      py: { xs: 1, md: 1.25 },
                      px: { xs: 1, md: 1.5 },
                      borderRadius: 2.5,
                      transition: 'all 0.3s ease',
                      ...(isStepActive && {
                        bgcolor: alpha(config.color, 0.08),
                      }),
                    }}
                  >
                    {/* Status Icon - Touch-friendly 32px minimum */}
                    <Box
                      sx={{
                        width: { xs: 32, md: 36 },
                        height: { xs: 32, md: 36 },
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'all 0.3s ease',
                        ...(isCompleted && {
                          bgcolor: theme.palette.success.main,
                          color: 'white',
                        }),
                        ...(isStepActive && {
                          bgcolor: config.color,
                          color: 'white',
                          animation: 'pulse-status 1.5s ease-in-out infinite',
                          '@keyframes pulse-status': {
                            '0%, 100%': { transform: 'scale(1)', opacity: 1 },
                            '50%': { transform: 'scale(1.1)', opacity: 0.9 },
                          },
                        }),
                        ...(isPending && {
                          bgcolor: alpha(theme.palette.text.disabled, 0.1),
                          color: 'text.disabled',
                        }),
                      }}
                    >
                      {isCompleted ? (
                        <CheckCircle2 size={18} />
                      ) : isStepActive ? (
                        <Icon size={16} />
                      ) : (
                        <Circle size={10} />
                      )}
                    </Box>

                    {/* Agent Info */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body1"
                        sx={{
                          fontWeight: isStepActive ? 600 : 500,
                          color: isPending ? 'text.disabled' : 'text.primary',
                          fontSize: { xs: '0.875rem', md: '0.95rem' },
                        }}
                      >
                        {getAgentLabel(step.id)}
                      </Typography>
                      {(isStepActive || isCompleted) && step.action && (
                        <Typography
                          variant="body2"
                          sx={{
                            color: 'text.secondary',
                            fontSize: { xs: '0.75rem', md: '0.85rem' },
                            display: 'block',
                            mt: 0.25,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {isStepActive ? step.action : (step.result || step.action.replace('...', ''))}
                        </Typography>
                      )}
                    </Box>

                    {/* Duration */}
                    {step.duration && (
                      <Typography
                        variant="body2"
                        sx={{
                          color: 'text.disabled',
                          fontFamily: 'monospace',
                          fontSize: { xs: '0.75rem', md: '0.85rem' },
                          flexShrink: 0,
                        }}
                      >
                        {(step.duration / 1000).toFixed(1)}s
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>

            {/* Progress Bar */}
            <Box sx={{ mt: { xs: 2, md: 3 }, pt: { xs: 1.5, md: 2 }, borderTop: '1px solid', borderColor: alpha(theme.palette.divider, 0.08) }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: { xs: 0.5, md: 1 } }}>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                    fontSize: { xs: '0.8rem', md: '0.9rem' },
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    mr: 1,
                  }}
                >
                  {activeStep?.action || (t.ai?.chat?.progress?.finalizing || 'Finalizing...')}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.disabled',
                    fontFamily: 'monospace',
                    fontSize: { xs: '0.8rem', md: '0.9rem' },
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  {Math.round(progress)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{
                  height: { xs: 4, md: 6 },
                  borderRadius: 3,
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 3,
                    background: `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                  },
                }}
              />
            </Box>
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
}

export default AgentProgressIndicator;
