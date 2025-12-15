/**
 * Mem0 Enhanced Memory Service
 *
 * Wraps mem0ai npm package to provide advanced memory features:
 * - Memory consolidation (auto-merge similar memories)
 * - Deduplication (prevent duplicate memories)
 * - Memory history (track changes over time via PostgreSQL)
 * - Memory update operations
 * - Time decay for relevance scoring
 *
 * Uses existing infrastructure (NO SQLite - multi-tenant for >1000 users):
 * - Mistral for LLM (via Langchain for embeddings)
 * - PostgreSQL + Prisma for persistent storage and history
 * - Redis for caching (via existing CacheService)
 * - BullMQ for async operations
 *
 * References:
 * - https://docs.mem0.ai/open-source/node-quickstart
 * - https://arxiv.org/abs/2504.19413 (Mem0 Research Paper)
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Memory, type MemoryConfig, type MemoryItem, type SearchResult } from 'mem0ai/oss';
import { MistralAIEmbeddings } from '@langchain/mistralai';
import { PrismaService } from '../../../../prisma/prisma.service';

/**
 * Memory result from search operations (compatible with LongTermMemoryService)
 */
export interface Mem0MemoryResult {
  id: string;
  memory: string;
  category?: string;
  importance?: number;
  metadata?: Record<string, unknown>;
  score?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Options for storing memories
 */
export interface Mem0StoreOptions {
  category?: string;
  importance?: number;
  metadata?: Record<string, unknown>;
  infer?: boolean; // Whether to extract facts from messages
}

/**
 * Options for searching memories
 */
export interface Mem0SearchOptions {
  limit?: number;
  minScore?: number;
  applyTimeDecay?: boolean;
}

/**
 * Memory history entry
 */
export interface MemoryHistoryEntry {
  id: string;
  memoryId: string;
  previousValue: string | null;
  newValue: string | null;
  action: string;
  timestamp: string;
}

@Injectable()
export class Mem0EnhancedMemoryService implements OnModuleInit {
  private readonly logger = new Logger(Mem0EnhancedMemoryService.name);
  private memory: Memory | null = null;
  private enabled = false;

  // Configuration
  private readonly maxMemories: number;
  private readonly timeDecayHalfLifeDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.maxMemories = this.configService.get<number>('MEM0_MAX_MEMORIES', 10);
    this.timeDecayHalfLifeDays = this.configService.get<number>('MEM0_TIME_DECAY_DAYS', 30);
  }

  async onModuleInit(): Promise<void> {
    const mem0Enabled = this.configService.get<string>('MEM0_ENABLED', 'false');

    if (mem0Enabled !== 'true') {
      this.logger.warn('Mem0 enhanced memory disabled by configuration');
      return;
    }

    const mistralApiKey = this.configService.get<string>('MISTRAL_API_KEY');
    if (!mistralApiKey) {
      this.logger.warn('Mem0 disabled: MISTRAL_API_KEY is required');
      return;
    }

    try {
      // Use existing AI config variables (no duplication)
      const embeddingModel = this.configService.get<string>('AI_EMBEDDING_MODEL', 'mistral-embed');
      // Use AI_MODEL_MEDIUM for fact extraction (better JSON output than small models)
      const llmModel = this.configService.get<string>('AI_MODEL_MEDIUM',
        this.configService.get<string>('MISTRAL_MODEL', 'mistral-small-latest'));
      // Mistral-embed is always 1024 dimensions (AI_MAX_EMBEDDING_DIM is the max limit, not actual)
      const embeddingDimension = embeddingModel === 'mistral-embed' ? 1024 : 1536;

      this.logger.debug(`Mem0 config: embedding=${embeddingModel}, llm=${llmModel}, dim=${embeddingDimension}`);

      // Create Langchain Mistral embeddings instance
      // NOTE: mem0ai doesn't support 'mistral' provider directly for embeddings,
      // so we use Langchain as a bridge to Mistral's embedding API
      const mistralEmbeddings = new MistralAIEmbeddings({
        apiKey: mistralApiKey,
        model: embeddingModel,
      });

      // Initialize Mem0 with Mistral as LLM and Langchain for embeddings
      // NOTE: NO SQLite - we use PostgreSQL for all storage (multi-tenant, >1000 users)
      // NOTE: Due to mem0ai v2.x + @mistralai/mistralai v1.10+ incompatibility with JSON mode,
      // we use infer=false by default and extract facts manually before storing.
      // The mem0ai library uses snake_case (response_format) but newer Mistral SDK expects camelCase (responseFormat)
      const config = {
        version: 'v1.1',
        // Use Langchain with Mistral for embeddings
        embedder: {
          provider: 'langchain',
          config: {
            model: mistralEmbeddings, // Pass Langchain embeddings instance
          },
        },
        // Use in-memory vector store for mem0ai internal operations
        // Our existing Prisma + pgvector (AiMemory table) handles persistence
        vectorStore: {
          provider: 'memory',
          config: {
            collectionName: 'ai_memories_mem0',
            dimension: embeddingDimension,
          },
        },
        // Use Mistral for LLM operations (fact extraction, consolidation)
        llm: {
          provider: 'mistral',
          config: {
            apiKey: mistralApiKey,
            model: llmModel,
          },
        },
        // NO historyDbPath - we use PostgreSQL via Prisma for history tracking
        // History is stored in AiMemoryHistory table (to be created)
      } as Partial<MemoryConfig>;

      this.memory = new Memory(config);
      this.enabled = true;
      this.logger.log('Mem0 enhanced memory initialized with Mistral');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize Mem0: ${msg}`);
      this.enabled = false;
    }
  }

  /**
   * Check if Mem0 is enabled
   */
  isEnabled(): boolean {
    return this.enabled && this.memory !== null;
  }

  /**
   * Generate tenant-isolated user ID.
   * Format: {tenantId}:{userId}
   */
  private getMemoryUserId(tenantId: string, userId: string): string {
    return `${tenantId}:${userId}`;
  }

  // ==========================================================================
  // CORE MEMORY OPERATIONS
  // ==========================================================================

  /**
   * Add memory from conversation messages.
   * Mem0 will automatically extract facts and deduplicate.
   */
  async addMemory(
    tenantId: string,
    userId: string,
    messages: Array<{ role: string; content: string }>,
    options: Mem0StoreOptions = {},
  ): Promise<string[]> {
    if (!this.isEnabled()) return [];

    const memoryUserId = this.getMemoryUserId(tenantId, userId);

    try {
      const result = await this.memory!.add(messages, {
        userId: memoryUserId,
        metadata: {
          tenantId,
          userId,
          category: options.category || 'GENERAL',
          importance: options.importance || 0.5,
          ...options.metadata,
        },
        infer: options.infer ?? true,
      });

      const ids = result.results?.map((r: MemoryItem) => r.id) || [];
      this.logger.debug(`Added ${ids.length} memories for user ${userId}`);
      return ids;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to add memory: ${msg}`);
      return [];
    }
  }

  /**
   * Add a single fact directly (without LLM extraction).
   */
  async addFact(
    tenantId: string,
    userId: string,
    fact: string,
    options: Mem0StoreOptions = {},
  ): Promise<string | null> {
    if (!this.isEnabled()) return null;

    const memoryUserId = this.getMemoryUserId(tenantId, userId);

    try {
      const result = await this.memory!.add(fact, {
        userId: memoryUserId,
        metadata: {
          tenantId,
          userId,
          category: options.category || 'GENERAL',
          importance: options.importance || 0.5,
          ...options.metadata,
        },
        infer: false, // Store as-is, no extraction
      });

      const id = result.results?.[0]?.id || null;
      if (id) {
        this.logger.debug(`Added fact ${id} for user ${userId}`);
      }
      return id;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to add fact: ${msg}`);
      return null;
    }
  }

  /**
   * Search for relevant memories.
   * Optionally applies time decay to prioritize recent memories.
   */
  async searchMemories(
    tenantId: string,
    userId: string,
    query: string,
    options: Mem0SearchOptions = {},
  ): Promise<Mem0MemoryResult[]> {
    if (!this.isEnabled()) return [];

    const memoryUserId = this.getMemoryUserId(tenantId, userId);
    const limit = options.limit || this.maxMemories;

    try {
      const result: SearchResult = await this.memory!.search(query, {
        userId: memoryUserId,
        limit,
      });

      let memories: Mem0MemoryResult[] = (result.results || []).map((item: MemoryItem) => ({
        id: item.id,
        memory: item.memory,
        category: item.metadata?.category as string | undefined,
        importance: item.metadata?.importance as number | undefined,
        metadata: item.metadata,
        score: item.score,
        createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
        updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
      }));

      // Apply minimum score filter
      if (options.minScore) {
        memories = memories.filter((m) => (m.score || 0) >= options.minScore!);
      }

      // Apply time decay if enabled
      if (options.applyTimeDecay) {
        memories = this.applyTimeDecay(memories);
      }

      return memories;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to search memories: ${msg}`);
      return [];
    }
  }

  /**
   * Get context string for AI prompts.
   */
  async getContextForPrompt(
    tenantId: string,
    userId: string,
    query: string,
    options: Mem0SearchOptions = {},
  ): Promise<string> {
    const memories = await this.searchMemories(tenantId, userId, query, {
      limit: options.limit || 5,
      minScore: options.minScore || 0.5,
      applyTimeDecay: true,
    });

    if (memories.length === 0) return '';

    // Group by category
    const byCategory = new Map<string, string[]>();
    for (const m of memories) {
      const cat = m.category || 'GENERAL';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(m.memory);
    }

    const sections: string[] = [];
    for (const [category, items] of byCategory) {
      sections.push(`**${category}:**\n${items.map((i) => `- ${i}`).join('\n')}`);
    }

    return `\n\n## User Context (from memory):\n${sections.join('\n\n')}`;
  }

  /**
   * Get a specific memory by ID.
   */
  async getMemory(memoryId: string): Promise<Mem0MemoryResult | null> {
    if (!this.isEnabled()) return null;

    try {
      const item = await this.memory!.get(memoryId);
      if (!item) return null;

      return {
        id: item.id,
        memory: item.memory,
        category: item.metadata?.category as string | undefined,
        importance: item.metadata?.importance as number | undefined,
        metadata: item.metadata,
        createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
        updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get memory: ${msg}`);
      return null;
    }
  }

  /**
   * Update an existing memory.
   * NEW: This feature was missing in our custom implementation.
   */
  async updateMemory(memoryId: string, newContent: string): Promise<boolean> {
    if (!this.isEnabled()) return false;

    try {
      await this.memory!.update(memoryId, newContent);
      this.logger.debug(`Updated memory ${memoryId}`);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to update memory: ${msg}`);
      return false;
    }
  }

  /**
   * Delete a specific memory.
   */
  async deleteMemory(memoryId: string): Promise<boolean> {
    if (!this.isEnabled()) return false;

    try {
      await this.memory!.delete(memoryId);
      this.logger.debug(`Deleted memory ${memoryId}`);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to delete memory: ${msg}`);
      return false;
    }
  }

  /**
   * Delete all memories for a user (GDPR compliance).
   */
  async deleteUserMemories(tenantId: string, userId: string): Promise<boolean> {
    if (!this.isEnabled()) return false;

    const memoryUserId = this.getMemoryUserId(tenantId, userId);

    try {
      await this.memory!.deleteAll({ userId: memoryUserId });

      // Also delete from Prisma backup if exists
      try {
        await this.prisma.aiMemory.deleteMany({
          where: { tenantId, userId },
        });
      } catch {
        // Ignore if Prisma table doesn't have these records
      }

      this.logger.log(`Deleted all memories for user ${userId} (GDPR)`);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to delete user memories: ${msg}`);
      return false;
    }
  }

  /**
   * Get all memories for a user.
   */
  async getAllMemories(
    tenantId: string,
    userId: string,
    options: { limit?: number } = {},
  ): Promise<Mem0MemoryResult[]> {
    if (!this.isEnabled()) return [];

    const memoryUserId = this.getMemoryUserId(tenantId, userId);

    try {
      const result: SearchResult = await this.memory!.getAll({
        userId: memoryUserId,
        limit: options.limit || 100,
      });

      return (result.results || []).map((item: MemoryItem) => ({
        id: item.id,
        memory: item.memory,
        category: item.metadata?.category as string | undefined,
        importance: item.metadata?.importance as number | undefined,
        metadata: item.metadata,
        createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
        updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
      }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get all memories: ${msg}`);
      return [];
    }
  }

  // ==========================================================================
  // NEW: MEMORY HISTORY (was missing in custom implementation)
  // ==========================================================================

  /**
   * Get history of changes for a memory.
   * Tracks when memory was created, updated, or deleted.
   */
  async getMemoryHistory(memoryId: string): Promise<MemoryHistoryEntry[]> {
    if (!this.isEnabled()) return [];

    try {
      const history = await this.memory!.history(memoryId);
      return (history || []).map((entry: Record<string, unknown>) => ({
        id: entry.id as string,
        memoryId: entry.memoryId as string,
        previousValue: entry.previousValue as string | null,
        newValue: entry.newValue as string | null,
        action: entry.action as string,
        timestamp: entry.timestamp as string,
      }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get memory history: ${msg}`);
      return [];
    }
  }

  // ==========================================================================
  // NEW: TIME DECAY (was missing in custom implementation)
  // ==========================================================================

  /**
   * Apply time decay to memory scores.
   * Recent memories get higher scores.
   *
   * Formula: score = originalScore * e^(-daysSince / halfLifeDays * ln(2))
   */
  private applyTimeDecay(memories: Mem0MemoryResult[]): Mem0MemoryResult[] {
    const now = Date.now();

    return memories
      .map((m) => {
        if (!m.createdAt) return m;

        const daysSince = (now - m.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        const decayFactor = Math.exp((-daysSince / this.timeDecayHalfLifeDays) * Math.LN2);
        const decayedScore = (m.score || 1) * decayFactor;

        return {
          ...m,
          score: decayedScore,
        };
      })
      .sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get memory statistics for a user.
   */
  async getStats(
    tenantId: string,
    userId: string,
  ): Promise<{
    totalMemories: number;
    byCategory: Record<string, number>;
    avgImportance: number;
    oldestMemory: Date | null;
    newestMemory: Date | null;
  }> {
    const memories = await this.getAllMemories(tenantId, userId, { limit: 1000 });

    const byCategory: Record<string, number> = {};
    let totalImportance = 0;
    let oldestMemory: Date | null = null;
    let newestMemory: Date | null = null;

    for (const m of memories) {
      const cat = m.category || 'GENERAL';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
      totalImportance += m.importance || 0.5;

      if (m.createdAt) {
        if (!oldestMemory || m.createdAt < oldestMemory) {
          oldestMemory = m.createdAt;
        }
        if (!newestMemory || m.createdAt > newestMemory) {
          newestMemory = m.createdAt;
        }
      }
    }

    return {
      totalMemories: memories.length,
      byCategory,
      avgImportance: memories.length > 0 ? totalImportance / memories.length : 0,
      oldestMemory,
      newestMemory,
    };
  }
}
