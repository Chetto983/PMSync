import { Module, forwardRef } from '@nestjs/common';
import { EmailService } from './services/email.service';
import { EmailsService } from './services/emails.service';
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
import { ScheduledJobsModule } from '../../common/services/scheduled-jobs.module';

/**
 * EmailModule - Core email functionality with observability
 *
 * Services:
 * - AttachmentMetricsService: Centralized metrics for attachment operations (dedup, upload, download)
 * - AttachmentStorageService: S3 storage with SHA-256 content-addressable deduplication
 * - AttachmentOnDemandService: Lazy download from providers (Gmail, Microsoft, IMAP)
 * - EmailCleanupService: Retention policies with orphan S3 tracking
 *
 * @see docs/EMAIL_MODULE_ROADMAP.md for implementation details
 */
@Module({
  imports: [
    PrismaModule,
    ProvidersModule,
    forwardRef(() => AiModule),
    forwardRef(() => EmailSyncModule),
    forwardRef(() => CalendarModule),
    RealtimeModule,
    ScheduledJobsModule, // For RedisLockService
  ],
  providers: [
    // Core services
    EmailService,
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
  ],
  // CRITICAL: SignaturesController and TemplatesController MUST be before EmailsController
  // because EmailsController has @Get(':id') which would catch /emails/signatures as /emails/:id
  controllers: [SignaturesController, TemplatesController, AttachmentsController, EmailsController],
  exports: [
    EmailService,
    EmailsService,
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
  ],
})
export class EmailModule { }
