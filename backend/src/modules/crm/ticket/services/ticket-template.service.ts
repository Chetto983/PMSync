import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

interface CreateTemplateDto {
  name: string;
  body: string;
  category?: string;
}

interface UpdateTemplateDto {
  name?: string;
  body?: string;
  category?: string | null;
}

@Injectable()
export class TicketTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, category?: string) {
    return this.prisma.ticketTemplate.findMany({
      where: {
        tenantId,
        ...(category ? { category } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(tenantId: string, dto: CreateTemplateDto) {
    return this.prisma.ticketTemplate.create({
      data: {
        tenantId,
        name: dto.name,
        body: dto.body,
        category: dto.category ?? null,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateTemplateDto) {
    const existing = await this.prisma.ticketTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Template not found');

    return this.prisma.ticketTemplate.update({
      where: { id, tenantId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
      },
    });
  }

  async delete(tenantId: string, id: string) {
    const existing = await this.prisma.ticketTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Template not found');

    await this.prisma.ticketTemplate.delete({ where: { id, tenantId } });
    return { deleted: true };
  }
}
