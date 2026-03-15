/**
 * TelegramSchedulerService — Slot-based Telegram digest sender.
 *
 * Registers three BullMQ cron handlers (mattina, pomeriggio, sera).
 * Each slot: find users with active Telegram → query matching reminders → send digest.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ReminderStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ScheduledJobsQueueService,
  ScheduledJobType,
} from '../../../common/services/scheduled-jobs.queue';
import { TelegramBotService } from './telegram-bot.service';

type SlotName = 'mattina' | 'pomeriggio' | 'sera';

@Injectable()
export class TelegramSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(TelegramSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduledJobsQueue: ScheduledJobsQueueService,
    private readonly telegramBot: TelegramBotService,
  ) {}

  onModuleInit() {
    if (!this.telegramBot.isEnabled) {
      this.logger.warn('Telegram bot not configured — scheduler handlers not registered');
      return;
    }

    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.TELEGRAM_SLOT_MATTINA,
      async () => this.processSlot('mattina'),
    );

    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.TELEGRAM_SLOT_POMERIGGIO,
      async () => this.processSlot('pomeriggio'),
    );

    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.TELEGRAM_SLOT_SERA,
      async () => this.processSlot('sera'),
    );

    this.logger.log('Telegram scheduler handlers registered (mattina, pomeriggio, sera)');
  }

  private async processSlot(slot: SlotName): Promise<void> {
    this.logger.log(`Processing Telegram slot: ${slot}`);

    // Find all users with active Telegram settings
    const telegramUsers = await this.prisma.telegramSettings.findMany({
      where: { isActive: true, telegramChatId: { not: null } },
      select: { userId: true, tenantId: true, telegramChatId: true },
    });

    if (!telegramUsers.length) {
      this.logger.debug(`No active Telegram users for slot ${slot}`);
      return;
    }

    for (const tgUser of telegramUsers) {
      try {
        await this.sendSlotDigestForUser(
          tgUser.tenantId,
          tgUser.userId,
          tgUser.telegramChatId!,
          slot,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to send ${slot} digest for user ${tgUser.userId}: ${msg}`,
        );
      }
    }
  }

  private async sendSlotDigestForUser(
    tenantId: string,
    userId: string,
    chatId: string,
    slot: SlotName,
  ): Promise<void> {
    // Query reminders matching this slot
    const reminders = await this.prisma.reminder.findMany({
      where: {
        tenantId,
        userId,
        status: ReminderStatus.attivo,
        OR: [
          { periodo: slot },
          { periodo: 'tutto_il_giorno' },
          // Include reminders with scadenzaDatetime today regardless of periodo
          {
            scadenzaDatetime: {
              gte: this.startOfDay(),
              lte: this.endOfDay(),
            },
            periodo: null,
          },
        ],
        // Exclude already sent reminders (for this slot cycle)
        telegramInviato: false,
      },
      orderBy: [{ priorita: 'asc' }, { scadenzaDatetime: 'asc' }],
      take: 20, // Cap per digest
    });

    if (!reminders.length) {
      this.logger.debug(`No reminders for user ${userId} slot ${slot}`);
      return;
    }

    const digestItems = reminders.map((r) => ({
      id: r.id,
      titolo: r.titolo,
      contatto: r.contatto,
      azione: r.azione,
      scadenzaDatetime: r.scadenzaDatetime,
      condizioneTipo: r.condizioneTipo,
      condizioneDettaglio: r.condizioneDettaglio,
      monitoraEmail: r.monitoraEmail,
    }));

    const sent = await this.telegramBot.sendDigest(chatId, slot, digestItems);

    if (sent) {
      // Mark reminders as sent
      const reminderIds = reminders.map((r) => r.id);
      await this.prisma.reminder.updateMany({
        where: { id: { in: reminderIds } },
        data: { telegramInviato: true, telegramInviatoAt: new Date() },
      });

      // Log the digest
      await this.prisma.telegramLog.create({
        data: {
          tenantId,
          userId,
          reminderIds,
          slot,
          messaggioCompleto: `Digest ${slot}: ${reminderIds.length} reminders`,
          inviatoAt: new Date(),
        },
      });

      this.logger.log(
        `Sent ${slot} digest to user ${userId}: ${reminderIds.length} reminders`,
      );
    } else {
      // Log error
      await this.prisma.telegramLog.create({
        data: {
          tenantId,
          userId,
          reminderIds: reminders.map((r) => r.id),
          slot,
          messaggioCompleto: `Failed to send ${slot} digest`,
          isError: true,
          errorMessage: 'Telegram API send failed',
        },
      });
    }
  }

  private startOfDay(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private endOfDay(): Date {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }
}
