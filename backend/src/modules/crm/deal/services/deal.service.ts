import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateDealDto,
  UpdateDealDto,
  ListDealsQueryDto,
  LinkDealContactDto,
  ChangeStageDto,
} from '../dto/deal.dto';

@Injectable()
export class DealService {
  private readonly logger = new Logger(DealService.name);

  constructor(private readonly prisma: PrismaService) {}

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

    return { deal: updated, oldStageId };
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
