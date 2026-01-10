/**
 * VoltAgent Agents Export
 *
 * Phase 3 Agent Consolidation (10 → 3):
 * - ActionsAgent: ALL WRITE operations (email, calendar, contacts, folders)
 * - IntelligenceAgent: ALL READ and ANALYSIS operations
 * - Optional: WebSearchAgent, DocumentLibraryAgent, AnalyticsAgent (lazy-loaded)
 */

// Core consolidated agents
export { createActionsAgent, type ActionsAgentOptions } from './actions.agent';
export { createIntelligenceAgent, type IntelligenceAgentOptions } from './intelligence.agent';

// Optional lazy-loaded agents
export { createWebSearchAgent, type WebSearchAgentOptions } from './websearch.agent';
export { createAnalyticsAgent, type AnalyticsAgentOptions } from './analytics.agent';
export {
  createDocumentLibraryAgent,
  type DocumentLibraryAgentOptions,
} from './document-library.agent';

// Supervisor agent (orchestrator)
export {
  createSupervisorAgent,
  buildDynamicInstructions,
  type SupervisorAgentOptions,
  type UserContext,
  type ConnectedProvider,
} from './supervisor.agent';
