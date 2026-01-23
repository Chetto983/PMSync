/**
 * Agent Prompts Index
 *
 * Centralized exports for all agent system prompts.
 * These prompts are maintained separately for easier editing and version control.
 *
 * Architecture: Single source of truth - all prompts defined here,
 * locales/en.ts imports from this index (no inline prompts).
 */

// Core agents
export { SUPERVISOR_PROMPT, SUPERVISOR_MESSAGES } from './supervisor.prompt';
export { ACTIONS_PROMPT } from './actions.prompt';
export { INTELLIGENCE_PROMPT } from './intelligence.prompt';

// Specialist agents
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
