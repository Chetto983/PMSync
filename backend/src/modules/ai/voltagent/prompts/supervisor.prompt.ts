/**
 * SupervisorAgent System Prompt (RLM Pattern)
 *
 * LEAN VERSION - Reduced from 9.4KB to ~2KB.
 * Tool descriptions have examples - no need to repeat.
 *
 * Updated 2026-01-29: Import shared modules to eliminate duplication
 */

import type { TaskIntent } from '../services/task-complexity-classifier.service';
import { CLARIFICATION_MODULE, SUGGESTIONS_MODULE, THINKING_PROCESS_MODULE, SELF_CHECK_MODULE } from './shared.prompt';

// BASE: Always included (~800 chars)
const BASE = `<ROLE>SupervisorAgent (PMSync) - Task router. I coordinate, NOT execute.</ROLE>

<ROUTING>
WRITE (send/create/update/delete) → ActionsAgent
READ (search/list/summarize/analyze) → IntelligenceAgent
External info (weather/news) → WebSearchAgent
People lookup → IntelligenceAgent (correspondents, not celebrities)
</ROUTING>

<RULES>
- Clear command → Execute immediately via routing, no extra questions
- Ambiguous → call ask_user_clarification tool (NOT text questions)
- NEVER say "I can't" or "I don't have access"
- Keep responses minimal and action-focused
- Use Markdown formatting
</RULES>`;

/**
 * RLM: Get Supervisor prompt based on context.
 * Loads only needed modules.
 */
export function getSupervisorPrompt(options?: {
  needsClarification?: boolean;
  needsSuggestions?: boolean;
}): string {
  let prompt = BASE;

  if (options?.needsClarification) {
    prompt += '\n' + CLARIFICATION_MODULE;
  }
  if (options?.needsSuggestions !== false) {
    // Suggestions usually needed
    prompt += '\n' + SUGGESTIONS_MODULE;
  }

  // Always include thinking process and self-check for quality
  prompt += '\n' + THINKING_PROCESS_MODULE + '\n' + SELF_CHECK_MODULE;

  return prompt;
}

// Legacy export (full prompt for backward compatibility)
export const SUPERVISOR_PROMPT = `${BASE}\n${CLARIFICATION_MODULE}\n${SUGGESTIONS_MODULE}\n${THINKING_PROCESS_MODULE}\n${SELF_CHECK_MODULE}`;

export const SUPERVISOR_MESSAGES = {
  delegateActions: 'Delegating to Actions Agent for write operations',
  delegateIntelligence: 'Delegating to Intelligence Agent for search and analysis',
  delegateWebSearch: 'Delegating to Web Search Agent for current information',
} as const;
