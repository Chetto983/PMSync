/**
 * IntelligenceAgent System Prompt (RLM Pattern)
 *
 * Loads ONLY the relevant prompt section based on detected intent.
 * Reduces tokens by 60-80% compared to monolithic prompt.
 *
 * Updated 2026-01-29: Import shared modules to eliminate duplication
 */

import type { TaskIntent } from '../services/task-complexity-classifier.service';
import { CLARIFICATION_MODULE, SUGGESTIONS_MODULE } from './shared.prompt';

// BASE: Always included
const BASE = `<ROLE>IntelligenceAgent - READ/ANALYSIS. Non-destructive.</ROLE>
<RULE>User's language. Markdown format.</RULE>`;

// Use shared modules (renamed for backward compat in this file)
const CLARIFICATION = CLARIFICATION_MODULE;
const SUGGESTIONS = SUGGESTIONS_MODULE;

// INTENT-SPECIFIC MODULES
const MODULES: Record<string, string> = {
  read: `<STRATEGY>
1. list_email_index(mode:'unread') → fast metadata
2. Pick 3-5 relevant IDs
3. get_email_content([ids]) → load selected
4. Summarize</STRATEGY>`,

  search: `<STRATEGY>
- search_emails(query) for keywords
- semantic_search_emails for meaning
- Names = correspondents, not celebrities
- search_contacts for people</STRATEGY>`,

  calendar: `<STRATEGY>
- get_events(start, end) for schedule
- Check conflicts before suggesting</STRATEGY>`,

  greeting: `<STRATEGY>Be helpful. Ask how to assist.</STRATEGY>`,

  // Fallback for unknown intents
  unknown: `<TOOLS>list_email_index, get_email_content, list_emails, search_emails, count_emails, search_contacts, get_events, analyze_email</TOOLS>
<RULE>Ambiguous → ask_user_clarification tool</RULE>`,
};

/**
 * RLM: Get prompt based on detected intent.
 * Only loads the relevant module - saves 60-80% tokens.
 */
export function getIntelligencePrompt(intent?: TaskIntent): string {
  const module = MODULES[intent || 'unknown'] || MODULES.unknown;
  return `${BASE}\n${module}\n${CLARIFICATION}\n${SUGGESTIONS}`;
}

// Legacy export (uses full fallback)
export const INTELLIGENCE_PROMPT = `${BASE}\n${MODULES.unknown}`;
