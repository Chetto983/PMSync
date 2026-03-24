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
  CreateAccountDto,
  UpdateAccountDto,
  ListAccountsQueryDto,
  LinkContactDto,
} from '../dto/account.dto';

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

  async getChildren(tenantId: string, id: string) {
    // Verify parent exists
    await this.findById(tenantId, id);

    return this.prisma.crmAccount.findMany({
      where: { tenantId, parentId: id, deletedAt: null },
      include: {
        _count: { select: { contacts: true, deals: true, children: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateAccountDto) {
    // Verify existence and tenant ownership
    await this.findById(tenantId, id);

    // Cycle detection when setting parentId
    if (dto.parentId !== undefined && dto.parentId !== null) {
      await this.validateNoCycle(tenantId, id, dto.parentId);
    }

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

  async getAccountsByContact(tenantId: string, contactId: string) {
    return this.prisma.accountContact.findMany({
      where: { contactId, tenantId },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            website: true,
            industry: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getContacts(tenantId: string, accountId: string) {
    await this.findById(tenantId, accountId);

    return this.prisma.accountContact.findMany({
      where: { accountId, tenantId },
      include: {
        contact: {
          select: {
            id: true,
            tenantId: true,
            displayName: true,
            company: true,
            emails: true,
            phoneNumbers: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async linkContact(tenantId: string, accountId: string, dto: LinkContactDto) {
    await this.findById(tenantId, accountId);

    // Verify contact exists in same tenant
    const contact = await this.prisma.contact.findFirst({
      where: { id: dto.contactId, tenantId },
    });
    if (!contact) {
      throw new NotFoundException(`Contact ${dto.contactId} not found`);
    }

    try {
      return await this.prisma.accountContact.create({
        data: {
          accountId,
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
              emails: true,
              phoneNumbers: true,
            },
          },
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Contact is already linked to this account');
      }
      throw error;
    }
  }

  async unlinkContact(
    tenantId: string,
    accountId: string,
    contactId: string,
  ) {
    const link = await this.prisma.accountContact.findFirst({
      where: { accountId, contactId, tenantId },
    });
    if (!link) {
      throw new NotFoundException('Contact-Account link not found');
    }

    await this.prisma.accountContact.delete({ where: { id: link.id } });
    return { deleted: true };
  }

  /**
   * Walk the ancestor chain from targetParentId upward.
   * If we ever encounter `accountId`, it means setting this parent
   * would create a cycle. Max depth: 5 levels.
   */
  private async validateNoCycle(
    tenantId: string,
    accountId: string,
    targetParentId: string,
  ): Promise<void> {
    if (targetParentId === accountId) {
      throw new BadRequestException('An account cannot be its own parent');
    }

    let currentId: string | null = targetParentId;
    const maxDepth = 5;

    for (let depth = 0; depth < maxDepth && currentId; depth++) {
      const ancestor: { parentId: string | null } | null =
        await this.prisma.crmAccount.findFirst({
          where: { id: currentId, tenantId, deletedAt: null },
          select: { parentId: true },
        });

      if (!ancestor) break;
      if (ancestor.parentId === accountId) {
        throw new BadRequestException(
          'Setting this parent would create a cycle in the account hierarchy',
        );
      }
      currentId = ancestor.parentId;
    }
  }
}
