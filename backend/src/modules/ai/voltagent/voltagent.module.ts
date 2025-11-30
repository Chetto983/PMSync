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
  ],
  exports: [
    VoltAgentService,
    HitlService,
    FeedbackService,
    ActionExecutorService,
  ],
})
export class VoltAgentModule {}
