/**
 * Email Agent for VoltAgent
 *
 * Specialized agent for email operations including folder management
 * and AI-powered email insights (summarization, sentiment, smart replies).
 * Uses centralized locale system for instructions.
 */
import { Agent, type AgentHooks, type Memory } from '@voltagent/core';
import type { LanguageModel } from 'ai';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService } from '../../../../common/services/cache.service';
import { EmailSendService } from '../../../email/services/email-send.service';
import { MistralService } from '../../services/mistral.service';
import { EmbeddingsService } from '../../services/embeddings.service';
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
  /** EmbeddingsService for semantic email search */
  embeddingsService?: EmbeddingsService | null;
  writingStyle?: WritingStyleService | null;
  cacheService?: CacheService;
  locale: SupportedLocale;
  tenantId: string;
  userId?: string;
  hooks?: AgentHooks;
  /** VoltAgent memory for conversation persistence */
  memory?: Memory;
}

/**
 * Creates an Email Agent with all email, folder, and insight tools.
 * Includes semantic email search when MistralService and EmbeddingsService are available.
 */
export function createEmailAgent(options: EmailAgentOptions): Agent {
  const { model, prisma, emailSendService, mistral, embeddingsService, writingStyle, cacheService, locale, tenantId, userId, hooks, memory } = options;
  const t = getAgentTranslations(locale);

  // Combine email tools, folder tools, and insight tools
  const emailTools = createEmailTools(prisma, emailSendService, locale, tenantId, cacheService);
  const folderTools = createFolderTools(prisma, locale, tenantId, cacheService);

  // Only add insight tools if mistral service is available
  // Now also includes semantic_search_emails when embeddingsService is available
  const insightTools = mistral
    ? createInsightTools({
        prisma,
        mistral,
        embeddingsService: embeddingsService ?? undefined,
        writingStyle: writingStyle ?? undefined,
        cacheService,
        locale,
        tenantId,
        userId,
      })
    : [];

  return new Agent({
    name: 'EmailAgent',
    purpose: 'Send, search, organize, reply, forward emails. SEARCH HERE for info about PEOPLE by name (e.g., Borello, Mario) - they are email correspondents! NOTE: For SENDING, recipient must be verified by ContactsAgent FIRST.',
    model,
    instructions: t.email.instructions,
    tools: [...emailTools, ...folderTools, ...insightTools],
    hooks,
    memory,
    maxSteps: 3, // Reduced from 5 - most email ops need 2-3 steps max
  });
}
