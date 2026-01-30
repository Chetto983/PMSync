/**
 * Agent Name Constants
 *
 * Centralized agent name definitions to avoid hardcoded strings.
 * Use these constants throughout the VoltAgent module.
 */

export const AGENT_NAMES = {
  /** Primary agent with dynamic tool loading */
  UNIFIED: 'UnifiedAgent',
  /** Wrapper for backward compatibility */
  SUPERVISOR: 'SupervisorAgent',
} as const;

export type AgentName = (typeof AGENT_NAMES)[keyof typeof AGENT_NAMES];
