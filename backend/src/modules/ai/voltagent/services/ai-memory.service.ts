/**
 * AI Memory Service - Long-term memory storage for user preferences, facts, and patterns
 *
 * Simplified implementation inspired by mem0 (https://github.com/mem0ai/mem0)
 * Provides CRUD operations for user memories with history tracking.
 * Supports semantic vector search using mistral-embed (1024 dimensions).
 *
 * @see https://docs.mem0.ai/overview
 */
import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MemoryType, Prisma } from '@prisma/client';
import { MistralService } from '../../services/mistral.service';

// ============================================================================
// Types
// ============================================================================

export interface StoreMemoryInput {
  content: string;
  type: MemoryType;
  source?: 'EXPLICIT' | 'INFERRED' | 'CONVERSATION';
  category?: string;
  tags?: string[];
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateMemoryInput {
  content?: string;
  type?: MemoryType;
  category?: string;
  tags?: string[];
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryFilters {
  type?: MemoryType;
  category?: string;
  limit?: number;
  offset?: number;
}

export interface Memory {
  id: string;
  content: string;
  memoryType: MemoryType;
  source: string | null;
  confidence: number;
  usageCount: number;
  lastUsedAt: Date | null;
  category: string | null;
  tags: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryStats {
  total: number;
  byType: Record<MemoryType, number>;
  lastUpdated: string | null;
}

export interface MemoryHistoryItem {
  action: string;
  previousValue: string | null;
  newValue: string | null;
  createdAt: Date;
}

export interface MemoryWithScore extends Memory {
  score: number; // Similarity score (0-1, higher = more similar)
  distance: number; // Cosine distance (0-2, lower = more similar)
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class AIMemoryService {
  private readonly logger = new Logger(AIMemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly mistralService?: MistralService,
  ) {}

  /**
   * Store a new memory for a user
   */
  async storeMemory(
    tenantId: string,
    userId: string,
    input: StoreMemoryInput,
  ): Promise<Memory> {
    this.logger.debug(
      `Storing memory for user ${userId}: ${input.type} - ${input.content.substring(0, 50)}...`,
    );

    const memory = await this.prisma.aIMemory.create({
      data: {
        tenantId,
        userId,
        content: input.content,
        memoryType: input.type,
        source: input.source || 'EXPLICIT',
        category: input.category,
        tags: input.tags?.join(','),
        confidence: input.confidence ?? 0.5,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });

    // Record history
    await this.recordHistory(tenantId, memory.id, 'CREATE', null, input.content);

    // Generate embedding async (fire-and-forget for speed)
    this.generateAndStoreEmbedding(memory.id, input.content, tenantId).catch(
      (err: Error) => this.logger.warn(`Failed to generate embedding for memory ${memory.id}: ${err.message}`),
    );

    this.logger.log(
      `Stored memory ${memory.id} for user ${userId}: ${input.type}`,
    );

    return memory;
  }

  /**
   * Get all memories for a user, optionally filtered
   */
  async getMemories(
    tenantId: string,
    userId: string,
    filters: MemoryFilters = {},
  ): Promise<Memory[]> {
    const { type, category, limit = 100, offset = 0 } = filters;

    const where: Prisma.AIMemoryWhereInput = {
      tenantId,
      userId,
      ...(type && { memoryType: type }),
      ...(category && { category }),
    };

    return this.prisma.aIMemory.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get a single memory by ID
   */
  async getMemory(
    tenantId: string,
    userId: string,
    memoryId: string,
  ): Promise<Memory | null> {
    return this.prisma.aIMemory.findFirst({
      where: {
        id: memoryId,
        tenantId,
        userId,
      },
    });
  }

  /**
   * Update an existing memory
   */
  async updateMemory(
    tenantId: string,
    userId: string,
    memoryId: string,
    input: UpdateMemoryInput,
  ): Promise<Memory> {
    // Verify ownership
    const existing = await this.getMemory(tenantId, userId, memoryId);
    if (!existing) {
      throw new NotFoundException(`Memory ${memoryId} not found`);
    }

    const oldContent = existing.content;

    const updated = await this.prisma.aIMemory.update({
      where: { id: memoryId },
      data: {
        ...(input.content !== undefined && { content: input.content }),
        ...(input.type !== undefined && { memoryType: input.type }),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.tags !== undefined && { tags: input.tags.join(',') }),
        ...(input.confidence !== undefined && { confidence: input.confidence }),
        ...(input.metadata !== undefined && {
          metadata: input.metadata as Prisma.InputJsonValue,
        }),
      },
    });

    // Record history if content changed
    if (input.content && input.content !== oldContent) {
      await this.recordHistory(tenantId, memoryId, 'UPDATE', oldContent, input.content);

      // Regenerate embedding for new content (async)
      this.generateAndStoreEmbedding(memoryId, input.content, tenantId).catch(
        (err: Error) => this.logger.warn(`Failed to update embedding for memory ${memoryId}: ${err.message}`),
      );
    }

    this.logger.log(`Updated memory ${memoryId}`);
    return updated;
  }

  /**
   * Delete a memory
   */
  async deleteMemory(
    tenantId: string,
    userId: string,
    memoryId: string,
  ): Promise<void> {
    // Verify ownership
    const existing = await this.getMemory(tenantId, userId, memoryId);
    if (!existing) {
      throw new NotFoundException(`Memory ${memoryId} not found`);
    }

    // Record history before deletion
    await this.recordHistory(tenantId, memoryId, 'DELETE', existing.content, null);

    await this.prisma.aIMemory.delete({
      where: { id: memoryId },
    });

    this.logger.log(`Deleted memory ${memoryId}`);
  }

  /**
   * Clear all memories for a user (GDPR compliance)
   */
  async clearAllMemories(tenantId: string, userId: string): Promise<number> {
    const result = await this.prisma.aIMemory.deleteMany({
      where: { tenantId, userId },
    });

    this.logger.log(
      `Cleared ${result.count} memories for user ${userId}`,
    );

    return result.count;
  }

  /**
   * Search memories by content (simple text search)
   * For semantic search, use EmbeddingsService with pgvector
   */
  async searchMemories(
    tenantId: string,
    userId: string,
    query: string,
    limit = 20,
  ): Promise<Memory[]> {
    // Simple case-insensitive contains search
    // For production, consider full-text search or vector similarity
    return this.prisma.aIMemory.findMany({
      where: {
        tenantId,
        userId,
        content: {
          contains: query,
          mode: 'insensitive',
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get memory statistics for a user
   */
  async getStats(tenantId: string, userId: string): Promise<MemoryStats> {
    const memories = await this.prisma.aIMemory.findMany({
      where: { tenantId, userId },
      select: {
        memoryType: true,
        updatedAt: true,
      },
    });

    const byType: Record<MemoryType, number> = {
      PREFERENCE: 0,
      FACT: 0,
      PATTERN: 0,
      INTERACTION: 0,
      CONTACT_NOTE: 0,
    };

    let lastUpdated: Date | null = null;

    for (const memory of memories) {
      byType[memory.memoryType]++;
      if (!lastUpdated || memory.updatedAt > lastUpdated) {
        lastUpdated = memory.updatedAt;
      }
    }

    return {
      total: memories.length,
      byType,
      lastUpdated: lastUpdated?.toISOString() || null,
    };
  }

  /**
   * Get history for a specific memory
   */
  async getMemoryHistory(
    tenantId: string,
    userId: string,
    memoryId: string,
  ): Promise<MemoryHistoryItem[]> {
    // Verify ownership
    const memory = await this.getMemory(tenantId, userId, memoryId);
    if (!memory) {
      throw new NotFoundException(`Memory ${memoryId} not found`);
    }

    const history = await this.prisma.aIMemoryHistory.findMany({
      where: { memoryId },
      orderBy: { createdAt: 'desc' },
      select: {
        action: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
      },
    });

    return history.map((h) => ({
      action: h.action,
      previousValue: h.oldValue,
      newValue: h.newValue,
      createdAt: h.createdAt,
    }));
  }

  /**
   * Increment usage count for a memory (call when memory is used in context)
   */
  async recordUsage(memoryId: string): Promise<void> {
    await this.prisma.aIMemory.update({
      where: { id: memoryId },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  }

  /**
   * Get procedural patterns (learned task workflows)
   * These are memories of type PATTERN that represent repeatable procedures
   */
  async getPatterns(
    tenantId: string,
    userId: string,
    limit = 20,
  ): Promise<Memory[]> {
    return this.prisma.aIMemory.findMany({
      where: {
        tenantId,
        userId,
        memoryType: 'PATTERN',
      },
      orderBy: [{ usageCount: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async recordHistory(
    tenantId: string,
    memoryId: string,
    action: string,
    oldValue: string | null,
    newValue: string | null,
  ): Promise<void> {
    await this.prisma.aIMemoryHistory.create({
      data: {
        tenantId,
        memoryId,
        action,
        oldValue,
        newValue,
        changedBy: 'user',
      },
    });
  }

  /**
   * Generate embedding for content and store it in the memory record
   * Uses mistral-embed model (1024 dimensions)
   */
  private async generateAndStoreEmbedding(
    memoryId: string,
    content: string,
    tenantId: string,
  ): Promise<void> {
    if (!this.mistralService) {
      this.logger.debug('MistralService not available, skipping embedding generation');
      return;
    }

    try {
      const embedding = await this.mistralService.generateEmbedding(content, undefined, { tenantId });

      if (!embedding || embedding.length !== 1024) {
        this.logger.warn(`Invalid embedding for memory ${memoryId}: expected 1024 dimensions, got ${embedding?.length}`);
        return;
      }

      // Store embedding using raw SQL (Prisma doesn't support vector type directly)
      // CITUS: tenantId MUST be in WHERE clause for shard routing
      const vectorLiteral = `[${embedding.join(',')}]`;
      await this.prisma.$executeRaw`
        UPDATE "ai_memories"
        SET "vector" = ${Prisma.raw(`'${vectorLiteral}'::vector`)}
        WHERE "id" = ${memoryId} AND "tenantId" = ${tenantId}
      `;

      this.logger.debug(`Generated embedding for memory ${memoryId}`);
    } catch (error) {
      this.logger.error(`Failed to generate embedding for memory ${memoryId}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // Semantic Search Methods
  // ============================================================================

  /**
   * Semantic search for memories using vector similarity
   * Uses cosine distance with HNSW index for fast retrieval
   *
   * @param tenantId - Tenant isolation
   * @param userId - User isolation
   * @param query - Search query (will be embedded)
   * @param limit - Max results (default 10)
   * @param maxDistance - Max cosine distance threshold (0-2, default 1.0)
   * @returns Memories sorted by similarity score
   */
  async searchMemoriesSemantic(
    tenantId: string,
    userId: string,
    query: string,
    limit = 10,
    maxDistance = 1.0,
  ): Promise<MemoryWithScore[]> {
    if (!this.mistralService) {
      this.logger.warn('MistralService not available, falling back to text search');
      const textResults = await this.searchMemories(tenantId, userId, query, limit);
      return textResults.map((m) => ({ ...m, score: 0.5, distance: 1.0 }));
    }

    try {
      // Generate query embedding
      const queryEmbedding = await this.mistralService.generateEmbedding(query, undefined, { tenantId });

      if (!queryEmbedding || queryEmbedding.length !== 1024) {
        this.logger.warn(`Invalid query embedding: expected 1024 dimensions, got ${queryEmbedding?.length}`);
        return [];
      }

      const vectorLiteral = `[${queryEmbedding.join(',')}]`;

      // Semantic search with tenant + user isolation using CTE
      // Cosine distance: 0 = identical, 2 = opposite
      const results = await this.prisma.$queryRaw<
        Array<Memory & { distance: number }>
      >`
        WITH user_memories AS (
          SELECT *
          FROM "ai_memories"
          WHERE "tenantId" = ${tenantId}
            AND "userId" = ${userId}
            AND "vector" IS NOT NULL
        )
        SELECT
          "id",
          "tenantId",
          "userId",
          "content",
          "memoryType",
          "source",
          "confidence",
          "usageCount",
          "lastUsedAt",
          "category",
          "tags",
          "metadata",
          "createdAt",
          "updatedAt",
          ("vector" <-> ${Prisma.raw(`'${vectorLiteral}'::vector`)}) AS distance
        FROM user_memories
        WHERE ("vector" <-> ${Prisma.raw(`'${vectorLiteral}'::vector`)}) < ${maxDistance}
        ORDER BY distance ASC
        LIMIT ${limit}
      `;

      // Convert distance to score (0-1, higher = more similar)
      return results.map((r) => ({
        ...r,
        distance: Number(r.distance),
        score: 1 - Number(r.distance) / 2,
      }));
    } catch (error) {
      this.logger.error('Semantic search failed, falling back to text search:', error);
      const textResults = await this.searchMemories(tenantId, userId, query, limit);
      return textResults.map((m) => ({ ...m, score: 0.5, distance: 1.0 }));
    }
  }

  /**
   * Check if semantic search is available
   */
  isSemanticSearchAvailable(): boolean {
    return !!this.mistralService;
  }

  /**
   * Backfill embeddings for existing memories without vectors
   * Useful for migrating existing data to semantic search
   */
  async backfillEmbeddings(
    tenantId: string,
    userId: string,
    batchSize = 10,
  ): Promise<{ processed: number; failed: number }> {
    if (!this.mistralService) {
      return { processed: 0, failed: 0 };
    }

    // Find memories without embeddings
    const memoriesWithoutVectors = await this.prisma.$queryRaw<Array<{ id: string; content: string }>>`
      SELECT "id", "content"
      FROM "ai_memories"
      WHERE "tenantId" = ${tenantId}
        AND "userId" = ${userId}
        AND "vector" IS NULL
      LIMIT ${batchSize}
    `;

    let processed = 0;
    let failed = 0;

    for (const memory of memoriesWithoutVectors) {
      try {
        await this.generateAndStoreEmbedding(memory.id, memory.content, tenantId);
        processed++;
      } catch {
        failed++;
      }
    }

    this.logger.log(`Backfilled ${processed} embeddings, ${failed} failed`);
    return { processed, failed };
  }
}
