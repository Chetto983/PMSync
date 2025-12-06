import { Module, forwardRef } from '@nestjs/common';
import { EmailService } from './services/email.service';
import { EmailsService } from './services/emails.service';
import { EmailFetchService } from './services/email-fetch.service';
import { EmailRetentionService } from './services/email-retention.service';
import { EmailSendService } from './services/email-send.service';
import { EmailSyncBackService } from './services/email-sync-back.service';
import { EmailCleanupService } from './services/email-cleanup.service';
import { AttachmentStorageService } from './services/attachment.storage';
import { AttachmentOnDemandService } from './services/attachment-on-demand.service';
import { AttachmentMetricsService } from './services/attachment-metrics.service';
import { BatchProcessorService } from './services/batch-processor.service';
import { ScheduledEmailService } from './services/scheduled-email.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProvidersModule } from '../providers/providers.module';
import { AiModule } from '../ai/ai.module';
import { EmailsController } from './controllers/emails.controller';
import { AttachmentsController } from './controllers/attachments.controller';
import { EmailSyncModule } from '../email-sync/email-sync.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { StorageService } from './services/storage.service';
import { ProviderTokenService } from '../email-sync/services/provider-token.service';
import { CalendarModule } from '../calendar/calendar.module';

/**
 * EmailModule - Core email functionality with observability
 *
 * Services:
 * - AttachmentMetricsService: Centralized metrics for attachment operations (dedup, upload, download)
 * - AttachmentStorageService: S3 storage with SHA-256 content-addressable deduplication
 * - AttachmentOnDemandService: Lazy download from providers (Gmail, Microsoft, IMAP)
 * - EmailCleanupService: Retention policies with orphan S3 tracking
 *
 * @see EMAIL_MODULE_ROADMAP.md for implementation details
 */
@Module({
  imports: [
    PrismaModule,
    ProvidersModule,
    forwardRef(() => AiModule),
    forwardRef(() => EmailSyncModule),
    forwardRef(() => CalendarModule),
    RealtimeModule,
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
    BatchProcessorService, // Batch processing with concurrency control
    StorageService,
    ProviderTokenService,
  ],
  controllers: [EmailsController, AttachmentsController],
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
    BatchProcessorService, // Export for cross-module access
    StorageService,
    ScheduledEmailService,
  ],
})
export class EmailModule {}
