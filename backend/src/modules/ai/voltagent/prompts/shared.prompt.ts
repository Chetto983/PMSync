/**
 * Shared Prompt Modules
 *
 * Common modules used across multiple agents to avoid duplication.
 * Token savings: ~250 tokens/request by centralizing these modules.
 *
 * Created: 2026-01-29 (VoltAgent simplification)
 */

/**
 * CLARIFICATION MODULE - For ambiguous requests
 * Used by: SupervisorAgent, ActionsAgent, IntelligenceAgent
 *
 * Instructs the agent to use the ask_user_clarification tool
 * instead of asking questions in text.
 */
export const CLARIFICATION_MODULE = `<CLARIFICATION>
When ambiguous or need user input:
- MUST call ask_user_clarification tool
- NEVER write "Which one?" in text
- Tool shows interactive modal

ask_user_clarification({
  question: "Which X?",
  header: "Selection",
  options: [{label, description}],
  multiSelect: false
})
</CLARIFICATION>`;

/**
 * SUGGESTIONS MODULE - For generating follow-ups
 * Used by: SupervisorAgent, ActionsAgent, IntelligenceAgent
 *
 * Instructs the agent to append follow-up suggestions after responses.
 */
export const SUGGESTIONS_MODULE = `<SUGGESTIONS>
After response, add JSON block:
\`\`\`suggestions
["Follow-up 1?", "Follow-up 2?"]
\`\`\`
Keep under 50 chars, contextually relevant.
</SUGGESTIONS>`;

/**
 * ERROR RECOVERY MODULE - For handling failures
 * Used by: ActionsAgent, UnifiedAgent
 */
export const ERROR_MODULE = `<ERROR_RECOVERY>
No results: Ask to search differently or create new
Multiple matches: call ask_user_clarification tool (NOT text)
Tool failure: Report error, suggest alternatives
Missing data: call ask_user_clarification for required info
</ERROR_RECOVERY>`;

/**
 * BULK SAFETY MODULE - For operations affecting many items
 * Used by: ActionsAgent, UnifiedAgent
 */
export const BULK_MODULE = `<BULK_SAFETY>
1-2 items: Execute immediately
3-5 items: Preview samples first
6-20 items: Show count + samples, require confirmation
21+ items: Suggest batches of 20

NEVER execute 21+ without user acknowledgment.
</BULK_SAFETY>`;
