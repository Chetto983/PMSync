import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTemplateDto, UpdateTemplateDto } from '../dto/template.dto';

@Injectable()
export class EmailTemplateService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new email template
   * If isDefault=true, unsets other defaults
   */
  async create(tenantId: string, userId: string, dto: CreateTemplateDto) {
    // If setting as default, unset existing defaults
    if (dto.isDefault) {
      await this.prisma.emailTemplate.updateMany({
        where: {
          tenantId,
          userId,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.emailTemplate.create({
      data: {
        tenantId,
        userId,
        name: dto.name,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        category: dto.category ?? null,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  /**
   * Get all templates for a user, optionally filtered by category
   */
  async findAll(tenantId: string, userId: string, category?: string) {
    const templates = await this.prisma.emailTemplate.findMany({
      where: {
        tenantId,
        userId,
        ...(category && { category }),
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    return {
      templates,
      total: templates.length,
    };
  }

  /**
   * Get a single template by ID
   */
  async findOne(tenantId: string, userId: string, id: string) {
    const template = await this.prisma.emailTemplate.findFirst({
      where: { id, tenantId, userId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return template;
  }

  /**
   * Get the default template (for quick compose)
   */
  async findDefault(tenantId: string, userId: string) {
    return this.prisma.emailTemplate.findFirst({
      where: { tenantId, userId, isDefault: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get unique categories used by user's templates
   */
  async getCategories(tenantId: string, userId: string) {
    const templates = await this.prisma.emailTemplate.findMany({
      where: { tenantId, userId, category: { not: null } },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });

    return templates.map((t) => t.category).filter(Boolean);
  }

  /**
   * Update a template
   */
  async update(tenantId: string, userId: string, id: string, dto: UpdateTemplateDto) {
    // Verify template exists and belongs to user
    await this.findOne(tenantId, userId, id);

    // If setting as default, unset existing defaults
    if (dto.isDefault) {
      await this.prisma.emailTemplate.updateMany({
        where: {
          tenantId,
          userId,
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    await this.prisma.emailTemplate.updateMany({
      where: { id, tenantId },
      data: dto,
    });
    return this.prisma.emailTemplate.findFirst({ where: { id, tenantId } });
  }

  /**
   * Delete a template
   */
  async delete(tenantId: string, userId: string, id: string) {
    // Verify template exists and belongs to user
    await this.findOne(tenantId, userId, id);

    await this.prisma.emailTemplate.deleteMany({ where: { id, tenantId } });
    return { success: true };
  }

  /**
   * Set a template as the default
   */
  async setDefault(tenantId: string, userId: string, id: string) {
    await this.findOne(tenantId, userId, id);

    // Unset other defaults
    await this.prisma.emailTemplate.updateMany({
      where: {
        tenantId,
        userId,
        isDefault: true,
        id: { not: id },
      },
      data: { isDefault: false },
    });

    // Set this one as default
    await this.prisma.emailTemplate.updateMany({
      where: { id, tenantId },
      data: { isDefault: true },
    });
    return this.prisma.emailTemplate.findFirst({ where: { id, tenantId } });
  }

  /**
   * Duplicate a template with a new name
   */
  async duplicate(tenantId: string, userId: string, id: string, newName?: string) {
    const original = await this.findOne(tenantId, userId, id);

    return this.prisma.emailTemplate.create({
      data: {
        tenantId,
        userId,
        name: newName || `${original.name} (Copy)`,
        subject: original.subject,
        bodyHtml: original.bodyHtml,
        category: original.category,
        isDefault: false,
      },
    });
  }
}
