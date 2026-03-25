/**
 * CRM Custom Field Service
 *
 * CRUD operations for tenant-configurable custom fields.
 * Supports Account, Contact, and Deal entities.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import type {
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
  CustomFieldEntity,
} from '../dto/custom-field.dto';

@Injectable()
export class CustomFieldService {
  private readonly logger = new Logger(CustomFieldService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listFields(tenantId: string, entity?: CustomFieldEntity) {
    const where: Prisma.CrmCustomFieldWhereInput = { tenantId };
    if (entity) where.entity = entity;

    return this.prisma.crmCustomField.findMany({
      where,
      orderBy: [{ entity: 'asc' }, { position: 'asc' }],
    });
  }

  async getField(tenantId: string, id: string) {
    const field = await this.prisma.crmCustomField.findFirst({
      where: { id, tenantId },
    });
    if (!field) throw new NotFoundException('Custom field not found');
    return field;
  }

  async createField(tenantId: string, dto: CreateCustomFieldDto) {
    try {
      return await this.prisma.crmCustomField.create({
        data: {
          tenantId,
          entity: dto.entity,
          name: dto.name,
          label: dto.label,
          type: dto.type,
          options: dto.options
            ? (dto.options as unknown as Prisma.InputJsonValue)
            : undefined,
          required: dto.required ?? false,
          position: dto.position ?? 0,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          `Custom field "${dto.name}" already exists for ${dto.entity}`,
        );
      }
      throw error;
    }
  }

  async updateField(tenantId: string, id: string, dto: UpdateCustomFieldDto) {
    await this.getField(tenantId, id);

    return this.prisma.crmCustomField.update({
      where: { id },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.options !== undefined && {
          options: dto.options as unknown as Prisma.InputJsonValue,
        }),
        ...(dto.required !== undefined && { required: dto.required }),
        ...(dto.position !== undefined && { position: dto.position }),
      },
    });
  }

  async deleteField(tenantId: string, id: string) {
    await this.getField(tenantId, id);

    // Delete all values first, then the field
    await this.prisma.$transaction([
      this.prisma.crmCustomFieldValue.deleteMany({ where: { fieldId: id, tenantId } }),
      this.prisma.crmCustomField.delete({ where: { id } }),
    ]);
  }

  /**
   * Get custom field values for an entity instance
   */
  async getValues(tenantId: string, entityId: string) {
    return this.prisma.crmCustomFieldValue.findMany({
      where: { entityId, tenantId },
      include: { field: true },
    });
  }

  /**
   * Set custom field values for an entity instance (upsert)
   */
  async setValues(
    tenantId: string,
    entityId: string,
    values: Array<{ fieldId: string; value: any }>,
  ) {
    const results = [];

    for (const { fieldId, value } of values) {
      // Verify field belongs to this tenant
      const field = await this.prisma.crmCustomField.findFirst({
        where: { id: fieldId, tenantId },
      });
      if (!field) {
        this.logger.warn(`Custom field ${fieldId} not found for tenant ${tenantId}`);
        continue;
      }

      // Upsert the value
      const result = await this.prisma.crmCustomFieldValue.upsert({
        where: {
          fieldId_entityId_tenantId: { fieldId, entityId, tenantId },
        },
        create: {
          fieldId,
          entityId,
          tenantId,
          value: value as Prisma.InputJsonValue,
        },
        update: {
          value: value as Prisma.InputJsonValue,
        },
        include: { field: true },
      });
      results.push(result);
    }

    return results;
  }

  /**
   * Delete a specific custom field value
   */
  async deleteValue(tenantId: string, fieldId: string, entityId: string) {
    await this.prisma.crmCustomFieldValue.deleteMany({
      where: { fieldId, entityId, tenantId },
    });
  }
}
