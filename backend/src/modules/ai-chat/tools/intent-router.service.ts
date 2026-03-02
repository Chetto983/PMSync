/**
 * IntentRouterService -- Intent-based tool routing for AI Chat.
 *
 * Classifies user intent using FastText (via IntentClassifierService)
 * with Ministral 3B LLM fallback for low-confidence results.
 * Maps each intent to 6-8 relevant tools, reducing token cost ~70%
 * by serving only relevant tools per request via AI SDK v6 prepareStep.
 *
 * Phase 25: Tools & RAG (Plan 02)
 */

import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { IntentClassifierService } from '../../ai/nlp/intent-classifier.service';
import { MistralProviderService } from '../../mistral/mistral-provider.service';
import type { PrimaryIntent } from '../../ai/nlp/intent-taxonomy';
import { PRIMARY_INTENTS } from '../../ai/nlp/intent-taxonomy';

/** Confidence threshold below which LLM fallback is triggered */
const CONFIDENCE_THRESHOLD = 0.5;

/** Classification + routing result */
export interface IntentRouteResult {
  intent: PrimaryIntent;
  confidence: number;
  activeTools: string[];
}

/**
 * Maps each PrimaryIntent to the subset of tools that should be active.
 *
 * Design: 6-8 tools per intent keeps context small for the LLM.
 * Conversational intents (greeting, farewell, thanks, help, settings_view)
 * map to empty arrays -- the LLM responds directly without tools.
 */
const INTENT_TOOL_MAP: Record<PrimaryIntent, string[]> = {
  // Email intents
  email_search: [
    'search_emails',
    'semantic_search',
    'read_email',
  ],
  email_compose: [
    'draft_email',
    'send_email',
    'search_contacts',
  ],
  email_reply: [
    'read_email',
    'reply_email',
    'search_emails',
  ],
  email_forward: [
    'read_email',
    'forward_email',
    'search_contacts',
  ],
  email_delete: [
    'search_emails',
    'read_email',
    'delete_email',
  ],
  email_archive: [
    'search_emails',
    'archive_email',
  ],
  email_move: [
    'search_emails',
    'move_email',
    'list_folders',
  ],
  email_read: [
    'read_email',
    'search_emails',
    'semantic_search',
  ],
  email_summarize: [
    'search_emails',
    'read_email',
    'semantic_search',
  ],

  // Calendar intents
  calendar_view: [
    'view_calendar',
    'search_contacts',
  ],
  calendar_create: [
    'create_event',
    'view_calendar',
    'search_contacts',
  ],
  calendar_update: [
    'update_event',
    'view_calendar',
  ],
  calendar_delete: [
    'delete_event',
    'view_calendar',
  ],

  // Contact intents
  contact_search: [
    'search_contacts',
    'semantic_search',
  ],
  contact_create: [
    'create_contact',
  ],
  contact_update: [
    'search_contacts',
    'update_contact',
  ],

  // Folder intents
  folder_list: [
    'list_folders',
  ],
  folder_create: [
    'create_folder',
    'list_folders',
  ],

  // Conversational intents -- no tools needed, LLM responds directly
  greeting: [],
  farewell: [],
  thanks: [],
  help: [],
  settings_view: [],

  // Status check -- search + calendar for overview
  status_check: [
    'search_emails',
    'view_calendar',
  ],

  // Unknown fallback -- broad set for best coverage
  unknown: [
    'search_emails',
    'semantic_search',
    'view_calendar',
  ],
};

/**
 * LLM classification prompt -- used when FastText confidence is below threshold.
 * Ministral 3B is the cheapest available model for this task.
 */
const LLM_CLASSIFY_SYSTEM_PROMPT =
  'Classify the user\'s intent into ONE of these categories: ' +
  PRIMARY_INTENTS.join(', ') +
  '. Return ONLY the category name, nothing else.';

/**
 * Tool expansion rules for follow-up steps.
 * After certain tool types are called, expand the active set
 * to include logically next actions.
 */
const EXPANSION_RULES: Record<string, string[]> = {
  // After search: allow reading, replying, forwarding
  search_emails: [
    'read_email',
    'reply_email',
    'forward_email',
    'archive_email',
    'delete_email',
    'move_email',
  ],
  semantic_search: [
    'read_email',
    'reply_email',
    'forward_email',
  ],
  // After read: allow reply, forward, archive, delete
  read_email: [
    'reply_email',
    'forward_email',
    'archive_email',
    'delete_email',
    'move_email',
  ],
  // After create: allow the corresponding view/search
  create_event: ['view_calendar'],
  create_contact: ['search_contacts'],
  create_folder: ['list_folders'],
  draft_email: ['send_email'],
  // After view: allow modification
  view_calendar: [
    'create_event',
    'update_event',
    'delete_event',
  ],
  search_contacts: [
    'create_contact',
    'update_contact',
  ],
  list_folders: [
    'create_folder',
    'move_email',
  ],
};

@Injectable()
export class IntentRouterService {
  private readonly logger = new Logger(IntentRouterService.name);

  constructor(
    private readonly intentClassifier: IntentClassifierService,
    private readonly mistralProvider: MistralProviderService,
  ) {}

  /**
   * Classify user message and return the active tools for step 0.
   *
   * 1. FastText classification (sub-ms, free)
   * 2. If confidence < 0.5: Ministral 3B LLM fallback
   * 3. Map intent to tool subset via INTENT_TOOL_MAP
   */
  async classifyAndRoute(message: string): Promise<IntentRouteResult> {
    // Step 1: FastText classification
    const classification = await this.intentClassifier.classify(message);

    if (classification.confidence >= CONFIDENCE_THRESHOLD) {
      return {
        intent: classification.intent,
        confidence: classification.confidence,
        activeTools: INTENT_TOOL_MAP[classification.intent],
      };
    }

    // Step 2: LLM fallback for low confidence
    this.logger.debug(
      `Low confidence (${classification.confidence.toFixed(2)}) for "${message.slice(0, 50)}..." -- falling back to LLM`,
    );

    try {
      const { text } = await generateText({
        model: this.mistralProvider.getChatModel('mistral-small-latest'),
        system: LLM_CLASSIFY_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: message }],
        maxOutputTokens: 30,
      });

      const llmIntent = text.trim().toLowerCase() as PrimaryIntent;

      if (PRIMARY_INTENTS.includes(llmIntent)) {
        return {
          intent: llmIntent,
          confidence: 0.7, // LLM fallback gets medium confidence
          activeTools: INTENT_TOOL_MAP[llmIntent],
        };
      }

      this.logger.warn(
        `LLM returned unrecognized intent: "${text.trim()}" -- defaulting to unknown`,
      );
    } catch (error) {
      this.logger.warn(
        `LLM fallback failed: ${error instanceof Error ? error.message : String(error)} -- using FastText result`,
      );
    }

    // Fallback: use FastText result even if low confidence, or default to unknown
    const finalIntent = classification.intent || 'unknown';
    return {
      intent: finalIntent,
      confidence: classification.confidence,
      activeTools: INTENT_TOOL_MAP[finalIntent],
    };
  }

  /**
   * Expand active tools for follow-up steps based on previous tool calls.
   *
   * After step 0 executes tools, subsequent steps need expanded toolsets.
   * E.g., after search_emails -> also enable read_email, reply_email, etc.
   *
   * @param lastToolCalls - Tool calls from the previous step
   * @param allToolNames - All available tool names (for intersection filtering)
   * @returns Expanded set of active tool names
   */
  expandForFollowUp(
    lastToolCalls: Array<{ toolName: string }>,
    allToolNames: string[],
  ): string[] {
    const expanded = new Set<string>();

    // Keep the tools that were just called (they may be needed again)
    for (const tc of lastToolCalls) {
      expanded.add(tc.toolName);
    }

    // Add expansion rules for each called tool
    for (const tc of lastToolCalls) {
      const expansions = EXPANSION_RULES[tc.toolName];
      if (expansions) {
        for (const toolName of expansions) {
          expanded.add(toolName);
        }
      }
    }

    // Also always include save_memory (user might want to save context)
    expanded.add('save_memory');

    // Filter to only tools that actually exist in the current toolset
    const allToolSet = new Set(allToolNames);
    return Array.from(expanded).filter((name) => allToolSet.has(name));
  }
}
