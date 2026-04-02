import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { emailLabelsInclude } from '../../../common/utils';
import { EmailsService } from '../../email/services/emails.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { ProviderSyncBackQueueService } from '../../email-sync/services/provider-sync-back-queue.service';
import { EmailInsightsService } from '../../ai/services/email-insights.service';
import {
  AddEmailsToLabelDto,
  CreateLabelDto,
  CreateLabelWizardDto,
  LabelPreviewDto,
  ReorderLabelsDto,
  TriageOnboardingRulesDto,
  UpdateLabelDto,
} from '../dto/labels.dto';
import {
  buildAiPromptFromMetadata,
  ACTION_TO_LANE,
  WIZARD_ROLE_OPTIONS,
  WIZARD_CONTENT_OPTIONS,
  WIZARD_ACTION_OPTIONS,
} from '../label-prompt-builder';
import {
  buildRecommendedLabelSet,
  normalizeTriageOnboardingRules,
  TRIAGE_LABEL_TAXONOMY,
  TRIAGE_ONBOARDING_EXAMPLES,
  TRIAGE_ONBOARDING_FIELDS,
} from '../triage-onboarding.contract';

@Injectable()
export class LabelsService {
  private readonly logger = new Logger(LabelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailsService: EmailsService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly syncBackQueue: ProviderSyncBackQueueService,
    @Optional() private readonly emailInsightsService?: EmailInsightsService,
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

  async getTriageOnboardingContract(tenantId: string) {
    const labels = await this.prisma.userLabel.findMany({
      where: { tenantId, isArchived: false },
      select: {
        id: true,
        name: true,
        slug: true,
        aiPrompt: true,
        type: true,
      },
      orderBy: [{ parentId: 'asc' }, { orderIndex: 'asc' }],
    });

    return {
      version: 'v1' as const,
      schema: TRIAGE_ONBOARDING_FIELDS,
      taxonomy: TRIAGE_LABEL_TAXONOMY,
      examples: TRIAGE_ONBOARDING_EXAMPLES,
      currentLabels: labels,
    };
  }

  async previewTriageOnboarding(tenantId: string, dto: TriageOnboardingRulesDto) {
    const normalizedRules = normalizeTriageOnboardingRules(dto);
    const existingLabels = await this.prisma.userLabel.findMany({
      where: { tenantId, isArchived: false },
      select: { id: true, name: true, slug: true, aiPrompt: true, type: true },
    });
    const existingBySlug = new Map(existingLabels.map((label) => [label.slug, label]));

    const recommendedLabels = buildRecommendedLabelSet(normalizedRules).map((label) => ({
      ...label,
      existingLabelId: existingBySlug.get(label.slug)?.id ?? null,
      willCreate: !existingBySlug.has(label.slug),
    }));

    return {
      version: 'v1' as const,
      normalizedRules,
      schema: TRIAGE_ONBOARDING_FIELDS,
      taxonomy: TRIAGE_LABEL_TAXONOMY,
      examples: TRIAGE_ONBOARDING_EXAMPLES,
      recommendedLabels,
    };
  }

  async applyTriageOnboarding(tenantId: string, dto: TriageOnboardingRulesDto) {
    const preview = await this.previewTriageOnboarding(tenantId, dto);
    const existingLabels = await this.prisma.userLabel.findMany({
      where: { tenantId, isArchived: false },
      select: { id: true, slug: true },
    });
    const existingBySlug = new Map(existingLabels.map((label) => [label.slug, label]));

    const labels = await this.prisma.$transaction(async (tx) => {
      const nextLabels = [];
      for (const recommendation of preview.recommendedLabels) {
        const existing = existingBySlug.get(recommendation.slug);

        if (existing) {
          const updated = await tx.userLabel.update({
            where: { id: existing.id },
            data: { aiPrompt: recommendation.aiPrompt },
            select: {
              id: true,
              tenantId: true,
              name: true,
              slug: true,
              type: true,
              color: true,
              icon: true,
              parentId: true,
              level: true,
              orderIndex: true,
              isArchived: true,
              aiPrompt: true,
              createdAt: true,
              updatedAt: true,
            },
          });
          nextLabels.push(updated);
          continue;
        }

        const maxOrder = await tx.userLabel.aggregate({
          where: { tenantId, parentId: null },
          _max: { orderIndex: true },
        });

        const created = await tx.userLabel.create({
          data: {
            tenantId,
            name: recommendation.name,
            slug: recommendation.slug,
            type: 'USER',
            color: recommendation.color as Prisma.InputJsonValue,
            aiPrompt: recommendation.aiPrompt,
            level: 0,
            parentId: null,
            orderIndex: (maxOrder._max.orderIndex ?? -1) + 1,
          },
          select: {
            id: true,
            tenantId: true,
            name: true,
            slug: true,
            type: true,
            color: true,
            icon: true,
            parentId: true,
            level: true,
            orderIndex: true,
            isArchived: true,
            aiPrompt: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        nextLabels.push(created);
      }

      return nextLabels;
    });

    await this.invalidateTenantAnalysisCache(tenantId, 'triage-onboarding-applied');

    return {
      version: 'v1' as const,
      normalizedRules: preview.normalizedRules,
      taxonomy: TRIAGE_LABEL_TAXONOMY,
      examples: TRIAGE_ONBOARDING_EXAMPLES,
      labels,
    };
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

    await this.invalidateTenantAnalysisCache(tenantId, 'label-created');

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
          : ({ ...dto.color } as Prisma.InputJsonValue);
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

      await this.invalidateTenantAnalysisCache(tenantId, 'label-updated');

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

    await this.invalidateTenantAnalysisCache(tenantId, 'label-updated');

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

    await this.invalidateTenantAnalysisCache(tenantId, 'label-deleted');
  }

  async bulkDelete(tenantId: string, labelIds: string[]) {
    if (labelIds.length === 0) return { deleted: 0 };

    // Verify all labels belong to this tenant and are not system labels
    const labels = await this.prisma.userLabel.findMany({
      where: {
        id: { in: labelIds },
        tenantId,
        type: 'USER',
        isArchived: false,
      },
      select: { id: true, slug: true },
    });

    const validIds = labels.map((l) => l.id);
    if (validIds.length === 0) return { deleted: 0 };

    const now = Date.now();

    await this.prisma.$transaction(async (tx) => {
      // Soft-delete all matching labels
      await tx.userLabel.updateMany({
        where: { id: { in: validIds } },
        data: { isArchived: true },
      });

      // Append timestamp to slugs to free them up (individually to avoid collision)
      for (const label of labels) {
        await tx.userLabel.update({
          where: { id: label.id },
          data: { slug: `${label.slug}-deleted-${now}` },
        });
      }

      // Also archive all descendants of deleted labels
      const descendants = await tx.userLabel.findMany({
        where: { tenantId, parentId: { in: validIds }, isArchived: false },
        select: { id: true, slug: true },
      });
      if (descendants.length > 0) {
        await tx.userLabel.updateMany({
          where: { id: { in: descendants.map((d) => d.id) } },
          data: { isArchived: true },
        });
        for (const desc of descendants) {
          await tx.userLabel.update({
            where: { id: desc.id },
            data: { slug: `${desc.slug}-deleted-${now}` },
          });
        }
      }
    });

    // Emit WS events
    for (const id of validIds) {
      this.realtimeEvents.emitLabelDelete(tenantId, {
        labelId: id,
        reason: 'label-deleted',
        label: { id } as any,
        timestamp: new Date().toISOString(),
      });
    }

    await this.invalidateTenantAnalysisCache(tenantId, 'labels-bulk-deleted');

    return { deleted: validIds.length };
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

    // T-0901: Queue sync-back for Microsoft providers (UserLabel → Outlook category)
    const label = await this.prisma.userLabel.findUnique({
      where: { id: labelId },
      select: { name: true },
    });
    if (label) {
      await this.queueLabelSyncBack(tenantId, updatedEmails, 'add-label', label.name);
    }

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

    // T-0901: Queue sync-back for Microsoft providers (remove Outlook category)
    if (updatedEmail) {
      const label = await this.prisma.userLabel.findUnique({
        where: { id: labelId },
        select: { name: true },
      });
      if (label) {
        await this.queueLabelSyncBack(tenantId, [updatedEmail], 'remove-label', label.name);
      }
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
   * T-0901/T-0902: Queue label sync-back for providers that support labels.
   * Microsoft: UserLabel name → Outlook category. Google: UserLabel name → Gmail label ID.
   * IMAP: skipped (labels are app-only, no provider-side concept).
   */
  private async queueLabelSyncBack(
    tenantId: string,
    emails: Array<{ id: string; providerId: string; provider?: { providerType?: string } | null }>,
    action: 'add-label' | 'remove-label',
    labelName: string,
  ): Promise<void> {
    // T-0902: Only queue for providers that support labels (Google, Microsoft)
    const LABEL_CAPABLE_PROVIDERS = new Set(['google', 'microsoft']);

    const byProvider = new Map<string, { emailIds: string[]; providerType: string }>();
    for (const email of emails) {
      const providerType = email.provider?.providerType;
      if (!providerType || !LABEL_CAPABLE_PROVIDERS.has(providerType)) continue;

      const entry = byProvider.get(email.providerId) || { emailIds: [], providerType };
      entry.emailIds.push(email.id);
      byProvider.set(email.providerId, entry);
    }

    if (byProvider.size === 0) return;

    const jobs = Array.from(byProvider.entries()).map(([providerId, { emailIds, providerType }]) => ({
      tenantId,
      providerId,
      providerType: providerType as 'google' | 'microsoft',
      action,
      emailIds,
      labelId: labelName,
      requestedAt: new Date().toISOString(),
      priority: 'high' as const,
    }));

    await this.syncBackQueue.enqueueBulkSyncBack(jobs);
    this.logger.debug(
      `Queued ${action} sync-back for ${jobs.length} provider(s), label="${labelName}"`,
    );
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

  private async invalidateTenantAnalysisCache(tenantId: string, reason: string): Promise<void> {
    try {
      const { count } = await this.prisma.emailAnalysis.updateMany({
        where: { tenantId },
        data: { processedAt: new Date(0) },
      });
      this.logger.debug(`Expired ${count} email analyses for tenant ${tenantId} after ${reason}`);
    } catch (error) {
      this.logger.warn(
        `Failed to expire email analyses for tenant ${tenantId} after ${reason}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
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

  // --- Label Wizard ---

  getWizardOptions() {
    return { roles: WIZARD_ROLE_OPTIONS, contents: WIZARD_CONTENT_OPTIONS, actions: WIZARD_ACTION_OPTIONS };
  }

  private static readonly MAX_LABELS_PER_TENANT = 20;

  async createFromWizard(tenantId: string, dto: CreateLabelWizardDto) {
    const count = await this.prisma.userLabel.count({ where: { tenantId, isArchived: false } });
    if (count >= LabelsService.MAX_LABELS_PER_TENANT) {
      throw new BadRequestException(`Maximum ${LabelsService.MAX_LABELS_PER_TENANT} labels per tenant`);
    }

    const slug = this.slugify(dto.name);
    const existing = await this.prisma.userLabel.findUnique({ where: { tenantId_slug: { tenantId, slug } } });
    if (existing && !existing.isArchived) {
      throw new ConflictException(`Label "${dto.name}" already exists`);
    }

    const generatedPrompt = buildAiPromptFromMetadata({
      name: dto.name, roles: dto.roles, contents: dto.contents,
      actionType: dto.actionType, aiPrompt: dto.aiPrompt,
    });
    const defaultLane = ACTION_TO_LANE[dto.actionType] || null;

    return this.prisma.userLabel.create({
      data: {
        tenantId, name: dto.name, slug, type: 'USER',
        color: dto.color ? (dto.color as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        aiPrompt: generatedPrompt, category: dto.category,
        roles: dto.roles, contents: dto.contents, actionType: dto.actionType,
        suppressUrgency: dto.suppressUrgency ?? false,
        mutuallyExclusiveWith: dto.mutuallyExclusiveWith ?? [],
        defaultLane,
        orderIndex: count,
      },
    });
  }

  async updateFromWizard(tenantId: string, labelId: string, dto: CreateLabelWizardDto) {
    const label = await this.prisma.userLabel.findFirst({ where: { id: labelId, tenantId } });
    if (!label) throw new NotFoundException('Label not found');

    const slug = this.slugify(dto.name);
    if (slug !== label.slug) {
      const duplicate = await this.prisma.userLabel.findUnique({ where: { tenantId_slug: { tenantId, slug } } });
      if (duplicate && duplicate.id !== labelId && !duplicate.isArchived) {
        throw new ConflictException(`Label "${dto.name}" already exists`);
      }
    }

    const generatedPrompt = buildAiPromptFromMetadata({
      name: dto.name, roles: dto.roles, contents: dto.contents,
      actionType: dto.actionType, aiPrompt: dto.aiPrompt,
    });
    const defaultLane = ACTION_TO_LANE[dto.actionType] || null;

    return this.prisma.userLabel.update({
      where: { id: labelId },
      data: {
        name: dto.name, slug,
        color: dto.color ? (dto.color as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        aiPrompt: generatedPrompt, category: dto.category,
        roles: dto.roles, contents: dto.contents, actionType: dto.actionType,
        suppressUrgency: dto.suppressUrgency ?? false,
        mutuallyExclusiveWith: dto.mutuallyExclusiveWith ?? [],
        defaultLane,
      },
    });
  }

  async previewLabelOnEmail(tenantId: string, labelId: string, dto: LabelPreviewDto) {
    if (!this.emailInsightsService) {
      throw new BadRequestException('Email insights service is unavailable');
    }

    const [label, email] = await Promise.all([
      this.prisma.userLabel.findFirst({
        where: { id: labelId, tenantId, isArchived: false },
        select: {
          id: true,
          name: true,
          aiPrompt: true,
          category: true,
          roles: true,
          contents: true,
          actionType: true,
          defaultLane: true,
        },
      }),
      this.prisma.email.findFirst({
        where: { id: dto.emailId, tenantId },
        select: {
          id: true,
          subject: true,
          from: true,
          receivedAt: true,
        },
      }),
    ]);

    if (!label) {
      throw new NotFoundException('Label not found');
    }
    if (!email) {
      throw new NotFoundException('Email not found');
    }

    const analysis = await this.emailInsightsService.analyzeEmailUnified(
      tenantId,
      dto.emailId,
      dto.locale,
    );

    return {
      matched: analysis.labels.includes(label.name),
      label,
      email,
      analysis: {
        labels: analysis.labels,
        priority: analysis.priority,
        urgency: analysis.urgency,
        lane: analysis.lane,
        intent: analysis.intent,
        actionability: analysis.actionability,
        summary: analysis.summary,
        reasoning: analysis.reasoning,
        meta: analysis.meta,
      },
    };
  }

  private slugify(name: string): string {
    const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return base || `label-${Date.now()}`;
  }
}
