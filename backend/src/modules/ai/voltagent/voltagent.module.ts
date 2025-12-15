/**
 * VoltAgent Module
 *
 * NestJS module that provides VoltAgent functionality.
 * Includes all AI agent services (HITL, Feedback, ActionExecutor).
 * Uses CacheService (Redis) for scalable metrics storage (>1000 tenants).
 * Provides REST endpoints for chat and approval workflows.
 *
 * RAG Integration:
 * - MistralService: Embeddings generation for semantic search
 * - EmbeddingsService: pgvector similarity search
 * - HybridRetriever: Combines vector + keyword search with re-ranking
 *
 * Memory System (2025 Best Practices):
 * - VoltAgentMemoryService: Enhanced memory with summarization & hybrid search
 * - SessionBridgeService: Unified session management
 *
 * Consolidated Services (Step 8):
 * - PersonalizationService: User profile & semantic memories
 * - WritingStyleService: NLP-based email style analysis
 * - PromptRegistryService: Centralized prompt management with locale support
 * - LlmTelemetry: OpenTelemetry-aligned LLM observability
 *
 * Performance Optimizations (2025):
 * - SemanticCacheService: Redis LangCache for 50-60% cost reduction
 * - ModelRouterService: Intelligent model selection (40-60% savings)
 * - AiQueueService: BullMQ for 8x throughput improvement
 * - RateLimiterService: Token bucket rate limiting for 1000+ users
 * - MistralBatchService: Batch API for 50% cost reduction at scale
 */
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '../../../common/services/cache.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { CalendarModule } from '../../calendar/calendar.module';
import { EmailModule } from '../../email/email.module';
import { EmailSyncModule } from '../../email-sync/email-sync.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { VoltAgentController } from './voltagent.controller';
import { VoltAgentService } from './voltagent.service';
import { HitlService } from './services/hitl.service';
import { FeedbackService } from './services/feedback.service';
import { ActionExecutorService } from './services/action-executor.service';
import { MistralService } from '../services/mistral.service';
import { EmbeddingsService } from '../services/embeddings.service';
// Memory services (2025 Best Practices)
import {
  VoltAgentMemoryService,
  SessionBridgeService,
  SummarizationQueueService,
  LongTermMemoryService,
} from './memory';
// Mem0 enhanced memory (consolidation, history, time decay)
import { Mem0EnhancedMemoryService } from './memory/mem0-enhanced-memory.service';
// Consolidated AI services
import { PersonalizationService } from './services/personalization.service';
import { WritingStyleService } from './services/writing-style.service';
import { PromptRegistryService } from './prompts/prompt-registry.service';
// Performance Optimization services (2025)
import { SemanticCacheService } from './services/semantic-cache.service';
import { ModelRouterService } from './services/model-router.service';
import { AiQueueService } from './services/ai-queue.service';
// Scalability services (1000+ users)
import { RateLimiterService } from './services/rate-limiter.service';
import { MistralBatchService } from './services/mistral-batch.service';
// Daily briefing (pre-computed summaries)
import { DailyBriefingService } from './services/daily-briefing.service';
// Deadline extraction (chrono-node NLP)
import { DeadlineExtractorService } from './services/deadline-extractor.service';
// Observability (OpenTelemetry-aligned)
import { LlmTelemetryService } from './observability/telemetry';

@Module({
  imports: [
    ConfigModule, // For queue configuration
    PrismaModule,
    CacheModule, // Redis for scalable metrics storage
    RealtimeModule, // For HITL real-time events
    forwardRef(() => EmailModule),
    forwardRef(() => CalendarModule),
    forwardRef(() => EmailSyncModule), // For folder operations
  ],
  controllers: [VoltAgentController],
  providers: [
    VoltAgentService,
    HitlService,
    FeedbackService,
    ActionExecutorService,
    // RAG services for HybridRetriever
    MistralService,
    EmbeddingsService,
    // Memory services (2025 Best Practices)
    VoltAgentMemoryService,
    SessionBridgeService,
    SummarizationQueueService,
    LongTermMemoryService,
    Mem0EnhancedMemoryService,
    // Consolidated AI services (Step 8)
    PersonalizationService,
    WritingStyleService,
    PromptRegistryService,
    // Performance Optimization services (2025)
    SemanticCacheService,
    ModelRouterService,
    AiQueueService,
    // Scalability services (1000+ users)
    RateLimiterService,
    MistralBatchService,
    // Daily briefing (pre-computed summaries)
    DailyBriefingService,
    // Deadline extraction (chrono-node NLP + BullMQ)
    DeadlineExtractorService,
    // Observability
    LlmTelemetryService,
  ],
  exports: [
    VoltAgentService,
    HitlService,
    FeedbackService,
    ActionExecutorService,
    // Memory services
    VoltAgentMemoryService,
    SessionBridgeService,
    SummarizationQueueService,
    LongTermMemoryService,
    Mem0EnhancedMemoryService,
    // Consolidated AI services
    PersonalizationService,
    WritingStyleService,
    PromptRegistryService,
    // Performance Optimization services
    SemanticCacheService,
    ModelRouterService,
    AiQueueService,
    // Daily briefing
    DailyBriefingService,
    // Deadline extraction
    DeadlineExtractorService,
    // Observability
    LlmTelemetryService,
  ],
})
export class VoltAgentModule {}
