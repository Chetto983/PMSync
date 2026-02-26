import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GdprService } from '../services/gdpr.service';
import { GdprStatusDto } from '../dto/gdpr-status.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { SkipLegalCheck } from '../decorators/skip-legal-check.decorator';

@ApiTags('Compliance')
@ApiBearerAuth()
@SkipLegalCheck()
@Controller('compliance/gdpr')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class GdprController {
  constructor(private readonly gdprService: GdprService) {}

  /**
   * Get GDPR compliance status
   * SECURITY: Requires admin or super-admin role
   * Returns status for user's tenant only
   */
  @Get('status')
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Get GDPR compliance status (admin only)' })
  @ApiOkResponse({ type: GdprStatusDto })
  getStatus(@Request() req: AuthenticatedRequest): Promise<GdprStatusDto> {
    // ✅ Security: Return status for user's tenant only
    return this.gdprService.getStatus(req.user.tenantId);
  }
}
