import { Injectable, Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmbeddingsService } from '../../ai/services/embeddings.service';
import { MistralEmbeddingService } from '../../ai/services/mistral-embedding.service';
import { HybridSearchService } from '../services/hybrid-search.service';

/**
 * PII resolve function type -- provided by AiChatService closure.
 */
type PiiResolveFn = (
  payload: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/**
 * RagToolsService -- 2 RAG tools for the AI chat pipeline.
 *
 * Tools: semantic_search, save_memory
 *
 * semantic_search: Generates an embedding for the query and performs
 * vector similarity search across emails, contacts, and calendar data.
 *
 * save_memory: Stores a memory note with vector embedding for later retrieval.
 *
 * Phase 25: Tools & RAG
 */
@Injectable()
export class RagToolsService {
  private readonly logger = new Logger(RagToolsService.name);

  constructor(
    private readonly embeddingsService: EmbeddingsService,
    private readonly mistralEmbeddingService: MistralEmbeddingService,
    private readonly prisma: PrismaService,
    private readonly hybridSearchService: HybridSearchService,
  ) {}

  /**
   * Returns all RAG tools with PII resolution via closure.
   */
  getTools(
    tenantId: string,
    userId: string,
    _conversationId: string,
    piiResolve: PiiResolveFn,
  ) {
    return {
      semantic_search: this.buildSemanticSearch(tenantId, piiResolve),
      save_memory: this.buildSaveMemory(tenantId, userId, piiResolve),
    };
  }

  private buildSemanticSearch(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Search across emails, contacts, and calendar events using semantic and keyword matching. ' +
        'Finds relevant content by meaning, not just exact text matches. ' +
        'Example: semantic_search({ query: "project deadline discussion with marketing team", sources: ["emails", "contacts"] })',
      inputSchema: z.object({
        query: z
          .string()
          .describe('Natural language search query'),
        sources: z
          .array(z.enum(['emails', 'contacts', 'calendar']))
          .optional()
          .describe(
            'Sources to search. Omit to search all.',
          ),
        limit: z
          .number()
          .min(1)
          .max(20)
          .optional()
          .describe('Maximum results (default 10)'),
      }),
      execute: async (args) => {
        const resolved = (await piiResolve(
          args as unknown as Record<string, unknown>,
        )) as typeof args;

        const results = await this.hybridSearchService.search(
          tenantId,
          resolved.query,
          resolved.sources ?? ['emails', 'contacts', 'calendar'],
          resolved.limit ?? 10,
        );

        return { results, count: results.length };
      },
    });
  }

  private buildSaveMemory(tenantId: string, userId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Save a memory note that the AI can recall later. ' +
        'Use this to remember user preferences, important facts, or decisions. ' +
        'Example: save_memory({ content: "User prefers emails in Italian", category: "preference" })',
      inputSchema: z.object({
        content: z
          .string()
          .describe('The information to remember'),
        category: z
          .string()
          .optional()
          .describe(
            'Category for organizing memories (e.g., "preference", "fact", "decision")',
          ),
        tags: z
          .string()
          .optional()
          .describe('Comma-separated tags for filtering'),
      }),
      execute: async (args) => {
        const resolved = (await piiResolve(
          args as unknown as Record<string, unknown>,
        )) as typeof args;

        // Generate embedding for the memory content -- routes through MistralEmbeddingService for cost protection
        const vector = await this.mistralEmbeddingService.generateEmbedding(
          resolved.content,
          undefined,
          { tenantId },
        );

        // Save memory to AIMemory table
        const memory = await this.prisma.aIMemory.create({
          data: {
            tenantId,
            userId,
            content: resolved.content,
            category: resolved.category,
            tags: resolved.tags,
            memoryType: 'FACT',
            confidence: 1.0,
            source: 'chat',
          },
        });

        // Save the embedding vector for later semantic search
        await this.embeddingsService.saveEmbedding({
          tenantId,
          embedding: vector,
          model: 'mistral-embed',
          documentName: `memory:${memory.id}`,
          metadata: {
            memoryId: memory.id,
            category: resolved.category,
            type: 'ai_memory',
          },
        });

        return {
          id: memory.id,
          content: resolved.content,
          category: resolved.category ?? null,
          savedAt: memory.createdAt,
        };
      },
    });
  }

}
