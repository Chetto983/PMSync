'use client';

/**
 * useAgentActivityStream - Real-time agent activity streaming hook
 *
 * 2025 UX Pattern: Live visualization of what each VoltAgent is doing
 * Uses WebSocket for real-time updates during AI processing
 *
 * @example
 * const { steps, isActive, reset } = useAgentActivityStream(sessionId);
 * <AgentProgressIndicator isActive={isActive} agentSteps={steps} />
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { websocketClient, type RealtimeAiAgentStepEvent, type AiAgentType } from '@/lib/websocket-client';

export interface AgentStep {
  id: string;
  agentType: AiAgentType;
  status: 'pending' | 'active' | 'completed' | 'error';
  action?: string;
  duration?: number;
  result?: string;
  error?: string;
}

interface UseAgentActivityStreamOptions {
  /** Session/conversation ID to filter events */
  sessionId?: string | null;
  /** Maximum number of steps to keep */
  maxSteps?: number;
}

interface UseAgentActivityStreamResult {
  /** Current agent steps */
  steps: AgentStep[];
  /** Whether any agent is currently active */
  isActive: boolean;
  /** Reset the stream state */
  reset: () => void;
  /** Latest error if any */
  lastError: string | null;
}

/**
 * Maps WebSocket event status to internal step status
 */
function mapStatus(status: RealtimeAiAgentStepEvent['status']): AgentStep['status'] {
  switch (status) {
    case 'started':
    case 'processing':
    case 'tool_call':
      return 'active';
    case 'completed':
      return 'completed';
    case 'error':
      return 'error';
    default:
      return 'pending';
  }
}

export function useAgentActivityStream(
  options: UseAgentActivityStreamOptions = {}
): UseAgentActivityStreamResult {
  const { sessionId, maxSteps = 10 } = options;
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const activeStepRef = useRef<string | null>(null);

  // Reset the stream state
  const reset = useCallback(() => {
    setSteps([]);
    setIsActive(false);
    setLastError(null);
    activeStepRef.current = null;
  }, []);

  // Handle incoming agent step events
  useEffect(() => {
    const handleAgentStep = (event: RealtimeAiAgentStepEvent) => {
      // Filter by sessionId if provided
      if (sessionId && event.sessionId !== sessionId) {
        return;
      }

      const mappedStatus = mapStatus(event.status);

      setSteps(prev => {
        // Find existing step by stepId
        const existingIndex = prev.findIndex(s => s.id === event.stepId);

        const newStep: AgentStep = {
          id: event.stepId,
          agentType: event.agentType,
          status: mappedStatus,
          action: event.action,
          duration: event.duration,
          result: event.result,
          error: event.error,
        };

        if (existingIndex >= 0) {
          // Update existing step
          const updated = [...prev];
          updated[existingIndex] = newStep;
          return updated;
        } else {
          // Add new step (limit to maxSteps)
          const updated = [...prev, newStep];
          return updated.slice(-maxSteps);
        }
      });

      // Update active state
      if (mappedStatus === 'active') {
        setIsActive(true);
        activeStepRef.current = event.stepId;
      } else if (mappedStatus === 'completed' || mappedStatus === 'error') {
        // When response agent completes, the entire workflow is done
        // This is the final event emitted by the backend
        if (event.agentType === 'response' && mappedStatus === 'completed') {
          setIsActive(false);
          activeStepRef.current = null;
        }
        // Also handle errors - deactivate on any error
        if (mappedStatus === 'error') {
          setIsActive(false);
          activeStepRef.current = null;
        }
      }

      // Track errors
      if (event.error) {
        setLastError(event.error);
      }
    };

    // Subscribe to agent step events
    const unsubscribe = websocketClient.onAiAgentStep(handleAgentStep);

    return () => {
      unsubscribe();
    };
  }, [sessionId, maxSteps]);

  return {
    steps,
    isActive,
    reset,
    lastError,
  };
}

export default useAgentActivityStream;
