import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class TenantService {
  private logger = new Logger(TenantService.name);

  constructor(private prisma: PrismaService) {}

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
   */
  async deleteTenant(tenantId: string) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { deletedAt: new Date() },
    });
  }
}
