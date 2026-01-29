/**
 * VoltAgent Agents Export
 *
 * VoltAgent Simplification 2026-01-29:
 * - UnifiedAgent: Single agent with dynamic tool groups (replaces 5 agents)
 * - SupervisorAgent: Kept for backward compatibility (delegates to UnifiedAgent)
 */

// UnifiedAgent - single agent with dynamic tool groups (primary)
export {
  createUnifiedAgent,
  createUnifiedAgentForIntent,
  getAvailableToolGroups,
  type UnifiedAgentOptions,
} from './unified.agent';

// Supervisor agent (backward compatibility - now delegates to UnifiedAgent)
export {
  createSupervisorAgent,
  buildDynamicInstructions,
  type SupervisorAgentOptions,
  type UserContext,
  type ConnectedProvider,
} from './supervisor.agent';
