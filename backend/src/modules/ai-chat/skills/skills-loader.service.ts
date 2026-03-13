/**
 * SkillsLoaderService -- Loads contextual skill documents based on intent.
 *
 * Skills are markdown knowledge docs that teach the LLM HOW and WHEN to use
 * tools for specific workflows. Loaded once at startup, selected per-request
 * based on intent classification from IntentRouterService.
 *
 * Design: 1-2 skills per intent (~400-600 tokens added), cached in memory.
 * Phase SKILLS: Nanobot-inspired progressive context loading.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { PrimaryIntent } from '../../ai/nlp/intent-taxonomy';

/** Loaded skill with metadata */
interface Skill {
  name: string;
  content: string;
}

/**
 * Maps each intent to the skill files that should be injected.
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
  email_summarize: ['email-workflows'],
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

  // Data analysis → no specific skill yet
  // Calendar/contact intents → no specific skill yet (system prompt covers them)

  // Unknown → all skills for best coverage
  unknown: ['email-workflows', 'triage-organization', 'follow-up-management'],
};

@Injectable()
export class SkillsLoaderService implements OnModuleInit {
  private readonly logger = new Logger(SkillsLoaderService.name);
  private readonly skillCache = new Map<string, Skill>();
  private readonly skillsDir = join(__dirname, '.');

  onModuleInit() {
    this.loadAllSkills();
  }

  /**
   * Load all skill markdown files into memory cache.
   * Called once at startup. Skills are static — no runtime reloading needed.
   */
  private loadAllSkills(): void {
    const skillFiles = [
      'email-workflows',
      'triage-organization',
      'follow-up-management',
    ];

    for (const name of skillFiles) {
      try {
        const filePath = join(this.skillsDir, `${name}.md`);
        const content = readFileSync(filePath, 'utf-8');
        this.skillCache.set(name, { name, content });
        this.logger.log(`Skill loaded: ${name} (${content.length} chars)`);
      } catch (err) {
        this.logger.warn(
          `Failed to load skill "${name}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(`Skills loaded: ${this.skillCache.size}/${skillFiles.length}`);
  }

  /**
   * Get relevant skills for a classified intent.
   *
   * @returns Formatted skill block to append to system prompt, or empty string if no skills.
   */
  getSkillsForIntent(intent: PrimaryIntent): string {
    const skillNames = INTENT_SKILL_MAP[intent];
    if (!skillNames || skillNames.length === 0) return '';

    const blocks: string[] = [];
    for (const name of skillNames) {
      const skill = this.skillCache.get(name);
      if (skill) {
        blocks.push(skill.content);
      }
    }

    if (blocks.length === 0) return '';

    return (
      '\n\n## Active Skills (contextual knowledge for this request)\n\n' +
      blocks.join('\n\n---\n\n')
    );
  }

  /** Get all loaded skill names (for debugging/metrics). */
  getLoadedSkills(): string[] {
    return Array.from(this.skillCache.keys());
  }
}
