import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiChatModule } from '../ai-chat/ai-chat.module';
import { TelegramBotService } from './services/telegram-bot.service';
import { TelegramSchedulerService } from './services/telegram-scheduler.service';
import { TelegramWebhookService } from './services/telegram-webhook.service';
import { ReminderEmailMonitorService } from './services/reminder-email-monitor.service';
import { TelegramWebhookController } from './controllers/telegram-webhook.controller';
import { TelegramSettingsController } from './controllers/telegram-settings.controller';

// ScheduledJobsModule is @Global() — no import needed
// AiChatModule: for relaying Telegram messages to the AI chat pipeline
@Module({
  imports: [PrismaModule, AiChatModule],
  controllers: [TelegramWebhookController, TelegramSettingsController],
  providers: [
    TelegramBotService,
    TelegramSchedulerService,
    TelegramWebhookService,
    ReminderEmailMonitorService,
  ],
  exports: [TelegramBotService],
})
export class TelegramModule {}
