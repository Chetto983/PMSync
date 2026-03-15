import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TelegramBotService } from './services/telegram-bot.service';
import { TelegramSchedulerService } from './services/telegram-scheduler.service';
import { TelegramWebhookService } from './services/telegram-webhook.service';
import { ReminderEmailMonitorService } from './services/reminder-email-monitor.service';
import { TelegramWebhookController } from './controllers/telegram-webhook.controller';
import { TelegramSettingsController } from './controllers/telegram-settings.controller';

// ScheduledJobsModule is @Global() — no import needed
@Module({
  imports: [PrismaModule],
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
