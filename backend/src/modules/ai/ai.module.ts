import { Module, forwardRef, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MistralService } from './services/mistral.service';
import { MistralEmbeddingService } from './services/mistral-embedding.service';
import { MistralRagService } from './services/mistral-rag.service';
import { AiController } from './controllers/ai.controller';
import { AiHealthController } from './controllers/ai-health.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { EmbeddingsService } from './services/embeddings.service';
import { KnowledgeBaseService } from './services/knowledge-base.service';
import { KnowledgeBaseController } from './controllers/knowledge-base.controller';
import { EmailEmbeddingQueueService } from './services/email-embedding.queue';
import { ContactEmbeddingQueueService } from './services/contact-embedding.queue';
import { EmailInsightsService } from './services/email-insights.service';
import { EmailTriageService } from './services/email-triage.service';
import { QueryEmbeddingCacheService } from './services/query-embedding-cache.service';
import { AttachmentContentExtractorService } from './services/attachment-content-extractor.service';
import { EmbeddingBackfillSchedulerService } from './services/embedding-backfill-scheduler.service';
import { TriageBackfillSchedulerService } from './services/triage-backfill-scheduler.service';
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
import { MistralOcrService } from './services/mistral-ocr.service';
import { IntentClassifierService } from './nlp';
// Phase 7: Extracted RAG sub-services (registered BEFORE KnowledgeBaseService facade)
import { EmbeddingComposerService } from './services/embedding-composer.service';
import { EmbeddingCrudService } from './services/embedding-crud.service';
import { EmbeddingSearchService } from './services/embedding-search.service';
import { EmbeddingBackfillService } from './services/embedding-backfill.service';
// PERF-03: Orphan embedding cleanup (null emailId AND null contactId)
import { OrphanEmbeddingCleanupService } from './services/orphan-embedding-cleanup.service';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => EmailModule), // For StorageService (attachment downloads)
    forwardRef(() => VoltAgentModule),
    SubscriptionModule, // P10: Provides UsageTrackingService for AI quota enforcement
  ],
  providers: [
    // Core AI services (not in VoltAgent)
    MistralEmbeddingService,
    MistralRagService,
    MistralService,
    EmbeddingsService,
    // Phase 7: Extracted RAG sub-services (must be before KnowledgeBaseService facade)
    EmbeddingComposerService,
    EmbeddingCrudService,
    EmbeddingSearchService,
    EmbeddingBackfillService,
    KnowledgeBaseService, // Facade - delegates to sub-services above
    EmailEmbeddingQueueService,
    ContactEmbeddingQueueService,
    EmailInsightsService,
    EmailTriageService, // Auto-triage new emails (Superhuman-like feature)
    QueryEmbeddingCacheService,
    AttachmentContentExtractorService,
    EmbeddingBackfillSchedulerService,
    TriageBackfillSchedulerService, // Recovers missed auto-triage emails
    AlertingService, // Required by EmailEmbeddingQueueService for critical failure alerts
    EmbeddingProviderService, // Unified embedding with caching + rate limiting
    BatchIndexingService, // Batch API for large-scale email indexing (1000+ emails)
    CachePrewarmingService, // Pre-warm query cache for common searches
    MistralAgentCleanupService, // GDPR: Delete Mistral agents on tenant deletion
    MistralOcrService, // On-demand OCR for attachment extraction (cost-saving)
    IntentClassifierService, // FastText-based intent classification (bilingual EN/IT)
    OrphanEmbeddingCleanupService, // PERF-03: Cleanup orphaned embeddings weekly
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
    TriageBackfillSchedulerService, // Recovers missed auto-triage emails
    EmbeddingProviderService, // Unified embedding with caching + rate limiting
    BatchIndexingService, // Batch API for large-scale email indexing
    MistralAgentCleanupService, // GDPR: Delete Mistral agents on tenant deletion
    MistralOcrService, // On-demand OCR for attachment extraction (cost-saving)
    IntentClassifierService, // FastText-based intent classification (bilingual EN/IT)
    OrphanEmbeddingCleanupService, // PERF-03: Cleanup orphaned embeddings weekly
    VoltAgentModule,
  ],
})
export class AiModule implements OnModuleInit {
  private readonly logger = new Logger(AiModule.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    // Validate MISTRAL_API_KEY at startup in production
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const mistralApiKey = this.configService.get<string>('MISTRAL_API_KEY');

    if (nodeEnv === 'production' && !mistralApiKey) {
      throw new Error(
        'MISTRAL_API_KEY is required in production. Set the environment variable to enable AI features.'
      );
    }

    if (!mistralApiKey) {
      this.logger.warn(
        'MISTRAL_API_KEY not configured - AI features will be limited or unavailable. ' +
        'Set MISTRAL_API_KEY environment variable to enable full functionality.'
      );
    } else {
      this.logger.log('MISTRAL_API_KEY configured successfully');
    }
  }
}
