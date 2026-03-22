/**
 * MemoryService -- Auto-inject relevant memories into AI chat system prompt.
 *
 * Searches AIMemory table by vector similarity (pgvector cosine distance)
 * to find top-N facts about the user. These are prepended to the system
 * prompt so the LLM has context about user preferences and past interactions.
 *
 * ChatGPT-style memory: transparent, automatic, non-blocking.
 * If vector search fails (no embeddings, pgvector unavailable), returns
 * empty array -- never blocks chat.
 *
 * Phase 25: Tools & RAG (Plan 02)
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { validateEmbeddingVector } from '../../../common/utils/vector-validation';
import { MistralEmbeddingService } from '../../ai/services/mistral-embedding.service';

/** Memory result from vector search */
export interface MemoryResult {
  content: string;
  category: string | null;
  createdAt: Date;
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistralEmbeddingService: MistralEmbeddingService,
  ) {}

  /**
   * Retrieve the top-N most relevant memories for a user, given a query.
   *
   * Uses pgvector cosine distance (<->) on AIMemory.vector column.
   * Only returns memories with distance < 0.5 (reasonably similar).
   *
   * @param tenantId - Tenant scope
   * @param userId - User scope
   * @param query - Current user message (used to generate query embedding)
   * @param limit - Max number of memories to return (default 3)
   * @returns Relevant memories sorted by similarity, or empty on error
   */
  async getRelevantMemories(
    tenantId: string,
    userId: string,
    query: string,
    limit: number = 3,
  ): Promise<MemoryResult[]> {
    try {
      // Generate embedding for the query -- routes through MistralEmbeddingService for cost protection
      const queryVector = await this.mistralEmbeddingService.generateEmbedding(
        query,
        undefined,
        { tenantId },
      );

      // SECURITY: Validate embedding vector before using in raw SQL
      const validatedVector = validateEmbeddingVector(queryVector);

      // Convert to pgvector format: [0.1, 0.2, ...]
      const vectorStr = `[${validatedVector.join(',')}]`;

      // Vector similarity search on AIMemory
      // SEC: Use $queryRaw tagged template (parameterized) instead of $queryRawUnsafe
      const vectorParam = Prisma.raw(`'${vectorStr}'::vector`);
      const results = await this.prisma.$queryRaw<
        Array<{ id: string; content: string; category: string | null; createdAt: Date }>
      >(
        Prisma.sql`SELECT id, content, category, "createdAt"
         FROM ai_memories
         WHERE "tenantId" = ${tenantId}
           AND "userId" = ${userId}
           AND vector IS NOT NULL
           AND (vector <-> ${vectorParam}) < 0.5
         ORDER BY (vector <-> ${vectorParam}) ASC
         LIMIT ${limit}`,
      );

      // Update usage tracking (fire-and-forget, never block chat)
      if (results.length > 0) {
        const ids = results.map((r) => r.id).filter(Boolean);
        if (ids.length > 0) {
          this.prisma.aIMemory
            .updateMany({
              where: { id: { in: ids } },
              data: {
                usageCount: { increment: 1 },
                lastUsedAt: new Date(),
              },
            })
            .catch(() => {});
        }
      }

      return results;
    } catch (error) {
      // Never block chat -- log and return empty
      this.logger.warn(
        `Memory retrieval failed (non-blocking): ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Format retrieved memories into a system prompt block.
   *
   * Returns a markdown section that gets appended to the base system prompt.
   * If no memories, returns empty string (no noise in prompt).
   *
   * @param memories - Retrieved memory results
   * @returns Formatted markdown block or empty string
   */
  formatMemoriesForPrompt(memories: MemoryResult[]): string {
    if (!memories.length) return '';

    const lines = memories.map((m) => {
      const dateStr = m.createdAt.toISOString().split('T')[0];
      const prefix = m.category ? `[${m.category}] ` : '';
      return `- ${prefix}${m.content} (saved ${dateStr})`;
    });

    return `## Known Facts About This User\n${lines.join('\n')}`;
  }
}
