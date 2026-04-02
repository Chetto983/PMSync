import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiChatModule } from '../ai-chat/ai-chat.module';
import { AuditModule } from '../audit/audit.module';
import { TelegramSchedulerService } from './services/telegram-scheduler.service';
import { TelegramWebhookService } from './services/telegram-webhook.service';
import { ReminderEmailMonitorService } from './services/reminder-email-monitor.service';
import { TelegramWebhookController } from './controllers/telegram-webhook.controller';
import { TelegramSettingsController } from './controllers/telegram-settings.controller';

// TelegramCoreModule is @Global() — provides TelegramBotService, ReminderNotifyQueueService, REMINDER_NOTIFY_QUEUE
// ScheduledJobsModule is @Global() — no import needed
// AiChatModule: for relaying Telegram messages to the AI chat pipeline
// AuditModule: for HITL decision audit logging
@Module({
  imports: [PrismaModule, AiChatModule, AuditModule],
  controllers: [TelegramWebhookController, TelegramSettingsController],
  providers: [
    TelegramSchedulerService,
    TelegramWebhookService,
    ReminderEmailMonitorService,
  ],
  exports: [],
})
export class TelegramModule {}
