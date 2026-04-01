import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiChatModule } from '../ai-chat/ai-chat.module';
import { AuditModule } from '../audit/audit.module';
import { TelegramBotService } from './services/telegram-bot.service';
import { TelegramSchedulerService } from './services/telegram-scheduler.service';
import { TelegramWebhookService } from './services/telegram-webhook.service';
import { ReminderEmailMonitorService } from './services/reminder-email-monitor.service';
import { ReminderNotifyQueueService } from './services/reminder-notify.queue';
import { REMINDER_NOTIFY_QUEUE } from '../../common/interfaces/reminder-notify.interface';
import { TelegramWebhookController } from './controllers/telegram-webhook.controller';
import { TelegramSettingsController } from './controllers/telegram-settings.controller';

// ScheduledJobsModule is @Global() — no import needed
// AiChatModule: for relaying Telegram messages to the AI chat pipeline
// AuditModule: for HITL decision audit logging
@Module({
  imports: [PrismaModule, AiChatModule, AuditModule],
  controllers: [TelegramWebhookController, TelegramSettingsController],
  providers: [
    TelegramBotService,
    ReminderNotifyQueueService,
    { provide: REMINDER_NOTIFY_QUEUE, useExisting: ReminderNotifyQueueService },
    TelegramSchedulerService,
    TelegramWebhookService,
    ReminderEmailMonitorService,
  ],
  exports: [TelegramBotService, ReminderNotifyQueueService, REMINDER_NOTIFY_QUEUE],
})
export class TelegramModule {}
