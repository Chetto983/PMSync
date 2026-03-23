import { Module, OnModuleInit, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MistralService } from './services/mistral.service';
import { MistralEmbeddingService } from './services/mistral-embedding.service';
import { MistralRagService } from './services/mistral-rag.service';
import { AiController } from './controllers/ai.controller';
import { AiHealthController } from './controllers/ai-health.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { EmbeddingsService } from './services/embeddings.service';
import { KnowledgeBaseService } from './services/knowledge-base.service';
import { KnowledgeBaseController } from './controllers/knowledge-base.controller';
import { EmailEmbeddingQueueService } from './services/email-embedding.queue';
import { ContactEmbeddingQueueService } from './services/contact-embedding.queue';
import { EmailInsightsService } from './services/email-insights.service';
// Phase 43: EmailInsights sub-services (must be before facade for DI ordering)
import { InsightUtilsService } from './services/insight-utils.service';
import { EmailAnalysisService } from './services/email-analysis.service';
import { EmailComposeService } from './services/email-compose.service';
import { EmailTriageService } from './services/email-triage.service';
import { QueryEmbeddingCacheService } from './services/query-embedding-cache.service';
import { AttachmentContentExtractorService } from './services/attachment-content-extractor.service';
import { EmbeddingBackfillSchedulerService } from './services/embedding-backfill-scheduler.service';
import { TriageBackfillSchedulerService } from './services/triage-backfill-scheduler.service';
import { ReminderSchedulerService } from './services/reminder-scheduler.service';
import { StorageModule } from '../email/storage.module';
import { AlertingService } from '../../common/services/alerting.service';
import { CachePrewarmingService } from './services/cache-prewarming.service';
import { MistralOcrService } from './services/mistral-ocr.service';
// Phase 7: Extracted RAG sub-services (registered BEFORE KnowledgeBaseService facade)
import { EmbeddingComposerService } from './services/embedding-composer.service';
import { EmbeddingCrudService } from './services/embedding-crud.service';
import { EmbeddingSearchService } from './services/embedding-search.service';
import { EmbeddingBackfillService } from './services/embedding-backfill.service';
// PERF-03: Orphan embedding cleanup (null emailId AND null contactId)
import { OrphanEmbeddingCleanupService } from './services/orphan-embedding-cleanup.service';
import { TriageLearningService } from './services/triage-learning.service';
import { TriageActionService } from './services/triage-action.service';
import { PromptGuardService } from './guards';
// Phase 26: Non-chat AI services (generateText + Output.object())
import { BriefingService } from './services/briefing.service';
import { FollowUpDetectionService } from './services/follow-up-detection.service';
import { DraftGenerationService } from './services/draft-generation.service';
// Phase 32: ToolRegistry self-registration
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../common/interfaces/tool-registry.interface';
// Phase 45: Interface tokens for embedding cycle-breaking
import {
  EMAIL_EMBEDDING_QUEUE,
  KNOWLEDGE_BASE,
} from '../../common/interfaces/embedding-queue.interface';
import { RagTool } from './tools/rag.tool';
import { AiProviderEventHandlerService } from './services/provider-event-handler.service';
// CRM: Relationship scoring (dependencies: PrismaService + HashSearchService — both from PrismaModule, no circular dep)
import { RelationshipScoreService } from '../contacts/services/relationship-score.service';
// Phase 45-03: Event handler for email.indexed (EmailSync -> AI decoupling)
import { EmailIndexedHandler } from './services/email-indexed.handler';
// Phase 45-03: Moved from EmailSyncModule (AI concern, not sync concern)
import { EmailEmbeddingCleanupService } from './services/email-embedding-cleanup.service';
// Phase 35: AI Run Ledger -- fire-and-forget telemetry for all AI calls
import { AiRunLedgerService } from './services/ai-run-ledger.service';
// Phase 35 Plan 02: AI Observability endpoints (runs query + cost summary)
import { AiObservabilityController } from './controllers/ai-observability.controller';
import { AiAnalyticsService } from './services/ai-analytics.service';
import { RealtimeModule } from '../realtime/realtime.module';

/**
 * AiModule - AI/ML services, embeddings, triage, and RAG.
 *
 * Phase 32: Self-registers RagTool via ToolRegistryService OnModuleInit.
 */
@Module({
  imports: [
    PrismaModule,
    StorageModule, // Provides STORAGE_SERVICE without pulling EmailModule into AI graph
    SubscriptionModule, // P10: Provides UsageTrackingService for AI quota enforcement
    ComplianceModule, // Phase 28: ConsentGuard + ConsentEnforcementService for @RequiresConsent
    RealtimeModule, // Phase 4: Socket.IO reminder events for follow-up notifications
    // ToolRegistryModule is @Global() -- no import needed
  ],
  providers: [
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
    // Phase 45: Token-to-class bindings for embedding cycle-breaking
    { provide: EMAIL_EMBEDDING_QUEUE, useExisting: EmailEmbeddingQueueService },
    { provide: KNOWLEDGE_BASE, useExisting: KnowledgeBaseService },
    // Phase 43: EmailInsights sub-services (must be before facade for DI ordering)
    InsightUtilsService,
    EmailAnalysisService,
    EmailComposeService,
    EmailInsightsService, // Facade - delegates to sub-services above
    EmailTriageService, // Auto-triage new emails (Superhuman-like feature)
    QueryEmbeddingCacheService,
    AttachmentContentExtractorService,
    EmbeddingBackfillSchedulerService,
    TriageBackfillSchedulerService, // Recovers missed auto-triage emails
    ReminderSchedulerService, // CONSOLIDATION: Follow-up due date notifications
    AlertingService, // Required by EmailEmbeddingQueueService for critical failure alerts
    CachePrewarmingService, // Pre-warm query cache for common searches
    MistralOcrService, // On-demand OCR for attachment extraction (cost-saving)
    OrphanEmbeddingCleanupService, // PERF-03: Cleanup orphaned embeddings weekly
    TriageLearningService, // TRIAGE-03: Implicit signal tracking + sender behavior scoring
    TriageActionService, // CONSOLIDATION: Triage → follow-up/reminder creation
    PromptGuardService, // Required by MistralService for prompt injection prevention
    // Phase 26: Non-chat AI services (generateText + Output.object())
    BriefingService,
    FollowUpDetectionService,
    DraftGenerationService,
    // Phase 32: IAiTool wrapper for ToolRegistry self-registration
    RagTool,
    // Phase 32: Event handler for ProviderDisconnected (embedding cleanup)
    AiProviderEventHandlerService,
    // Phase 35: AI Run Ledger telemetry
    AiRunLedgerService,
    // NeMo-inspired: Analytics aggregation over AiRunLedger
    AiAnalyticsService,
    // CRM: Relationship scoring for stale-contacts endpoint
    RelationshipScoreService,
    // Phase 45-03: Event handler for email.indexed (EmailSync -> AI decoupling)
    EmailIndexedHandler,
    // Phase 45-03: Moved from EmailSyncModule (AI concern, not sync concern)
    EmailEmbeddingCleanupService,
  ],
  controllers: [AiController, AiHealthController, KnowledgeBaseController, AiObservabilityController],
  exports: [
    // Core AI services
    MistralService,
    MistralEmbeddingService, // Used by AiChatModule (RagToolsService, HybridSearchService, MemoryService)
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
    MistralOcrService, // On-demand OCR for attachment extraction (cost-saving)
    OrphanEmbeddingCleanupService, // PERF-03: Cleanup orphaned embeddings weekly
    TriageLearningService, // TRIAGE-03: Implicit signal tracking + sender behavior scoring
    // Phase 26: Non-chat AI services
    BriefingService,
    FollowUpDetectionService,
    DraftGenerationService,
    // Phase 35: AI Run Ledger (exported for AiChatModule)
    AiRunLedgerService,
  ],
})
export class AiModule implements OnModuleInit {
  private readonly logger = new Logger(AiModule.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
    private readonly ragTool: RagTool,
  ) {}

  onModuleInit() {
    // Phase 32: Register RAG tool with ToolRegistry
    this.toolRegistry.registerTool(this.ragTool);
    this.logger.log('Registered RagTool with ToolRegistry');

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
