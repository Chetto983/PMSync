/**
 * VoltAgent Services - Core services for AI agents
 */

// Core Services
export * from './hitl.service';
export * from './action-executor.service';

// CRM & Scheduling
export * from './relationship-intelligence.service';
export * from './calendar-conflict.service';
export * from './focus-time.service';
export * from './meeting-prep.service';

// Conversation & Memory
export * from './conversation-compaction.service';
export { ConversationManagementService } from './conversation-management.service';
export type {
  ConversationSummary,
  ConversationDetail,
  ConversationMessageDetail,
} from './conversation-management.service';

// Analytics & Performance
export * from './analytics.service';
export * from './ai-queue.service';
export * from './rate-limiter.service';
// ModelRouterService removed - VoltAgent 2.x handles model routing natively
export type { AgentType } from '../types';

// AI Features
export * from './daily-briefing.service';
export * from './follow-up.service';
export * from './writing-style.service';
export * from './unified-knowledge.service';
export * from './document-library.service';
export * from './episodic-memory.service';
export * from './mistral-batch.service';
export * from './memory-intelligence.service';

// Chat Processing (Refactored from VoltAgentService 2026-01-22)
export * from './chat-request-processor.service';
export * from './chat-context-builder.service';
export * from './chat-response-processor.service';

// Metrics (Refactored from VoltAgentService 2026-01-22)
export * from './agent-metrics.service';

// Agent Lifecycle (Refactored from VoltAgentService 2026-01-22)
export * from './agent-pool.service';

// Approval Workflow (Refactored from VoltAgentService 2026-01-22)
export * from './approval-workflow.service';
