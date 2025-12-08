import { Module, forwardRef } from '@nestjs/common';
import { CalendarController } from './controllers/calendar.controller';
import { CalendarWebhookController } from './controllers/calendar-webhook.controller';
import { CalendarService } from './services/calendar.service';
import { GoogleCalendarSyncService } from './services/google-calendar-sync.service';
import { MicrosoftCalendarSyncService } from './services/microsoft-calendar-sync.service';
import { GoogleCalendarWebhookService } from './services/google-calendar-webhook.service';
import { MicrosoftCalendarWebhookService } from './services/microsoft-calendar-webhook.service';
import { CalendarSyncQueueService } from './services/calendar-sync-queue.service';
import { CalendarSyncWorker } from './workers/calendar-sync.worker';
import { IcsParserService } from './services/ics-parser.service';
import { IcsGeneratorService } from './services/ics-generator.service';
import { CalendarProviderFactory } from './calendar-provider.factory';
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
    CalendarController,
    CalendarWebhookController,
  ],
  providers: [
    CalendarService,
    GoogleCalendarSyncService,
    MicrosoftCalendarSyncService,
    GoogleCalendarWebhookService,
    MicrosoftCalendarWebhookService,
    CalendarSyncQueueService,
    CalendarSyncWorker,
    IcsParserService,
    IcsGeneratorService,
    CalendarProviderFactory,
  ],
  exports: [
    CalendarService,
    GoogleCalendarSyncService,
    MicrosoftCalendarSyncService,
    GoogleCalendarWebhookService,
    MicrosoftCalendarWebhookService,
    CalendarSyncQueueService,
    IcsParserService,
    IcsGeneratorService,
    CalendarProviderFactory,
  ],
})
export class CalendarModule {}
