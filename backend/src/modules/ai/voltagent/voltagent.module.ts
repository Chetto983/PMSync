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
// PgVector memory service (replaces mem0ai - no external dependencies)

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
// Follow-up tracking (P0 critical feature)
import { FollowUpService } from './services/follow-up.service';
// Action item extraction (P1 feature)
import { ActionItemService } from './services/action-item.service';
// Analytics (P1.5 - Mistral code_interpreter)
import { AnalyticsService } from './services/analytics.service';
// Unified Knowledge (P1.6 - Memory-First RAG)
import { UnifiedKnowledgeService } from './services/unified-knowledge.service';
// CRM Intelligence (P1.7 - Relationship Tracking)
import { RelationshipIntelligenceService } from './services/relationship-intelligence.service';
import { CrmBackfillProcessor, ReconnectReminderProcessor } from './jobs';
// Smart Scheduling (P2 - Calendar Conflict, Focus Time, Meeting Prep)
import { CalendarConflictService } from './services/calendar-conflict.service';
import { FocusTimeService } from './services/focus-time.service';
import { MeetingPrepService } from './services/meeting-prep.service';
// Document Library (P2.5 - Mistral document_library RAG)
import { DocumentLibraryService } from './services/document-library.service';
import { DocumentLibraryController } from './controllers/document-library.controller';
// Observability (OpenTelemetry-aligned)
import { LlmTelemetryService } from './observability/telemetry';
// Security guards (OWASP LLM Top 10 2025)
import { PromptGuardService, PiiDetectionService } from '../guards';
import { EpisodicMemoryService } from './services/episodic-memory.service';
// Common services for job processors
import { AlertingService } from '../../../common/services/alerting.service';
// DeadLetterQueueService is available globally from CacheModule

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
  controllers: [VoltAgentController, DocumentLibraryController],
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
    // Follow-up tracking (P0 critical feature)
    FollowUpService,
    // Action item extraction (P1 feature)
    ActionItemService,
    // Analytics (P1.5 - Mistral code_interpreter)
    AnalyticsService,
    // Unified Knowledge (P1.6 - Memory-First RAG)
    UnifiedKnowledgeService,
    // CRM Intelligence (P1.7 - Relationship Tracking)
    RelationshipIntelligenceService,
    CrmBackfillProcessor,
    ReconnectReminderProcessor,
    // Smart Scheduling (P2)
    CalendarConflictService,
    FocusTimeService,
    MeetingPrepService,
    // Document Library (P2.5 - Mistral document_library RAG)
    DocumentLibraryService,
    // Observability
    LlmTelemetryService,
    // Security guards (OWASP LLM Top 10 2025)
    // Security guards (OWASP LLM Top 10 2025)
    PromptGuardService,
    PiiDetectionService,
    // Episodic Learning
    EpisodicMemoryService,
    // Common services for job processors (CrmBackfillProcessor, ReconnectReminderProcessor)
    AlertingService,
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
    // Follow-up tracking
    FollowUpService,
    // Action item extraction
    ActionItemService,
    // Analytics
    AnalyticsService,
    // Unified Knowledge (P1.6)
    UnifiedKnowledgeService,
    // CRM Intelligence (P1.7)
    RelationshipIntelligenceService,
    CrmBackfillProcessor,
    ReconnectReminderProcessor,
    // Smart Scheduling (P2)
    CalendarConflictService,
    FocusTimeService,
    MeetingPrepService,
    // Document Library (P2.5)
    DocumentLibraryService,
    // Observability
    LlmTelemetryService,
    // Security guards (OWASP LLM Top 10 2025)
    PromptGuardService,
    PiiDetectionService,
    // Episodic Learning
    EpisodicMemoryService,
  ],
})
export class VoltAgentModule { }
