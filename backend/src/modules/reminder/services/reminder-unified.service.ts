/**
 * ReminderUnifiedService — Combines user-created Reminders and
 * AI-detected EmailFollowUps into a single sorted list.
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { FollowUpStatus, ReminderStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReminderService } from './reminder.service';
import {
  UnifiedReminderItem,
  UnifiedReminderListResponse,
  UnifiedReminderFilters,
  UnifiedSource,
  UnifiedStatus,
} from '../dto/unified-reminder.dto';

@Injectable()
export class ReminderUnifiedService {
  private readonly logger = new Logger(ReminderUnifiedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reminderService: ReminderService,
  ) {}

  /**
   * Fetch both Reminders and EmailFollowUps, map to unified format,
   * sort by deadline ascending, and paginate.
   */
  async listUnified(
    tenantId: string,
    userId: string,
    filters: UnifiedReminderFilters = {},
  ): Promise<UnifiedReminderListResponse> {
    const { source, page = 1, limit = 30 } = filters;

    const includeReminders = !source || source === 'user';
    const includeFollowUps = !source || source === 'ai-followup';

    // Fetch both in parallel
    const [reminders, followUps] = await Promise.all([
      includeReminders
        ? this.prisma.reminder.findMany({
            where: { tenantId, userId },
            orderBy: [{ scadenzaDatetime: 'asc' }, { createdAt: 'desc' }],
            take: 200, // cap per source
          })
        : Promise.resolve([]),
      includeFollowUps
        ? this.prisma.emailFollowUp.findMany({
            where: {
              tenantId,
              userId,
              status: { in: [FollowUpStatus.PENDING, FollowUpStatus.REMINDED] },
            },
            include: {
              email: {
                select: { id: true, subject: true, from: true },
              },
            },
            orderBy: { dueDate: 'asc' },
            take: 200,
          })
        : Promise.resolve([]),
    ]);

    // Map to unified format
    const unifiedReminders: UnifiedReminderItem[] = reminders.map((r) => ({
      id: r.id,
      source: 'user' as const,
      titolo: r.titolo,
      descrizione: r.descrizione,
      contatto: r.contatto,
      scadenzaDatetime: r.scadenzaDatetime?.toISOString() ?? null,
      priorita: r.priorita as 'alta' | 'media' | 'bassa',
      status: r.status as UnifiedStatus,
      azione: r.azione,
      condizioneTipo: r.condizioneTipo,
      monitoraEmail: r.monitoraEmail,
      telegramInviato: r.telegramInviato,
      isRecurring: r.isRecurring,
      recurrenceRule: r.recurrenceRule,
      emailSubject: null,
      emailFrom: null,
      emailId: null,
      followUpType: null,
      confidence: null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    const unifiedFollowUps: UnifiedReminderItem[] = followUps.map((f) => ({
      id: f.id,
      source: 'ai-followup' as const,
      titolo: (f as any).email?.subject || f.reason || 'Follow-up',
      descrizione: f.reason,
      contatto: (f as any).email?.from ?? null,
      scadenzaDatetime: f.dueDate.toISOString(),
      priorita: 'media' as const, // follow-ups don't have priority; default to media
      status: f.status.toLowerCase() as UnifiedStatus,
      azione: null,
      condizioneTipo: null,
      monitoraEmail: false,
      telegramInviato: false,
      isRecurring: false,
      recurrenceRule: null,
      emailSubject: (f as any).email?.subject ?? null,
      emailFrom: (f as any).email?.from ?? null,
      emailId: f.emailId,
      followUpType: f.followUpType,
      confidence: f.confidence,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    }));

    // Merge and sort by deadline ascending (nulls last)
    const all = [...unifiedReminders, ...unifiedFollowUps].sort((a, b) => {
      if (!a.scadenzaDatetime && !b.scadenzaDatetime) return 0;
      if (!a.scadenzaDatetime) return 1;
      if (!b.scadenzaDatetime) return -1;
      return new Date(a.scadenzaDatetime).getTime() - new Date(b.scadenzaDatetime).getTime();
    });

    // Paginate
    const total = all.length;
    const skip = (page - 1) * limit;
    const items = all.slice(skip, skip + limit);

    return {
      items,
      total,
      page,
      limit,
      counts: {
        user: unifiedReminders.length,
        aiFollowUp: unifiedFollowUps.length,
      },
    };
  }

  /**
   * Resolve a unified item — routes to the correct backend based on source.
   */
  async resolveUnified(tenantId: string, userId: string, id: string, source: UnifiedSource) {
    if (source === 'user') {
      return this.reminderService.completeReminder(tenantId, userId, id);
    }

    // Follow-up: mark as RESOLVED
    const result = await this.prisma.emailFollowUp.updateMany({
      where: { id, tenantId, userId, status: { in: [FollowUpStatus.PENDING, FollowUpStatus.REMINDED] } },
      data: { status: FollowUpStatus.RESOLVED, resolvedAt: new Date(), resolvedBy: userId },
    });

    if (result.count === 0) {
      throw new NotFoundException('Follow-up not found or already resolved');
    }

    return { success: true, resolved: true };
  }

  /**
   * Snooze a unified item — routes based on source.
   */
  async snoozeUnified(tenantId: string, userId: string, id: string, source: UnifiedSource, newDate: string) {
    const dueDate = new Date(newDate);
    if (isNaN(dueDate.getTime()) || dueDate.getTime() <= Date.now()) {
      throw new BadRequestException('dueDate must be a valid future date');
    }

    if (source === 'user') {
      // Snooze = update scadenzaDatetime
      return this.reminderService.updateReminder(tenantId, userId, id, {
        scadenzaDatetime: newDate,
      });
    }

    // Follow-up: snooze
    const result = await this.prisma.emailFollowUp.updateMany({
      where: {
        id,
        tenantId,
        userId,
        status: { in: [FollowUpStatus.PENDING, FollowUpStatus.REMINDED] },
      },
      data: { dueDate, status: FollowUpStatus.PENDING, remindCount: 0 },
    });

    if (result.count === 0) {
      throw new NotFoundException('Follow-up not found or already resolved');
    }

    return { success: true, dueDate: dueDate.toISOString() };
  }

  /**
   * Convert an EmailFollowUp into a user Reminder, then resolve the follow-up.
   */
  async convertFollowUpToReminder(tenantId: string, userId: string, followUpId: string) {
    // Load follow-up with email context
    const followUp = await this.prisma.emailFollowUp.findFirst({
      where: { id: followUpId, tenantId, userId },
      include: { email: { select: { subject: true, from: true } } },
    });

    if (!followUp) {
      throw new NotFoundException('Follow-up not found');
    }

    if (followUp.status === FollowUpStatus.RESOLVED) {
      throw new BadRequestException('Follow-up is already resolved');
    }

    // Create a Reminder from follow-up data
    const { reminder } = await this.reminderService.createReminder(tenantId, userId, {
      titolo: followUp.email?.subject || followUp.reason || 'Follow-up',
      descrizione: followUp.reason ?? undefined,
      contatto: followUp.email?.from ?? undefined,
      scadenzaDatetime: followUp.dueDate.toISOString(),
    });

    // Resolve the follow-up to prevent double notifications
    await this.prisma.emailFollowUp.update({
      where: { id: followUpId },
      data: { status: FollowUpStatus.RESOLVED, resolvedAt: new Date(), resolvedBy: userId },
    });

    this.logger.log(`Converted follow-up ${followUpId} to reminder ${reminder.id}`);

    return { reminder, resolvedFollowUpId: followUpId };
  }
}
