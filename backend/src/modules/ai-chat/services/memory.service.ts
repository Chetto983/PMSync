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

/** Memory result from vector search or direct load */
export interface MemoryResult {
  id?: string;
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
   * Retrieve the most relevant memories for a user.
   *
   * Hybrid strategy (saves ~300ms for typical users):
   * - If user has <= DIRECT_LOAD_THRESHOLD memories: load all directly (no embedding API call)
   * - If user has more: use pgvector cosine distance for semantic search
   *
   * Mem0-style embedding search is superior when users have hundreds of memories,
   * but our users typically have 3-20. Direct load avoids the Mistral embedding
   * API round-trip (~300ms) that dominates latency for small memory sets.
   */
  private static readonly DIRECT_LOAD_THRESHOLD = 15;

  async getRelevantMemories(
    tenantId: string,
    userId: string,
    query: string,
    limit: number = 5,
  ): Promise<MemoryResult[]> {
    try {
      // Check memory count (fast indexed query)
      const count = await this.prisma.aIMemory.count({
        where: { tenantId, userId },
      });

      const results = count <= MemoryService.DIRECT_LOAD_THRESHOLD
        ? await this.loadAllMemories(tenantId, userId, limit)
        : await this.searchByEmbedding(tenantId, userId, query, limit);

      // Update usage tracking (fire-and-forget, never block chat)
      if (results.length > 0) {
        const ids = results.map((r) => r.id).filter((id): id is string => !!id);
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

  /** Fast path: load all memories directly, ordered by most recently used. */
  private async loadAllMemories(
    tenantId: string,
    userId: string,
    limit: number,
  ): Promise<MemoryResult[]> {
    const rows = await this.prisma.aIMemory.findMany({
      where: { tenantId, userId },
      select: { id: true, content: true, category: true, createdAt: true },
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      category: r.category,
      createdAt: r.createdAt,
    }));
  }

  /** Slow path: embedding-based semantic search via pgvector. */
  private async searchByEmbedding(
    tenantId: string,
    userId: string,
    query: string,
    limit: number,
  ): Promise<MemoryResult[]> {
    const queryVector = await this.mistralEmbeddingService.generateEmbedding(
      query,
      undefined,
      { tenantId },
    );

    const validatedVector = validateEmbeddingVector(queryVector);
    const vectorStr = `[${validatedVector.join(',')}]`;
    const vectorParam = Prisma.raw(`'${vectorStr}'::vector`);

    const t0 = Date.now();
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

    const elapsed = Date.now() - t0;
    if (elapsed > 500) {
      this.logger.warn(`Slow memory vector search: ${elapsed}ms (limit=${limit}, results=${results.length})`);
    }

    return results;
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
