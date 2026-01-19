/**
 * Agent Prompts Index
 *
 * Centralized exports for all agent system prompts.
 * These prompts are maintained separately for easier editing and version control.
 */

export { SUPERVISOR_PROMPT, SUPERVISOR_MESSAGES } from './supervisor.prompt';
export { ACTIONS_PROMPT } from './actions.prompt';
export { INTELLIGENCE_PROMPT } from './intelligence.prompt';
export {
  FACT_RETRIEVAL_PROMPT,
  MEMORY_DEDUCTION_PROMPT,
  MEMORY_SEARCH_PROMPT,
  MEMORY_SUMMARY_PROMPT,
  inferMemoryType,
} from './memory.prompt';
