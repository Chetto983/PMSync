import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import { TenantService } from '../services/tenant.service';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import { UpdateTenantDto } from '../dto/update-tenant.dto';

@ApiTags('Tenants')
@ApiCookieAuth()
@Controller('tenants')
@UseGuards(TenantGuard, RolesGuard)
export class TenantsController {
  constructor(private tenantService: TenantService) {}

  /**
   * Get all tenants (super-admin only)
   * SECURITY: Requires super-admin role
   */
  @Get()
  @Roles('super-admin')
  @ApiOperation({ summary: 'Get all tenants (super-admin only)' })
  async getAllTenants() {
    return this.tenantService.getAllTenants();
  }

  /**
   * Get tenant by ID
   * SECURITY: 1 user = 1 tenant model
   * User can ONLY access their own tenant (no cross-tenant access)
   * Super-admin can access any tenant
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get tenant by ID' })
  async getTenantById(
    @Request() req: AuthenticatedRequest,
    @Param('id') tenantId: string,
  ) {
    // ✅ SECURITY: 1 user = 1 tenant
    // User must access their own tenant only
    if (req.user.tenantId !== tenantId && req.user.role !== 'super-admin') {
      throw new ForbiddenException('Access denied: You can only access your own tenant');
    }

    return this.tenantService.getTenantById(tenantId);
  }

  /**
   * Create new tenant (super-admin only)
   * SECURITY: Only super-admin can create tenants
   */
  @Post()
  @Roles('super-admin')
  @ApiOperation({ summary: 'Create new tenant (super-admin only)' })
  async createTenant(@Body() body: CreateTenantDto) {
    return this.tenantService.createTenant(body);
  }

  /**
   * Update tenant
   * SECURITY: 1 user = 1 tenant model
   * Admin can ONLY update their own tenant
   * Super-admin can update any tenant
   */
  @Put(':id')
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Update tenant (admin/super-admin)' })
  async updateTenant(
    @Request() req: AuthenticatedRequest,
    @Param('id') tenantId: string,
    @Body() body: UpdateTenantDto,
  ) {
    // ✅ SECURITY: 1 user = 1 tenant
    // Admin can ONLY update their own tenant, no cross-tenant updates
    if (req.user.tenantId !== tenantId && req.user.role !== 'super-admin') {
      throw new ForbiddenException('Access denied: You can only update your own tenant');
    }

    return this.tenantService.updateTenant(tenantId, body);
  }

  /**
   * Delete tenant (super-admin only)
   * SECURITY: Only super-admin can delete tenants
   */
  @Delete(':id')
  @Roles('super-admin')
  @ApiOperation({ summary: 'Delete tenant (super-admin only)' })
  async deleteTenant(@Param('id') tenantId: string) {
    return this.tenantService.deleteTenant(tenantId);
  }
}
