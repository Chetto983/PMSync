/**
 * ReminderService — CRUD and business logic for user-initiated reminders.
 *
 * Handles creation (with optional AI parsing), listing, updating,
 * completing, and soft-deleting reminders. All queries are tenant-scoped.
 */
import { Injectable, Inject, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma, ReminderStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReminderAiParserService } from './reminder-ai-parser.service';
import { REMINDER_NOTIFY_QUEUE, type IReminderNotifyQueue } from '../../../common/interfaces/reminder-notify.interface';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { CreateReminderDto } from '../dto/create-reminder.dto';
import { UpdateReminderDto } from '../dto/update-reminder.dto';

export interface ReminderListFilters {
  status?: ReminderStatus;
  priorita?: string;
  periodo?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiParser: ReminderAiParserService,
    private readonly realtimeEvents: RealtimeEventsService,
    @Optional() @Inject(REMINDER_NOTIFY_QUEUE) private readonly reminderNotifyQueue?: IReminderNotifyQueue,
  ) {
    // Startup diagnostic: verify queue injection from @Global() TelegramCoreModule
    if (this.reminderNotifyQueue) {
      this.logger.log('✅ ReminderNotifyQueue injected successfully');
    } else {
      this.logger.warn('⚠️ ReminderNotifyQueue NOT injected — Telegram notifications will be skipped');
    }
  }

  /**
   * Create a reminder. If `inputUtente` is provided, runs AI parsing first.
   * Returns the created reminder plus `rispostaChat` from the AI parser.
   */
  async createReminder(
    tenantId: string,
    userId: string,
    dto: CreateReminderDto,
  ) {
    let rispostaChat: string | null = null;
    let aiRawResponse: Prisma.InputJsonValue | null = null;

    // AI parsing mode: extract structured fields from natural language
    if (dto.inputUtente) {
      const parsed = await this.aiParser.parse(dto.inputUtente, tenantId, userId);
      aiRawResponse = parsed as unknown as Prisma.InputJsonValue;
      rispostaChat = parsed.risposta_chat;

      // If AI parser crashed (model timeout, bad JSON, etc.) — distinct from classification
      const parserError = (parsed as any)._parserError;
      if (parserError) {
        const errorMsg = (parsed as any)._errorMessage || 'unknown';
        this.logger.error(`AI parser failed for reminder input: "${dto.inputUtente}" — ${errorMsg}`);
        return {
          reminder: { id: '', titolo: 'Promemoria', scadenzaDatetime: null, condizioneTipo: 'sempre', monitoraEmail: false, messaggioTelegram: null } as any,
          rispostaChat: 'Si è verificato un errore tecnico nella creazione del promemoria. Riprova tra qualche istante.',
          failed: true,
          failReason: 'parser_error' as const,
        };
      }

      // If AI classified the input as not a reminder
      if (!parsed.is_reminder) {
        this.logger.warn(`AI parser did not recognize input as reminder: "${dto.inputUtente}"`);
        return {
          reminder: { id: '', titolo: 'Promemoria', scadenzaDatetime: null, condizioneTipo: 'sempre', monitoraEmail: false, messaggioTelegram: null } as any,
          rispostaChat: parsed.risposta_chat || 'Non sono riuscito a interpretare la richiesta.',
          failed: true,
          failReason: 'not_a_reminder' as const,
        };
      }

      // Merge AI-parsed fields with explicit DTO fields (DTO takes precedence)
      if (!dto.titolo && parsed.titolo) dto.titolo = parsed.titolo;
      if (!dto.descrizione && parsed.descrizione) dto.descrizione = parsed.descrizione;
      if (!dto.contatto && parsed.contatto) dto.contatto = parsed.contatto;
      if (!dto.scadenzaDatetime && parsed.scadenza_datetime) {
        dto.scadenzaDatetime = parsed.scadenza_datetime;
      }
      if (!dto.periodo && parsed.periodo) {
        dto.periodo = parsed.periodo as CreateReminderDto['periodo'];
      }
      if (!dto.azione && parsed.azione) {
        dto.azione = parsed.azione as CreateReminderDto['azione'];
      }
      if (!dto.priorita && parsed.priorita) {
        dto.priorita = parsed.priorita as CreateReminderDto['priorita'];
      }
      if (!dto.condizioneTipo && parsed.condizione_tipo) {
        dto.condizioneTipo = parsed.condizione_tipo as CreateReminderDto['condizioneTipo'];
      }
      if (!dto.condizioneDettaglio && parsed.condizione_dettaglio) {
        dto.condizioneDettaglio = parsed.condizione_dettaglio;
      }
      if (dto.monitoraEmail === undefined) {
        dto.monitoraEmail = parsed.monitora_email;
      }
      if (!dto.emailKeywords?.length && parsed.email_keywords?.length) {
        dto.emailKeywords = parsed.email_keywords;
      }
      if (!dto.emailMittente && parsed.email_mittente) {
        dto.emailMittente = parsed.email_mittente;
      }
      if (!dto.messaggioTelegram && parsed.messaggio_telegram) {
        dto.messaggioTelegram = parsed.messaggio_telegram;
      }
    }

    // Ensure titolo is set
    const titolo = dto.titolo || 'Promemoria';

    const reminder = await this.prisma.reminder.create({
      data: {
        tenantId,
        userId,
        titolo,
        descrizione: dto.descrizione ?? null,
        contatto: dto.contatto ?? null,
        scadenzaTesto: dto.inputUtente ?? null,
        scadenzaDatetime: dto.scadenzaDatetime ? new Date(dto.scadenzaDatetime) : null,
        periodo: dto.periodo ?? null,
        azione: dto.azione ?? 'altro',
        priorita: dto.priorita ?? 'media',
        condizioneTipo: dto.condizioneTipo ?? 'sempre',
        condizioneDettaglio: dto.condizioneDettaglio ?? null,
        monitoraEmail: dto.monitoraEmail ?? false,
        emailKeywords: dto.emailKeywords ?? [],
        emailMittente: dto.emailMittente ?? null,
        messaggioTelegram: dto.messaggioTelegram ?? null,
        inputUtente: dto.inputUtente ?? null,
        aiRawResponse: aiRawResponse ?? undefined,
      },
    });

    this.logger.log(`Created reminder ${reminder.id} for user ${userId} in tenant ${tenantId}`);

    // Schedule Telegram notification at exact scadenzaDatetime
    if (reminder.scadenzaDatetime && this.reminderNotifyQueue) {
      try {
        await this.reminderNotifyQueue.scheduleNotification(
          reminder.id,
          reminder.scadenzaDatetime,
        );
        await this.prisma.reminder.update({
          where: { id: reminder.id },
          data: { notificationScheduled: true },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Failed to schedule notification for reminder ${reminder.id}: ${msg}`,
        );
      }
    }

    return { reminder, rispostaChat, failed: false as const };
  }

  async listReminders(tenantId: string, userId: string, filters: ReminderListFilters = {}) {
    const { status, priorita, periodo, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.ReminderWhereInput = { tenantId, userId };
    if (status) where.status = status;
    if (priorita) where.priorita = priorita as unknown as Prisma.ReminderWhereInput['priorita'];
    if (periodo) where.periodo = periodo as unknown as Prisma.ReminderWhereInput['periodo'];

    const [reminders, total] = await Promise.all([
      this.prisma.reminder.findMany({
        where,
        orderBy: [{ scadenzaDatetime: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.reminder.count({ where }),
    ]);

    return { reminders, total, page, limit };
  }

  async getReminder(tenantId: string, userId: string, id: string) {
    const reminder = await this.prisma.reminder.findFirst({
      where: { id, tenantId, userId },
    });
    if (!reminder) throw new NotFoundException('Reminder not found');
    return reminder;
  }

  async updateReminder(tenantId: string, userId: string, id: string, dto: UpdateReminderDto) {
    // Verify ownership
    await this.getReminder(tenantId, userId, id);

    const data: Prisma.ReminderUpdateInput = {};
    if (dto.titolo !== undefined) data.titolo = dto.titolo;
    if (dto.descrizione !== undefined) data.descrizione = dto.descrizione;
    if (dto.contatto !== undefined) data.contatto = dto.contatto;
    if (dto.scadenzaDatetime !== undefined) {
      data.scadenzaDatetime = new Date(dto.scadenzaDatetime);
    }
    if (dto.periodo !== undefined) data.periodo = dto.periodo;
    if (dto.azione !== undefined) data.azione = dto.azione;
    if (dto.priorita !== undefined) data.priorita = dto.priorita;
    if (dto.condizioneTipo !== undefined) data.condizioneTipo = dto.condizioneTipo;
    if (dto.condizioneDettaglio !== undefined) data.condizioneDettaglio = dto.condizioneDettaglio;
    if (dto.monitoraEmail !== undefined) data.monitoraEmail = dto.monitoraEmail;
    if (dto.emailKeywords !== undefined) data.emailKeywords = dto.emailKeywords;
    if (dto.emailMittente !== undefined) data.emailMittente = dto.emailMittente;
    if (dto.messaggioTelegram !== undefined) data.messaggioTelegram = dto.messaggioTelegram;
    if (dto.status !== undefined) data.status = dto.status;

    const updated = await this.prisma.reminder.update({
      where: { id },
      data,
    });

    // Reschedule notification if scadenzaDatetime changed
    if (dto.scadenzaDatetime !== undefined && this.reminderNotifyQueue) {
      try {
        if (updated.scadenzaDatetime) {
          await this.reminderNotifyQueue.scheduleNotification(id, updated.scadenzaDatetime);
          await this.prisma.reminder.update({
            where: { id },
            data: { notificationScheduled: true },
          });
        } else {
          await this.reminderNotifyQueue.cancelNotification(id);
          await this.prisma.reminder.update({
            where: { id },
            data: { notificationScheduled: false },
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to reschedule notification for reminder ${id}: ${msg}`);
      }
    }

    // Cancel notification if status changed to non-active
    if (dto.status && dto.status !== 'attivo' && this.reminderNotifyQueue) {
      await this.reminderNotifyQueue.cancelNotification(id);
    }

    return updated;
  }

  async completeReminder(tenantId: string, userId: string, id: string) {
    const reminder = await this.getReminder(tenantId, userId, id);
    if (this.reminderNotifyQueue) {
      await this.reminderNotifyQueue.cancelNotification(id);
    }
    const updated = await this.prisma.reminder.update({
      where: { id },
      data: { status: 'completato', completatoAt: new Date() },
    });

    this.realtimeEvents.emitReminderCompleted(tenantId, {
      reminderId: id,
      titolo: reminder.titolo,
      contatto: reminder.contatto,
      scadenzaDatetime: reminder.scadenzaDatetime?.toISOString() ?? '',
      tenantId,
      userId,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  async deleteReminder(tenantId: string, userId: string, id: string) {
    await this.getReminder(tenantId, userId, id);
    if (this.reminderNotifyQueue) {
      await this.reminderNotifyQueue.cancelNotification(id);
    }
    return this.prisma.reminder.delete({
      where: { id },
    });
  }

  async bulkDeleteReminders(tenantId: string, userId: string, ids: string[]) {
    // Cancel all pending notifications
    if (this.reminderNotifyQueue) {
      await Promise.all(
        ids.map((id) => this.reminderNotifyQueue!.cancelNotification(id)),
      );
    }
    const result = await this.prisma.reminder.deleteMany({
      where: { id: { in: ids }, tenantId, userId },
    });
    this.logger.log(`Bulk-deleted ${result.count} reminders for user ${userId}`);
    return { deleted: result.count };
  }
}
