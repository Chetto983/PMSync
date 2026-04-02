import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  ListSuggestionsQueryDto,
  BulkSuggestionDto,
} from '../dto/suggestion.dto';

@Injectable()
export class CrmSuggestionService {
  private readonly logger = new Logger(CrmSuggestionService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---- CRUD ----

  async list(tenantId: string, query: ListSuggestionsQueryDto) {
    const where: Prisma.CrmSuggestionWhereInput = { tenantId };

    if (query.type) {
      where.type = query.type;
    }
    if (query.status) {
      where.status = query.status;
    } else {
      where.status = 'pending'; // default to pending
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.crmSuggestion.findMany({
        where,
        include: {
          sourceEmail: {
            select: { id: true, tenantId: true, subject: true, from: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? 25,
        skip: query.offset ?? 0,
      }),
      this.prisma.crmSuggestion.count({ where }),
    ]);

    return { data, total };
  }

  async findById(tenantId: string, id: string) {
    const suggestion = await this.prisma.crmSuggestion.findFirst({
      where: { id, tenantId },
      include: {
        sourceEmail: {
          select: { id: true, tenantId: true, subject: true, from: true },
        },
      },
    });
    if (!suggestion) {
      throw new NotFoundException(`Suggestion ${id} not found`);
    }
    return suggestion;
  }

  async create(
    tenantId: string,
    data: {
      type: string;
      entityData: Record<string, unknown>;
      sourceEmailId?: string;
      sourceType?: string;
      confidence?: number;
    },
  ) {
    // Dedup: skip if identical pending suggestion exists
    const existing = await this.prisma.crmSuggestion.findFirst({
      where: {
        tenantId,
        type: data.type,
        status: 'pending',
        entityData: { equals: data.entityData as Prisma.InputJsonValue },
      },
    });
    if (existing) {
      this.logger.debug(
        `Duplicate suggestion skipped: ${data.type} for tenant ${tenantId}`,
      );
      return existing;
    }

    return this.prisma.crmSuggestion.create({
      data: {
        tenantId,
        type: data.type,
        entityData: data.entityData as Prisma.InputJsonValue,
        sourceEmailId: data.sourceEmailId,
        sourceEmailTenant: data.sourceEmailId ? tenantId : undefined,
        sourceType: data.sourceType,
        confidence: data.confidence ?? 0.5,
      },
    });
  }

  // ---- Accept / Dismiss ----

  async accept(tenantId: string, id: string, userId?: string) {
    const suggestion = await this.findById(tenantId, id);
    if (suggestion.status !== 'pending') {
      throw new BadRequestException(
        `Suggestion already ${suggestion.status}`,
      );
    }

    const entityData = suggestion.entityData as Record<string, unknown>;
    let createdEntityId: string | null = null;

    switch (suggestion.type) {
      case 'account':
        createdEntityId = await this.createAccount(tenantId, entityData);
        break;
      case 'deal':
        createdEntityId = await this.createDeal(tenantId, entityData);
        break;
      case 'ticket':
        createdEntityId = await this.createTicket(tenantId, entityData);
        break;
      case 'task':
        if (!userId) throw new BadRequestException('Task creation requires userId');
        createdEntityId = await this.createTask(tenantId, entityData, userId);
        break;
      case 'link':
        await this.linkContactToAccount(tenantId, entityData);
        break;
      default:
        throw new BadRequestException(`Unknown suggestion type: ${suggestion.type}`);
    }

    return this.prisma.crmSuggestion.update({
      where: { id },
      data: {
        status: 'accepted',
        entityData: {
          ...entityData,
          ...(createdEntityId ? { createdEntityId } : {}),
        } as Prisma.InputJsonValue,
      },
    });
  }

  async dismiss(tenantId: string, id: string) {
    const suggestion = await this.findById(tenantId, id);
    if (suggestion.status !== 'pending') {
      throw new BadRequestException(
        `Suggestion already ${suggestion.status}`,
      );
    }

    return this.prisma.crmSuggestion.update({
      where: { id },
      data: { status: 'dismissed' },
    });
  }

  async bulk(tenantId: string, dto: BulkSuggestionDto, userId?: string) {
    const results = await Promise.allSettled(
      dto.ids.map((id) =>
        dto.action === 'accept'
          ? this.accept(tenantId, id, userId)
          : this.dismiss(tenantId, id),
      ),
    );

    const succeeded = results.filter(
      (r) => r.status === 'fulfilled',
    ).length;
    const failed = results.filter(
      (r) => r.status === 'rejected',
    ).length;

    return { succeeded, failed, total: dto.ids.length };
  }

  // ---- Entity Creation Helpers ----

  private async createAccount(
    tenantId: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    const account = await this.prisma.crmAccount.create({
      data: {
        tenantId,
        name: (data.name as string) || 'Unknown',
        website: data.website as string | undefined,
      },
    });
    this.logger.log(`Created account ${account.id} from suggestion`);
    return account.id;
  }

  private async createDeal(
    tenantId: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    // Find default pipeline + first stage
    const pipeline = await this.prisma.crmPipeline.findFirst({
      where: { tenantId },
      include: { stages: { orderBy: { position: 'asc' }, take: 1 } },
    });
    if (!pipeline || pipeline.stages.length === 0) {
      throw new BadRequestException(
        'No pipeline found. Create a pipeline before accepting deal suggestions.',
      );
    }

    const deal = await this.prisma.crmDeal.create({
      data: {
        tenantId,
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0].id,
        name: (data.title as string) || 'New Deal',
        accountId: data.accountId as string | undefined,
        source: 'AUTO_SUGGESTION',
      },
    });

    // Link contact if provided
    if (data.contactId) {
      await this.prisma.dealContact
        .create({
          data: {
            dealId: deal.id,
            contactId: data.contactId as string,
            tenantId,
            role: 'Primary',
          },
        })
        .catch((e) => {
          this.logger.warn(`Failed to link contact to deal: ${e.message}`);
        });
    }

    this.logger.log(`Created deal ${deal.id} from suggestion`);
    return deal.id;
  }

  private async createTicket(
    tenantId: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    const ticket = await this.prisma.ticket.create({
      data: {
        tenant: { connect: { id: tenantId } },
        subject: (data.subject as string) || 'New Ticket',
        priority: (data.priority as string) || 'medium',
        ...(data.contactId
          ? {
              contact: {
                connect: {
                  id_tenantId: {
                    id: data.contactId as string,
                    tenantId,
                  },
                },
              },
            }
          : {}),
        ...(data.sourceEmailId
          ? {
              email: {
                connect: {
                  id_tenantId: {
                    id: data.sourceEmailId as string,
                    tenantId,
                  },
                },
              },
            }
          : {}),
      },
    });
    this.logger.log(`Created ticket ${ticket.id} from suggestion`);
    return ticket.id;
  }

  private async linkContactToAccount(
    tenantId: string,
    data: Record<string, unknown>,
  ) {
    const contactId = data.contactId as string;
    const accountId = data.accountId as string;

    if (!contactId || !accountId) {
      throw new BadRequestException(
        'Link suggestion requires contactId and accountId',
      );
    }

    await this.prisma.accountContact.upsert({
      where: {
        accountId_contactId_tenantId: { accountId, contactId, tenantId },
      },
      update: {},
      create: { accountId, contactId, tenantId },
    });

    this.logger.log(
      `Linked contact ${contactId} to account ${accountId}`,
    );
  }

  private async createTask(
    tenantId: string,
    data: Record<string, unknown>,
    userId: string,
  ): Promise<string> {
    const task = await this.prisma.manualTask.create({
      data: {
        tenantId,
        userId,
        title: (data.title as string) || 'New Task',
        description: (data.description as string) || undefined,
        status: 'pending',
        priority: (data.priority as string) || 'medium',
        contactId: (data.contactId as string) || undefined,
        contactTenant: data.contactId ? tenantId : undefined,
        emailId: (data.emailId as string) || undefined,
        emailTenant: data.emailId ? tenantId : undefined,
        dealId: (data.dealId as string) || undefined,
      },
    });
    this.logger.log(`Created task ${task.id} from suggestion`);
    return task.id;
  }
}
