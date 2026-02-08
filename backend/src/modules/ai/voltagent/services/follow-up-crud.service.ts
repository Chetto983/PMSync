/** Follow-up CRUD Service - Data persistence operations (Phase 11-02). */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService } from '../../../../common/services/cache.service';
import { FollowUpStatus, FollowUpType, EmailFollowUp, Prisma } from '@prisma/client';
import type { FollowUpQueueService } from './follow-up-queue.service';
import type {
  ExtractedCommitment,
  ExtractedWaitingFor,
  ExtractedActionItem,
} from './follow-up-extraction.service';

export interface CreateFollowUpInput {
  tenantId: string; userId: string; emailId: string; reason?: string;
  dueDate?: Date; followUpType?: FollowUpType;
  commitments?: ExtractedCommitment[]; waitingFor?: ExtractedWaitingFor[];
  actionItems?: ExtractedActionItem[]; emailType?: string; confidence?: number;
  detectedDeadline?: Date; deadlineSource?: string;
}

export interface ListFollowUpsOptions {
  status?: FollowUpStatus | FollowUpStatus[]; type?: FollowUpType;
  limit?: number; offset?: number; orderBy?: 'dueDate' | 'createdAt'; orderDir?: 'asc' | 'desc';
}

export interface FollowUpStats {
  total: number; pending: number; reminded: number; resolved: number;
  expired: number; dueToday: number; overdue: number;
}

const FOLLOW_UP_SELECT = {
  id: true, tenantId: true, userId: true, emailId: true, status: true, followUpType: true,
  reason: true, dueDate: true, remindCount: true, lastRemindedAt: true, resolvedAt: true,
  resolvedBy: true, commitments: true, waitingFor: true, actionItems: true, emailType: true,
  confidence: true, detectedDeadline: true, deadlineSource: true, createdAt: true, updatedAt: true,
} as const;

const EMAIL_SELECT = { id: true, subject: true, from: true, to: true, receivedAt: true, sentAt: true, bodyText: true };
const FOLLOW_UP_WITH_EMAIL_SELECT = { ...FOLLOW_UP_SELECT, email: { select: EMAIL_SELECT } } as const;

@Injectable()
export class FollowUpCrudService {
  private readonly logger = new Logger(FollowUpCrudService.name);
  private readonly cacheKeyPrefix = 'follow-up';
  private readonly cacheTtl = 300; // 5 minutes

  private queueService?: FollowUpQueueService;
  private defaultDueDays = 3;

  constructor(private readonly prisma: PrismaService, private readonly cacheService: CacheService) {}

  setQueueService(queueService: FollowUpQueueService): void { this.queueService = queueService; }
  setDefaultDueDays(days: number): void { this.defaultDueDays = days; }

  async createFollowUp(input: CreateFollowUpInput): Promise<EmailFollowUp> {
    const {
      tenantId,
      userId,
      emailId,
      reason,
      dueDate,
      followUpType,
      commitments,
      waitingFor,
      actionItems,
      emailType,
      confidence,
      detectedDeadline,
      deadlineSource,
    } = input;

    const existing = await this.prisma.emailFollowUp.findFirst({
      where: {
        tenantId,
        userId,
        emailId,
        status: { in: ['PENDING', 'REMINDED'] },
      },
    });

    if (existing) {
      this.logger.debug(`Follow-up already exists for email ${emailId}`);
      return existing;
    }

    const finalDueDate = dueDate || this.getDefaultDueDate();

    const followUp = await this.prisma.emailFollowUp.create({
      data: {
        tenantId,
        userId,
        emailId,
        reason: reason ?? null,
        dueDate: finalDueDate,
        status: 'PENDING',
        followUpType: followUpType ?? FollowUpType.TODO,
        // Extraction data (persisted for VoltAgent access)
        commitments: commitments?.length ? (commitments as unknown as Prisma.InputJsonValue) : undefined,
        waitingFor: waitingFor?.length ? (waitingFor as unknown as Prisma.InputJsonValue) : undefined,
        actionItems: actionItems?.length ? (actionItems as unknown as Prisma.InputJsonValue) : undefined,
        emailType: emailType ?? undefined,
        confidence: confidence ?? undefined,
        // NLP deadline detection (Phase 04-02)
        detectedDeadline: detectedDeadline ?? undefined,
        deadlineSource: deadlineSource ?? undefined,
      },
    });

    // Schedule reminder via queue service
    if (this.queueService) {
      await this.queueService.scheduleReminder(followUp.id, finalDueDate, tenantId, userId);
    }

    await this.invalidateCache(tenantId, userId);

    this.logger.log(`Created follow-up ${followUp.id} for email ${emailId}`);

    return followUp;
  }

  async getFollowUp(tenantId: string, userId: string, id: string): Promise<EmailFollowUp | null> {
    return this.prisma.emailFollowUp.findFirst({
      where: { id, tenantId, userId },
      select: FOLLOW_UP_WITH_EMAIL_SELECT,
    });
  }

  async listFollowUps(
    tenantId: string,
    userId: string,
    options: ListFollowUpsOptions = {},
  ): Promise<EmailFollowUp[]> {
    const { status, type, limit = 50, offset = 0, orderBy = 'dueDate', orderDir = 'asc' } = options;

    const where: Record<string, unknown> = { tenantId, userId };
    if (status) {
      where.status = Array.isArray(status) ? { in: status } : status;
    }
    if (type) {
      where.followUpType = type;
    }

    return this.prisma.emailFollowUp.findMany({
      where,
      orderBy: { [orderBy]: orderDir },
      take: limit,
      skip: offset,
      select: FOLLOW_UP_WITH_EMAIL_SELECT,
    });
  }

  async getPendingFollowUps(tenantId: string, userId: string, limit = 20): Promise<EmailFollowUp[]> {
    const cacheKey = `${this.cacheKeyPrefix}:pending:${tenantId}:${userId}`;

    try {
      const cached = await this.cacheService.get<EmailFollowUp[]>(cacheKey);
      if (cached) {
        return cached.slice(0, limit);
      }
    } catch {
      // Cache miss
    }

    const followUps = await this.listFollowUps(tenantId, userId, {
      status: ['PENDING', 'REMINDED'],
      limit: Math.max(limit, 50),
      orderBy: 'dueDate',
      orderDir: 'asc',
    });

    try {
      await this.cacheService.set(cacheKey, followUps, { ttl: this.cacheTtl });
    } catch {
      // Ignore cache errors
    }

    return followUps.slice(0, limit);
  }

  async getOverdueFollowUps(tenantId: string, userId: string, limit = 20): Promise<EmailFollowUp[]> {
    return this.prisma.emailFollowUp.findMany({
      where: {
        tenantId,
        userId,
        status: { in: ['PENDING', 'REMINDED'] },
        dueDate: { lt: new Date() },
      },
      orderBy: { dueDate: 'asc' },
      take: limit,
      select: { ...FOLLOW_UP_SELECT, email: { select: { id: true, subject: true, from: true, to: true, receivedAt: true, sentAt: true } } },
    });
  }

  async getStats(tenantId: string, userId: string): Promise<FollowUpStats> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    const [total, pending, reminded, resolved, expired, dueToday, overdue] = await Promise.all([
      this.prisma.emailFollowUp.count({ where: { tenantId, userId } }),
      this.prisma.emailFollowUp.count({ where: { tenantId, userId, status: 'PENDING' } }),
      this.prisma.emailFollowUp.count({ where: { tenantId, userId, status: 'REMINDED' } }),
      this.prisma.emailFollowUp.count({ where: { tenantId, userId, status: 'RESOLVED' } }),
      this.prisma.emailFollowUp.count({ where: { tenantId, userId, status: 'EXPIRED' } }),
      this.prisma.emailFollowUp.count({
        where: {
          tenantId, userId,
          status: { in: ['PENDING', 'REMINDED'] },
          dueDate: { gte: startOfToday, lt: endOfToday },
        },
      }),
      this.prisma.emailFollowUp.count({
        where: {
          tenantId, userId,
          status: { in: ['PENDING', 'REMINDED'] },
          dueDate: { lt: now },
        },
      }),
    ]);

    return { total, pending, reminded, resolved, expired, dueToday, overdue };
  }

  async resolveFollowUp(
    tenantId: string,
    userId: string,
    id: string,
    resolvedBy: 'REPLY_RECEIVED' | 'MANUAL' | 'AUTO_EXPIRED' = 'MANUAL',
  ): Promise<EmailFollowUp> {
    const followUp = await this.prisma.emailFollowUp.findFirst({
      where: { id, tenantId, userId },
    });

    if (!followUp) {
      throw new Error('Follow-up not found');
    }

    await this.prisma.emailFollowUp.updateMany({
      where: { id, tenantId, userId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedBy,
      },
    });

    if (this.queueService) {
      await this.queueService.cancelReminder(id);
    }
    await this.invalidateCache(tenantId, userId);

    this.logger.log(`Resolved follow-up ${id} by ${resolvedBy}`);

    const updated = await this.prisma.emailFollowUp.findFirst({
      where: { id, tenantId, userId },
    });

    if (!updated) {
      throw new Error('Follow-up not found');
    }

    return updated;
  }

  async updateStatus(
    tenantId: string,
    userId: string,
    id: string,
    status: FollowUpStatus,
  ): Promise<EmailFollowUp> {
    if (status === 'RESOLVED') {
      return this.resolveFollowUp(tenantId, userId, id, 'MANUAL');
    }

    const followUp = await this.prisma.emailFollowUp.findFirst({
      where: { id, tenantId, userId },
    });

    if (!followUp) {
      throw new Error('Follow-up not found');
    }

    await this.prisma.emailFollowUp.updateMany({
      where: { id, tenantId, userId },
      data: { status },
    });

    if (this.queueService) {
      if (status === 'EXPIRED') await this.queueService.cancelReminder(id);
      else if (status === 'PENDING' && followUp.status !== 'PENDING') {
        await this.queueService.scheduleReminder(
          id,
          followUp.dueDate,
          tenantId,
          userId,
        );
      }
    }

    await this.invalidateCache(tenantId, userId);

    this.logger.log(`Updated follow-up ${id} status to ${status}`);

    const updated = await this.prisma.emailFollowUp.findFirst({
      where: { id, tenantId, userId },
    });

    if (!updated) {
      throw new Error('Follow-up not found after update');
    }

    return updated;
  }

  async snoozeFollowUp(tenantId: string, userId: string, id: string, newDueDate: Date): Promise<EmailFollowUp> {
    const followUp = await this.prisma.emailFollowUp.findFirst({
      where: { id, tenantId, userId },
    });

    if (!followUp) {
      throw new Error('Follow-up not found');
    }

    await this.prisma.emailFollowUp.updateMany({
      where: { id, tenantId, userId },
      data: {
        dueDate: newDueDate,
        status: 'PENDING',
        remindCount: 0,
      },
    });

    if (this.queueService) {
      await this.queueService.cancelReminder(id);
      await this.queueService.scheduleReminder(id, newDueDate, tenantId, userId);
    }
    await this.invalidateCache(tenantId, userId);

    this.logger.log(`Snoozed follow-up ${id} to ${newDueDate.toISOString()}`);

    const updated = await this.prisma.emailFollowUp.findFirst({
      where: { id, tenantId, userId },
    });

    if (!updated) {
      throw new Error('Follow-up not found');
    }

    return updated;
  }

  async updateForReminder(
    followUpId: string,
    tenantId: string,
    userId: string,
    update: { status: FollowUpStatus; resolvedBy?: string; resolvedAt?: Date } | { remindCount: { increment: number }; lastRemindedAt: Date; status: FollowUpStatus },
  ): Promise<void> {
    await this.prisma.emailFollowUp.updateMany({
      where: { id: followUpId, tenantId, userId },
      data: update as Prisma.EmailFollowUpUpdateManyMutationInput,
    });
    await this.invalidateCache(tenantId, userId);
  }

  async deleteFollowUp(tenantId: string, userId: string, id: string): Promise<void> {
    const followUp = await this.prisma.emailFollowUp.findFirst({
      where: { id, tenantId, userId },
    });

    if (!followUp) {
      throw new Error('Follow-up not found');
    }

    await this.prisma.emailFollowUp.deleteMany({
      where: { id, tenantId, userId },
    });

    if (this.queueService) {
      await this.queueService.cancelReminder(id);
    }
    await this.invalidateCache(tenantId, userId);

    this.logger.log(`Deleted follow-up ${id}`);
  }

  async checkForReplyByEmailId(tenantId: string, userId: string, originalEmailId: string): Promise<boolean> {
    const followUp = await this.prisma.emailFollowUp.findFirst({
      where: {
        tenantId,
        userId,
        emailId: originalEmailId,
        status: { in: ['PENDING', 'REMINDED'] },
      },
    });

    if (followUp) {
      await this.resolveFollowUp(tenantId, userId, followUp.id, 'REPLY_RECEIVED');
      return true;
    }

    return false;
  }

  async checkAndResolveReplyFollowUp(
    tenantId: string,
    userId: string,
    inReplyTo: string | null,
    references: string | null,
  ): Promise<boolean> {
    if (!inReplyTo && !references) {
      return false;
    }

    const messageIds: string[] = [];
    if (inReplyTo) messageIds.push(inReplyTo.trim());
    if (references) messageIds.push(...references.split(/\s+/).filter((r) => r.trim()));

    const originalEmail = await this.prisma.email.findFirst({
      where: {
        tenantId,
        messageId: { in: messageIds },
        folder: 'SENT',
      },
      select: { id: true },
    });

    if (!originalEmail) return false;
    return this.checkForReplyByEmailId(tenantId, userId, originalEmail.id);
  }

  private getDefaultDueDate(): Date {
    return new Date(Date.now() + this.defaultDueDays * 24 * 60 * 60 * 1000);
  }

  async invalidateCache(tenantId: string, userId: string): Promise<void> {
    try { await this.cacheService.del(`${this.cacheKeyPrefix}:pending:${tenantId}:${userId}`); } catch { /* ignore */ }
  }
}
