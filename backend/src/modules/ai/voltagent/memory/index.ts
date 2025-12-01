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
export { createMemory, createTestMemory, type MemoryOptions } from './memory.config';

// Enhanced memory service (Prisma-based)
export {
  VoltAgentMemoryService,
  type MessageRole,
  type MemoryMessage,
  type ConversationContext,
  type HybridSearchOptions,
  type MemoryRetrievalResult,
} from './memory.service';

// Session bridge for legacy ChatSession migration
export {
  SessionBridgeService,
  type SessionInfo,
} from './session-bridge.service';
