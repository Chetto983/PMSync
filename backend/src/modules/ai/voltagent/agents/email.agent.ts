/**
 * Email Agent for VoltAgent
 *
 * Specialized agent for email operations including folder management.
 * Uses centralized locale system for instructions.
 */
import { Agent, type AgentHooks } from '@voltagent/core';
import type { LanguageModel } from 'ai';
import { PrismaService } from '../../../../prisma/prisma.service';
import { EmailSendService } from '../../../email/services/email-send.service';
import { getAgentTranslations, type SupportedLocale } from '../locales';
import { createEmailTools } from '../tools/email.tools';
import { createFolderTools } from '../tools/folder.tools';

export interface EmailAgentOptions {
  model: LanguageModel;
  prisma: PrismaService;
  emailSendService: EmailSendService | null;
  locale: SupportedLocale;
  tenantId: string;
  hooks?: AgentHooks;
}

/**
 * Creates an Email Agent with all email and folder tools.
 */
export function createEmailAgent(options: EmailAgentOptions): Agent {
  const { model, prisma, emailSendService, locale, tenantId, hooks } = options;
  const t = getAgentTranslations(locale);

  // Combine email tools and folder tools
  const emailTools = createEmailTools(prisma, emailSendService, locale, tenantId);
  const folderTools = createFolderTools(prisma, locale, tenantId);

  return new Agent({
    name: 'EmailAgent',
    purpose: 'Handle email operations including sending, searching, organizing emails, and managing folders',
    model,
    instructions: t.email.instructions,
    tools: [...emailTools, ...folderTools],
    hooks,
    maxSteps: 5,
  });
}
