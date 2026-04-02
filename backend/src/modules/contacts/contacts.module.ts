import { Module, OnModuleInit, Inject, Logger } from '@nestjs/common';
import { ContactsController } from './controllers/contacts.controller';
import { ContactsWebhookController } from './controllers/contacts-webhook.controller';
import { ContactsService } from './services/contacts.service';
// Phase 43: Contacts sub-services (must be before facade for DI ordering)
import { ContactCrudService } from './services/contact-crud.service';
import { ContactProviderOpsService } from './services/contact-provider-ops.service';
import { ContactSyncService } from './services/contact-sync.service';
import { ContactsCacheService } from './services/contacts-cache.service';
import { ContactsImportService } from './services/contacts-import.service';
import { ContactDedupService } from './services/contact-dedup.service';
import { GoogleContactsSyncService } from './services/google-contacts-sync.service';
import { MicrosoftContactsSyncService } from './services/microsoft-contacts-sync.service';
import { GoogleContactsWebhookService } from './services/google-contacts-webhook.service';
import { MicrosoftContactsWebhookService } from './services/microsoft-contacts-webhook.service';
import { ContactsSyncQueueService } from './services/contacts-sync-queue.service';
import { ContactsSyncSchedulerService } from './services/contacts-sync-scheduler.service';
import { RelationshipScoreService } from './services/relationship-score.service';
import { ContactTimelineService } from './services/contact-timeline.service';
import { ContactsSyncWorker } from './workers/contacts-sync.worker';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProvidersModule } from '../providers/providers.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { EmailSyncModule } from '../email-sync/email-sync.module'; // Import for SyncAuthService
import { AiModule } from '../ai/ai.module';
import { AlertingService } from '../../common/services/alerting.service';
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../common/interfaces/tool-registry.interface';
import { ContactsTool } from './tools/contacts.tool';
import { ContactsProviderEventHandlerService } from './services/provider-event-handler.service';
// DeadLetterQueueService is available globally from CacheModule

/**
 * ContactsModule - Contacts management with provider sync.
 *
 * Phase 32: Self-registers ContactsTool via ToolRegistryService OnModuleInit.
 */
@Module({
  imports: [
    PrismaModule,
    ProvidersModule, // Phase 32: Direct import (circular broken -- ProvidersModule no longer imports ContactsModule)
    RealtimeModule, // WebSocket events
    EmailSyncModule, // Phase 32: Direct import for SyncAuthService (no circular -- EmailSyncModule doesn't import ContactsModule)
    // AI agent module refactored; CRM Relationship Intelligence rebuilt as RelationshipScoreService (Phase 26).
    AiModule, // Phase 32: Direct import for ContactEmbeddingQueueService (no circular -- AiModule doesn't import ContactsModule)
    // ToolRegistryModule is @Global() -- no import needed
  ],
  controllers: [
    ContactsController,
    ContactsWebhookController,
  ],
  providers: [
    // Phase 43: Contacts sub-services (must be before facade for DI ordering)
    ContactCrudService,
    ContactProviderOpsService,
    ContactSyncService,
    ContactsService, // Facade - delegates to sub-services above
    ContactsCacheService, // Redis caching and distributed locking
    ContactsImportService, // vCard and email extraction
    ContactDedupService, // Duplicate detection and contact merging (S09)
    GoogleContactsSyncService,
    MicrosoftContactsSyncService,
    GoogleContactsWebhookService,
    MicrosoftContactsWebhookService,
    ContactsSyncQueueService, // Queue service for contacts sync
    ContactsSyncSchedulerService, // Scheduler for periodic sync
    RelationshipScoreService, // CRM scoring: recency/frequency/reciprocity/trend
    ContactTimelineService, // Phase 141: Unified contact timeline aggregation
    ContactsSyncWorker, // Worker to process sync jobs (extends BaseWorker with DLQ/Alerting)
    AlertingService, // Required by ContactsSyncWorker for critical failure alerts
    // Phase 32: IAiTool wrapper for ToolRegistry self-registration
    ContactsTool,
    // Phase 32: Event handler for ProviderConnected/ProviderDisconnected
    ContactsProviderEventHandlerService,
  ],
  exports: [
    ContactsService,
    ContactsCacheService,
    ContactsImportService,
    ContactDedupService,
    GoogleContactsSyncService,
    MicrosoftContactsSyncService,
    GoogleContactsWebhookService,
    MicrosoftContactsWebhookService,
    ContactsSyncQueueService,
    ContactsSyncSchedulerService,
    RelationshipScoreService,
  ],
})
export class ContactsModule implements OnModuleInit {
  private readonly logger = new Logger(ContactsModule.name);

  constructor(
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
    private readonly contactsTool: ContactsTool,
  ) {}

  onModuleInit() {
    this.toolRegistry.registerTool(this.contactsTool);
    this.logger.log('Registered ContactsTool with ToolRegistry');
  }
}
