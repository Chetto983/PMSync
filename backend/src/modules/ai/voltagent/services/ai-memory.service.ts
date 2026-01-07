/**
 * AI Memory Service - Long-term memory storage for user preferences, facts, and patterns
 *
 * Simplified implementation inspired by mem0 (https://github.com/mem0ai/mem0)
 * Provides CRUD operations for user memories with history tracking.
 *
 * @see https://docs.mem0.ai/overview
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MemoryType, Prisma } from '@prisma/client';

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

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class AIMemoryService {
  private readonly logger = new Logger(AIMemoryService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    await this.recordHistory(memory.id, 'CREATE', null, input.content);

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
      await this.recordHistory(memoryId, 'UPDATE', oldContent, input.content);
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
    await this.recordHistory(memoryId, 'DELETE', existing.content, null);

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
    memoryId: string,
    action: string,
    oldValue: string | null,
    newValue: string | null,
  ): Promise<void> {
    await this.prisma.aIMemoryHistory.create({
      data: {
        memoryId,
        action,
        oldValue,
        newValue,
        changedBy: 'user',
      },
    });
  }
}
