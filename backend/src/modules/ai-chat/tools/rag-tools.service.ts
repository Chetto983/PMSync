import { Injectable, Logger } from '@nestjs/common';
import { tool } from 'ai';
import { embed } from 'ai';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmbeddingsService } from '../../ai/services/embeddings.service';
import { MistralProviderService } from '../../mistral/mistral-provider.service';

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
    private readonly mistralProvider: MistralProviderService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Returns all RAG tools with PII resolution via closure.
   */
  getTools(
    tenantId: string,
    _conversationId: string,
    piiResolve: PiiResolveFn,
  ) {
    return {
      semantic_search: this.buildSemanticSearch(tenantId, piiResolve),
      save_memory: this.buildSaveMemory(tenantId, piiResolve),
    };
  }

  private buildSemanticSearch(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Search across emails, contacts, and calendar using semantic/meaning-based search. ' +
        'Better than keyword search for finding related content. ' +
        'Example: semantic_search({ query: "project deadline discussion with marketing team", sources: ["emails", "contacts"] })',
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            'Natural language search query describing what you are looking for',
          ),
        sources: z
          .array(z.enum(['emails', 'contacts', 'calendar']))
          .optional()
          .describe(
            'Filter by source type. Omit to search all sources.',
          ),
        limit: z
          .number()
          .optional()
          .describe('Max results to return (default 10, max 30)'),
      }),
      execute: async (args) => {
        const resolved = (await piiResolve(
          args as unknown as Record<string, unknown>,
        )) as typeof args;
        const limit = Math.min(resolved.limit ?? 10, 30);

        // Generate embedding for the query
        const embeddingModel = this.mistralProvider.getEmbeddingModel();
        const { embedding } = await embed({
          model: embeddingModel,
          value: resolved.query,
        });

        // Vector similarity search
        const rawResults = await this.embeddingsService.findSimilarContent(
          tenantId,
          embedding,
          limit,
          { maxDistance: 0.5 },
        );

        // Map to structured results with source enrichment
        const results = await this.enrichResults(
          tenantId,
          rawResults,
          resolved.sources,
        );

        return { results, count: results.length };
      },
    });
  }

  private buildSaveMemory(tenantId: string, piiResolve: PiiResolveFn) {
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

        // Generate embedding for the memory content
        const embeddingModel = this.mistralProvider.getEmbeddingModel();
        const { embedding: vector } = await embed({
          model: embeddingModel,
          value: resolved.content,
        });

        // Save memory to AIMemory table
        const memory = await this.prisma.aIMemory.create({
          data: {
            tenantId,
            userId: tenantId, // Will be replaced with actual userId in Phase 26
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

  /**
   * Enrich raw embedding results with source-specific metadata.
   * Filters by requested sources (emails, contacts, calendar).
   */
  private async enrichResults(
    tenantId: string,
    rawResults: Array<{
      id: string;
      documentName: string | null;
      metadata: any;
      distance?: number;
      emailId?: string | null;
      contactId?: string | null;
    }>,
    sources?: string[],
  ) {
    const enriched: Array<{
      source: string;
      id: string;
      title: string;
      snippet: string;
      relevanceScore: number;
    }> = [];

    for (const result of rawResults) {
      const distance = result.distance ?? 1;
      const relevanceScore = Math.round((1 - distance) * 100) / 100;

      // Determine source type
      let source = 'unknown';
      if (result.emailId) source = 'emails';
      else if (result.contactId) source = 'contacts';
      else if (result.documentName?.startsWith('memory:')) source = 'memory';
      else if (result.metadata?.type === 'calendar') source = 'calendar';

      // Filter by requested sources
      if (sources && sources.length > 0 && !sources.includes(source)) {
        continue;
      }

      // Enrich based on source type
      if (source === 'emails' && result.emailId) {
        const email = await this.prisma.email.findFirst({
          where: { id: result.emailId, tenantId },
          select: { subject: true, from: true, snippet: true },
        });
        if (email) {
          enriched.push({
            source,
            id: result.emailId,
            title: email.subject ?? 'No subject',
            snippet: `From: ${email.from} - ${email.snippet?.slice(0, 150) ?? ''}`,
            relevanceScore,
          });
        }
      } else if (source === 'contacts' && result.contactId) {
        const contact = await this.prisma.contact.findFirst({
          where: { id: result.contactId, tenantId },
          select: { displayName: true, company: true, jobTitle: true },
        });
        if (contact) {
          enriched.push({
            source,
            id: result.contactId,
            title: contact.displayName ?? 'Unknown',
            snippet: [contact.jobTitle, contact.company]
              .filter(Boolean)
              .join(' at '),
            relevanceScore,
          });
        }
      } else {
        // Generic result (memory, calendar, or unknown)
        enriched.push({
          source,
          id: result.id,
          title: result.documentName ?? 'Untitled',
          snippet:
            typeof result.metadata?.content === 'string'
              ? (result.metadata.content as string).slice(0, 150)
              : '',
          relevanceScore,
        });
      }
    }

    return enriched;
  }
}
