/**
 * UnifiedAgent System Prompt (RLM Pattern)
 *
 * LEAN VERSION - Single prompt that dynamically loads only relevant modules.
 * Inspired by Notion AI's "immediate action" and "avoid overperforming" patterns.
 *
 * Token savings: ~60% compared to multi-agent routing overhead.
 *
 * Created: 2026-01-29 (VoltAgent Simplification)
 */

import type { TaskIntent } from '../services/task-complexity-classifier.service';
import {
  CLARIFICATION_MODULE,
  SUGGESTIONS_MODULE,
  ERROR_MODULE,
  BULK_MODULE,
} from './shared.prompt';

/**
 * Email context for when user is viewing/discussing a specific email.
 * Used to inject contextual awareness into the prompt when selectedEmailId is present.
 */
export interface EmailContext {
  id: string;
  subject: string;
  from: string;
  receivedAt: string;
  snippet?: string;
}

/**
 * Build email context section for the prompt when viewing a specific email.
 * This enables the AI to understand "this email" references.
 */
function buildEmailContextSection(emailContext?: EmailContext): string {
  if (!emailContext) return '';

  const snippetLine = emailContext.snippet
    ? `- **Preview**: ${emailContext.snippet.slice(0, 200)}...`
    : '';

  return `
<EMAIL_CONTEXT>
You are helping the user with this specific email:
- **Subject**: ${emailContext.subject}
- **From**: ${emailContext.from}
- **Received**: ${emailContext.receivedAt}
${snippetLine}

When the user says "this email", "the email", or similar, they are referring to this email (ID: ${emailContext.id}).
For operations on this email (reply, forward, archive, label, summarize), use this email's ID.
</EMAIL_CONTEXT>`;
}

/**
 * BASE: Always included (~500 chars)
 * Core identity and rules - kept minimal like Notion AI.
 */
const BASE = `<ROLE>PMSync - Personal Mail Sync Assistant</ROLE>

<CORE_RULES>
- Immediate action: Call tools directly when request is clear
- User's language: Match the language of the user
- Markdown format: Use for all responses
- Ask don't guess: Use ask_user_clarification tool for ambiguity
- Keep scope tight: Do not do more than user asks for
</CORE_RULES>

<SEVERITY>
LOW: read/search/list operations
MEDIUM: create/update/send operations (require HITL)
HIGH: delete/bulk operations (require explicit confirmation)
</SEVERITY>`;

/**
 * EMAIL_MODULE: For email read/search/compose operations (~400 chars)
 */
const EMAIL_MODULE = `<EMAIL_STRATEGY>
READ: list_email_index(mode:'unread') → pick 3-5 IDs → get_email_content([ids]) → summarize
SEARCH: search_emails(query) for keywords | semantic_search_emails for meaning
COMPOSE: list_emails(mode:'accounts') → get providerId → manage_email(action:'send'|'reply'|'forward')
</EMAIL_STRATEGY>`;

/**
 * CALENDAR_MODULE: For event operations (~300 chars)
 */
const CALENDAR_MODULE = `<CALENDAR_STRATEGY>
VIEW: get_events(start, end) for schedule
CREATE: manage_event(action:'create', title, startTime, endTime, ...)
UPDATE: get_events(dateRange) → find eventId → manage_event(action:'update', eventId, ...)
DELETE: get_events(dateRange) → find eventId → manage_event(action:'delete', eventId)
</CALENDAR_STRATEGY>`;

/**
 * CONTACT_MODULE: For contact operations (~250 chars)
 */
const CONTACT_MODULE = `<CONTACT_STRATEGY>
SEARCH: search_contacts(query) for people lookup (correspondents, not celebrities)
CREATE: manage_contact(action:'create', displayName, email, ...)
UPDATE: search_contacts → get contactId → manage_contact(action:'update', ...)
DELETE: search_contacts → get contactId → manage_contact(action:'delete', ...)
</CONTACT_STRATEGY>`;

/**
 * FOLDER_MODULE: For folder operations (~200 chars)
 */
const FOLDER_MODULE = `<FOLDER_STRATEGY>
LIST: list_folders(providerId) for all folders
CREATE: manage_folder(action:'create', name, parentFolderId?)
RENAME: list_folders → get folderId → manage_folder(action:'rename', folderId, newName)
DELETE: list_folders → get folderId → manage_folder(action:'delete', folderId)
</FOLDER_STRATEGY>`;

/**
 * INSIGHTS_MODULE: For AI-powered analysis (~250 chars)
 * Only loaded when RAG services are available.
 */
const INSIGHTS_MODULE = `<INSIGHTS_STRATEGY>
ANALYZE: analyze_email(emailId) for sentiment, priority, action items
SMART_REPLY: compose_reply(emailId, tone) for AI-suggested responses
SEMANTIC: semantic_search_emails(query) for meaning-based search
</INSIGHTS_STRATEGY>`;

/**
 * WEBSEARCH_MODULE: For external information (~150 chars)
 */
const WEBSEARCH_MODULE = `<WEBSEARCH_STRATEGY>
EXTERNAL: web_search(query) for current information (weather, news, public data)
NOT FOR: internal workspace info, emails, contacts - use search_emails/search_contacts instead
</WEBSEARCH_STRATEGY>`;

/**
 * GREETING_MODULE: Fast path for simple interactions (~100 chars)
 */
const GREETING_MODULE = `<GREETING_STRATEGY>
Be helpful and friendly. Ask how to assist with emails, calendar, or contacts.
</GREETING_STRATEGY>`;

/**
 * MEMORY_MODULE: For user memory operations (~200 chars)
 */
const MEMORY_MODULE = `<MEMORY_STRATEGY>
SEARCH: memory_search(query) for user preferences, facts, relationships
STORE: Automatically extract and save relevant facts from conversation
NOTE: Use memory to personalize responses and remember context
</MEMORY_STRATEGY>`;

/**
 * Tool groups by intent - defines which tools to load
 */
export const TOOL_GROUPS: Record<string, readonly string[]> = {
  // Core tools - always loaded
  core: ['ask_user_clarification'] as const,

  // Memory tools - loaded when memory service available
  memory: ['memory_search', 'memory_store'] as const,

  // Email tools - for email operations
  email: [
    'list_email_index',
    'get_email_content',
    'list_emails',
    'search_emails',
    'count_emails',
    'manage_email',
    'bulk_email_actions',
  ] as const,

  // Calendar tools - for event operations
  calendar: ['get_events', 'manage_event'] as const,

  // Contact tools - for contact operations
  contacts: ['search_contacts', 'manage_contact'] as const,

  // Folder tools - for folder management
  folders: ['list_folders', 'manage_folder'] as const,

  // Insights tools - for AI analysis (RAG required)
  insights: ['analyze_email', 'compose_reply', 'semantic_search_emails'] as const,

  // Web search tools - external info
  websearch: ['web_search'] as const,

  // Document tools - for document library
  documents: ['manage_document_library', 'search_documents'] as const,
} as const;

/**
 * Intent to tool groups mapping
 */
const INTENT_TOOL_GROUPS: Record<TaskIntent, readonly string[]> = {
  greeting: ['core'],
  search: ['core', 'email', 'contacts', 'insights'],
  read: ['core', 'email', 'insights'],
  write: ['core', 'email', 'contacts'],
  compose: ['core', 'email', 'contacts', 'insights'],
  calendar: ['core', 'calendar'],
  orchestrate: ['core', 'email', 'calendar', 'contacts', 'folders'],
  unknown: ['core', 'email', 'calendar', 'contacts', 'folders'],
};

/**
 * Get tool groups for an intent
 */
export function getToolGroupsForIntent(
  intent: TaskIntent,
  options?: {
    hasMemory?: boolean;
    hasInsights?: boolean;
    hasWebSearch?: boolean;
    hasDocuments?: boolean;
  },
): string[] {
  const groups = [...INTENT_TOOL_GROUPS[intent]];

  // Add optional groups based on available services
  if (options?.hasMemory) {
    groups.push('memory');
  }
  if (options?.hasInsights && !groups.includes('insights')) {
    groups.push('insights');
  }
  if (options?.hasWebSearch && intent !== 'greeting') {
    groups.push('websearch');
  }
  if (options?.hasDocuments && intent !== 'greeting') {
    groups.push('documents');
  }

  return groups;
}

/**
 * RLM: Get UnifiedAgent prompt based on detected intent.
 * Only loads relevant modules - saves 60%+ tokens.
 *
 * @param intent - Detected task intent
 * @param options - Service availability flags
 */
export function getUnifiedPrompt(
  intent: TaskIntent,
  options?: {
    hasMemory?: boolean;
    hasInsights?: boolean;
    hasWebSearch?: boolean;
    hasDocuments?: boolean;
    includeBulkSafety?: boolean;
    emailContext?: EmailContext;
  },
): string {
  const parts: string[] = [BASE];

  // Add email context if provided (for "this email" references)
  if (options?.emailContext) {
    parts.push(buildEmailContextSection(options.emailContext));
  }

  // Add intent-specific modules
  switch (intent) {
    case 'greeting':
      parts.push(GREETING_MODULE);
      break;

    case 'search':
      parts.push(EMAIL_MODULE);
      parts.push(CONTACT_MODULE);
      if (options?.hasInsights) parts.push(INSIGHTS_MODULE);
      break;

    case 'read':
      parts.push(EMAIL_MODULE);
      if (options?.hasInsights) parts.push(INSIGHTS_MODULE);
      break;

    case 'write':
    case 'compose':
      parts.push(EMAIL_MODULE);
      parts.push(CONTACT_MODULE);
      if (options?.hasInsights) parts.push(INSIGHTS_MODULE);
      break;

    case 'calendar':
      parts.push(CALENDAR_MODULE);
      break;

    case 'orchestrate':
    case 'unknown':
    default:
      // Load all modules for complex/unknown intents
      parts.push(EMAIL_MODULE);
      parts.push(CALENDAR_MODULE);
      parts.push(CONTACT_MODULE);
      parts.push(FOLDER_MODULE);
      break;
  }

  // Add optional modules based on available services
  if (options?.hasMemory) {
    parts.push(MEMORY_MODULE);
  }
  if (options?.hasWebSearch && intent !== 'greeting') {
    parts.push(WEBSEARCH_MODULE);
  }

  // Add bulk safety for write operations
  if (options?.includeBulkSafety && ['write', 'compose', 'orchestrate'].includes(intent)) {
    parts.push(BULK_MODULE);
  }

  // Always add error recovery, clarification, and suggestions
  parts.push(ERROR_MODULE);
  parts.push(CLARIFICATION_MODULE);
  parts.push(SUGGESTIONS_MODULE);

  return parts.join('\n');
}

/**
 * Legacy export for backward compatibility
 */
export const UNIFIED_PROMPT = getUnifiedPrompt('unknown', {
  hasMemory: true,
  hasInsights: true,
  hasWebSearch: true,
});
