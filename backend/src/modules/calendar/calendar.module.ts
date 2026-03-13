import { Module, OnModuleInit, Inject, Logger } from '@nestjs/common';
import { CalendarController } from './controllers/calendar.controller';
import { CalendarWebhookController } from './controllers/calendar-webhook.controller';
import { CalendarService } from './services/calendar.service';
import { CalendarListService } from './services/calendar-list.service';
import { CalendarEventsService } from './services/calendar-events.service';
import { GoogleCalendarSyncService } from './services/google-calendar-sync.service';
import { MicrosoftCalendarSyncService } from './services/microsoft-calendar-sync.service';
import { GoogleCalendarWebhookService } from './services/google-calendar-webhook.service';
import { MicrosoftCalendarWebhookService } from './services/microsoft-calendar-webhook.service';
import { CalendarWebhookAuthService } from './services/calendar-webhook-auth.service';
import { CalendarSyncQueueService } from './services/calendar-sync-queue.service';
import { CalendarSyncWorker } from './workers/calendar-sync.worker';
import { IcsParserService } from './services/ics-parser.service';
import { IcsGeneratorService } from './services/ics-generator.service';
import { CalendarConflictService } from './services/calendar-conflict.service';
import { FocusTimeService } from './services/focus-time.service';
import { MeetingPrepService } from './services/meeting-prep.service';
import { CalendarProviderFactory } from './calendar-provider.factory';
import { CalendarProviderEventHandlerService } from './services/provider-event-handler.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProvidersModule } from '../providers/providers.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { EmailSyncModule } from '../email-sync/email-sync.module'; // Import for SyncAuthService
import { AlertingService } from '../../common/services/alerting.service';
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../common/interfaces/tool-registry.interface';
import { CalendarTool } from './tools/calendar.tool';
// DeadLetterQueueService is available globally from CacheModule

/**
 * CalendarModule - Calendar functionality with provider sync.
 *
 * Phase 32: Self-registers CalendarTool via ToolRegistryService OnModuleInit.
 */
@Module({
  imports: [
    PrismaModule,
    ProvidersModule, // Phase 32: Direct import (circular broken -- ProvidersModule no longer imports CalendarModule)
    RealtimeModule, // WebSocket events
    EmailSyncModule, // Phase 49-03: Direct import (forwardRef removed -- StorageModule @Global() breaks cycle)
    // ToolRegistryModule is @Global() -- no import needed
  ],
  controllers: [
    CalendarController,
    CalendarWebhookController,
  ],
  providers: [
    CalendarService,
    CalendarListService,
    CalendarEventsService,
    GoogleCalendarSyncService,
    MicrosoftCalendarSyncService,
    GoogleCalendarWebhookService,
    MicrosoftCalendarWebhookService,
    CalendarWebhookAuthService,
    CalendarSyncQueueService,
    CalendarSyncWorker,
    IcsParserService,
    IcsGeneratorService,
    CalendarProviderFactory,
    CalendarConflictService, // Scheduling conflict detection
    FocusTimeService, // Focus time block suggestions
    MeetingPrepService, // Pre-meeting briefing assembly
    AlertingService, // Required by CalendarSyncWorker (DLQ is global from CacheModule)
    // Phase 32: IAiTool wrapper for ToolRegistry self-registration
    CalendarTool,
    // Phase 32: Event handler for ProviderConnected/ProviderDisconnected
    CalendarProviderEventHandlerService,
  ],
  exports: [
    CalendarService,
    CalendarListService,
    CalendarEventsService,
    GoogleCalendarSyncService,
    MicrosoftCalendarSyncService,
    GoogleCalendarWebhookService,
    MicrosoftCalendarWebhookService,
    CalendarWebhookAuthService,
    CalendarSyncQueueService,
    IcsParserService,
    IcsGeneratorService,
    CalendarProviderFactory,
    CalendarConflictService,
    FocusTimeService,
    MeetingPrepService,
  ],
})
export class CalendarModule implements OnModuleInit {
  private readonly logger = new Logger(CalendarModule.name);

  constructor(
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
    private readonly calendarTool: CalendarTool,
  ) {}

  onModuleInit() {
    this.toolRegistry.registerTool(this.calendarTool);
    this.logger.log('Registered CalendarTool with ToolRegistry');
  }
}
