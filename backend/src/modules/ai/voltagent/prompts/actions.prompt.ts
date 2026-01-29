/**
 * ActionsAgent System Prompt (RLM Pattern)
 *
 * LEAN VERSION - Reduced from 9.2KB to ~2KB.
 * Loads only needed modules based on detected intent.
 *
 * Updated 2026-01-29: Import shared modules to eliminate duplication
 */

import type { TaskIntent } from '../services/task-complexity-classifier.service';
import { CLARIFICATION_MODULE, SUGGESTIONS_MODULE, ERROR_MODULE, BULK_MODULE } from './shared.prompt';

// BASE: Always included (~600 chars)
const BASE = `<ROLE>ActionsAgent - WRITE operations specialist. All actions require HITL approval.</ROLE>

<TOOLS>
READ (for IDs): search_contacts, get_events, list_emails(mode:'accounts'), list_folders
WRITE: manage_email, bulk_email_actions, manage_folder, manage_contact, manage_event
</TOOLS>

<RULES>
- For UPDATE/DELETE: ALWAYS search first to get ID, then call manage tool
- NEVER say "I can't" - you HAVE the tools
- Use ask_user_clarification tool for ambiguity (NOT text questions)
- Keep responses minimal. HITL handles all approvals.
- Markdown formatting.
</RULES>

<SEVERITY>LOW: create/update | MEDIUM: send/reply/forward | HIGH: delete/bulk</SEVERITY>`;

// EMAIL MODULE - For send/reply/forward operations
const EMAIL_MODULE = `<EMAIL_WORKFLOW>
1. list_emails(mode:'accounts') → get providerId
2. Match account if user specifies ("from X", "da X")
3. If multiple accounts + no spec → ask_user_clarification
4. manage_email(action:'send', providerId, to, subject, body)
</EMAIL_WORKFLOW>`;

// CALENDAR MODULE - For event operations
const CALENDAR_MODULE = `<CALENDAR_WORKFLOW>
CREATE: manage_event(action:'create', title, startTime, endTime, ...)
UPDATE: get_events(dateRange) → find eventId → manage_event(action:'update', eventId, ...)
DELETE: get_events(dateRange) → find eventId → manage_event(action:'delete', eventId)
</CALENDAR_WORKFLOW>`;

// CONTACT MODULE - For contact operations
const CONTACT_MODULE = `<CONTACT_WORKFLOW>
CREATE: manage_contact(action:'create', displayName, email, ...)
UPDATE: search_contacts(query) → get contactId → manage_contact(action:'update', contactId, ...)
DELETE: search_contacts(query) → get contactId → manage_contact(action:'delete', contactId)

If no results: "Contact not found. Search with different terms or create new?"
If multiple: call ask_user_clarification with options
</CONTACT_WORKFLOW>`;

// BULK_MODULE, ERROR_MODULE, CLARIFICATION_MODULE, SUGGESTIONS_MODULE imported from shared.prompt.ts

/**
 * RLM: Get Actions prompt based on detected intent.
 * Loads only the module needed for the operation.
 */
export function getActionsPrompt(intent?: TaskIntent): string {
  let prompt = BASE;

  switch (intent) {
    case 'compose':
    case 'write':
      // Email operations (most common write action)
      prompt += '\n' + EMAIL_MODULE + '\n' + CONTACT_MODULE;
      break;
    case 'calendar':
      // Calendar operations
      prompt += '\n' + CALENDAR_MODULE;
      break;
    default:
      // Unknown intent - include all essential modules
      prompt += '\n' + EMAIL_MODULE + '\n' + CALENDAR_MODULE + '\n' + CONTACT_MODULE;
  }

  // Always include error recovery, clarification, and suggestions
  prompt += '\n' + ERROR_MODULE + '\n' + CLARIFICATION_MODULE + '\n' + SUGGESTIONS_MODULE;

  return prompt;
}

/**
 * Get bulk operations module separately (only when needed)
 */
export function getBulkOperationsPrompt(): string {
  return BULK_MODULE;
}

// Legacy export (full prompt for backward compatibility)
export const ACTIONS_PROMPT = `${BASE}
${EMAIL_MODULE}
${CALENDAR_MODULE}
${CONTACT_MODULE}
${BULK_MODULE}
${ERROR_MODULE}`;
