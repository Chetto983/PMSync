/**
 * Long-Term Memory Service (Prisma + Mistral)
 *
 * Provides persistent memory across sessions using existing infrastructure.
 * Key differences from VoltAgentMemoryService (short-term):
 * - Persists facts/preferences ACROSS conversations (not just within)
 * - Uses AI-powered memory extraction from conversations
 * - Stores memories with importance scoring for relevance ranking
 * - Supports GDPR compliance with per-user memory deletion
 *
 * Architecture:
 * - Uses Mistral for embeddings and LLM operations (existing infrastructure)
 * - Uses Prisma + pgvector for vector storage (existing PostgreSQL)
 * - Strict tenant isolation via {tenantId}:{userId} filtering
 *
 * References:
 * - https://arxiv.org/abs/2504.19413 (Mem0 Research Paper: 26% accuracy improvement)
 * - Design inspired by Mem0, implemented with existing stack
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MistralService } from '../../services/mistral.service';

/**
 * Validates and sanitizes an embedding vector for safe SQL usage.
 * Prevents SQL injection by ensuring all values are finite numbers.
 *
 * @throws Error if embedding contains invalid values
 */
function validateEmbeddingVector(embedding: unknown): number[] {
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding must be an array');
  }

  if (embedding.length === 0) {
    throw new Error('Embedding array cannot be empty');
  }

  if (embedding.length > 4096) {
    throw new Error('Embedding array exceeds maximum dimension (4096)');
  }

  const validated: number[] = [];
  for (let i = 0; i < embedding.length; i++) {
    const value = embedding[i];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Invalid embedding value at index ${i}: expected finite number`);
    }
    validated.push(value);
  }

  return validated;
}

/**
 * Memory result from search operations
 */
export interface MemoryResult {
  id: string;
  memory: string;
  category?: string;
  importance?: number;
  metadata?: Record<string, unknown>;
  score?: number;
  createdAt?: Date;
}

/**
 * Memory category types for organization
 */
export type MemoryCategory =
  | 'PREFERENCE'      // User preferences (communication style, timezone, etc.)
  | 'CONTACT'         // Information about contacts
  | 'SCHEDULE'        // Scheduling preferences and patterns
  | 'HABIT'           // User work habits
  | 'RELATIONSHIP'    // Contact relationship context
  | 'PROJECT'         // Project/task context
  | 'GENERAL';        // General facts

/**
 * Options for storing memories
 */
export interface StoreMemoryOptions {
  category?: MemoryCategory;
  importance?: number;
  sourceType?: 'CONVERSATION' | 'EMAIL' | 'CALENDAR';
  sourceId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Options for searching memories
 */
export interface SearchMemoryOptions {
  category?: MemoryCategory;
  limit?: number;
  minImportance?: number;
  includeMetadata?: boolean;
}

/**
 * Raw query result type for memory searches
 */
interface MemoryRow {
  id: string;
  content: string;
  category: string | null;
  importance: number;
  metadata: unknown;
  created_at: Date;
  similarity: number;
}

@Injectable()
export class LongTermMemoryService implements OnModuleInit {
  private readonly logger = new Logger(LongTermMemoryService.name);
  private enabled = false;

  // Configuration
  private readonly maxMemories: number;
  private readonly similarityThreshold = 0.7;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistralService: MistralService,
    private readonly configService: ConfigService,
  ) {
    this.maxMemories = this.configService.get<number>('MEM0_MAX_MEMORIES', 10);
  }

  async onModuleInit(): Promise<void> {
    const mem0Enabled = this.configService.get<string>('MEM0_ENABLED', 'false');

    if (mem0Enabled !== 'true') {
      this.logger.warn('Long-term memory disabled by configuration (MEM0_ENABLED != true)');
      return;
    }

    // Verify Mistral API key is available
    const mistralApiKey = this.configService.get<string>('MISTRAL_API_KEY');
    if (!mistralApiKey) {
      this.logger.warn('Long-term memory disabled: MISTRAL_API_KEY is required');
      return;
    }

    this.enabled = true;
    this.logger.log('Long-term memory initialized (Prisma + Mistral)');
  }

  /**
   * Check if long-term memory is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Generate a unique ID for memories
   */
  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Store a memory from conversation messages.
   * Extracts key facts using Mistral and stores in Prisma.
   */
  async addMemory(
    tenantId: string,
    userId: string,
    messages: Array<{ role: string; content: string }>,
    options: StoreMemoryOptions = {},
  ): Promise<string | null> {
    if (!this.enabled) return null;

    try {
      // Extract key facts from messages using Mistral
      const content = await this.extractMemoryFromMessages(messages);
      if (!content) return null;

      // Generate embedding for semantic search
      let vector: number[] | undefined;
      try {
        vector = await this.mistralService.generateEmbedding(content);
      } catch {
        this.logger.debug('Failed to generate embedding, storing without vector');
      }

      const id = this.generateId();
      const category = options.category || 'GENERAL';
      const importance = options.importance || 0.5;
      const sourceType = options.sourceType || null;
      const sourceId = options.sourceId || null;

      // Store in Prisma using raw SQL for vector
      if (vector) {
        const validatedVector = validateEmbeddingVector(vector);
        const vectorLiteral = Prisma.raw(`'[${validatedVector.join(',')}]'::vector`);
        const metadataFragment = options.metadata
          ? Prisma.sql`${JSON.stringify(options.metadata)}::jsonb`
          : Prisma.sql`'{}'::jsonb`;

        await this.prisma.$executeRaw(
          Prisma.sql`
            INSERT INTO "ai_memories"
              ("id", "tenantId", "userId", "content", "category", "importance",
               "sourceType", "sourceId", "metadata", "vector", "createdAt", "updatedAt")
            VALUES
              (${id}, ${tenantId}, ${userId}, ${content}, ${category}, ${importance},
               ${sourceType}, ${sourceId}, ${metadataFragment}, ${vectorLiteral}, NOW(), NOW())
          `,
        );
        this.logger.debug(`Stored memory ${id} for user ${userId}`);
        return id;
      } else {
        // Store without vector using Prisma ORM
        const memory = await this.prisma.aiMemory.create({
          data: {
            tenantId,
            userId,
            content,
            category,
            importance,
            sourceType,
            sourceId,
            metadata: options.metadata as Prisma.InputJsonValue || Prisma.JsonNull,
          },
          select: { id: true },
        });
        this.logger.debug(`Stored memory ${memory.id} for user ${userId}`);
        return memory.id;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to store memory: ${message}`);
      return null;
    }
  }

  /**
   * Store a single fact/memory directly.
   * Use this for explicit memory storage (vs. conversation extraction).
   */
  async addFact(
    tenantId: string,
    userId: string,
    fact: string,
    options: StoreMemoryOptions = {},
  ): Promise<string | null> {
    if (!this.enabled) return null;

    try {
      // Generate embedding for semantic search
      let vector: number[] | undefined;
      try {
        vector = await this.mistralService.generateEmbedding(fact);
      } catch {
        this.logger.debug('Failed to generate embedding, storing without vector');
      }

      const id = this.generateId();
      const category = options.category || 'GENERAL';
      const importance = options.importance || 0.5;
      const sourceType = options.sourceType || null;
      const sourceId = options.sourceId || null;

      if (vector) {
        const validatedVector = validateEmbeddingVector(vector);
        const vectorLiteral = Prisma.raw(`'[${validatedVector.join(',')}]'::vector`);
        const metadataFragment = options.metadata
          ? Prisma.sql`${JSON.stringify(options.metadata)}::jsonb`
          : Prisma.sql`'{}'::jsonb`;

        await this.prisma.$executeRaw(
          Prisma.sql`
            INSERT INTO "ai_memories"
              ("id", "tenantId", "userId", "content", "category", "importance",
               "sourceType", "sourceId", "metadata", "vector", "createdAt", "updatedAt")
            VALUES
              (${id}, ${tenantId}, ${userId}, ${fact}, ${category}, ${importance},
               ${sourceType}, ${sourceId}, ${metadataFragment}, ${vectorLiteral}, NOW(), NOW())
          `,
        );
        return id;
      } else {
        const memory = await this.prisma.aiMemory.create({
          data: {
            tenantId,
            userId,
            content: fact,
            category,
            importance,
            sourceType,
            sourceId,
            metadata: options.metadata as Prisma.InputJsonValue || Prisma.JsonNull,
          },
          select: { id: true },
        });
        return memory.id;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to store fact: ${message}`);
      return null;
    }
  }

  /**
   * Search for relevant memories based on a query.
   * Uses CTE pattern to ensure tenant isolation at query level.
   */
  async searchMemories(
    tenantId: string,
    userId: string,
    query: string,
    options: SearchMemoryOptions = {},
  ): Promise<MemoryResult[]> {
    if (!this.enabled) return [];

    const limit = options.limit || this.maxMemories;

    try {
      // Generate query embedding
      let queryEmbedding: number[];
      try {
        queryEmbedding = await this.mistralService.generateEmbedding(query);
      } catch {
        // Fall back to recent memories if embedding fails
        return this.getRecentMemories(tenantId, userId, options);
      }

      // Validate and create vector literal
      const validatedVector = validateEmbeddingVector(queryEmbedding);
      const vectorLiteral = Prisma.raw(`'[${validatedVector.join(',')}]'::vector`);

      // Semantic search with pgvector using CTE for tenant isolation
      const results = await this.prisma.$queryRaw<MemoryRow[]>(
        Prisma.sql`
          WITH tenant_memories AS (
            SELECT "id", "content", "category", "importance", "metadata",
                   "createdAt", "vector"
            FROM "ai_memories"
            WHERE "tenantId" = ${tenantId}
              AND "userId" = ${userId}
              AND "vector" IS NOT NULL
          )
          SELECT "id", "content", "category", "importance", "metadata",
                 "createdAt" as created_at,
                 1 - ("vector" <-> ${vectorLiteral}) as similarity
          FROM tenant_memories
          ORDER BY "vector" <-> ${vectorLiteral}
          LIMIT ${limit}
        `,
      );

      return results
        .filter((r: MemoryRow) => r.similarity >= this.similarityThreshold)
        .filter((r: MemoryRow) => !options.minImportance || r.importance >= options.minImportance)
        .filter((r: MemoryRow) => !options.category || r.category === options.category)
        .map((r: MemoryRow) => ({
          id: r.id,
          memory: r.content,
          category: r.category || undefined,
          importance: r.importance,
          score: r.similarity,
          metadata: options.includeMetadata ? (r.metadata as Record<string, unknown>) : undefined,
          createdAt: r.created_at,
        }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to search memories: ${message}`);
      return [];
    }
  }

  /**
   * Get context string for AI prompts.
   * Call this before sending to Mistral to inject user context.
   */
  async getContextForPrompt(
    tenantId: string,
    userId: string,
    query: string,
    options: SearchMemoryOptions = {},
  ): Promise<string> {
    const memories = await this.searchMemories(tenantId, userId, query, {
      limit: options.limit || 5,
      minImportance: options.minImportance || 0.3,
    });

    if (memories.length === 0) return '';

    // Group by category for better context organization
    const byCategory = new Map<string, string[]>();
    for (const m of memories) {
      const cat = m.category || 'GENERAL';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(m.memory);
    }

    const sections: string[] = [];
    for (const [category, items] of byCategory) {
      const categoryLabel = this.getCategoryLabel(category);
      sections.push(`**${categoryLabel}:**\n${items.map((i) => `- ${i}`).join('\n')}`);
    }

    return `\n\n## User Context (from long-term memory):\n${sections.join('\n\n')}`;
  }

  /**
   * Get all memories for a user.
   */
  async getAllMemories(
    tenantId: string,
    userId: string,
    options: { category?: MemoryCategory; limit?: number } = {},
  ): Promise<MemoryResult[]> {
    if (!this.enabled) return [];

    try {
      const memories = await this.prisma.aiMemory.findMany({
        where: {
          tenantId,
          userId,
          ...(options.category ? { category: options.category } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: options.limit || 100,
        select: {
          id: true,
          content: true,
          category: true,
          importance: true,
          metadata: true,
          createdAt: true,
        },
      });

      return memories.map((m: {
        id: string;
        content: string;
        category: string | null;
        importance: number;
        metadata: Prisma.JsonValue;
        createdAt: Date;
      }) => ({
        id: m.id,
        memory: m.content,
        category: m.category || undefined,
        importance: m.importance,
        metadata: m.metadata as Record<string, unknown> | undefined,
        createdAt: m.createdAt,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get all memories: ${message}`);
      return [];
    }
  }

  /**
   * Delete a specific memory by ID.
   */
  async deleteMemory(tenantId: string, memoryId: string): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      await this.prisma.aiMemory.delete({
        where: { id: memoryId, tenantId },
      });
      this.logger.debug(`Deleted memory ${memoryId}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to delete memory: ${message}`);
      return false;
    }
  }

  /**
   * Delete all memories for a user (GDPR compliance).
   */
  async deleteUserMemories(tenantId: string, userId: string): Promise<number> {
    if (!this.enabled) return 0;

    try {
      const result = await this.prisma.aiMemory.deleteMany({
        where: { tenantId, userId },
      });

      this.logger.log(`Deleted ${result.count} memories for user ${userId}`);
      return result.count;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to delete user memories: ${message}`);
      return 0;
    }
  }

  /**
   * Get memory statistics for a user.
   */
  async getStats(tenantId: string, userId: string): Promise<{
    totalMemories: number;
    byCategory: Record<string, number>;
    avgImportance: number;
  }> {
    const memories = await this.getAllMemories(tenantId, userId, { limit: 1000 });

    const byCategory: Record<string, number> = {};
    let totalImportance = 0;

    for (const m of memories) {
      const cat = m.category || 'GENERAL';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
      totalImportance += m.importance || 0.5;
    }

    return {
      totalMemories: memories.length,
      byCategory,
      avgImportance: memories.length > 0 ? totalImportance / memories.length : 0,
    };
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  /**
   * Get recent memories without vector search.
   */
  private async getRecentMemories(
    tenantId: string,
    userId: string,
    options: SearchMemoryOptions,
  ): Promise<MemoryResult[]> {
    const memories = await this.prisma.aiMemory.findMany({
      where: {
        tenantId,
        userId,
        ...(options.category ? { category: options.category } : {}),
        ...(options.minImportance ? { importance: { gte: options.minImportance } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit || this.maxMemories,
      select: {
        id: true,
        content: true,
        category: true,
        importance: true,
        metadata: true,
        createdAt: true,
      },
    });

    return memories.map((m: {
      id: string;
      content: string;
      category: string | null;
      importance: number;
      metadata: Prisma.JsonValue;
      createdAt: Date;
    }) => ({
      id: m.id,
      memory: m.content,
      category: m.category || undefined,
      importance: m.importance,
      metadata: options.includeMetadata ? (m.metadata as Record<string, unknown>) : undefined,
      createdAt: m.createdAt,
    }));
  }

  /**
   * Extract key memory facts from conversation messages using Mistral.
   */
  private async extractMemoryFromMessages(
    messages: Array<{ role: string; content: string }>,
  ): Promise<string | null> {
    if (messages.length === 0) return null;

    // For single short message, just use it directly
    if (messages.length === 1 && messages[0].content.length < 200) {
      return messages[0].content;
    }

    try {
      // Use Mistral to extract key facts
      const transcript = messages
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 500)}`)
        .join('\n');

      const response = await this.mistralService.completePrompt({
        systemPrompt: `Extract the most important fact or preference from this conversation that should be remembered for future interactions.
Return ONLY the fact as a single sentence, nothing else.
If nothing important to remember, return "NONE".`,
        userPrompt: transcript,
        temperature: 0.1,
        maxTokens: 100,
      });

      const fact = response.trim();
      if (fact === 'NONE' || fact.length < 10) return null;

      return fact;
    } catch {
      // Fallback: Use first user message as memory
      const firstUser = messages.find((m) => m.role === 'user');
      return firstUser?.content.slice(0, 200) || null;
    }
  }

  /**
   * Get human-readable category label.
   */
  private getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      PREFERENCE: 'Preferences',
      CONTACT: 'Contact Information',
      SCHEDULE: 'Scheduling',
      HABIT: 'Work Habits',
      RELATIONSHIP: 'Relationships',
      PROJECT: 'Projects',
      GENERAL: 'General',
    };
    return labels[category] || category;
  }
}
