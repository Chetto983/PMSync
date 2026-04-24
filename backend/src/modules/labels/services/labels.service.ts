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
import { TriageRuleService } from '../../ai/services/triage-rule.service';
import {
  AddEmailsToLabelDto,
  CreateLabelDto,
  CreateLabelWizardDto,
  LabelPreviewDto,
  LabelWizardPreviewDto,
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
import type { TenantLabel } from '../../ai/services/label-resolution.service';
import {
  buildDerivedTriageRules,
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
    private readonly triageRuleService: TriageRuleService,
    @Optional() private readonly emailInsightsService?: EmailInsightsService,
  ) {}

  /**
   * Phase 150 D-04 + Landmine §1 Option B: mirror UserLabel → GraphNode so the
   * affinity-edge graph (Plans 02/03/04) can target a real node by labelId.
   *
   * Option B path: GraphNode has NO `@@unique([tenantId, nodeType, externalId])`
   * constraint (Plan 02 decision — 150-02-SUMMARY). Concurrent mirror inserts
   * are serialized via SELECT FOR UPDATE inside a short-lived `$transaction`.
   * Identical semantics to `findOrCreateGraphNode` in
   * `triage-affinity-promotion.helpers.ts`, re-implemented locally because that
   * helper is non-exported and importing it from ai/ is unnecessary for a 20-LF
   * seam (keeps labels.service independent of ai-module internals).
   *
   * Phase 150.1 WR-03: accepts optional `tx: Prisma.TransactionClient` so
   * callers can run the UserLabel write + mirror upsert + any downstream
   * cleanup under a single atomic transaction. When `tx` is omitted, opens
   * its own short-lived $transaction (legacy path, preserved for direct
   * callers that don't need outer atomicity).
   */
  private async upsertLabelNode(
    tenantId: string,
    labelId: string,
    labelName: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const run = async (client: Prisma.TransactionClient) => {
      const existing = await client.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM graph_nodes
        WHERE "tenantId" = ${tenantId}
          AND "nodeType" = 'label'
          AND "externalId" = ${labelId}
        FOR UPDATE
        LIMIT 1
      `;
      if (existing.length > 0) {
        await client.graphNode.update({
          where: { id: existing[0].id },
          data: { label: labelName },
        });
      } else {
        await client.graphNode.create({
          data: {
            tenantId,
            nodeType: 'label',
            externalId: labelId,
            label: labelName,
          },
        });
      }
    };
    if (tx) {
      await run(tx);
    } else {
      await this.prisma.$transaction(run);
    }
  }

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
    const rules = await this.triageRuleService.setTriageRules(
      tenantId,
      buildDerivedTriageRules(preview.normalizedRules),
    );

    await this.invalidateTenantAnalysisCache(tenantId, 'triage-onboarding-applied');
    const labels = await this.findAllByTenant(tenantId);

    return {
      version: 'v1' as const,
      normalizedRules: preview.normalizedRules,
      taxonomy: TRIAGE_LABEL_TAXONOMY,
      examples: TRIAGE_ONBOARDING_EXAMPLES,
      labels,
      rules,
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

    // Phase 150.1 WR-03: wrap userLabel.create + mirror GraphNode upsert in
    // a single $transaction so a failure between the two can't leave the
    // user with a label that lacks a mirror (though the promotion service's
    // find-or-create self-heals, atomicity is cleaner + matches delete/bulkDelete).
    const newLabel = await this.prisma.$transaction(async (tx) => {
      const created = await tx.userLabel.create({
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

      // Phase 150 D-04 (+ WR-03 atomicity): mirror GraphNode for affinity-edge
      // targeting, same tx client — serializes with the $queryRaw SELECT FOR
      // UPDATE inside upsertLabelNode so concurrent creators don't race.
      await this.upsertLabelNode(tenantId, created.id, created.name, tx);

      return created;
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

      // Phase 150 D-04: keep mirror GraphNode.label in sync on rename.
      // updateMany (not update) — no composite unique exists under Option B,
      // and 0-row match is a no-op if the mirror hasn't been created yet.
      if (dto.name !== undefined) {
        await this.prisma.graphNode.updateMany({
          where: { tenantId, nodeType: 'label', externalId: id },
          data: { label: dto.name },
        });
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

    // Phase 150 D-04: keep mirror GraphNode.label in sync on rename (reorder path).
    if (dto.name !== undefined) {
      await this.prisma.graphNode.updateMany({
        where: { tenantId, nodeType: 'label', externalId: id },
        data: { label: dto.name },
      });
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

    // Phase 150.1 WR-03: wrap the soft-delete + descendant archival + mirror
    // hard-delete in a single $transaction. Before this, a crash between the
    // userLabel.update and the graphNode.deleteMany would leave the label
    // soft-deleted but the mirror + its affinity edges alive — graph-lookup
    // would return "Learned pattern" for a label the user deleted an hour
    // ago, and the decay-gc sweep doesn't reap orphans (it prunes by
    // confidence, not by orphan-detection). Under a single $transaction,
    // either all three writes commit together or all roll back.
    await this.prisma.$transaction(async (tx) => {
      await tx.userLabel.update({
        where: { id },
        data: {
          isArchived: true,
          slug: deletedSlug,
        },
      });

      // Cascade soft-delete to all descendants, same tx.
      await this.archiveDescendants(tenantId, id, tx);

      // Phase 150 D-04 + Landmine §2: explicit GraphNode hard-delete.
      // UserLabel is soft-deleted (isArchived=true) so GraphEdge's
      // onDelete:Cascade only fires when we HARD-delete the mirror node.
      // Cascade then drops affinity edges automatically (GraphEdge FKs:
      // source/target → GraphNode, onDelete:Cascade). GDPR: the mirror carries
      // no user data beyond the labelName (which persists on the
      // soft-deleted UserLabel), so hard-deletion here is non-destructive.
      await tx.graphNode.deleteMany({
        where: { tenantId, nodeType: 'label', externalId: id },
      });
    });

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

    // Phase 150.1 WR-03: fold the mirror GraphNode hard-delete INTO the same
    // $transaction as the userLabel soft-deletes. Prior code committed the
    // userLabel updates first, then issued a post-transaction graphNode.delete
    // Many — a crash between the two left every bulk-deleted label's mirror
    // + affinity edges alive. Now the whole bulk operation is atomic.
    // Explicit 10s timeout to accommodate large bulk deletes (default is 5s,
    // insufficient for tenants with thousands of descendant labels).
    await this.prisma.$transaction(
      async (tx) => {
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
        const descendantIds = descendants.map((d) => d.id);
        if (descendants.length > 0) {
          await tx.userLabel.updateMany({
            where: { id: { in: descendantIds } },
            data: { isArchived: true },
          });
          for (const desc of descendants) {
            await tx.userLabel.update({
              where: { id: desc.id },
              data: { slug: `${desc.slug}-deleted-${now}` },
            });
          }
        }

        // Phase 150 D-04 + Landmine §2 (WR-03 atomic): hard-delete mirror
        // GraphNodes for every soft-deleted label (self + descendants) in
        // the same tx. Fires GraphEdge onDelete:Cascade on commit.
        const allDeletedIds = [...validIds, ...descendantIds];
        if (allDeletedIds.length > 0) {
          await tx.graphNode.deleteMany({
            where: {
              tenantId,
              nodeType: 'label',
              externalId: { in: allDeletedIds },
            },
          });
        }
      },
      { timeout: 10_000 },
    );

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
   *
   * Phase 150 D-04 + Landmine §2: hard-delete each descendant's mirror
   * GraphNode as we recurse. GraphEdge onDelete:Cascade then drops any
   * affinity edges pointing at the removed label. Done per-child rather
   * than as a single deleteMany at the end because the recursion already
   * enumerates every descendant individually.
   *
   * Phase 150.1 WR-03: accepts optional `tx: Prisma.TransactionClient` so
   * the recursive soft-delete + mirror hard-delete run under the same
   * atomic boundary as the parent's `delete()` call. On process crash
   * between the userLabel.update and the graphNode.deleteMany, the whole
   * chain rolls back — no orphaned mirrors escape cascade-deletion.
   * When `tx` is omitted, falls back to the direct `this.prisma` client
   * (legacy behavior).
   */
  private async archiveDescendants(
    tenantId: string,
    parentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client: Prisma.TransactionClient | PrismaService = tx ?? this.prisma;
    const children = await client.userLabel.findMany({
      where: { tenantId, parentId, isArchived: false },
      select: { id: true, slug: true },
    });

    if (children.length === 0) return;

    const childIds = children.map((c) => c.id);

    for (const child of children) {
      await client.userLabel.update({
        where: { id: child.id },
        data: {
          isArchived: true,
          slug: `${child.slug}-deleted-${Date.now()}`,
        },
      });
      await this.archiveDescendants(tenantId, child.id, tx);
    }

    // Hard-delete mirrors for this batch of children in a single call.
    await client.graphNode.deleteMany({
      where: {
        tenantId,
        nodeType: 'label',
        externalId: { in: childIds },
      },
    });
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
    let level = 0;
    if (dto.parentId) {
      const parent = await this.prisma.userLabel.findUnique({
        where: { id: dto.parentId },
        select: { tenantId: true, level: true },
      });
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
        tenantId, name: dto.name, slug, type: 'USER',
        color: dto.color ? (dto.color as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        aiPrompt: generatedPrompt, category: dto.category,
        roles: dto.roles, contents: dto.contents, actionType: dto.actionType,
        suppressUrgency: dto.suppressUrgency ?? false,
        mutuallyExclusiveWith: dto.mutuallyExclusiveWith ?? [],
        defaultLane,
        parentId: dto.parentId ?? null,
        level,
        orderIndex: (maxOrder._max.orderIndex ?? -1) + 1,
      },
      include: {
        children: {
          where: { isArchived: false },
          orderBy: { orderIndex: 'asc' },
        },
        _count: { select: { emailLabels: true } },
      },
    });

    // Phase 150 D-04: mirror GraphNode for affinity-edge targeting (wizard variant).
    await this.upsertLabelNode(tenantId, newLabel.id, newLabel.name);

    this.realtimeEvents.emitLabelNew(tenantId, {
      labelId: newLabel.id,
      reason: 'label-created',
      label: newLabel as any,
      timestamp: new Date().toISOString(),
    });
    await this.invalidateTenantAnalysisCache(tenantId, 'label-wizard-created');

    return newLabel;
  }

  async updateFromWizard(tenantId: string, labelId: string, dto: CreateLabelWizardDto) {
    const currentLabel = await this.prisma.userLabel.findUnique({
      where: { id: labelId },
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

    const slug = this.slugify(dto.name);
    if (slug !== currentLabel.slug) {
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
    const data: Prisma.UserLabelUncheckedUpdateInput = {
      name: dto.name,
      slug,
      color: dto.color ? (dto.color as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      aiPrompt: generatedPrompt,
      category: dto.category,
      roles: dto.roles,
      contents: dto.contents,
      actionType: dto.actionType,
      suppressUrgency: dto.suppressUrgency ?? false,
      mutuallyExclusiveWith: dto.mutuallyExclusiveWith ?? [],
      defaultLane,
    };

    let nextParentId = currentLabel.parentId;
    let nextLevel = currentLabel.level;
    if (dto.parentId !== undefined) {
      const parent = await this.prisma.userLabel.findUnique({
        where: { id: dto.parentId },
        select: { tenantId: true, level: true },
      });
      if (!parent || parent.tenantId !== tenantId) {
        throw new NotFoundException('Parent label not found');
      }
      if (await this.wouldCreateCircularReference(labelId, dto.parentId)) {
        throw new ConflictException('Cannot create circular label hierarchy');
      }
      nextParentId = dto.parentId;
      nextLevel = parent.level + 1;
    }

    const shouldReorder = nextParentId !== currentLabel.parentId;
    if (!shouldReorder) {
      const updatedLabel = await this.prisma.userLabel.update({
        where: { id: labelId },
        data,
        include: {
          children: {
            where: { isArchived: false },
            orderBy: { orderIndex: 'asc' },
          },
          _count: { select: { emailLabels: true } },
        },
      });

      // Phase 150 D-04: keep mirror GraphNode.label in sync on wizard-rename.
      // slug change is the proxy for a real name change (data.name is always set).
      if (slug !== currentLabel.slug) {
        await this.prisma.graphNode.updateMany({
          where: { tenantId, nodeType: 'label', externalId: labelId },
          data: { label: dto.name },
        });
      }

      this.realtimeEvents.emitLabelUpdate(tenantId, {
        labelId: updatedLabel.id,
        reason: 'label-updated',
        label: updatedLabel as any,
        updates: dto as any,
        timestamp: new Date().toISOString(),
      });
      await this.invalidateTenantAnalysisCache(tenantId, 'label-wizard-updated');

      return updatedLabel;
    }

    const sourceParentId = currentLabel.parentId;
    const targetSiblings = tenantLabels
      .filter((label) => label.parentId === nextParentId && label.id !== labelId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const targetOrderIds = [...targetSiblings.map((label) => label.id), labelId];
    const sourceSiblings =
      sourceParentId !== nextParentId
        ? tenantLabels
            .filter((label) => label.parentId === sourceParentId && label.id !== labelId)
            .sort((a, b) => a.orderIndex - b.orderIndex)
        : [];
    const levelDelta = nextLevel - currentLabel.level;
    const descendants =
      levelDelta === 0
        ? []
        : this.getDescendantLabels(tenantLabels, labelId);

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
        targetOrderIds.map((id, index) =>
          tx.userLabel.update({
            where: { id },
            data:
              id === labelId
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
        where: { id: labelId },
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

    // Phase 150 D-04: keep mirror GraphNode.label in sync on wizard-rename (reorder path).
    if (slug !== currentLabel.slug) {
      await this.prisma.graphNode.updateMany({
        where: { tenantId, nodeType: 'label', externalId: labelId },
        data: { label: dto.name },
      });
    }

    this.realtimeEvents.emitLabelUpdate(tenantId, {
      labelId: updatedLabel.id,
      reason: 'label-updated',
      label: updatedLabel as any,
      updates: dto as any,
      timestamp: new Date().toISOString(),
    });
    await this.invalidateTenantAnalysisCache(tenantId, 'label-wizard-updated');

    return updatedLabel;
  }

  async previewLabelOnEmail(tenantId: string, labelId: string, dto: LabelPreviewDto) {
    const label = await this.prisma.userLabel.findFirst({
      where: { id: labelId, tenantId, isArchived: false },
      select: {
        id: true,
        name: true,
        aiPrompt: true,
        category: true,
        roles: true,
        contents: true,
        actionType: true,
        suppressUrgency: true,
        mutuallyExclusiveWith: true,
        defaultLane: true,
      },
    });

    if (!label) {
      throw new NotFoundException('Label not found');
    }

    return this.previewWizardLabelOnEmail(tenantId, {
      labelId: label.id,
      emailId: dto.emailId,
      locale: dto.locale,
      name: label.name,
      category: label.category,
      roles: label.roles,
      contents: label.contents,
      actionType: label.actionType,
      suppressUrgency: label.suppressUrgency,
      mutuallyExclusiveWith: label.mutuallyExclusiveWith,
      aiPrompt: label.aiPrompt ?? undefined,
    });
  }

  async previewWizardLabelOnEmail(tenantId: string, dto: LabelWizardPreviewDto) {
    if (!this.emailInsightsService) {
      throw new BadRequestException('Email insights service is unavailable');
    }

    const [tenantLabels, email] = await Promise.all([
      this.prisma.userLabel.findMany({
        where: { tenantId, isArchived: false },
        select: {
          id: true,
          name: true,
          aiPrompt: true,
          category: true,
          roles: true,
          contents: true,
          actionType: true,
          suppressUrgency: true,
          mutuallyExclusiveWith: true,
          defaultLane: true,
        },
        orderBy: { orderIndex: 'asc' },
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

    if (dto.labelId && !tenantLabels.some((label) => label.id === dto.labelId)) {
      throw new NotFoundException('Label not found');
    }
    if (!email) {
      throw new NotFoundException('Email not found');
    }

    const prompt = buildAiPromptFromMetadata({
      name: dto.name,
      roles: dto.roles,
      contents: dto.contents,
      actionType: dto.actionType,
      aiPrompt: dto.aiPrompt,
    });

    const draftLabel = {
      id: dto.labelId ?? null,
      name: dto.name,
      aiPrompt: prompt,
      category: dto.category,
      roles: dto.roles,
      contents: dto.contents,
      actionType: dto.actionType,
      suppressUrgency: dto.suppressUrgency ?? false,
      mutuallyExclusiveWith: dto.mutuallyExclusiveWith ?? [],
      defaultLane: ACTION_TO_LANE[dto.actionType] || null,
    };

    const overrideLabels: TenantLabel[] = dto.labelId
      ? tenantLabels.map((label) => (
          label.id === dto.labelId
            ? {
                name: draftLabel.name,
                aiPrompt: draftLabel.aiPrompt,
                category: draftLabel.category,
                suppressUrgency: draftLabel.suppressUrgency,
                mutuallyExclusiveWith: draftLabel.mutuallyExclusiveWith,
                defaultLane: draftLabel.defaultLane,
              }
            : {
                name: label.name,
                aiPrompt: label.aiPrompt,
                category: label.category,
                suppressUrgency: label.suppressUrgency,
                mutuallyExclusiveWith: label.mutuallyExclusiveWith,
                defaultLane: label.defaultLane,
              }
        ))
      : [
          ...tenantLabels.map((label) => ({
            name: label.name,
            aiPrompt: label.aiPrompt,
            category: label.category,
            suppressUrgency: label.suppressUrgency,
            mutuallyExclusiveWith: label.mutuallyExclusiveWith,
            defaultLane: label.defaultLane,
          })),
          {
            name: draftLabel.name,
            aiPrompt: draftLabel.aiPrompt,
            category: draftLabel.category,
            suppressUrgency: draftLabel.suppressUrgency,
            mutuallyExclusiveWith: draftLabel.mutuallyExclusiveWith,
            defaultLane: draftLabel.defaultLane,
          },
        ];

    const analysis = await this.emailInsightsService.analyzeEmailUnified(
      tenantId,
      dto.emailId,
      dto.locale,
      {
        labelDefsOverride: overrideLabels,
        bypassCache: true,
        persist: false,
      },
    );

    return {
      matched: analysis.labels.includes(draftLabel.name),
      label: draftLabel,
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
