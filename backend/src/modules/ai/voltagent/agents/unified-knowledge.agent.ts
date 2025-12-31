/**
 * Unified Knowledge Agent for VoltAgent
 *
 * Memory-first RAG agent that searches across all knowledge sources:
 * - User memories and preferences
 * - Emails (via HybridRetriever)
 * - Deadlines
 * - Follow-ups
 * - Action items
 *
 * Uses 2025 best practices:
 * - Memory-First: Personal context before data search
 * - Self-Reflection: Determines which sources to query
 * - Multi-Source: Parallel retrieval
 * - Fusion & Re-ranking: Memory-boosted scoring
 *
 * @see docs/AI_SECRETARY_IMPLEMENTATION_PLAN.md P1.6
 */
import { Agent, createTool, type AgentHooks } from '@voltagent/core';
import { MemoryCategory } from '../memory';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { LongTermMemoryService } from '../memory/long-term-memory.service';
import type { PgVectorMemoryService } from '../memory/pgvector-memory.service';
import type { MistralService } from '../../services/mistral.service';
import type { EmbeddingsService } from '../../services/embeddings.service';
import type { DeadlineExtractorService } from '../services/deadline-extractor.service';
import type { FollowUpService } from '../services/follow-up.service';
import type { ActionItemService } from '../services/action-item.service';
import { getAgentTranslations, getToolTranslations, type SupportedLocale } from '../locales';
import { UnifiedRetriever } from '../rag/unified-retriever';

export interface UnifiedKnowledgeAgentOptions {
  model: LanguageModel;
  prisma: PrismaService;
  locale: SupportedLocale;
  tenantId: string;
  userId: string;
  hooks?: AgentHooks;
  // Memory services
  longTermMemory: LongTermMemoryService;
  pgVectorMemory?: PgVectorMemoryService;
  // Data services
  deadlineService: DeadlineExtractorService;
  followUpService: FollowUpService;
  actionItemService: ActionItemService;
  // RAG services (optional - agent works with basic tools without them)
  mistralService?: MistralService;
  embeddingsService?: EmbeddingsService;
}

/**
 * Creates tools for unified knowledge search
 */
function createUnifiedKnowledgeTools(options: UnifiedKnowledgeAgentOptions) {
  const {
    prisma,
    tenantId,
    userId,
    locale,
    longTermMemory,
    deadlineService,
    followUpService,
    actionItemService,
    embeddingsService,
  } = options;
  const t = getToolTranslations(locale);

  return [
    // Unified search across all sources
    createTool({
      name: 'unified_search',
      description:
        'Search across all knowledge sources: emails, memories, deadlines, follow-ups, action items. Use this for comprehensive searches.',
      parameters: z.object({
        query: z.string().describe('Search query'),
        sources: z
          .array(z.enum(['emails', 'memories', 'deadlines', 'followups', 'actions']))
          .optional()
          .describe('Sources to search (default: all relevant based on query)'),
        limit: z.number().optional().describe('Maximum results per source (default: 5)'),
      }),
      execute: async ({ query, limit }) => {
        const retriever = new UnifiedRetriever({
          tenantId,
          userId,
          locale,
          prisma,
          longTermMemory,
          pgVectorMemory: options.pgVectorMemory,
          mistralService: options.mistralService,
          embeddingsService,
          emailLimit: limit ?? 5,
          deadlineLimit: limit ?? 5,
          followupLimit: limit ?? 5,
          actionLimit: limit ?? 5,
        });

        const context = await retriever.retrieve(query);

        return {
          success: true,
          context,
          summary: context ? t.knowledge.found(context.split('\n').filter((l) => l.trim()).length) : t.knowledge.noResults,
        };
      },
    }),

    // Get upcoming deadlines
    createTool({
      name: 'get_deadlines',
      description: 'Get upcoming deadlines for the user',
      parameters: z.object({
        days: z.number().optional().describe('Days ahead to look (default: 7)'),
      }),
      execute: async ({ days }) => {
        const deadlines = await deadlineService.getUpcomingDeadlines(tenantId, userId, days ?? 7);
        return {
          success: true,
          data: deadlines,
          summary: t.knowledge.found(deadlines.length),
        };
      },
    }),

    // Get pending follow-ups
    createTool({
      name: 'get_followups',
      description: 'Get pending follow-ups that need attention',
      parameters: z.object({
        status: z.enum(['pending', 'overdue', 'all']).optional().describe('Filter by status'),
      }),
      execute: async ({ status }) => {
        let followups;
        if (status === 'overdue') {
          followups = await followUpService.getOverdueFollowUps(tenantId, userId);
        } else {
          followups = await followUpService.getPendingFollowUps(tenantId, userId);
        }
        return {
          success: true,
          data: followups,
          summary: t.knowledge.found(followups.length),
        };
      },
    }),

    // Get action items
    createTool({
      name: 'get_action_items',
      description: 'Get action items and tasks',
      parameters: z.object({
        status: z.enum(['todo', 'in_progress', 'done', 'all']).optional(),
        priority: z.enum(['high', 'medium', 'low']).optional(),
      }),
      execute: async ({ status, priority }) => {
        let items = await actionItemService.getPending(tenantId, userId);

        // Filter by priority if specified
        if (priority && items) {
          const priorityMap = { high: 3, medium: 6, low: 10 };
          items = items.filter((i: any) => i.priority <= priorityMap[priority]);
        }

        // Filter by status if specified (other than pending)
        if (status && status !== 'todo') {
          const statusMap: Record<string, string> = {
            in_progress: 'IN_PROGRESS',
            done: 'DONE',
            all: 'all',
          };
          if (statusMap[status] !== 'all') {
            items = items.filter((i: any) => i.status === statusMap[status]);
          }
        }

        return {
          success: true,
          data: items,
          summary: t.knowledge.found(items?.length ?? 0),
        };
      },
    }),

    // Remember something (store in memory)
    createTool({
      name: 'remember',
      description:
        'Store information in long-term memory for future reference. Use this when the user shares preferences, facts, or important information.',
      parameters: z.object({
        content: z.string().describe('What to remember'),
        category: z
          .enum(['preference', 'fact', 'contact', 'project', 'general'])
          .optional()
          .describe('Category of memory'),
      }),
      execute: async ({ content, category }) => {
        const categoryMap: Record<string, string> = {
          preference: 'PREFERENCE',
          fact: 'FACT',
          contact: 'CONTACT',
          project: 'PROJECT',
          general: 'GENERAL',
        };

        await longTermMemory.addFact(tenantId, userId, content, {
          category: (categoryMap[category ?? 'general'] ?? 'GENERAL') as MemoryCategory,
        });

        return {
          success: true,
          message: t.knowledge.remembered,
        };
      },
    }),
  ];
}

/**
 * Creates a Unified Knowledge Agent with memory-first RAG
 *
 * @param options - Agent configuration options
 * @returns Configured VoltAgent Agent instance
 */
export function createUnifiedKnowledgeAgent(options: UnifiedKnowledgeAgentOptions): Agent {
  const { model, prisma, locale, tenantId, userId, hooks } = options;
  const t = getAgentTranslations(locale);

  // Create unified retriever for automatic RAG context injection
  const retriever = new UnifiedRetriever({
    tenantId,
    userId,
    locale,
    prisma,
    longTermMemory: options.longTermMemory,
    pgVectorMemory: options.pgVectorMemory,
    mistralService: options.mistralService,
    embeddingsService: options.embeddingsService,
  });

  return new Agent({
    name: 'UnifiedKnowledgeAgent',
    purpose: 'Memory-first comprehensive search: emails, memories, deadlines, follow-ups, action items. Use for: complex queries needing multiple sources.',
    model,
    instructions: t.knowledge.instructions,
    tools: createUnifiedKnowledgeTools(options),
    hooks,
    maxSteps: 5, // Allow multi-hop queries
    retriever, // Automatic RAG context injection
  });
}
