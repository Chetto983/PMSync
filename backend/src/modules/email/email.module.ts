import { Module, forwardRef, OnModuleInit, Inject, Logger } from '@nestjs/common';
import { EmailService } from './services/email.service';
import { EmailsService } from './services/emails.service';
import { EmailCrudService } from './services/email-crud.service';
import { EmailBulkService } from './services/email-bulk.service';
import { EmailSearchService } from './services/email-search.service';
import { EmailFetchService } from './services/email-fetch.service';
import { EmailRetentionService } from './services/email-retention.service';
import { EmailSendService } from './services/email-send.service';
import { EmailSyncBackService } from './services/email-sync-back.service';
import { EmailCleanupService } from './services/email-cleanup.service';
import { EmailFolderService } from './services/email-folder.service';
import { AttachmentStorageService } from './services/attachment.storage';
import { AttachmentOnDemandService } from './services/attachment-on-demand.service';
import { AttachmentMetricsService } from './services/attachment-metrics.service';
import { ScheduledEmailService } from './services/scheduled-email.service';
import { ProviderValidationService } from './services/provider-validation.service';
import { FolderLookupService } from './services/folder-lookup.service';
import { EmailSignatureService } from './services/email-signature.service';
import { EmailTemplateService } from './services/email-template.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProvidersModule } from '../providers/providers.module';
import { AiModule } from '../ai/ai.module';
import { EmailsController } from './controllers/emails.controller';
import { AttachmentsController } from './controllers/attachments.controller';
import { SignaturesController } from './controllers/signatures.controller';
import { TemplatesController } from './controllers/templates.controller';
import { EmailSyncModule } from '../email-sync/email-sync.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { StorageService } from './services/storage.service';
import { ProviderTokenService } from '../email-sync/services/provider-token.service';
import { CalendarModule } from '../calendar/calendar.module';
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../common/interfaces/tool-registry.interface';
import { STORAGE_SERVICE } from '../../common/interfaces/storage.interface';
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
    ProvidersModule, // Phase 32: Direct import (circular broken -- ProvidersModule no longer imports EmailModule)
    forwardRef(() => AiModule),
    forwardRef(() => EmailSyncModule),
    forwardRef(() => CalendarModule),
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
    EmailSyncBackService,
    EmailCleanupService,
    ScheduledEmailService,
    // Attachment services with observability
    AttachmentStorageService,
    AttachmentOnDemandService,
    AttachmentMetricsService, // Centralized metrics for attachments
    StorageService,
    ProviderTokenService,
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
    // Phase 32: STORAGE_SERVICE alias for cross-module access (Plan 03 AiModule decoupling)
    // Uses StorageService (S3 wrapper) -- Plan 03 will adapt as needed
    { provide: STORAGE_SERVICE, useExisting: StorageService },
  ],
  // CRITICAL: SignaturesController and TemplatesController MUST be before EmailsController
  // because EmailsController has @Get(':id') which would catch /emails/signatures as /emails/:id
  controllers: [SignaturesController, TemplatesController, AttachmentsController, EmailsController],
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
    AttachmentStorageService,
    AttachmentOnDemandService,
    AttachmentMetricsService, // Export for cross-module access
    StorageService,
    ScheduledEmailService,
    // Shared utility services (Phase 3 consolidation)
    ProviderValidationService,
    FolderLookupService,
    EmailFolderService,
    // Signature service
    EmailSignatureService,
    // Template service
    EmailTemplateService,
    // Phase 32: STORAGE_SERVICE for cross-module attachment access
    STORAGE_SERVICE,
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
