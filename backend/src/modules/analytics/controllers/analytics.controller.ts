
import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from '../services/analytics.service';
import { JwtAuthGuard } from '../../../modules/auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../modules/auth/guards/tenant.guard';
import { AuthenticatedRequest } from '../../../common/types/request.types';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('emails')
  @ApiOperation({ summary: 'Get email analytics', description: 'Returns email analytics for the tenant' })
  @ApiResponse({ status: 200, description: 'Email analytics returned successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getEmailAnalytics(@Request() req: AuthenticatedRequest) {
    return this.analyticsService.getEmailAnalytics(req.user.tenantId);
  }
}
