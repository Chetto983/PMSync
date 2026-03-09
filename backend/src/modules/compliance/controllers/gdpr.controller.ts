import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GdprService } from '../services/gdpr.service';
import { GdprStatusDto } from '../dto/gdpr-status.dto';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { SkipLegalCheck } from '../decorators/skip-legal-check.decorator';

@ApiTags('Compliance')
@ApiBearerAuth()
@SkipLegalCheck()
@Controller('compliance/gdpr')
@UseGuards(TenantGuard, RolesGuard)
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
