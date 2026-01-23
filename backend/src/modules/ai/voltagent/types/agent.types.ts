/**
 * VoltAgent Agent Types
 *
 * Phase 3 Agent Consolidation (10 → 3):
 * - Supervisor: Orchestrates sub-agents, handles complex multi-domain queries
 * - Actions: ALL WRITE operations (email send/reply/delete, calendar CRUD, contacts CRUD)
 * - Intelligence: ALL READ and ANALYSIS operations (search, list, count, analyze)
 */
export type AgentType = 'Supervisor' | 'Actions' | 'Intelligence';
