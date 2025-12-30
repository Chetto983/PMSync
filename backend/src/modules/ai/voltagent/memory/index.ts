/**
 * VoltAgent Memory Export
 *
 * 2025 Best Practices:
 * - Enhanced memory service with summarization
 * - Hybrid search (semantic + recency decay)
 * - Session management with tenant isolation
 * - Legacy session migration bridge
 */

// Core memory configuration (VoltAgent native)
export { createMemory, type MemoryOptions } from './memory.config';

// Enhanced memory service (Prisma-based)
export {
  VoltAgentMemoryService,
  TOKEN_BUDGET_CONFIG,
  type MessageRole,
  type MemoryMessage,
  type ConversationContext,
  type HybridSearchOptions,
  type MemoryRetrievalResult,
  type TokenBudgetResult,
} from './memory.service';

// Session bridge for legacy ChatSession migration
export {
  SessionBridgeService,
  type SessionInfo,
} from './session-bridge.service';

// Summarization queue service (BullMQ-based)
export {
  SummarizationQueueService,
  type SummarizationJobData,
  type SummarizationJobResult,
} from './summarization.queue';

// Long-term memory service (Prisma + Mistral)
export {
  LongTermMemoryService,
  type MemoryResult,
  type MemoryCategory,
  type StoreMemoryOptions,
  type SearchMemoryOptions,
} from './long-term-memory.service';

// PgVector memory service (mem0-style with no external dependencies)
export { PgVectorMemoryService } from './pgvector-memory.service';
export type {
  MemoryItem,
  MemorySearchResult,
  StoreMemoryOptions as PgVectorStoreOptions,
  SearchMemoryOptions as PgVectorSearchOptions,
  MemoryContext,
  MemoryStats,
} from './prompts/memory.types';
