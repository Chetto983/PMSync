import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { emailLabelsInclude } from '../../../common/utils';
import { EmailsService } from '../../email/services/emails.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import {
  AddEmailsToLabelDto,
  CreateLabelDto,
  ReorderLabelsDto,
  UpdateLabelDto,
} from '../dto/labels.dto';

@Injectable()
export class LabelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailsService: EmailsService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async findAllByTenant(tenantId: string) {
    return this.prisma.userLabel.findMany({
      where: { tenantId, isArchived: false },
      include: {
        children: {
          where: { isArchived: false },
          orderBy: { orderIndex: 'asc' },
        },
        _count: { select: { emailLabels: true } },
      },
      orderBy: [{ parentId: 'asc' }, { orderIndex: 'asc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const label = await this.prisma.userLabel.findUnique({
      where: { id },
      include: {
        children: {
          where: { isArchived: false },
          orderBy: { orderIndex: 'asc' },
        },
        _count: { select: { emailLabels: true } },
      },
    });

    if (!label || label.tenantId !== tenantId) {
      throw new NotFoundException('Label not found');
    }

    return label;
  }

  async create(tenantId: string, dto: CreateLabelDto) {
    const slug = this.generateSlug(dto.name);

    const existing = await this.prisma.userLabel.findUnique({
      where: { tenantId_slug: { tenantId, slug } },
    });
    if (existing) {
      throw new ConflictException('A label with this name already exists');
    }

    let level = 0;
    if (dto.parentId) {
      const parent = await this.prisma.userLabel.findUnique({ where: { id: dto.parentId } });
      if (!parent || parent.tenantId !== tenantId) {
        throw new NotFoundException('Parent label not found');
      }
      level = parent.level + 1;
    }

    const maxOrder = await this.prisma.userLabel.aggregate({
      where: { tenantId, parentId: dto.parentId ?? null },
      _max: { orderIndex: true },
    });

    const newLabel = await this.prisma.userLabel.create({
      data: {
        tenantId,
        name: dto.name,
        slug,
        color: dto.color
          ? ({ ...dto.color } as Prisma.InputJsonValue)
          : undefined,
        icon: dto.icon,
        aiPrompt: dto.aiPrompt ?? null,
        parentId: dto.parentId ?? null,
        level,
        orderIndex: (maxOrder._max.orderIndex ?? -1) + 1,
        type: 'USER',
      },
      include: {
        children: {
          where: { isArchived: false },
          orderBy: { orderIndex: 'asc' },
        },
        _count: { select: { emailLabels: true } },
      },
    });

    // Emit WebSocket event for new label
    this.realtimeEvents.emitLabelNew(tenantId, {
      labelId: newLabel.id,
      reason: 'label-created',
      label: newLabel as any,
      timestamp: new Date().toISOString(),
    });

    return newLabel;
  }

  async update(tenantId: string, id: string, dto: UpdateLabelDto) {
    const currentLabel = await this.prisma.userLabel.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        slug: true,
        parentId: true,
        level: true,
        orderIndex: true,
      },
    });
    if (!currentLabel || currentLabel.tenantId !== tenantId) {
      throw new NotFoundException('Label not found');
    }

    const tenantLabels = await this.prisma.userLabel.findMany({
      where: { tenantId, isArchived: false },
      select: {
        id: true,
        parentId: true,
        level: true,
        orderIndex: true,
      },
      orderBy: [{ parentId: 'asc' }, { orderIndex: 'asc' }],
    });

    const data: Prisma.UserLabelUncheckedUpdateInput = {};
    let nextParentId = currentLabel.parentId;
    let nextLevel = currentLabel.level;

    if (dto.name) {
      const slug = this.generateSlug(dto.name);
      const existing = await this.prisma.userLabel.findFirst({
        where: {
          tenantId,
          slug,
          id: { not: id },
        },
      });
      if (existing) {
        throw new ConflictException('A label with this name already exists');
      }
      data.name = dto.name;
      data.slug = slug;
    }

    if (dto.color !== undefined) {
      data.color =
        dto.color === null
          ? Prisma.JsonNull
          : (dto.color as Prisma.InputJsonValue);
    }
    if (dto.icon !== undefined) {
      data.icon = dto.icon;
    }
    if (dto.aiPrompt !== undefined) {
      data.aiPrompt = dto.aiPrompt;
    }

    if (dto.parentId !== undefined) {
      if (dto.parentId === null) {
        nextParentId = null;
        nextLevel = 0;
      } else {
        const parent = await this.prisma.userLabel.findUnique({ where: { id: dto.parentId } });
        if (!parent || parent.tenantId !== tenantId) {
          throw new NotFoundException('Parent label not found');
        }
        if (await this.wouldCreateCircularReference(id, dto.parentId)) {
          throw new ConflictException('Cannot create circular label hierarchy');
        }
        nextParentId = dto.parentId;
        nextLevel = parent.level + 1;
      }
    }

    const shouldReorder =
      dto.orderIndex !== undefined || nextParentId !== currentLabel.parentId;

    if (!shouldReorder) {
      const updatedLabel = await this.prisma.userLabel.update({
        where: { id },
        data,
        include: {
          children: {
            where: { isArchived: false },
            orderBy: { orderIndex: 'asc' },
          },
          _count: { select: { emailLabels: true } },
        },
      });

      // Emit WebSocket event for updated label
      this.realtimeEvents.emitLabelUpdate(tenantId, {
        labelId: updatedLabel.id,
        reason: 'label-updated',
        label: updatedLabel as any,
        updates: dto as any,
        timestamp: new Date().toISOString(),
      });

      return updatedLabel;
    }

    const sourceParentId = currentLabel.parentId;
    const targetSiblings = tenantLabels
      .filter((label) => label.parentId === nextParentId && label.id !== id)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const desiredIndex =
      dto.orderIndex !== undefined
        ? dto.orderIndex
        : sourceParentId === nextParentId
          ? currentLabel.orderIndex
          : targetSiblings.length;
    const clampedIndex = Math.max(0, Math.min(desiredIndex, targetSiblings.length));
    const targetOrderIds = [...targetSiblings.map((label) => label.id)];
    targetOrderIds.splice(clampedIndex, 0, id);

    const sourceSiblings =
      sourceParentId !== nextParentId
        ? tenantLabels
            .filter((label) => label.parentId === sourceParentId && label.id !== id)
            .sort((a, b) => a.orderIndex - b.orderIndex)
        : [];

    const levelDelta = nextLevel - currentLabel.level;
    const descendants =
      levelDelta === 0
        ? []
        : this.getDescendantLabels(tenantLabels, id);

    const updatedLabel = await this.prisma.$transaction(async (tx) => {
      if (sourceSiblings.length > 0) {
        await Promise.all(
          sourceSiblings.map((label, index) =>
            tx.userLabel.update({
              where: { id: label.id },
              data: { orderIndex: index },
            }),
          ),
        );
      }

      await Promise.all(
        targetOrderIds.map((labelId, index) =>
          tx.userLabel.update({
            where: { id: labelId },
            data:
              labelId === id
                ? {
                    ...data,
                    parentId: nextParentId,
                    level: nextLevel,
                    orderIndex: index,
                  }
                : { orderIndex: index },
          }),
        ),
      );

      if (descendants.length > 0) {
        await Promise.all(
          descendants.map((label) =>
            tx.userLabel.update({
              where: { id: label.id },
              data: { level: label.level + levelDelta },
            }),
          ),
        );
      }

      return tx.userLabel.findUnique({
        where: { id },
        include: {
          children: {
            where: { isArchived: false },
            orderBy: { orderIndex: 'asc' },
          },
          _count: { select: { emailLabels: true } },
        },
      });
    });
    if (!updatedLabel) {
      throw new NotFoundException('Label not found');
    }

    // Emit WebSocket event for updated label
    this.realtimeEvents.emitLabelUpdate(tenantId, {
      labelId: updatedLabel.id,
      reason: 'label-updated',
      label: updatedLabel as any,
      updates: dto as any,
      timestamp: new Date().toISOString(),
    });

    return updatedLabel;
  }

  async delete(tenantId: string, id: string) {
    const label = await this.findOne(tenantId, id);

    // Append timestamp to slug to free it up for future labels
    const deletedSlug = `${label.slug}-deleted-${Date.now()}`;

    await this.prisma.userLabel.update({
      where: { id },
      data: {
        isArchived: true,
        slug: deletedSlug,
      },
    });

    // Cascade soft-delete to all descendants
    await this.archiveDescendants(tenantId, id);

    // Emit WebSocket event for deleted label
    this.realtimeEvents.emitLabelDelete(tenantId, {
      labelId: id,
      reason: 'label-deleted',
      label: label as any,
      timestamp: new Date().toISOString(),
    });
  }

  async addEmailsToLabel(tenantId: string, labelId: string, dto: AddEmailsToLabelDto) {
    await this.findOne(tenantId, labelId);

    if (!dto.emailIds?.length) {
      throw new BadRequestException('emailIds array cannot be empty');
    }

    const uniqueIds = [...new Set(dto.emailIds)];
    const validEmails = await this.prisma.email.findMany({
      where: {
        tenantId,
        id: { in: uniqueIds },
      },
      select: { id: true },
    });

    if (validEmails.length === 0) {
      return { count: 0, emails: [] };
    }

    await this.prisma.emailLabel.createMany({
      data: validEmails.map((email) => ({
        tenantId,
        emailId: email.id,
        labelId,
      })),
      skipDuplicates: true,
    });

    // Get updated emails with emailLabels relationship
    // FIX: Use Prisma directly instead of emailsService to ensure correct data retrieval
    const updatedEmails = await this.prisma.email.findMany({
      where: {
        id: { in: uniqueIds },
        tenantId,
      },
      include: {
        provider: {
          select: {
            id: true,
            email: true,
            providerType: true,
          },
        },
        ...emailLabelsInclude,
      },
    });

    updatedEmails.forEach((email) => {
      this.realtimeEvents.emitEmailUpdate(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        reason: 'labels-updated',
        email: email, // Include complete email object with labels
      });
    });

    this.realtimeEvents.emitLabelUpdate(tenantId, {
      labelId,
      reason: 'label-updated',
      timestamp: new Date().toISOString(),
    });

    return { count: validEmails.length, emails: updatedEmails };
  }

  async removeEmailFromLabel(tenantId: string, labelId: string, emailId: string) {
    await this.findOne(tenantId, labelId);

    const ownsEmail = await this.prisma.email.count({
      where: { id: emailId, tenantId },
    });
    if (!ownsEmail) {
      throw new NotFoundException('Email not found');
    }

    await this.prisma.emailLabel.deleteMany({
      where: { labelId, emailId },
    });

    // Get updated email with emailLabels relationship
    // FIX: Use Prisma directly instead of emailsService to ensure correct data retrieval
    // CITUS: Use findFirst instead of findUnique since we need tenantId filter
    const updatedEmail = await this.prisma.email.findFirst({
      where: {
        id: emailId,
        tenantId,
      },
      include: {
        provider: {
          select: {
            id: true,
            email: true,
            providerType: true,
          },
        },
        ...emailLabelsInclude,
      },
    });

    // Emit realtime event
    if (updatedEmail && updatedEmail.tenantId === tenantId) {
      this.realtimeEvents.emitEmailUpdate(tenantId, {
        emailId: updatedEmail.id,
        providerId: updatedEmail.providerId,
        folder: updatedEmail.folder,
        reason: 'labels-updated',
        email: updatedEmail as any, // Include complete email object with labels
      });
    }

    this.realtimeEvents.emitLabelUpdate(tenantId, {
      labelId,
      reason: 'label-updated',
      timestamp: new Date().toISOString(),
    });

    return updatedEmail || null;
  }

  async getEmailsForLabel(tenantId: string, labelId: string) {
    await this.findOne(tenantId, labelId);

    return this.prisma.email.findMany({
      where: {
        tenantId,
        emailLabels: { some: { labelId } },
      },
      orderBy: { receivedAt: 'desc' },
      select: {
        id: true,
        subject: true,
        from: true,
        receivedAt: true,
        snippet: true,
        isRead: true,
      },
    });
  }

  async reorder(tenantId: string, dto: ReorderLabelsDto) {
    if (!dto.labelIds?.length) {
      throw new BadRequestException('labelIds array cannot be empty');
    }

    const tenantLabels = await this.prisma.userLabel.findMany({
      where: { tenantId, id: { in: dto.labelIds } },
      select: { id: true },
    });
    const allowedIds = new Set(tenantLabels.map((label) => label.id));

    const updates: Prisma.PrismaPromise<Prisma.BatchPayload>[] = [];
    dto.labelIds.forEach((id, index) => {
      if (allowedIds.has(id)) {
        updates.push(
          this.prisma.userLabel.updateMany({
            where: { id, tenantId },
            data: { orderIndex: index },
          }),
        );
      }
    });

    if (updates.length === 0) {
      throw new NotFoundException('No matching labels found for tenant');
    }

    await this.prisma.$transaction(updates);
  }

  /**
   * Recursively soft-delete all descendant labels of a given parent.
   * Prisma cascade does not fire on soft-delete (update), so we do it manually.
   */
  private async archiveDescendants(
    tenantId: string,
    parentId: string,
  ): Promise<void> {
    const children = await this.prisma.userLabel.findMany({
      where: { tenantId, parentId, isArchived: false },
      select: { id: true, slug: true },
    });

    for (const child of children) {
      await this.prisma.userLabel.update({
        where: { id: child.id },
        data: {
          isArchived: true,
          slug: `${child.slug}-deleted-${Date.now()}`,
        },
      });
      await this.archiveDescendants(tenantId, child.id);
    }
  }

  private generateSlug(name: string) {
    const base = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return base || `label-${Date.now()}`;
  }

  private getDescendantLabels(
    labels: Array<{ id: string; parentId: string | null; level: number }>,
    parentId: string,
  ) {
    const descendants: Array<{ id: string; parentId: string | null; level: number }> = [];
    const queue = [parentId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (const label of labels) {
        if (label.parentId === currentId) {
          descendants.push(label);
          queue.push(label.id);
        }
      }
    }

    return descendants;
  }

  private async wouldCreateCircularReference(labelId: string, newParentId: string) {
    if (labelId === newParentId) {
      return true;
    }

    let currentParentId: string | null | undefined = newParentId;
    while (currentParentId) {
      if (currentParentId === labelId) {
        return true;
      }
      const parent: { parentId: string | null } | null =
        await this.prisma.userLabel.findUnique({
          where: { id: currentParentId },
          select: { parentId: true },
        });
      currentParentId = parent?.parentId;
    }
    return false;
  }
}
