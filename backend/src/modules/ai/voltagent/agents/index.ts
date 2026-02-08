/**
 * VoltAgent Agents Export
 *
 * VoltAgent Simplification 2026-01-29:
 * - UnifiedAgent: Single agent with dynamic tool groups (replaces 5 agents)
 * - Instruction builder utilities from supervisor.agent.ts
 */

// UnifiedAgent - single agent with dynamic tool groups (primary)
export {
  createUnifiedAgent,
  createUnifiedAgentForIntent,
  getAvailableToolGroups,
  type UnifiedAgentOptions,
} from './unified.agent';

// Instruction builder utilities (retained from supervisor.agent.ts)
export {
  buildDynamicInstructions,
  type UserContext,
  type ConnectedProvider,
} from './supervisor.agent';
