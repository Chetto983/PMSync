/**
 * TelegramCoreModule — @Global() module providing TelegramBotService
 * and ReminderNotifyQueueService (+ REMINDER_NOTIFY_QUEUE token).
 *
 * Extracted from TelegramModule to break the circular dependency:
 *   ReminderModule -> TelegramModule -> AiChatModule -> ReminderModule
 *
 * TelegramBotService only depends on ConfigService + PrismaService (both global).
 * ReminderNotifyQueueService depends on PrismaService, TelegramBotService, RealtimeEventsService (all global).
 * No circular imports.
 */
import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TelegramBotService } from './services/telegram-bot.service';
import { ReminderNotifyQueueService } from './services/reminder-notify.queue';
import { REMINDER_NOTIFY_QUEUE } from '../../common/interfaces/reminder-notify.interface';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    TelegramBotService,
    ReminderNotifyQueueService,
    { provide: REMINDER_NOTIFY_QUEUE, useExisting: ReminderNotifyQueueService },
  ],
  exports: [TelegramBotService, ReminderNotifyQueueService, REMINDER_NOTIFY_QUEUE],
})
export class TelegramCoreModule {}
