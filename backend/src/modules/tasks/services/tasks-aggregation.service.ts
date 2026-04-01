/**
 * TasksAggregationService — queries all 5 task sources in parallel,
 * normalizes, merges, sorts, and paginates into a unified list.
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ManualTaskService } from './manual-task.service';
import {
  normalizeFollowUp,
  normalizeReminder,
  normalizeNBAAction,
  normalizeTicket,
  normalizeManualTask,
} from './normalizers';
import type { ListTasksQueryDto } from '../dto/list-tasks-query.dto';
import type {
  UnifiedTaskDto,
  UnifiedTaskListResponseDto,
  TaskSourceType,
} from '../dto/unified-task.dto';
import { TASK_SOURCE_TYPES } from '../dto/unified-task.dto';

// ---------------------------------------------------------------------------
// Priority weight for sorting
// ---------------------------------------------------------------------------
const PRIORITY_WEIGHT: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

@Injectable()
export class TasksAggregationService {
  private readonly logger = new Logger(TasksAggregationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly manualTaskService: ManualTaskService,
  ) {}

  // -------------------------------------------------------------------------
  // List (aggregate)
  // -------------------------------------------------------------------------

  async listTasks(
    tenantId: string,
    userId: string,
    query: ListTasksQueryDto,
  ): Promise<UnifiedTaskListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const statusFilter = query.status ?? ['pending', 'in_progress'];
    const sortBy = query.sortBy ?? 'dueDate';
    const sortOrder = query.sortOrder ?? 'asc';

    // Determine which sources to query
    const sources: Set<TaskSourceType> = query.sourceType
      ? new Set(query.sourceType)
      : new Set([...TASK_SOURCE_TYPES]);

    // Build parallel queries
    const queries: Promise<UnifiedTaskDto[]>[] = [];

    if (sources.has('follow_up')) {
      queries.push(this.queryFollowUps(tenantId, userId, statusFilter, query));
    }
    if (sources.has('reminder')) {
      queries.push(this.queryReminders(tenantId, userId, statusFilter, query));
    }
    if (sources.has('deal_action')) {
      queries.push(this.queryNBAActions(tenantId, statusFilter, query));
    }
    if (sources.has('ticket')) {
      queries.push(this.queryTickets(tenantId, userId, statusFilter, query));
    }
    if (sources.has('manual')) {
      queries.push(this.queryManualTasks(tenantId, userId, statusFilter, query));
    }

    const results = await Promise.all(queries);

    // Merge all normalized arrays
    let merged = results.flat();

    // Apply priority filter if set
    if (query.priority?.length) {
      merged = merged.filter((t) => query.priority!.includes(t.priority as never));
    }

    // Sort
    merged.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'dueDate') {
        const aVal = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bVal = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        cmp = aVal - bVal;
      } else if (sortBy === 'createdAt') {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortBy === 'priority') {
        cmp = (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0);
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    // Counts per sourceType (before pagination)
    const counts = {
      follow_up: 0,
      reminder: 0,
      deal_action: 0,
      ticket: 0,
      manual: 0,
    };
    for (const t of merged) {
      counts[t.sourceType]++;
    }

    // Paginate
    const start = (page - 1) * limit;
    const paged = merged.slice(start, start + limit);

    return {
      data: paged,
      meta: { total: merged.length, page, limit, counts },
    };
  }

  // -------------------------------------------------------------------------
  // Complete
  // -------------------------------------------------------------------------

  async completeTask(
    tenantId: string,
    userId: string,
    sourceType: TaskSourceType,
    sourceId: string,
  ): Promise<void> {
    switch (sourceType) {
      case 'follow_up': {
        const record = await this.prisma.emailFollowUp.findUnique({ where: { id: sourceId } });
        if (!record || record.tenantId !== tenantId) {
          throw new NotFoundException(`Follow-up ${sourceId} not found`);
        }
        await this.prisma.emailFollowUp.update({
          where: { id: sourceId },
          data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedBy: userId },
        });
        break;
      }
      case 'reminder': {
        const record = await this.prisma.reminder.findUnique({ where: { id: sourceId } });
        if (!record || record.tenantId !== tenantId) {
          throw new NotFoundException(`Reminder ${sourceId} not found`);
        }
        await this.prisma.reminder.update({
          where: { id: sourceId },
          data: { status: 'completato', completatoAt: new Date() },
        });
        break;
      }
      case 'deal_action': {
        const record = await this.prisma.nBAAction.findUnique({ where: { id: sourceId } });
        if (!record || record.tenantId !== tenantId) {
          throw new NotFoundException(`NBA action ${sourceId} not found`);
        }
        await this.prisma.nBAAction.update({
          where: { id: sourceId },
          data: { status: 'EXECUTED', executedAt: new Date() },
        });
        break;
      }
      case 'ticket': {
        const record = await this.prisma.ticket.findUnique({ where: { id: sourceId } });
        if (!record || record.tenantId !== tenantId) {
          throw new NotFoundException(`Ticket ${sourceId} not found`);
        }
        await this.prisma.ticket.update({
          where: { id: sourceId },
          data: { status: 'resolved', resolvedAt: new Date() },
        });
        break;
      }
      case 'manual': {
        await this.manualTaskService.update(tenantId, sourceId, { status: 'completed' });
        break;
      }
      default:
        throw new BadRequestException(`Unknown source type: ${sourceType}`);
    }
  }

  // -------------------------------------------------------------------------
  // Dismiss
  // -------------------------------------------------------------------------

  async dismissTask(
    tenantId: string,
    sourceType: TaskSourceType,
    sourceId: string,
  ): Promise<void> {
    switch (sourceType) {
      case 'deal_action': {
        const record = await this.prisma.nBAAction.findUnique({ where: { id: sourceId } });
        if (!record || record.tenantId !== tenantId) {
          throw new NotFoundException(`NBA action ${sourceId} not found`);
        }
        await this.prisma.nBAAction.update({
          where: { id: sourceId },
          data: { status: 'DISMISSED', dismissedAt: new Date() },
        });
        break;
      }
      case 'reminder': {
        const record = await this.prisma.reminder.findUnique({ where: { id: sourceId } });
        if (!record || record.tenantId !== tenantId) {
          throw new NotFoundException(`Reminder ${sourceId} not found`);
        }
        await this.prisma.reminder.update({
          where: { id: sourceId },
          data: { status: 'annullato' },
        });
        break;
      }
      default:
        throw new BadRequestException('This task type cannot be dismissed');
    }
  }

  // -------------------------------------------------------------------------
  // Private: source queries
  // -------------------------------------------------------------------------

  private async queryFollowUps(
    tenantId: string,
    userId: string,
    statusFilter: string[],
    query: ListTasksQueryDto,
  ): Promise<UnifiedTaskDto[]> {
    const records = await this.prisma.emailFollowUp.findMany({
      where: {
        tenantId,
        userId,
        status: { in: this.mapToFollowUpStatuses(statusFilter) as any },
        ...(query.dueBefore ? { dueDate: { lte: new Date(query.dueBefore) } } : {}),
        ...(query.dueAfter ? { dueDate: { gte: new Date(query.dueAfter) } } : {}),
      },
      include: { email: { select: { subject: true, from: true } } },
      take: 500,
    });
    return records.map((r) => normalizeFollowUp(r as Parameters<typeof normalizeFollowUp>[0]));
  }

  private async queryReminders(
    tenantId: string,
    userId: string,
    statusFilter: string[],
    query: ListTasksQueryDto,
  ): Promise<UnifiedTaskDto[]> {
    const records = await this.prisma.reminder.findMany({
      where: {
        tenantId,
        userId,
        status: { in: this.mapToReminderStatuses(statusFilter) as any },
        ...(query.dueBefore ? { scadenzaDatetime: { lte: new Date(query.dueBefore) } } : {}),
        ...(query.dueAfter ? { scadenzaDatetime: { gte: new Date(query.dueAfter) } } : {}),
        ...(query.contactId ? { contatto: { contains: query.contactId } } : {}),
      },
      take: 500,
    });
    return records.map(normalizeReminder);
  }

  private async queryNBAActions(
    tenantId: string,
    statusFilter: string[],
    query: ListTasksQueryDto,
  ): Promise<UnifiedTaskDto[]> {
    const records = await this.prisma.nBAAction.findMany({
      where: {
        tenantId,
        status: { in: this.mapToNBAStatuses(statusFilter) },
        ...(query.contactId ? { contactId: query.contactId } : {}),
      },
      include: { contact: { select: { firstName: true, lastName: true } } },
      take: 500,
    });
    return records.map(normalizeNBAAction);
  }

  private async queryTickets(
    tenantId: string,
    userId: string,
    statusFilter: string[],
    query: ListTasksQueryDto,
  ): Promise<UnifiedTaskDto[]> {
    const records = await this.prisma.ticket.findMany({
      where: {
        tenantId,
        assigneeId: userId,
        status: { in: this.mapToTicketStatuses(statusFilter) },
        ...(query.dueBefore ? { slaDeadline: { lte: new Date(query.dueBefore) } } : {}),
        ...(query.dueAfter ? { slaDeadline: { gte: new Date(query.dueAfter) } } : {}),
        ...(query.contactId ? { contactId: query.contactId } : {}),
      },
      include: { contact: { select: { firstName: true, lastName: true } } },
      take: 500,
    });
    return records.map(normalizeTicket);
  }

  private async queryManualTasks(
    tenantId: string,
    userId: string,
    statusFilter: string[],
    query: ListTasksQueryDto,
  ): Promise<UnifiedTaskDto[]> {
    const records = await this.manualTaskService.findAll(tenantId, userId, {
      status: statusFilter,
      priority: query.priority,
      dueBefore: query.dueBefore,
      dueAfter: query.dueAfter,
      contactId: query.contactId,
    });
    return records.map(normalizeManualTask);
  }

  // -------------------------------------------------------------------------
  // Private: status reverse-mappers
  // -------------------------------------------------------------------------

  private mapToFollowUpStatuses(unified: string[]): string[] {
    const map: Record<string, string[]> = {
      pending: ['PENDING', 'REMINDED'],
      completed: ['RESOLVED'],
      expired: ['EXPIRED'],
    };
    return unified.flatMap((s) => map[s] ?? []);
  }

  private mapToReminderStatuses(unified: string[]): string[] {
    const map: Record<string, string[]> = {
      pending: ['attivo', 'sospeso'],
      completed: ['completato'],
      dismissed: ['annullato'],
    };
    return unified.flatMap((s) => map[s] ?? []);
  }

  private mapToNBAStatuses(unified: string[]): string[] {
    const map: Record<string, string[]> = {
      pending: ['SUGGESTED'],
      in_progress: ['ACCEPTED'],
      completed: ['EXECUTED'],
      dismissed: ['DISMISSED'],
    };
    return unified.flatMap((s) => map[s] ?? []);
  }

  private mapToTicketStatuses(unified: string[]): string[] {
    const map: Record<string, string[]> = {
      pending: ['open', 'waiting'],
      in_progress: ['in_progress'],
      completed: ['resolved', 'closed'],
    };
    return unified.flatMap((s) => map[s] ?? []);
  }
}
