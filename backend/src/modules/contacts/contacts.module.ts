import { Module, forwardRef } from '@nestjs/common';
import { ContactsController } from './controllers/contacts.controller';
import { ContactsWebhookController } from './controllers/contacts-webhook.controller';
import { ContactsService } from './services/contacts.service';
import { GoogleContactsSyncService } from './services/google-contacts-sync.service';
import { MicrosoftContactsSyncService } from './services/microsoft-contacts-sync.service';
import { GoogleContactsWebhookService } from './services/google-contacts-webhook.service';
import { MicrosoftContactsWebhookService } from './services/microsoft-contacts-webhook.service';
import { ContactsSyncQueueService } from './services/contacts-sync-queue.service';
import { ContactsSyncSchedulerService } from './services/contacts-sync-scheduler.service';
import { ContactsSyncWorker } from './workers/contacts-sync.worker';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProvidersModule } from '../providers/providers.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { EmailSyncModule } from '../email-sync/email-sync.module'; // Import for SyncAuthService

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => ProvidersModule),
    RealtimeModule, // WebSocket events
    EmailSyncModule, // Import for SyncAuthService (webhook authentication)
  ],
  controllers: [
    ContactsController,
    ContactsWebhookController,
  ],
  providers: [
    ContactsService,
    GoogleContactsSyncService,
    MicrosoftContactsSyncService,
    GoogleContactsWebhookService,
    MicrosoftContactsWebhookService,
    ContactsSyncQueueService, // Queue service for contacts sync
    ContactsSyncSchedulerService, // Scheduler for periodic sync
    ContactsSyncWorker, // Worker to process sync jobs
  ],
  exports: [
    ContactsService,
    GoogleContactsSyncService,
    MicrosoftContactsSyncService,
    GoogleContactsWebhookService,
    MicrosoftContactsWebhookService,
    ContactsSyncQueueService,
    ContactsSyncSchedulerService,
  ],
})
export class ContactsModule {}
