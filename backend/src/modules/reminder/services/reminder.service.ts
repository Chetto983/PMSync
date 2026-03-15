/**
 * ReminderService — CRUD and business logic for user-initiated reminders.
 *
 * Handles creation (with optional AI parsing), listing, updating,
 * completing, and soft-deleting reminders. All queries are tenant-scoped.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, ReminderStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReminderAiParserService } from './reminder-ai-parser.service';
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
  ) {}

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

    return { reminder, rispostaChat };
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

    return this.prisma.reminder.update({
      where: { id },
      data,
    });
  }

  async completeReminder(tenantId: string, userId: string, id: string) {
    await this.getReminder(tenantId, userId, id);
    return this.prisma.reminder.update({
      where: { id },
      data: { status: 'completato', completatoAt: new Date() },
    });
  }

  async deleteReminder(tenantId: string, userId: string, id: string) {
    await this.getReminder(tenantId, userId, id);
    return this.prisma.reminder.update({
      where: { id },
      data: { status: 'annullato' },
    });
  }
}
