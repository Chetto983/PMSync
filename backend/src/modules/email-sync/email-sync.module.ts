import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProvidersModule } from '../providers/providers.module';
import { AiModule } from '../ai/ai.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RetryService } from '../../common/services/retry.service';
import { RedisRateLimiterService } from '../../common/services/redis-rate-limiter.service';
import { AlertingService } from '../../common/services/alerting.service';
import { PrismaRetryService } from '../../common/services/prisma-retry.service';

// Email Drivers (Phase 2 Driver Abstraction)
import { DriversModule } from './drivers/drivers.module';

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
import { FolderSyncQueryService } from './services/folder-sync-query.service';
// Phase 45-03: EmailEmbeddingCleanupService moved to AiModule (AI concern)
import { ProviderEventHandlerService } from './services/provider-event-handler.service';

// Gmail-specific services (pluggable adapters)
import { GmailAttachmentHandler } from './services/gmail/gmail-attachment-handler';
import { GmailFolderService } from './services/gmail/gmail-folder.service';

// Microsoft-specific services (pluggable adapters)
import { MicrosoftAttachmentHandler } from './services/microsoft/microsoft-attachment-handler';
import { MicrosoftFolderService } from './services/microsoft/microsoft-folder.service';

// IMAP-specific services (pluggable adapters)
import { ImapAttachmentHandler } from './services/imap/imap-attachment-handler';
import { ImapFolderSyncService } from './services/imap-folder-sync.service';

// Base sync extracted services (Phase 6)
import { SyncMessageProcessorService } from './services/sync-message-processor.service';
import { SyncOrchestrationService } from './services/sync-orchestration.service';
import { SyncTokenService } from './services/sync-token.service';

import { IcsParserService } from '../calendar/services/ics-parser.service';

// Webhook Services (Strategy 2: Real-time Sync)
import { GmailWebhookService } from './services/gmail-webhook.service';
import { MicrosoftWebhookService } from './services/microsoft-webhook.service';
import { WebhookLifecycleService } from './services/webhook-lifecycle.service';

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
    ProvidersModule, // Phase 32: Direct import (circular broken -- ProvidersModule no longer imports EmailSyncModule)
    AiModule, // SyncWorker needs EmailTriageService (no forwardRef -- AiModule doesn't import EmailSyncModule)
    RealtimeModule, // WebSocket events
    // Phase 49-03: StorageModule is @Global() -- provides AttachmentStorageService, StorageService without EmailModule import
    DriversModule, // Email Drivers (Phase 2)
    // ScheduledJobsModule is @Global() — no need to import, available everywhere
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

    // Base sync extracted services (Phase 6) - must be before sync services for DI ordering
    SyncTokenService,
    SyncMessageProcessorService,
    SyncOrchestrationService,

    // Sync services
    GoogleSyncService,
    MicrosoftSyncService,
    ImapSyncService,
    FolderSyncQueryService, // Must be before FolderSyncService for DI ordering
    FolderSyncService,
    // Phase 45-03: EmailEmbeddingCleanupService moved to AiModule

    // Phase 32: Event handler for ProviderConnected/ProviderDisconnected
    ProviderEventHandlerService,

    // Gmail-specific services (pluggable adapters)
    GmailAttachmentHandler,
    GmailFolderService,

    // Microsoft-specific services (pluggable adapters)
    MicrosoftAttachmentHandler,
    MicrosoftFolderService,

    // IMAP-specific services (pluggable adapters)
    ImapAttachmentHandler,
    ImapFolderSyncService,

    IcsParserService,

    // Webhook services (Strategy 2: Real-time)
    GmailWebhookService,
    MicrosoftWebhookService,
    WebhookLifecycleService,
    SyncAuthService,
    ProviderTokenService,
    RetryService,
    PrismaRetryService, // DEBT-02: Centralized P2002/P2034 retry handling
    RedisRateLimiterService, // Phase 8: RC-NEW-3 fix for distributed rate limiting
    AlertingService, // Phase 5.2: Centralized alerting thresholds

    // Workers
    SyncWorker,
    FolderOperationsWorker,
    EmailSendWorker,
    SyncBackWorker,
    BulkOperationsWorker,
  ],
  exports: [
    QueueService,
    FolderOperationsQueueService,
    EmailSendQueueService,
    ProviderSyncBackQueueService,
    BulkOperationsQueueService,
    SyncSchedulerService,
    FolderSyncQueryService, // Shared folder DB operations
    FolderSyncService,
    GmailWebhookService,
    MicrosoftWebhookService,
    WebhookLifecycleService,
    ProviderTokenService, // Export for use in calendar and contacts modules
    SyncAuthService,
    // Attachment handlers (for on-demand download in EmailModule)
    GmailAttachmentHandler,
    MicrosoftAttachmentHandler,
    // Provider folder services (Phase 4)
    ImapFolderSyncService,
    GmailFolderService,
    MicrosoftFolderService,
    // Email Drivers (Phase 2) - re-exported from DriversModule
    DriversModule,
    // Base sync extracted services (Phase 6)
    SyncMessageProcessorService,
    SyncOrchestrationService,
    SyncTokenService,
  ],
})
export class EmailSyncModule { }
