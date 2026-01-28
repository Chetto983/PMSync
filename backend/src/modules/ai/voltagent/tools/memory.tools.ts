/**
 * Memory Tools for VoltAgent
 *
 * Exposes AIMemoryService as VoltAgent tools for:
 * - Semantic search on free-form facts/notes
 * - Storing new memories
 *
 * NOTE: Structured preferences use VoltAgent's built-in working memory.
 * These tools are for free-form text that needs semantic search.
 *
 * @see https://voltagent.dev/docs/agents/tools
 */
import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { MemoryType } from '@prisma/client';
import { AIMemoryService } from '../services/ai-memory.service';

/**
 * Parameters for search_memory tool
 */
const searchMemoryParams = z.object({
  query: z.string().describe('What to search for in user memories (semantic search)'),
  limit: z.number().optional().default(5).describe('Maximum number of results (1-20)'),
});

/**
 * Parameters for store_memory tool
 */
const storeMemoryParams = z.object({
  content: z.string().describe('The fact or note to remember'),
  type: z
    .enum(['FACT', 'PREFERENCE', 'CONTACT_NOTE', 'PATTERN'])
    .optional()
    .default('FACT')
    .describe('Memory type: FACT for general facts, CONTACT_NOTE for notes about contacts'),
  category: z.string().optional().describe('Optional category for organization'),
});

export interface MemoryToolsOptions {
  aiMemoryService: AIMemoryService;
  tenantId: string;
  userId?: string;
}

/**
 * Create memory search tool
 *
 * Uses pgvector semantic search to find relevant memories.
 * Example: "What did I say about John's email preferences?"
 */
export function createMemorySearchTool(options: MemoryToolsOptions) {
  const { aiMemoryService, tenantId, userId } = options;

  return createTool({
    name: 'search_memory',
    description:
      'Search user memories and facts semantically. Use for "what did I say about X" or "what do I know about Y" queries. Returns relevant facts, notes, and preferences stored by the user.',
    parameters: searchMemoryParams,
    execute: async ({ query, limit }) => {
      if (!userId) {
        return {
          success: false,
          message: 'User context not available',
          memories: [],
        };
      }

      try {
        const results = await aiMemoryService.searchMemoriesSemantic(
          tenantId,
          userId,
          query,
          Math.min(limit ?? 5, 20), // Cap at 20
        );

        if (results.length === 0) {
          return {
            success: true,
            message: 'No memories found matching your query',
            memories: [],
          };
        }

        return {
          success: true,
          message: `Found ${results.length} relevant memories`,
          memories: results.map((m) => ({
            content: m.content,
            type: m.memoryType,
            category: m.category,
            score: m.score,
            createdAt: m.createdAt.toISOString(),
          })),
        };
      } catch (error) {
        return {
          success: false,
          message: `Memory search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          memories: [],
        };
      }
    },
  });
}

/**
 * Create memory store tool
 *
 * Stores a new fact or note with automatic embedding generation.
 * Example: "Remember that John prefers brief emails"
 */
export function createMemoryStoreTool(options: MemoryToolsOptions) {
  const { aiMemoryService, tenantId, userId } = options;

  return createTool({
    name: 'store_memory',
    description:
      'Store a fact or note about the user. Use when user says "remember that...", "note that...", or wants to save information for later. The memory will be searchable later.',
    parameters: storeMemoryParams,
    execute: async ({ content, type, category }) => {
      if (!userId) {
        return {
          success: false,
          message: 'User context not available',
        };
      }

      try {
        const memory = await aiMemoryService.storeMemory(tenantId, userId, {
          content,
          type: (type as MemoryType) || 'FACT',
          category,
          source: 'EXPLICIT',
        });

        return {
          success: true,
          message: `Stored memory: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`,
          memoryId: memory.id,
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to store memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    },
  });
}

/**
 * Create all memory tools
 */
export function createMemoryTools(options: MemoryToolsOptions) {
  return [createMemorySearchTool(options), createMemoryStoreTool(options)];
}
