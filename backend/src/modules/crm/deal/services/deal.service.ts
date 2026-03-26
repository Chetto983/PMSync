import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { StageAutomationService } from '../../automation/stage-automation.service';
import { Prisma } from '@prisma/client';
import {
  CreateDealDto,
  UpdateDealDto,
  ListDealsQueryDto,
  LinkDealContactDto,
  LinkDealProductDto,
  ChangeStageDto,
  CreateActivityDto,
  ListActivitiesQueryDto,
  CreateNoteDto,
  UpdateNoteDto,
} from '../dto/deal.dto';

@Injectable()
export class DealService {
  private readonly logger = new Logger(DealService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly stageAutomation: StageAutomationService,
  ) {}

  // ---- Deal CRUD ----

  async list(tenantId: string, query: ListDealsQueryDto) {
    const where: Prisma.CrmDealWhereInput = {
      tenantId,
      deletedAt: null,
    };

    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }
    if (query.pipelineId) {
      where.pipelineId = query.pipelineId;
    }
    if (query.stageId) {
      where.stageId = query.stageId;
    }
    if (query.accountId) {
      where.accountId = query.accountId;
    }
    if (query.priority) {
      where.priority = query.priority;
    }
    if (query.contactId) {
      where.dealContacts = { some: { contactId: query.contactId } };
    }
    if (query.expectedCloseDateFrom || query.expectedCloseDateTo) {
      where.expectedCloseDate = {};
      if (query.expectedCloseDateFrom) {
        where.expectedCloseDate.gte = new Date(query.expectedCloseDateFrom);
      }
      if (query.expectedCloseDateTo) {
        where.expectedCloseDate.lte = new Date(query.expectedCloseDateTo);
      }
    }
    if (query.amountMin !== undefined || query.amountMax !== undefined) {
      where.amount = {};
      if (query.amountMin !== undefined) {
        where.amount.gte = query.amountMin;
      }
      if (query.amountMax !== undefined) {
        where.amount.lte = query.amountMax;
      }
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.crmDeal.findMany({
        where,
        include: {
          pipeline: { select: { id: true, name: true } },
          stage: { select: { id: true, name: true, color: true, probability: true } },
          account: { select: { id: true, name: true } },
          _count: { select: { dealContacts: true, dealProducts: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: query.limit ?? 25,
        skip: query.offset ?? 0,
      }),
      this.prisma.crmDeal.count({ where }),
    ]);

    return { data, total };
  }

  async findById(tenantId: string, id: string) {
    const deal = await this.prisma.crmDeal.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        pipeline: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true, color: true, probability: true, isWon: true, isLost: true } },
        account: { select: { id: true, name: true } },
        dealContacts: {
          include: {
            contact: {
              select: { id: true, tenantId: true, displayName: true, company: true },
            },
          },
        },
        _count: { select: { dealProducts: true, activities: true } },
      },
    });

    if (!deal) {
      throw new NotFoundException(`Deal ${id} not found`);
    }

    return deal;
  }

  async create(tenantId: string, dto: CreateDealDto) {
    // Validate stageId belongs to pipelineId
    await this.validateStageInPipeline(tenantId, dto.pipelineId, dto.stageId);

    // Validate accountId if provided
    if (dto.accountId) {
      await this.validateAccount(tenantId, dto.accountId);
    }

    return this.prisma.crmDeal.create({
      data: {
        tenantId,
        name: dto.name,
        pipelineId: dto.pipelineId,
        stageId: dto.stageId,
        accountId: dto.accountId,
        amount: dto.amount,
        currency: dto.currency,
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
        priority: dto.priority,
        source: dto.source,
        notes: dto.notes,
      },
      include: {
        pipeline: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true, color: true, probability: true } },
        account: { select: { id: true, name: true } },
        _count: { select: { dealContacts: true, dealProducts: true } },
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateDealDto) {
    await this.findById(tenantId, id);

    // If changing pipeline, require stageId too (or validate existing stage)
    if (dto.pipelineId && dto.stageId) {
      await this.validateStageInPipeline(tenantId, dto.pipelineId, dto.stageId);
    } else if (dto.stageId && !dto.pipelineId) {
      // Validate stage belongs to deal's current pipeline
      const deal = await this.prisma.crmDeal.findFirst({
        where: { id, tenantId },
        select: { pipelineId: true },
      });
      if (deal) {
        await this.validateStageInPipeline(tenantId, deal.pipelineId, dto.stageId);
      }
    } else if (dto.pipelineId && !dto.stageId) {
      throw new BadRequestException(
        'When changing pipeline, you must also provide a stageId from the new pipeline',
      );
    }

    // Validate accountId if provided (null clears association)
    if (dto.accountId) {
      await this.validateAccount(tenantId, dto.accountId);
    }

    return this.prisma.crmDeal.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.pipelineId !== undefined && { pipelineId: dto.pipelineId }),
        ...(dto.stageId !== undefined && { stageId: dto.stageId }),
        ...(dto.accountId !== undefined && { accountId: dto.accountId }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.expectedCloseDate !== undefined && {
          expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : null,
        }),
        ...(dto.closedAt !== undefined && {
          closedAt: dto.closedAt ? new Date(dto.closedAt) : null,
        }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.source !== undefined && { source: dto.source }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: {
        pipeline: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true, color: true, probability: true } },
        account: { select: { id: true, name: true } },
        _count: { select: { dealContacts: true, dealProducts: true } },
      },
    });
  }

  async delete(tenantId: string, id: string) {
    await this.findById(tenantId, id);

    await this.prisma.crmDeal.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { deleted: true };
  }

  // ---- Deal-Contact associations ----

  async getContacts(tenantId: string, dealId: string) {
    await this.findById(tenantId, dealId);

    return this.prisma.dealContact.findMany({
      where: { dealId, tenantId },
      include: {
        contact: {
          select: {
            id: true,
            tenantId: true,
            displayName: true,
            company: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async linkContact(tenantId: string, dealId: string, dto: LinkDealContactDto) {
    await this.findById(tenantId, dealId);

    // Verify contact exists in same tenant
    const contact = await this.prisma.contact.findFirst({
      where: { id: dto.contactId, tenantId },
    });
    if (!contact) {
      throw new NotFoundException(`Contact ${dto.contactId} not found`);
    }

    try {
      return await this.prisma.dealContact.create({
        data: {
          dealId,
          contactId: dto.contactId,
          tenantId,
          role: dto.role,
        },
        include: {
          contact: {
            select: {
              id: true,
              tenantId: true,
              displayName: true,
              company: true,
            },
          },
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Contact is already linked to this deal');
      }
      throw error;
    }
  }

  async unlinkContact(tenantId: string, dealId: string, contactId: string) {
    const link = await this.prisma.dealContact.findFirst({
      where: { dealId, contactId, tenantId },
    });
    if (!link) {
      throw new NotFoundException('Deal-Contact link not found');
    }

    await this.prisma.dealContact.delete({ where: { id: link.id } });
    return { deleted: true };
  }

  // ---- Deal-Product associations ----

  async getProducts(tenantId: string, dealId: string) {
    await this.findById(tenantId, dealId);

    return this.prisma.dealProduct.findMany({
      where: { dealId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            code: true,
            price: true,
            currency: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async linkProduct(
    tenantId: string,
    dealId: string,
    dto: LinkDealProductDto,
  ) {
    await this.findById(tenantId, dealId);

    // Verify product exists in same tenant
    const product = await this.prisma.crmProduct.findFirst({
      where: { id: dto.productId, tenantId, deletedAt: null },
    });
    if (!product) {
      throw new NotFoundException(`Product ${dto.productId} not found`);
    }

    try {
      return await this.prisma.dealProduct.create({
        data: {
          dealId,
          productId: dto.productId,
          quantity: dto.quantity ?? 1,
          unitPrice: dto.unitPrice,
          discount: dto.discount ?? 0,
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              code: true,
              price: true,
              currency: true,
              isActive: true,
            },
          },
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Product is already linked to this deal');
      }
      throw error;
    }
  }

  async unlinkProduct(tenantId: string, dealId: string, linkId: string) {
    await this.findById(tenantId, dealId);

    const link = await this.prisma.dealProduct.findFirst({
      where: { id: linkId, dealId },
    });
    if (!link) {
      throw new NotFoundException('Deal-Product link not found');
    }

    await this.prisma.dealProduct.delete({ where: { id: linkId } });
    return { deleted: true };
  }

  // ---- Stage Transition ----

  async changeStage(tenantId: string, id: string, dto: ChangeStageDto) {
    const deal = await this.findById(tenantId, id);
    const oldStageId = deal.stageId;

    if (oldStageId === dto.stageId) {
      return deal; // No-op if same stage
    }

    // Validate new stage belongs to the deal's pipeline
    await this.validateStageInPipeline(tenantId, deal.pipelineId, dto.stageId);

    const updated = await this.prisma.crmDeal.update({
      where: { id },
      data: { stageId: dto.stageId },
      include: {
        pipeline: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true, color: true, probability: true, isWon: true, isLost: true } },
        account: { select: { id: true, name: true } },
        _count: { select: { dealContacts: true, dealProducts: true } },
      },
    });

    // Record STAGE_CHANGE activity
    const oldStage = await this.prisma.crmStage.findUnique({
      where: { id: oldStageId },
      select: { name: true },
    });
    await this.prisma.crmActivity.create({
      data: {
        tenantId,
        dealId: id,
        type: 'STAGE_CHANGE',
        content: `Stage changed from ${oldStage?.name ?? 'unknown'} to ${updated.stage?.name ?? 'unknown'}`,
        metadata: { fromStageId: oldStageId, toStageId: dto.stageId },
      },
    });

    // Emit real-time event for Kanban board sync
    this.realtimeEvents.emitCrmDealStageChanged(tenantId, {
      dealId: id,
      dealName: updated.name,
      pipelineId: updated.pipelineId,
      oldStageId,
      newStageId: dto.stageId,
      newStageName: updated.stage?.name ?? '',
    });

    // Enqueue stage automations (async, non-blocking)
    await this.stageAutomation.enqueueStageChange({
      tenantId,
      dealId: id,
      dealName: updated.name,
      pipelineId: updated.pipelineId,
      oldStageId,
      newStageId: dto.stageId,
      newStageName: updated.stage?.name ?? '',
      triggeredByAutomation: false,
    });

    return { deal: updated, oldStageId };
  }

  // ---- Activities ----

  async listActivities(
    tenantId: string,
    dealId: string,
    query: ListActivitiesQueryDto,
  ) {
    await this.findById(tenantId, dealId);

    const where = { dealId, tenantId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.crmActivity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? 20,
        skip: query.offset ?? 0,
      }),
      this.prisma.crmActivity.count({ where }),
    ]);

    return { data, total };
  }

  async createActivity(
    tenantId: string,
    dealId: string,
    dto: CreateActivityDto,
  ) {
    await this.findById(tenantId, dealId);

    return this.prisma.crmActivity.create({
      data: {
        tenantId,
        dealId,
        type: dto.type,
        content: dto.description,
        metadata: {
          ...(dto.date && { date: dto.date }),
          ...(dto.durationMinutes !== undefined && {
            durationMinutes: dto.durationMinutes,
          }),
        },
      },
    });
  }

  // ---- Notes (CrmActivity type=NOTE) ----

  async listNotes(tenantId: string, dealId: string) {
    await this.findById(tenantId, dealId);

    return this.prisma.crmActivity.findMany({
      where: { dealId, tenantId, type: 'NOTE' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createNote(tenantId: string, dealId: string, dto: CreateNoteDto) {
    await this.findById(tenantId, dealId);

    return this.prisma.crmActivity.create({
      data: {
        tenantId,
        dealId,
        type: 'NOTE',
        content: dto.content,
      },
    });
  }

  async updateNote(tenantId: string, noteId: string, dto: UpdateNoteDto) {
    const note = await this.prisma.crmActivity.findFirst({
      where: { id: noteId, tenantId, type: 'NOTE' },
    });
    if (!note) {
      throw new NotFoundException(`Note ${noteId} not found`);
    }

    return this.prisma.crmActivity.update({
      where: { id: noteId },
      data: { content: dto.content },
    });
  }

  async deleteNote(tenantId: string, noteId: string) {
    const note = await this.prisma.crmActivity.findFirst({
      where: { id: noteId, tenantId, type: 'NOTE' },
    });
    if (!note) {
      throw new NotFoundException(`Note ${noteId} not found`);
    }

    await this.prisma.crmActivity.delete({ where: { id: noteId } });
    return { deleted: true };
  }

  // ---- Helpers ----

  private async validateStageInPipeline(
    tenantId: string,
    pipelineId: string,
    stageId: string,
  ) {
    const pipeline = await this.prisma.crmPipeline.findFirst({
      where: { id: pipelineId, tenantId, deletedAt: null },
    });
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }

    const stage = await this.prisma.crmStage.findFirst({
      where: { id: stageId, pipelineId },
    });
    if (!stage) {
      throw new BadRequestException(
        `Stage ${stageId} does not belong to pipeline ${pipelineId}`,
      );
    }
  }

  private async validateAccount(tenantId: string, accountId: string) {
    const account = await this.prisma.crmAccount.findFirst({
      where: { id: accountId, tenantId, deletedAt: null },
    });
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }
  }
}
