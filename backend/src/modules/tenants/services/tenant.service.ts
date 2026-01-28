import { Inject, Injectable, Logger, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { GdprService } from '../../compliance/services/gdpr.service';

@Injectable()
export class TenantService {
  private logger = new Logger(TenantService.name);

  constructor(
    private prisma: PrismaService,
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(GdprService) private gdprService?: GdprService,
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
   * Also triggers GDPR cleanup for external services (Mistral agents, etc.)
   */
  async deleteTenant(tenantId: string) {
    // 1. Clean up external service data (Mistral agents, etc.)
    // This must happen BEFORE the soft delete to ensure we can still find tenant data
    if (this.gdprService) {
      try {
        const purgeResult = await this.gdprService.purgeExternalTenantData(tenantId);
        if (!purgeResult.success) {
          this.logger.warn(
            `[GDPR] External data purge had errors for tenant ${tenantId}: ${purgeResult.errors.join(', ')}`,
          );
        } else {
          this.logger.log(
            `[GDPR] External data purge complete for tenant ${tenantId}: ${purgeResult.deletedCounts.mistralAgents} Mistral agents deleted`,
          );
        }
      } catch (error) {
        // Don't fail the delete if external cleanup fails
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`[GDPR] External data purge failed for tenant ${tenantId}: ${msg}`);
      }
    }

    // 2. Soft delete the tenant (Prisma cascade will handle PostgreSQL data)
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Permanently delete tenant and all associated data.
   * Use with caution - this is irreversible!
   *
   * @param tenantId - Tenant ID to permanently delete
   */
  async hardDeleteTenant(tenantId: string) {
    // 1. Clean up external service data (Mistral agents, etc.)
    if (this.gdprService) {
      try {
        const purgeResult = await this.gdprService.purgeExternalTenantData(tenantId);
        this.logger.log(
          `[GDPR] External data purge for hard delete: ${purgeResult.deletedCounts.mistralAgents} Mistral agents deleted`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`[GDPR] External data purge failed during hard delete for tenant ${tenantId}: ${msg}`);
        // Continue with hard delete even if external cleanup fails
      }
    }

    // 2. Hard delete tenant (Prisma cascade onDelete will handle related records)
    this.logger.warn(`[GDPR] Hard deleting tenant ${tenantId} - this is irreversible!`);
    return this.prisma.tenant.delete({
      where: { id: tenantId },
    });
  }
}
