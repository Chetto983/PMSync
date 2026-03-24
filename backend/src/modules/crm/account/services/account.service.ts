import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateAccountDto, UpdateAccountDto, ListAccountsQueryDto } from '../dto/account.dto';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: ListAccountsQueryDto) {
    const where: Prisma.CrmAccountWhereInput = {
      tenantId,
      deletedAt: null,
    };

    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }
    if (query.industry) {
      where.industry = query.industry;
    }
    if (query.size) {
      where.size = query.size;
    }
    if (query.parentId) {
      where.parentId = query.parentId;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.crmAccount.findMany({
        where,
        include: {
          parent: { select: { id: true, name: true } },
          _count: { select: { contacts: true, deals: true, children: true } },
        },
        orderBy: { name: 'asc' },
        take: query.limit ?? 25,
        skip: query.offset ?? 0,
      }),
      this.prisma.crmAccount.count({ where }),
    ]);

    return { data, total };
  }

  async findById(tenantId: string, id: string) {
    const account = await this.prisma.crmAccount.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true }, where: { deletedAt: null } },
        contacts: {
          include: {
            contact: {
              select: { id: true, tenantId: true, displayName: true, company: true },
            },
          },
        },
        _count: { select: { deals: true } },
      },
    });

    if (!account) {
      throw new NotFoundException(`Account ${id} not found`);
    }

    return account;
  }

  async create(tenantId: string, dto: CreateAccountDto) {
    return this.prisma.crmAccount.create({
      data: {
        tenantId,
        name: dto.name,
        website: dto.website,
        industry: dto.industry,
        size: dto.size,
        revenue: dto.revenue,
        currency: dto.currency,
        address: dto.address as Prisma.InputJsonValue,
        phone: dto.phone,
        description: dto.description,
        parentId: dto.parentId,
      },
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { contacts: true, deals: true, children: true } },
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateAccountDto) {
    // Verify existence and tenant ownership
    await this.findById(tenantId, id);

    return this.prisma.crmAccount.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.website !== undefined && { website: dto.website }),
        ...(dto.industry !== undefined && { industry: dto.industry }),
        ...(dto.size !== undefined && { size: dto.size }),
        ...(dto.revenue !== undefined && { revenue: dto.revenue }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.address !== undefined && { address: dto.address as Prisma.InputJsonValue }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
      },
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { contacts: true, deals: true, children: true } },
      },
    });
  }

  async delete(tenantId: string, id: string) {
    // Verify existence and tenant ownership
    await this.findById(tenantId, id);

    // Soft-delete
    await this.prisma.crmAccount.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { deleted: true };
  }
}
