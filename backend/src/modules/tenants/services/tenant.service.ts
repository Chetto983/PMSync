import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { TenantDeletedEvent } from '../../../common/events/tenant.events';

/**
 * TenantService - Manages tenant CRUD and lifecycle.
 *
 * Phase 32: Decoupled from ComplianceModule via TenantDeletedEvent.
 * - deleteTenant/hardDeleteTenant emit TenantDeletedEvent
 * - GdprEventHandlerService in ComplianceModule handles cleanup
 */
@Injectable()
export class TenantService {
  private logger = new Logger(TenantService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Get all tenants (admin only)
   */
  async getAllTenants() {
    return this.prisma.tenant.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: { users: true },
        },
      },
    });
  }

  /**
   * Get tenant by ID
   */
  async getTenantById(tenantId: string) {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: {
          select: { users: true, emails: true },
        },
      },
    });
  }

  /**
   * Create new tenant
   */
  async createTenant(data: { name: string; slug: string; description?: string }) {
    // Check if slug already exists
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: data.slug },
    });

    if (existing) {
      throw new BadRequestException('Slug already exists');
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        isActive: true,
      },
    });

    this.logger.log(`Tenant created: ${tenant.id}`);
    return tenant;
  }

  /**
   * Update tenant
   */
  async updateTenant(tenantId: string, data: Partial<{ name: string; description: string; isActive: boolean }>) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data,
    });
  }

  /**
   * Delete tenant (soft delete)
   * Phase 32: Emits TenantDeletedEvent for GDPR cleanup instead of direct GdprService call.
   */
  async deleteTenant(tenantId: string) {
    // Emit event BEFORE soft delete so handlers can access tenant data
    this.eventEmitter.emit(
      TenantDeletedEvent.eventName,
      new TenantDeletedEvent(tenantId, new Date()),
    );

    // Soft delete the tenant (Prisma cascade will handle PostgreSQL data)
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Permanently delete tenant and all associated data.
   * Use with caution - this is irreversible!
   *
   * Phase 32: Emits TenantDeletedEvent for GDPR cleanup instead of direct GdprService call.
   * @param tenantId - Tenant ID to permanently delete
   */
  async hardDeleteTenant(tenantId: string) {
    // Emit event BEFORE hard delete so handlers can access tenant data
    this.eventEmitter.emit(
      TenantDeletedEvent.eventName,
      new TenantDeletedEvent(tenantId, new Date()),
    );

    // Hard delete tenant (Prisma cascade onDelete will handle related records)
    this.logger.warn(`[GDPR] Hard deleting tenant ${tenantId} - this is irreversible!`);
    return this.prisma.tenant.delete({
      where: { id: tenantId },
    });
  }
}
