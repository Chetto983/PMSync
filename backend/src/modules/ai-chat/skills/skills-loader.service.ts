/**
 * SkillsLoaderService -- Contextual skill injection based on intent.
 *
 * Skills are markdown knowledge docs that teach the LLM HOW and WHEN to use
 * tools for specific workflows. Selected per-request based on intent
 * classification from IntentRouterService, injected into system prompt.
 *
 * Content is inline (not file-based) because tsc doesn't copy .md to dist/.
 * The .md files in this directory are canonical docs — keep in sync.
 *
 * Design: 1-2 skills per intent (~400-600 tokens added).
 * Phase SKILLS: Nanobot-inspired progressive context loading.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { PrimaryIntent } from '../../ai/nlp/intent-taxonomy';
import { SKILL_CONTENT } from './skill-content';

/**
 * Maps each intent to the skill keys that should be injected.
 *
 * Rules:
 * - Max 2 skills per intent (keeps token cost low)
 * - Conversational intents (greeting, farewell, thanks, help) get no skills
 * - Unknown gets all skills for maximum coverage
 */
const INTENT_SKILL_MAP: Partial<Record<PrimaryIntent, string[]>> = {
  // Email intents → email-workflows skill
  email_search: ['email-workflows'],
  email_compose: ['email-workflows'],
  email_reply: ['email-workflows'],
  email_forward: ['email-workflows'],
  email_read: ['email-workflows'],
  email_summarize: ['email-workflows', 'code-assistant'],
  email_delete: ['email-workflows'],
  email_archive: ['email-workflows'],
  email_move: ['email-workflows'],

  // Organization intents → triage skill
  email_label: ['triage-organization'],
  email_triage: ['triage-organization', 'follow-up-management'],

  // Follow-up intents
  follow_up_manage: ['follow-up-management'],

  // Status/briefing → triage (has briefing section) + follow-ups
  status_check: ['triage-organization', 'follow-up-management'],

  // Data analysis → code assistant skill
  data_analysis: ['code-assistant'],

  // Unknown → all skills for best coverage
  unknown: ['email-workflows', 'triage-organization', 'follow-up-management'],
};

@Injectable()
export class SkillsLoaderService {
  private readonly logger = new Logger(SkillsLoaderService.name);

  constructor() {
    const loaded = Object.keys(SKILL_CONTENT);
    this.logger.log(`Skills available: ${loaded.length} (${loaded.join(', ')})`);
  }

  /**
   * Get relevant skills for a classified intent.
   *
   * @returns Formatted skill block to append to system prompt, or empty string.
   */
  getSkillsForIntent(intent: PrimaryIntent): string {
    const skillNames = INTENT_SKILL_MAP[intent];
    if (!skillNames || skillNames.length === 0) return '';

    const blocks: string[] = [];
    for (const name of skillNames) {
      const content = SKILL_CONTENT[name];
      if (content) {
        blocks.push(content);
      }
    }

    if (blocks.length === 0) return '';

    return (
      '\n\n## Active Skills (contextual knowledge for this request)\n\n' +
      blocks.join('\n\n---\n\n')
    );
  }

  /** Get all available skill names (for debugging/metrics). */
  getLoadedSkills(): string[] {
    return Object.keys(SKILL_CONTENT);
  }
}
