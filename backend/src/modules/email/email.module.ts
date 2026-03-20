import { Module, OnModuleInit, Inject, Logger } from '@nestjs/common';
import { EmailService } from './services/email.service';
import { EmailsService } from './services/emails.service';
import { EmailCrudService } from './services/email-crud.service';
import { EmailBulkService } from './services/email-bulk.service';
import { EmailSearchService } from './services/email-search.service';
import { EmailFetchService } from './services/email-fetch.service';
import { EmailRetentionService } from './services/email-retention.service';
import { EmailSendService } from './services/email-send.service';
import { EmailSyncBackService } from './services/email-sync-back.service';
import { GmailSyncBackService } from './services/gmail-sync-back.service';
import { MicrosoftSyncBackService } from './services/microsoft-sync-back.service';
import { ImapSyncBackService } from './services/imap-sync-back.service';
import { SyncBackOrchestratorService } from './services/sync-back-orchestrator.service';
import { EmailCleanupService } from './services/email-cleanup.service';
import { EmailFolderService } from './services/email-folder.service';
import { AttachmentOnDemandService } from './services/attachment-on-demand.service';
import { ScheduledEmailService } from './services/scheduled-email.service';
import { ProviderValidationService } from './services/provider-validation.service';
import { FolderLookupService } from './services/folder-lookup.service';
import { EmailSignatureService } from './services/email-signature.service';
import { EmailTemplateService } from './services/email-template.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProvidersModule } from '../providers/providers.module';
import { AiModule } from '../ai/ai.module';
import { EmailsController } from './controllers/emails.controller';
import { EmailQueryController } from './controllers/email-query.controller';
import { EmailCalendarInviteController } from './controllers/email-calendar-invite.controller';
import { EmailActionsController } from './controllers/email-actions.controller';
import { AttachmentsController } from './controllers/attachments.controller';
import { SignaturesController } from './controllers/signatures.controller';
import { TemplatesController } from './controllers/templates.controller';
import { EmailSyncModule } from '../email-sync/email-sync.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { CalendarModule } from '../calendar/calendar.module';
import { StorageModule } from './storage.module';
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../common/interfaces/tool-registry.interface';
import { EmailSearchTool } from './tools/email-search.tool';
import { EmailProviderEventHandlerService } from './services/provider-event-handler.service';

/**
 * EmailModule - Core email functionality with observability
 *
 * Services:
 * - AttachmentMetricsService: Centralized metrics for attachment operations (dedup, upload, download)
 * - AttachmentStorageService: S3 storage with SHA-256 content-addressable deduplication
 * - AttachmentOnDemandService: Lazy download from providers (Gmail, Microsoft, IMAP)
 * - EmailCleanupService: Retention policies with orphan S3 tracking
 *
 * Phase 32: Self-registers EmailSearchTool via ToolRegistryService OnModuleInit.
 *           Provides STORAGE_SERVICE for cross-module attachment access.
 *
 * @see docs/EMAIL_MODULE_ROADMAP.md for implementation details
 */
@Module({
  imports: [
    PrismaModule,
    StorageModule, // Shared STORAGE_SERVICE/StorageService providers
    ProvidersModule, // Phase 32: Direct import (circular broken -- ProvidersModule no longer imports EmailModule)
    AiModule, // Direct import: AiModule no longer imports EmailModule
    EmailSyncModule, // Phase 49-03: Direct import (forwardRef removed -- StorageModule @Global() breaks cycle)
    CalendarModule, // Phase 45-03: Direct import (forwardRef removed -- cycle broken at EmailSync edge)
    RealtimeModule,
    // ToolRegistryModule is @Global() -- no import needed
    // ScheduledJobsModule is @Global() -- no need to import, available everywhere
  ],
  providers: [
    // Core services
    EmailService,
    // Sub-services (must be registered BEFORE facade for DI ordering)
    EmailCrudService,
    EmailBulkService,
    EmailSearchService,
    // EmailsService is the facade, depends on sub-services
    EmailsService,
    EmailRetentionService,
    EmailFetchService,
    EmailSendService,
    // Phase 43: Sync-back sub-services (must be before facade for DI ordering)
    GmailSyncBackService,
    MicrosoftSyncBackService,
    ImapSyncBackService,
    SyncBackOrchestratorService,
    EmailSyncBackService,
    EmailCleanupService,
    ScheduledEmailService,
    // Phase 49-03: AttachmentStorageService + AttachmentMetricsService moved to @Global() StorageModule
    AttachmentOnDemandService,
    // ProviderTokenService removed — provided and exported by EmailSyncModule (forwardRef import)
    // Shared utility services (Phase 3 consolidation)
    ProviderValidationService,
    FolderLookupService,
    EmailFolderService,
    // Signature service
    EmailSignatureService,
    // Template service
    EmailTemplateService,
    // Phase 32: IAiTool wrapper for ToolRegistry self-registration
    EmailSearchTool,
    // Phase 32: Event handler for ProviderDisconnected (S3 attachment cleanup)
    EmailProviderEventHandlerService,
  ],
  // CRITICAL: Controllers with specific paths MUST be before EmailsController
  // because EmailsController has @Get(':id') which would catch /emails/signatures as /emails/:id
  // Order: specific-path controllers first, then query/calendar/actions, then core read (has :id catch-all) last
  controllers: [
    SignaturesController,
    TemplatesController,
    AttachmentsController,
    EmailQueryController,        // GET /emails (list), /emails/stats, /emails/search
    EmailCalendarInviteController, // GET/POST /emails/:id/calendar-invite/*, /emails/calendar-invite/*
    EmailActionsController,      // POST/PATCH/DELETE on sends, bulk ops, drafts, retention, attachments
    EmailsController,            // GET /emails/conversations, /emails/thread/:id, /emails/:id (catch-all LAST)
  ],
  exports: [
    EmailService,
    EmailsService,
    // Sub-services exported for direct use and testing
    EmailCrudService,
    EmailBulkService,
    EmailSearchService,
    EmailRetentionService,
    EmailFetchService,
    EmailSendService,
    EmailSyncBackService,
    EmailCleanupService,
    // Phase 49-03: AttachmentStorageService + AttachmentMetricsService now from @Global() StorageModule
    AttachmentOnDemandService,
    StorageModule, // Re-export StorageService + STORAGE_SERVICE
    ScheduledEmailService,
    // Shared utility services (Phase 3 consolidation)
    ProviderValidationService,
    FolderLookupService,
    EmailFolderService,
    // Signature service
    EmailSignatureService,
    // Template service
    EmailTemplateService,
  ],
})
export class EmailModule implements OnModuleInit {
  private readonly logger = new Logger(EmailModule.name);

  constructor(
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
    private readonly emailSearchTool: EmailSearchTool,
  ) {}

  onModuleInit() {
    this.toolRegistry.registerTool(this.emailSearchTool);
    this.logger.log('Registered EmailSearchTool with ToolRegistry');
  }
}
