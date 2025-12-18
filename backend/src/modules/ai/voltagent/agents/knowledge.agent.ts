/**
 * Knowledge Agent for VoltAgent
 *
 * Specialized agent for searching the knowledge base.
 * Uses HybridRetriever for advanced RAG when available, falls back to basic search.
 * Uses centralized locale system for instructions.
 */
import { Agent, createTool, type AgentHooks, type BaseRetriever } from '@voltagent/core';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { PrismaService } from '../../../../prisma/prisma.service';
import { getAgentTranslations, getToolTranslations, type SupportedLocale } from '../locales';
import { MistralService } from '../../services/mistral.service';
import { EmbeddingsService } from '../../services/embeddings.service';
import { HybridRetriever } from '../rag';
import { EXCLUDE_JUNK_FOLDERS } from '../../../email/email.helpers';

export interface KnowledgeAgentOptions {
  model: LanguageModel;
  prisma: PrismaService;
  locale: SupportedLocale;
  tenantId: string;
  hooks?: AgentHooks;
  /** Optional: MistralService for RAG embeddings */
  mistralService?: MistralService;
  /** Optional: EmbeddingsService for RAG vector search */
  embeddingsService?: EmbeddingsService;
}

/**
 * Creates knowledge tools for searching saved documents and notes.
 */
function createKnowledgeTools(prisma: PrismaService, locale: SupportedLocale, tenantId: string) {
  const t = getToolTranslations(locale);

  return [
    createTool({
      name: 'search_knowledge',
      description: 'Search the knowledge base for relevant documents, notes, and saved information.',
      parameters: z.object({
        query: z.string().describe('Search query'),
        limit: z.number().optional().describe('Maximum results (default 10)'),
      }),
      execute: async ({ query, limit }) => {
        // Search in emails (exclude SPAM/TRASH - they're junk)
        const results = await prisma.email.findMany({
          where: {
            tenantId,
            folder: EXCLUDE_JUNK_FOLDERS,
            OR: [
              { subject: { contains: query, mode: 'insensitive' as const } },
              { snippet: { contains: query, mode: 'insensitive' as const } },
            ],
          },
          take: limit ?? 10,
          orderBy: { receivedAt: 'desc' },
          select: {
            id: true,
            subject: true,
            snippet: true,
            from: true,
            receivedAt: true,
          },
        });

        return {
          success: true,
          data: results.map((r) => ({
            type: 'email',
            id: r.id,
            title: r.subject,
            snippet: r.snippet,
            source: r.from,
            date: r.receivedAt,
          })),
          summary: results.length > 0 ? t.knowledge.found(results.length) : t.knowledge.noResults,
        };
      },
    }),
  ];
}

/**
 * Creates a HybridRetriever for advanced RAG if services are available.
 */
function createRetriever(options: KnowledgeAgentOptions): BaseRetriever | undefined {
  const { mistralService, embeddingsService, prisma, locale, tenantId } = options;

  // Only create HybridRetriever if both services are available
  if (!mistralService || !embeddingsService) {
    return undefined;
  }

  return new HybridRetriever({
    tenantId,
    locale,
    mistralService,
    embeddingsService,
    prisma,
    vectorLimit: 10,
    keywordLimit: 10,
    finalLimit: 5,
    vectorWeight: 0.7,
    enableQueryExpansion: true,
    enableReranking: true,
  });
}

/**
 * Creates a Knowledge Agent for searching the knowledge base.
 * Uses HybridRetriever for RAG when MistralService and EmbeddingsService are available.
 */
export function createKnowledgeAgent(options: KnowledgeAgentOptions): Agent {
  const { model, prisma, locale, tenantId, hooks } = options;
  const t = getAgentTranslations(locale);

  // Create retriever for RAG (optional - falls back to tool-based search)
  const retriever = createRetriever(options);

  return new Agent({
    name: 'KnowledgeAgent',
    purpose: 'Search saved emails and documents in knowledge base. Use for: finding past emails, searching archived content.',
    model,
    instructions: t.knowledge.instructions,
    tools: createKnowledgeTools(prisma, locale, tenantId),
    hooks,
    maxSteps: 3,
    // Use HybridRetriever for automatic RAG context injection
    retriever,
  });
}
