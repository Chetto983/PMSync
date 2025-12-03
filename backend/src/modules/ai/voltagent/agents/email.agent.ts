/**
 * Email Agent for VoltAgent
 *
 * Specialized agent for email operations including folder management
 * and AI-powered email insights (summarization, sentiment, smart replies).
 * Uses centralized locale system for instructions.
 */
import { Agent, type AgentHooks } from '@voltagent/core';
import type { LanguageModel } from 'ai';
import { PrismaService } from '../../../../prisma/prisma.service';
import { EmailSendService } from '../../../email/services/email-send.service';
import { MistralService } from '../../services/mistral.service';
import { WritingStyleService } from '../services/writing-style.service';
import { getAgentTranslations, type SupportedLocale } from '../locales';
import { createEmailTools } from '../tools/email.tools';
import { createFolderTools } from '../tools/folder.tools';
import { createInsightTools } from '../tools/insights.tools';

export interface EmailAgentOptions {
  model: LanguageModel;
  prisma: PrismaService;
  emailSendService: EmailSendService | null;
  mistral?: MistralService | null;
  writingStyle?: WritingStyleService | null;
  locale: SupportedLocale;
  tenantId: string;
  userId?: string;
  hooks?: AgentHooks;
}

/**
 * Creates an Email Agent with all email, folder, and insight tools.
 */
export function createEmailAgent(options: EmailAgentOptions): Agent {
  const { model, prisma, emailSendService, mistral, writingStyle, locale, tenantId, userId, hooks } = options;
  const t = getAgentTranslations(locale);

  // Combine email tools, folder tools, and insight tools
  const emailTools = createEmailTools(prisma, emailSendService, locale, tenantId);
  const folderTools = createFolderTools(prisma, locale, tenantId);

  // Only add insight tools if mistral service is available
  const insightTools = mistral
    ? createInsightTools({
        prisma,
        mistral,
        writingStyle: writingStyle ?? undefined,
        locale,
        tenantId,
        userId,
      })
    : [];

  return new Agent({
    name: 'EmailAgent',
    purpose:
      'Handle email operations including sending, searching, organizing, summarizing, analyzing sentiment, and generating smart replies',
    model,
    instructions: t.email.instructions,
    tools: [...emailTools, ...folderTools, ...insightTools],
    hooks,
    maxSteps: 5,
  });
}
