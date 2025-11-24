import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaPromise } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
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
          ? (dto.color as Prisma.InputJsonValue)
          : undefined,
        icon: dto.icon,
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
    await this.findOne(tenantId, id);

    const data: Prisma.UserLabelUncheckedUpdateInput = {};

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
    if (dto.orderIndex !== undefined) {
      data.orderIndex = dto.orderIndex;
    }

    if (dto.parentId !== undefined) {
      if (dto.parentId === null) {
        data.parentId = null;
        data.level = 0;
      } else {
        const parent = await this.prisma.userLabel.findUnique({ where: { id: dto.parentId } });
        if (!parent || parent.tenantId !== tenantId) {
          throw new NotFoundException('Parent label not found');
        }
        if (await this.wouldCreateCircularReference(id, dto.parentId)) {
          throw new ConflictException('Cannot create circular label hierarchy');
        }
        data.parentId = dto.parentId;
        data.level = parent.level + 1;
      }
    }

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

  async delete(tenantId: string, id: string) {
    const label = await this.findOne(tenantId, id);

    await this.prisma.userLabel.update({
      where: { id },
      data: { isArchived: true },
    });

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
        emailLabels: {
          include: {
            label: {
              select: {
                id: true,
                name: true,
                color: true,
                icon: true,
              },
            },
          },
        },
      },
    });

    // Emit realtime events for each updated email
    console.log('[LABELS] About to emit events for', updatedEmails.length, 'emails');
    updatedEmails.forEach((email) => {
      console.log('[LABELS] Emitting email:update', {
        emailId: email.id,
        providerId: email.providerId,
        reason: 'labels-updated',
        tenantId,
      });
      this.realtimeEvents.emitEmailUpdate(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        reason: 'labels-updated',
        email: email as any, // Include complete email object with labels
      });
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
    const updatedEmail = await this.prisma.email.findUnique({
      where: {
        id: emailId,
      },
      include: {
        provider: {
          select: {
            id: true,
            email: true,
            providerType: true,
          },
        },
        emailLabels: {
          include: {
            label: {
              select: {
                id: true,
                name: true,
                color: true,
                icon: true,
              },
            },
          },
        },
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

    const updates: PrismaPromise<Prisma.BatchPayload>[] = [];
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

  private generateSlug(name: string) {
    const base = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return base || `label-${Date.now()}`;
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
