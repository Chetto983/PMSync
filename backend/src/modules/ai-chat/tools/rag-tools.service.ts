import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { tool } from 'ai';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { MistralEmbeddingService } from '../../ai/services/mistral-embedding.service';
import { HybridSearchService } from '../services/hybrid-search.service';
import { truncateToolResult } from '../utils/tool-result-truncator';
import { validateEmbeddingVector } from '../../../common/utils/vector-validation';
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../../common/interfaces/tool-registry.interface';

/**
 * PII resolve function type -- provided by AiChatService closure.
 */
type PiiResolveFn = (
  payload: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/**
 * RagToolsService -- 4 RAG tools for the AI chat pipeline.
 *
 * Tools: semantic_search, save_memory, list_memories, delete_memory
 *
 * semantic_search: Generates an embedding for the query and performs
 * vector similarity search across emails, contacts, and calendar data.
 *
 * save_memory: Stores a memory note with vector embedding for later retrieval.
 * Deduplicates by checking semantic similarity before inserting.
 *
 * list_memories: Lists all stored memories for the current user.
 *
 * delete_memory: Deletes a specific memory by ID.
 *
 * Phase 25: Tools & RAG
 */
const schemas = {
  semantic_search: z.object({
    query: z.string().describe('Natural language search query'),
    sources: z.array(z.enum(['emails', 'contacts', 'calendar'])).optional().describe('Sources to search. Omit to search all.'),
    limit: z.number().min(1).max(20).optional().describe('Maximum results (default 10)'),
  }),
  save_memory: z.object({
    content: z.string().describe('The information to remember'),
    category: z.string().optional().describe('Category for organizing memories (e.g., "preference", "fact", "decision")'),
    tags: z.string().optional().describe('Comma-separated tags for filtering'),
  }),
  list_memories: z.object({
    category: z.string().optional().describe('Filter by category (e.g., "preference", "fact"). Omit to list all.'),
    limit: z.number().min(1).max(50).optional().describe('Maximum memories to return (default 20)'),
  }),
  delete_memory: z.object({
    memoryId: z.string().describe('The ID of the memory to delete'),
  }),
};

@Injectable()
export class RagToolsService implements OnModuleInit {
  private readonly logger = new Logger(RagToolsService.name);

  constructor(
    private readonly mistralEmbeddingService: MistralEmbeddingService,
    private readonly prisma: PrismaService,
    private readonly hybridSearchService: HybridSearchService,
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
  ) {}

  onModuleInit() {
    const noop = async () => ({});
    const tools = [
      { name: 'semantic_search', riskLevel: 'LOW' as const, requiresApproval: false, inputSchema: schemas.semantic_search },
      { name: 'save_memory', riskLevel: 'MEDIUM' as const, requiresApproval: false, inputSchema: schemas.save_memory },
      { name: 'list_memories', riskLevel: 'LOW' as const, requiresApproval: false, inputSchema: schemas.list_memories },
      { name: 'delete_memory', riskLevel: 'MEDIUM' as const, requiresApproval: true, inputSchema: schemas.delete_memory },
    ];
    for (const t of tools) {
      this.toolRegistry.registerTool({
        name: t.name, description: t.name, parameters: {}, execute: noop,
        domain: 'knowledge', riskLevel: t.riskLevel, requiresApproval: t.requiresApproval, inputSchema: t.inputSchema,
      });
    }
  }

  /**
   * Returns all RAG tools with PII resolution via closure.
   */
  getTools(
    tenantId: string,
    userId: string,
    piiResolve: PiiResolveFn,
  ) {
    return {
      semantic_search: this.buildSemanticSearch(tenantId, piiResolve),
      save_memory: this.buildSaveMemory(tenantId, userId, piiResolve),
      list_memories: this.buildListMemories(tenantId, userId),
      delete_memory: this.buildDeleteMemory(tenantId, userId),
    };
  }

  private buildSemanticSearch(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Search across emails, contacts, and calendar events by MEANING, not just keywords. ' +
        'Use when the user describes what they are looking for in natural language: ' +
        '"that conversation about the project deadline", "emails where Marco talked about budget". ' +
        'Do NOT use for specific keyword/sender lookups — use search_emails instead. ' +
        'Optionally filter by source: emails, contacts, calendar. Omit to search all. ' +
        'Returns: array of unified results ranked by semantic similarity. Max 20 results.',
      inputSchema: schemas.semantic_search,
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

        return truncateToolResult({ results, count: results.length });
      },
    });
  }

  private buildSaveMemory(tenantId: string, userId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Save a fact or preference that the AI should remember for future conversations. ' +
        'Use when the user explicitly states a preference ("I prefer emails in Italian") ' +
        'or when you learn an important fact about the user during conversation. ' +
        'Deduplicates automatically — if a very similar memory already exists, it updates instead of creating a duplicate. ' +
        'Categories: "preference" (user preferences), "fact" (important info), ' +
        '"contact_note" (notes about specific contacts), "workflow" (user workflows). ' +
        'Returns: { id, content, category, savedAt, deduplicated }.',
      inputSchema: schemas.save_memory,
      execute: async (args) => {
        const resolved = (await piiResolve(
          args as unknown as Record<string, unknown>,
        )) as typeof args;

        // Generate embedding for the memory content
        const vector = await this.mistralEmbeddingService.generateEmbedding(
          resolved.content,
          undefined,
          { tenantId },
        );
        const validatedVector = validateEmbeddingVector(vector);
        const vectorLiteral = Prisma.raw(
          `'[${validatedVector.join(',')}]'::vector`,
        );

        // Dedup: check if a very similar memory already exists (distance < 0.15)
        const vectorStr = `[${validatedVector.join(',')}]`;
        const dupVectorParam = Prisma.raw(`'${vectorStr}'::vector`);
        const duplicates = await this.prisma.$queryRaw<
          Array<{ id: string; content: string }>
        >(
          Prisma.sql`SELECT id, content FROM ai_memories
           WHERE "tenantId" = ${tenantId} AND "userId" = ${userId}
             AND vector IS NOT NULL
             AND (vector <-> ${dupVectorParam}) < 0.15
           ORDER BY (vector <-> ${dupVectorParam}) ASC
           LIMIT 1`,
        );

        if (duplicates.length > 0) {
          // Update existing memory instead of creating duplicate
          const existing = duplicates[0];
          await this.prisma.aIMemory.update({
            where: { id: existing.id },
            data: {
              content: resolved.content,
              category: resolved.category ?? undefined,
              tags: resolved.tags ?? undefined,
              updatedAt: new Date(),
            },
          });
          await this.prisma.$executeRaw(
            Prisma.sql`UPDATE "ai_memories" SET "vector" = ${dupVectorParam} WHERE "id" = ${existing.id}`,
          );

          return truncateToolResult({
            id: existing.id,
            content: resolved.content,
            category: resolved.category ?? null,
            savedAt: new Date(),
            deduplicated: true,
            previousContent: existing.content,
          });
        }

        // Save new memory
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

        await this.prisma.$executeRaw(
          Prisma.sql`UPDATE "ai_memories" SET "vector" = ${vectorLiteral} WHERE "id" = ${memory.id}`,
        );

        return truncateToolResult({
          id: memory.id,
          content: resolved.content,
          category: resolved.category ?? null,
          savedAt: memory.createdAt,
          deduplicated: false,
        });
      },
    });
  }

  private buildListMemories(tenantId: string, userId: string) {
    return tool({
      description:
        'List all memories stored for the current user. ' +
        'Use when the user asks "what do you remember about me?", "show my memories", ' +
        'or similar requests. Optionally filter by category. ' +
        'Returns: array of { id, content, category, tags, savedAt }.',
      inputSchema: schemas.list_memories,
      execute: async (args) => {
        const where: Prisma.AIMemoryWhereInput = {
          tenantId,
          userId,
          ...(args.category ? { category: args.category } : {}),
        };

        const memories = await this.prisma.aIMemory.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: args.limit ?? 20,
          select: {
            id: true,
            content: true,
            category: true,
            tags: true,
            createdAt: true,
            usageCount: true,
          },
        });

        return truncateToolResult({
          memories: memories.map((m) => ({
            id: m.id,
            content: m.content,
            category: m.category,
            tags: m.tags,
            savedAt: m.createdAt,
            timesUsed: m.usageCount,
          })),
          total: memories.length,
        });
      },
    });
  }

  private buildDeleteMemory(tenantId: string, userId: string) {
    return tool({
      description:
        'Delete a specific memory by its ID. ' +
        'Use when the user asks to "forget" something or wants to remove a stored memory. ' +
        'Use list_memories first to find the memory ID. ' +
        'Requires user approval before executing.',
      inputSchema: schemas.delete_memory,
      execute: async (args) => {
        const result = await this.prisma.aIMemory.deleteMany({
          where: {
            id: args.memoryId,
            tenantId,
            userId,
          },
        });

        if (result.count === 0) {
          return { success: false, error: 'Memory not found or already deleted' };
        }

        return { success: true, deletedId: args.memoryId };
      },
    });
  }
}
