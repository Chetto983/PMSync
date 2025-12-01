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
 */
import { Module, forwardRef } from '@nestjs/common';
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
import { VoltAgentMemoryService, SessionBridgeService } from './memory';
// Consolidated AI services
import { PersonalizationService } from './services/personalization.service';
import { WritingStyleService } from './services/writing-style.service';
import { PromptRegistryService } from './prompts/prompt-registry.service';

@Module({
  imports: [
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
    // Consolidated AI services (Step 8)
    PersonalizationService,
    WritingStyleService,
    PromptRegistryService,
  ],
  exports: [
    VoltAgentService,
    HitlService,
    FeedbackService,
    ActionExecutorService,
    // Memory services
    VoltAgentMemoryService,
    SessionBridgeService,
    // Consolidated AI services
    PersonalizationService,
    WritingStyleService,
    PromptRegistryService,
  ],
})
export class VoltAgentModule {}
