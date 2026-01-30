/**
 * Agent Prompts Index
 *
 * Centralized exports for all agent system prompts.
 *
 * Architecture (2026-01-29):
 * - UnifiedAgent: Single agent with dynamic tool loading
 * - Shared modules: Reusable prompt components
 * - Specialist prompts: Domain-specific (websearch, analytics, memory)
 */

// =============================================================================
// PRIMARY: UnifiedAgent
// =============================================================================
export { getUnifiedPrompt, getToolGroupsForIntent, TOOL_GROUPS, UNIFIED_PROMPT } from './unified.prompt';

// =============================================================================
// CORE: Supervisor and shared modules
// =============================================================================
export { SUPERVISOR_PROMPT, SUPERVISOR_MESSAGES } from './supervisor.prompt';
export {
  CLARIFICATION_MODULE,
  SUGGESTIONS_MODULE,
  ERROR_MODULE,
  BULK_MODULE,
  THINKING_PROCESS_MODULE,
  SELF_CHECK_MODULE,
} from './shared.prompt';

// =============================================================================
// SPECIALIST: Domain-specific prompts
// =============================================================================
export { WEBSEARCH_PROMPT } from './websearch.prompt';
export { ANALYTICS_PROMPT } from './analytics.prompt';
export { DOCUMENT_LIBRARY_PROMPT } from './document-library.prompt';

// Memory prompts
export {
  FACT_RETRIEVAL_PROMPT,
  MEMORY_DEDUCTION_PROMPT,
  MEMORY_SEARCH_PROMPT,
  MEMORY_SUMMARY_PROMPT,
  inferMemoryType,
} from './memory.prompt';
