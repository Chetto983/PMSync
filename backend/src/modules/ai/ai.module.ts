import { Module, forwardRef } from '@nestjs/common';
import { MistralService } from './services/mistral.service';
import { AiController } from './controllers/ai.controller';
import { AiHealthController } from './controllers/ai-health.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { EmbeddingsService } from './services/embeddings.service';
import { KnowledgeBaseService } from './services/knowledge-base.service';
import { KnowledgeBaseController } from './controllers/knowledge-base.controller';
// PersonalizationController removed - AI refactor v2.0
import { EmailEmbeddingQueueService } from './services/email-embedding.queue';
import { ContactEmbeddingQueueService } from './services/contact-embedding.queue';
import { EmailInsightsService } from './services/email-insights.service';
import { EmailTriageService } from './services/email-triage.service';
import { QueryEmbeddingCacheService } from './services/query-embedding-cache.service';
import { AttachmentContentExtractorService } from './services/attachment-content-extractor.service';
import { EmbeddingBackfillSchedulerService } from './services/embedding-backfill-scheduler.service';
import { FeedbackQueueService } from './services/feedback-queue.service';
import { EmailModule } from '../email/email.module';
import { AlertingService } from '../../common/services/alerting.service';
// VoltAgent module provides consolidated AI agent services
// DeadLetterQueueService is available globally from CacheModule
import { VoltAgentModule } from './voltagent/voltagent.module';
// Unified embedding provider (consolidates caching, rate limiting, provider abstraction)
import { EmbeddingProviderService } from './services/embedding';
import { BatchIndexingService } from './services/batch-indexing.service';
import { CachePrewarmingService } from './services/cache-prewarming.service';
import { MistralAgentCleanupService } from './services/mistral-agent-cleanup.service';

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
    ContactEmbeddingQueueService,
    EmailInsightsService,
    EmailTriageService, // Auto-triage new emails (Superhuman-like feature)
    QueryEmbeddingCacheService,
    AttachmentContentExtractorService,
    EmbeddingBackfillSchedulerService,
    FeedbackQueueService,
    AlertingService, // Required by EmailEmbeddingQueueService for critical failure alerts
    EmbeddingProviderService, // Unified embedding with caching + rate limiting
    BatchIndexingService, // Batch API for large-scale email indexing (1000+ emails)
    CachePrewarmingService, // Pre-warm query cache for common searches
    MistralAgentCleanupService, // GDPR: Delete Mistral agents on tenant deletion
  ],
  controllers: [AiController, AiHealthController, KnowledgeBaseController],
  exports: [
    // Core AI services
    MistralService,
    EmbeddingsService,
    KnowledgeBaseService,
    EmailEmbeddingQueueService,
    ContactEmbeddingQueueService,
    EmailInsightsService,
    EmailTriageService, // Auto-triage new emails (Superhuman-like feature)
    QueryEmbeddingCacheService,
    AttachmentContentExtractorService,
    EmbeddingBackfillSchedulerService,
    FeedbackQueueService,
    EmbeddingProviderService, // Unified embedding with caching + rate limiting
    BatchIndexingService, // Batch API for large-scale email indexing
    MistralAgentCleanupService, // GDPR: Delete Mistral agents on tenant deletion
    // VoltAgent module (re-exports PersonalizationService, WritingStyleService, etc.)
    VoltAgentModule,
  ],
})
export class AiModule {}
