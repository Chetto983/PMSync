import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { withPrismaRetry } from '../../../../common/services/prisma-retry.service';
import {
  CreatePipelineDto,
  UpdatePipelineDto,
  CreateStageDto,
  UpdateStageDto,
  ReorderStagesDto,
} from '../dto/pipeline.dto';
import { CreateSavedViewDto, UpdateSavedViewDto } from '../dto/saved-view.dto';

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---- Pipeline CRUD ----

  async listPipelines(tenantId: string) {
    return this.prisma.crmPipeline.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        stages: {
          select: { id: true, name: true, color: true, probability: true, position: true },
          orderBy: { position: 'asc' },
        },
        _count: { select: { stages: true, deals: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async findPipelineById(tenantId: string, id: string) {
    const pipeline = await this.prisma.crmPipeline.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        stages: { orderBy: { position: 'asc' } },
        _count: { select: { deals: true } },
      },
    });

    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${id} not found`);
    }

    return pipeline;
  }

  async createPipeline(tenantId: string, dto: CreatePipelineDto) {
    // If this is set as default, unset other defaults
    if (dto.isDefault) {
      await this.unsetDefaultPipeline(tenantId);
    }

    try {
      return await this.prisma.crmPipeline.create({
        data: {
          tenantId,
          name: dto.name,
          description: dto.description,
          isDefault: dto.isDefault ?? false,
        },
        include: {
          _count: { select: { stages: true, deals: true } },
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(`Pipeline "${dto.name}" already exists`);
      }
      throw error;
    }
  }

  async updatePipeline(tenantId: string, id: string, dto: UpdatePipelineDto) {
    await this.findPipelineById(tenantId, id);

    // If setting as default, unset other defaults
    if (dto.isDefault) {
      await this.unsetDefaultPipeline(tenantId);
    }

    try {
      return await this.prisma.crmPipeline.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
        include: {
          stages: { orderBy: { position: 'asc' } },
          _count: { select: { deals: true } },
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(`Pipeline "${dto.name}" already exists`);
      }
      throw error;
    }
  }

  async deletePipeline(tenantId: string, id: string) {
    const pipeline = await this.findPipelineById(tenantId, id);

    if (pipeline._count.deals > 0) {
      throw new BadRequestException(
        'Cannot delete a pipeline that has active deals. Move or remove the deals first.',
      );
    }

    // Soft-delete pipeline (cascade will not soft-delete stages, so delete them)
    await this.prisma.$transaction([
      this.prisma.crmStage.deleteMany({ where: { pipelineId: id } }),
      this.prisma.crmPipeline.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    ]);

    return { deleted: true };
  }

  // ---- Stage CRUD ----

  async createStage(tenantId: string, pipelineId: string, dto: CreateStageDto) {
    await this.findPipelineById(tenantId, pipelineId);

    // Auto-assign position: next available
    const maxPosition = await this.prisma.crmStage.aggregate({
      where: { pipelineId },
      _max: { position: true },
    });
    const nextPosition = (maxPosition._max.position ?? -1) + 1;

    try {
      return await this.prisma.crmStage.create({
        data: {
          pipelineId,
          name: dto.name,
          position: nextPosition,
          probability: dto.probability ?? 0,
          color: dto.color ?? '#6B7280',
          isWon: dto.isWon ?? false,
          isLost: dto.isLost ?? false,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          `Stage "${dto.name}" already exists in this pipeline`,
        );
      }
      throw error;
    }
  }

  async updateStage(tenantId: string, stageId: string, dto: UpdateStageDto) {
    await this.findStageWithTenantCheck(tenantId, stageId);

    try {
      return await this.prisma.crmStage.update({
        where: { id: stageId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.probability !== undefined && { probability: dto.probability }),
          ...(dto.color !== undefined && { color: dto.color }),
          ...(dto.isWon !== undefined && { isWon: dto.isWon }),
          ...(dto.isLost !== undefined && { isLost: dto.isLost }),
          ...(dto.automations !== undefined && { automations: dto.automations }),
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          `Stage "${dto.name}" already exists in this pipeline`,
        );
      }
      throw error;
    }
  }

  async deleteStage(tenantId: string, stageId: string) {
    const stage = await this.findStageWithTenantCheck(tenantId, stageId);

    // Check for active deals
    const dealCount = await this.prisma.crmDeal.count({
      where: { stageId, deletedAt: null },
    });

    if (dealCount > 0) {
      throw new BadRequestException(
        'Cannot delete a stage that has active deals. Move or remove the deals first.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Delete the stage
      await tx.crmStage.delete({ where: { id: stageId } });

      // Re-number remaining stages to close gaps
      const remaining = await tx.crmStage.findMany({
        where: { pipelineId: stage.pipelineId },
        orderBy: { position: 'asc' },
        select: { id: true },
      });

      for (let i = 0; i < remaining.length; i++) {
        await tx.crmStage.update({
          where: { id: remaining[i].id },
          data: { position: i },
        });
      }
    });

    return { deleted: true };
  }

  async reorderStages(
    tenantId: string,
    pipelineId: string,
    dto: ReorderStagesDto,
  ) {
    await this.findPipelineById(tenantId, pipelineId);

    // Verify all IDs belong to this pipeline
    const existing = await this.prisma.crmStage.findMany({
      where: { pipelineId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((s) => s.id));

    for (const id of dto.orderedIds) {
      if (!existingIds.has(id)) {
        throw new BadRequestException(`Stage ${id} does not belong to this pipeline`);
      }
    }

    if (dto.orderedIds.length !== existing.length) {
      throw new BadRequestException(
        `Expected ${existing.length} stage IDs, got ${dto.orderedIds.length}`,
      );
    }

    // Atomic reorder with serializable isolation to prevent race conditions
    // Wrapped in P2034 deadlock retry with exponential backoff
    await withPrismaRetry(
      () =>
        this.prisma.$transaction(
          async (tx) => {
            // First set all positions to negative to avoid unique constraint violations
            for (let i = 0; i < dto.orderedIds.length; i++) {
              await tx.crmStage.update({
                where: { id: dto.orderedIds[i] },
                data: { position: -(i + 1) },
              });
            }
            // Then set to actual positions
            for (let i = 0; i < dto.orderedIds.length; i++) {
              await tx.crmStage.update({
                where: { id: dto.orderedIds[i] },
                data: { position: i },
              });
            }
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      { loggerName: 'StageReorder', maxAttempts: 3 },
    );

    // Return updated stages
    return this.prisma.crmStage.findMany({
      where: { pipelineId },
      orderBy: { position: 'asc' },
    });
  }

  // ---- Default Pipeline Seed ----

  async createDefaultPipeline(tenantId: string) {
    const existing = await this.prisma.crmPipeline.findFirst({
      where: { tenantId, isDefault: true, deletedAt: null },
    });

    if (existing) {
      this.logger.debug(`Default pipeline already exists for tenant ${tenantId}`);
      return existing;
    }

    return this.prisma.crmPipeline.create({
      data: {
        tenantId,
        name: 'Sales Pipeline',
        description: 'Default sales pipeline',
        isDefault: true,
        stages: {
          create: [
            { name: 'Lead', position: 0, probability: 10, color: '#6B7280' },
            { name: 'Qualified', position: 1, probability: 25, color: '#3B82F6' },
            { name: 'Proposal', position: 2, probability: 50, color: '#8B5CF6' },
            { name: 'Negotiation', position: 3, probability: 75, color: '#F59E0B' },
            { name: 'Won', position: 4, probability: 100, color: '#10B981', isWon: true },
            { name: 'Lost', position: 5, probability: 0, color: '#EF4444', isLost: true },
          ],
        },
      },
      include: {
        stages: { orderBy: { position: 'asc' } },
      },
    });
  }

  // ---- Metrics ----

  async getMetrics(tenantId: string, pipelineId: string) {
    const pipeline = await this.findPipelineById(tenantId, pipelineId);

    // Get all non-deleted deals for this pipeline
    const deals = await this.prisma.crmDeal.findMany({
      where: { pipelineId, tenantId, deletedAt: null },
      select: {
        id: true,
        amount: true,
        stageId: true,
        closedAt: true,
        createdAt: true,
        stage: { select: { isWon: true, isLost: true, probability: true } },
      },
    });

    // Get stages ordered by position
    const stages = pipeline.stages ?? [];

    // Calculate per-stage metrics
    const stageMetrics = stages.map((stage) => {
      const stageDeals = deals.filter((d) => d.stageId === stage.id);
      const totalValue = stageDeals.reduce(
        (sum, d) => sum + (d.amount ? Number(d.amount) : 0),
        0,
      );

      // Average days in stage: for closed deals, use closedAt-createdAt as proxy
      // For open deals, use now-createdAt
      const now = new Date();
      const daysInStage = stageDeals.map((d) => {
        const end = d.closedAt ?? now;
        return (end.getTime() - d.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      });
      const avgDaysInStage =
        daysInStage.length > 0
          ? daysInStage.reduce((a, b) => a + b, 0) / daysInStage.length
          : 0;

      return {
        stageId: stage.id,
        stageName: stage.name,
        stageColor: stage.color,
        dealCount: stageDeals.length,
        totalValue,
        avgDaysInStage: Math.round(avgDaysInStage * 10) / 10,
      };
    });

    // Aggregate metrics
    const wonDeals = deals.filter((d) => d.stage.isWon);
    const lostDeals = deals.filter((d) => d.stage.isLost);
    const closedDeals = wonDeals.length + lostDeals.length;
    const openDeals = deals.filter((d) => !d.stage.isWon && !d.stage.isLost);

    const totalValue = openDeals.reduce(
      (sum, d) => sum + (d.amount ? Number(d.amount) : 0),
      0,
    );

    const weightedValue = openDeals.reduce((sum, d) => {
      const amount = d.amount ? Number(d.amount) : 0;
      return sum + amount * (d.stage.probability / 100);
    }, 0);

    const winRate = closedDeals > 0 ? (wonDeals.length / closedDeals) * 100 : 0;

    // Conversion rate: deals that moved beyond first stage / total deals
    const firstStageId = stages.length > 0 ? stages[0].id : null;
    const dealsNotInFirstStage = firstStageId
      ? deals.filter((d) => d.stageId !== firstStageId).length
      : 0;
    const conversionRate =
      deals.length > 0 ? (dealsNotInFirstStage / deals.length) * 100 : 0;

    // Average deal velocity: avg days from creation to close for won deals
    const wonDealDays = wonDeals
      .filter((d) => d.closedAt)
      .map((d) => {
        const ms = d.closedAt!.getTime() - d.createdAt.getTime();
        return ms / (1000 * 60 * 60 * 24);
      });
    const avgDealVelocity =
      wonDealDays.length > 0
        ? wonDealDays.reduce((a, b) => a + b, 0) / wonDealDays.length
        : 0;

    return {
      pipelineId,
      conversionRate: Math.round(conversionRate * 10) / 10,
      avgDealVelocity: Math.round(avgDealVelocity * 10) / 10,
      winRate: Math.round(winRate * 10) / 10,
      totalValue: Math.round(totalValue * 100) / 100,
      weightedValue: Math.round(weightedValue * 100) / 100,
      openDeals: openDeals.length,
      wonDeals: wonDeals.length,
      lostDeals: lostDeals.length,
      stageMetrics,
    };
  }

  // ---- Saved Views ----

  async listSavedViews(tenantId: string, pipelineId: string) {
    await this.findPipelineById(tenantId, pipelineId);
    return this.prisma.crmSavedView.findMany({
      where: { tenantId, pipelineId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSavedView(
    tenantId: string,
    pipelineId: string,
    dto: CreateSavedViewDto,
  ) {
    await this.findPipelineById(tenantId, pipelineId);

    try {
      return await this.prisma.crmSavedView.create({
        data: {
          tenantId,
          pipelineId,
          name: dto.name,
          filters: dto.filters as any,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(`Saved view "${dto.name}" already exists`);
      }
      throw error;
    }
  }

  async updateSavedView(
    tenantId: string,
    viewId: string,
    dto: UpdateSavedViewDto,
  ) {
    const view = await this.prisma.crmSavedView.findFirst({
      where: { id: viewId, tenantId },
    });
    if (!view) {
      throw new NotFoundException(`Saved view ${viewId} not found`);
    }

    try {
      return await this.prisma.crmSavedView.update({
        where: { id: viewId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.filters !== undefined && { filters: dto.filters as any }),
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(`Saved view "${dto.name}" already exists`);
      }
      throw error;
    }
  }

  async deleteSavedView(tenantId: string, viewId: string) {
    const view = await this.prisma.crmSavedView.findFirst({
      where: { id: viewId, tenantId },
    });
    if (!view) {
      throw new NotFoundException(`Saved view ${viewId} not found`);
    }

    await this.prisma.crmSavedView.delete({ where: { id: viewId } });
    return { deleted: true };
  }

  // ---- Helpers ----

  private async unsetDefaultPipeline(tenantId: string) {
    await this.prisma.crmPipeline.updateMany({
      where: { tenantId, isDefault: true },
      data: { isDefault: false },
    });
  }

  private async findStageWithTenantCheck(tenantId: string, stageId: string) {
    const stage = await this.prisma.crmStage.findFirst({
      where: { id: stageId },
      include: {
        pipeline: { select: { tenantId: true } },
        _count: { select: { deals: true } },
      },
    });

    if (!stage || stage.pipeline.tenantId !== tenantId) {
      throw new NotFoundException(`Stage ${stageId} not found`);
    }

    return stage;
  }
}
