/**
 * General Agent for VoltAgent
 *
 * Handles general questions and conversation.
 * Uses centralized locale system for instructions.
 */
import { Agent, type AgentHooks, type Memory } from '@voltagent/core';
import type { LanguageModel } from 'ai';
import { getAgentTranslations, type SupportedLocale } from '../locales';

export interface GeneralAgentOptions {
  model: LanguageModel;
  locale: SupportedLocale;
  hooks?: AgentHooks;
  /** VoltAgent memory for conversation persistence */
  memory?: Memory;
}

/**
 * Creates a General Agent for handling general questions.
 */
export function createGeneralAgent(options: GeneralAgentOptions): Agent {
  const { model, locale, hooks, memory } = options;
  // Always use English prompts - locale only affects response language
  const t = getAgentTranslations('en');
  const localeInstruction = locale !== 'en' ? `\n\nIMPORTANT: Respond in ${locale === 'it' ? 'Italian' : locale}.` : '';

  return new Agent({
    name: 'GeneralAgent',
    purpose: 'Handle general questions, greetings, small talk, and non-specialized conversation ONLY when no other agent applies. Fallback agent.',
    model,
    instructions: t.general.instructions + localeInstruction,
    tools: [],
    hooks,
    memory,
    maxSteps: 3,
  });
}
