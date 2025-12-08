import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProvidersModule } from '../providers/providers.module';
import { EmailModule } from '../email/email.module';
import { AiModule } from '../ai/ai.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RetryService } from '../../common/services/retry.service';

// Services
import { QueueService } from './services/queue.service';
import { FolderOperationsQueueService } from './services/folder-operations-queue.service';
import { EmailSendQueueService } from './services/email-send-queue.service';
import { ProviderSyncBackQueueService } from './services/provider-sync-back-queue.service';
import { BulkOperationsQueueService } from './services/bulk-operations-queue.service';
import { SyncSchedulerService } from './services/sync-scheduler.service';
import { GoogleSyncService } from './services/gmail/google-sync.service';
import { MicrosoftSyncService } from './services/microsoft/microsoft-sync.service';
import { ImapSyncService } from './services/imap/imap-sync.service';
import { FolderSyncService } from './services/folder-sync.service';
import { EmailEmbeddingCleanupService } from './services/email-embedding-cleanup.service';

// Gmail-specific services (pluggable adapters)
import { GmailAttachmentHandler } from './services/gmail/gmail-attachment-handler';
import { GmailFolderService } from './services/gmail/gmail-folder.service';
import { GmailMessageParser } from './services/gmail/gmail-message-parser';
import { GmailBatchProcessor } from './services/gmail/gmail-batch-processor';

// Microsoft-specific services (pluggable adapters)
import { MicrosoftAttachmentHandler } from './services/microsoft/microsoft-attachment-handler';
import { MicrosoftFolderService } from './services/microsoft/microsoft-folder.service';
import { MicrosoftMessageParser } from './services/microsoft/microsoft-message-parser';
import { MicrosoftBatchProcessor } from './services/microsoft/microsoft-batch-processor';
import { IcsParserService } from '../calendar/services/ics-parser.service';

// Webhook Services (Strategy 2: Real-time Sync)
import { GmailWebhookService } from './services/gmail-webhook.service';
import { MicrosoftWebhookService } from './services/microsoft-webhook.service';
import { WebhookLifecycleService } from './services/webhook-lifecycle.service';

// Cross-Provider Sync Services
import { CrossProviderDedupService } from './services/cross-provider-dedup.service';
import { CrossProviderConflictService } from './services/cross-provider-conflict.service';
import { CrossProviderSyncService } from './services/cross-provider-sync.service';
import { SyncAuthService } from './services/sync-auth.service';
import { ProviderTokenService } from './services/provider-token.service';

// Workers
import { SyncWorker } from './workers/sync.worker';
import { FolderOperationsWorker } from './workers/folder-operations.worker';
import { EmailSendWorker } from './workers/email-send.worker';
import { SyncBackWorker } from './workers/sync-back.worker';
import { BulkOperationsWorker } from './workers/bulk-operations.worker';

// Controllers
import { EmailSyncController } from './email-sync.controller';
import { WebhookController } from './controllers/webhook.controller';
import { FoldersController } from '../email/controllers/folders.controller';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    PrismaModule,
    forwardRef(() => ProvidersModule), // For OAuth services and crypto
    forwardRef(() => EmailModule), // For AttachmentStorageService
    forwardRef(() => AiModule),
    RealtimeModule, // WebSocket events
  ],
  controllers: [
    EmailSyncController,
    WebhookController, // Real-time webhook endpoint
    FoldersController, // Folder CRUD with queue operations
  ],
  providers: [
    // Queue management
    QueueService,
    FolderOperationsQueueService,
    EmailSendQueueService,
    ProviderSyncBackQueueService,
    BulkOperationsQueueService,

    // Scheduler
    SyncSchedulerService,

    // Sync services
    GoogleSyncService,
    MicrosoftSyncService,
    ImapSyncService,
    FolderSyncService,
    EmailEmbeddingCleanupService,

    // Gmail-specific services (pluggable adapters)
    GmailAttachmentHandler,
    GmailFolderService,
    GmailMessageParser,
    GmailBatchProcessor,

    // Microsoft-specific services (pluggable adapters)
    MicrosoftAttachmentHandler,
    MicrosoftFolderService,
    MicrosoftMessageParser,
    MicrosoftBatchProcessor,
    IcsParserService,

    // Webhook services (Strategy 2: Real-time)
    GmailWebhookService,
    MicrosoftWebhookService,
    WebhookLifecycleService,
    SyncAuthService,
    ProviderTokenService,
    RetryService,

    // Cross-Provider Sync services
    CrossProviderDedupService,
    CrossProviderConflictService,
    CrossProviderSyncService,

    // Workers
    SyncWorker,
    FolderOperationsWorker,
    EmailSendWorker,
    SyncBackWorker,
  ],
  exports: [
    QueueService,
    FolderOperationsQueueService,
    EmailSendQueueService,
    ProviderSyncBackQueueService,
    BulkOperationsQueueService,
    SyncSchedulerService,
    FolderSyncService,
    GmailWebhookService,
    MicrosoftWebhookService,
    WebhookLifecycleService,
    CrossProviderSyncService,
    ProviderTokenService, // Export for use in calendar and contacts modules
    SyncAuthService,
    // Attachment handlers (for on-demand download in EmailModule)
    GmailAttachmentHandler,
    MicrosoftAttachmentHandler,
  ],
})
export class EmailSyncModule {}
