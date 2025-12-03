/**
 * General Agent for VoltAgent
 *
 * Handles general questions and conversation.
 * Uses centralized locale system for instructions.
 */
import { Agent, type AgentHooks } from '@voltagent/core';
import type { LanguageModel } from 'ai';
import { getAgentTranslations, type SupportedLocale } from '../locales';

export interface GeneralAgentOptions {
  model: LanguageModel;
  locale: SupportedLocale;
  hooks?: AgentHooks;
}

/**
 * Creates a General Agent for handling general questions.
 */
export function createGeneralAgent(options: GeneralAgentOptions): Agent {
  const { model, locale, hooks } = options;
  const t = getAgentTranslations(locale);

  return new Agent({
    name: 'GeneralAgent',
    purpose: 'Handle general questions and conversation',
    model,
    instructions: t.general.instructions,
    tools: [],
    hooks,
    maxSteps: 3,
  });
}
