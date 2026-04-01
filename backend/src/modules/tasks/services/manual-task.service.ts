/**
 * ManualTaskService — CRUD operations for user-created manual tasks.
 * All queries are tenant-scoped per CLAUDE.md multi-tenant rule.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ManualTask, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { CreateManualTaskDto } from '../dto/create-task.dto';
import type { UpdateManualTaskDto } from '../dto/update-task.dto';

export interface ManualTaskListFilters {
  status?: string[];
  priority?: string[];
  dueBefore?: string;
  dueAfter?: string;
  contactId?: string;
}

@Injectable()
export class ManualTaskService {
  private readonly logger = new Logger(ManualTaskService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a manual task for a specific user within a tenant.
   */
  async create(
    tenantId: string,
    userId: string,
    dto: CreateManualTaskDto,
  ): Promise<ManualTask> {
    return this.prisma.manualTask.create({
      data: {
        tenantId,
        userId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority ?? 'medium',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        contactId: dto.contactId,
        contactTenant: dto.contactId ? tenantId : null,
        dealId: dto.dealId,
        emailId: dto.emailId,
        emailTenant: dto.emailId ? tenantId : null,
      },
    });
  }

  /**
   * List manual tasks for a user with optional filters.
   * Includes contact relation for name display.
   */
  async findAll(
    tenantId: string,
    userId: string,
    filters: ManualTaskListFilters = {},
  ): Promise<(ManualTask & { contact: { firstName: string | null; lastName: string | null } | null })[]> {
    const where: Prisma.ManualTaskWhereInput = {
      tenantId,
      userId,
    };

    if (filters.status?.length) {
      where.status = { in: filters.status };
    }
    if (filters.priority?.length) {
      where.priority = { in: filters.priority };
    }
    if (filters.dueBefore || filters.dueAfter) {
      where.dueDate = {};
      if (filters.dueBefore) {
        where.dueDate.lte = new Date(filters.dueBefore);
      }
      if (filters.dueAfter) {
        where.dueDate.gte = new Date(filters.dueAfter);
      }
    }
    if (filters.contactId) {
      where.contactId = filters.contactId;
    }

    return this.prisma.manualTask.findMany({
      where,
      include: {
        contact: { select: { firstName: true, lastName: true } },
      },
      orderBy: [
        { dueDate: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * Find a single manual task by ID, ensuring tenant ownership.
   */
  async findOne(tenantId: string, id: string): Promise<ManualTask> {
    const task = await this.prisma.manualTask.findUnique({ where: { id } });

    if (!task || task.tenantId !== tenantId) {
      throw new NotFoundException(`ManualTask ${id} not found`);
    }

    return task;
  }

  /**
   * Update a manual task. Sets completedAt when status becomes 'completed'.
   */
  async update(
    tenantId: string,
    id: string,
    dto: UpdateManualTaskDto,
  ): Promise<ManualTask> {
    // Verify ownership first
    await this.findOne(tenantId, id);

    const data: Prisma.ManualTaskUncheckedUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    if (dto.contactId !== undefined) {
      data.contactId = dto.contactId;
      data.contactTenant = dto.contactId ? tenantId : null;
    }
    if (dto.dealId !== undefined) data.dealId = dto.dealId;
    if (dto.emailId !== undefined) {
      data.emailId = dto.emailId;
      data.emailTenant = dto.emailId ? tenantId : null;
    }

    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === 'completed') {
        data.completedAt = new Date();
      } else {
        data.completedAt = null;
      }
    }

    return this.prisma.manualTask.update({ where: { id }, data });
  }

  /**
   * Delete a manual task. Verifies tenant ownership before deletion.
   */
  async delete(tenantId: string, id: string): Promise<void> {
    await this.findOne(tenantId, id);
    await this.prisma.manualTask.delete({ where: { id } });
  }

  /**
   * Count manual tasks for a user, optionally filtered by status.
   */
  async count(
    tenantId: string,
    userId: string,
    statusFilter?: string[],
  ): Promise<number> {
    return this.prisma.manualTask.count({
      where: {
        tenantId,
        userId,
        ...(statusFilter?.length ? { status: { in: statusFilter } } : {}),
      },
    });
  }
}
