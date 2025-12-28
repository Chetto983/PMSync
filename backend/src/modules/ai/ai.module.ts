import { Module, forwardRef } from '@nestjs/common';
import { MistralService } from './services/mistral.service';
import { AiController } from './controllers/ai.controller';
import { AiHealthController } from './controllers/ai-health.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { EmbeddingsService } from './services/embeddings.service';
import { KnowledgeBaseService } from './services/knowledge-base.service';
import { KnowledgeBaseController } from './controllers/knowledge-base.controller';
import { PersonalizationController } from './controllers/personalization.controller';
import { EmailEmbeddingQueueService } from './services/email-embedding.queue';
import { EmailInsightsService } from './services/email-insights.service';
import { QueryEmbeddingCacheService } from './services/query-embedding-cache.service';
import { AttachmentContentExtractorService } from './services/attachment-content-extractor.service';
import { EmbeddingBackfillSchedulerService } from './services/embedding-backfill-scheduler.service';
import { FeedbackQueueService } from './services/feedback-queue.service';
import { EmailModule } from '../email/email.module';
import { AlertingService } from '../../common/services/alerting.service';
// VoltAgent module provides consolidated AI agent services
// DeadLetterQueueService is available globally from CacheModule
import { VoltAgentModule } from './voltagent/voltagent.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => EmailModule), // For StorageService (attachment downloads)
    // VoltAgent module exports: PersonalizationService, WritingStyleService, PromptRegistryService
    forwardRef(() => VoltAgentModule),
  ],
  providers: [
    // Core AI services (not in VoltAgent)
    MistralService,
    EmbeddingsService,
    KnowledgeBaseService,
    EmailEmbeddingQueueService,
    EmailInsightsService,
    QueryEmbeddingCacheService,
    AttachmentContentExtractorService,
    EmbeddingBackfillSchedulerService,
    FeedbackQueueService,
    AlertingService, // Required by EmailEmbeddingQueueService for critical failure alerts
  ],
  controllers: [AiController, AiHealthController, KnowledgeBaseController, PersonalizationController],
  exports: [
    // Core AI services
    MistralService,
    EmbeddingsService,
    KnowledgeBaseService,
    EmailEmbeddingQueueService,
    EmailInsightsService,
    QueryEmbeddingCacheService,
    AttachmentContentExtractorService,
    EmbeddingBackfillSchedulerService,
    FeedbackQueueService,
    // VoltAgent module (re-exports PersonalizationService, WritingStyleService, etc.)
    VoltAgentModule,
  ],
})
export class AiModule {}
