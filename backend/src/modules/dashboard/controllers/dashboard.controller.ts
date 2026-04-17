import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { RateTierDecorator } from '../../../common/decorators/rate-tier.decorator';
import { DashboardTodayService } from '../services/dashboard-today.service';
import { GetTodayQueryDto } from '../dto/get-today-query.dto';
import { TodayFeedResponseDto } from '../dto/today-feed.dto';

interface AuthenticatedRequest {
  user: { id: string; tenantId: string };
}

@ApiTags('Dashboard')
@ApiCookieAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardTodayService: DashboardTodayService) {}

  @Get('today')
  @RateTierDecorator('read')
  @ApiOperation({
    summary: 'Get the AI-curated Today feed (urgent/today/fyi tiers)',
  })
  async getToday(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetTodayQueryDto,
  ): Promise<TodayFeedResponseDto> {
    return this.dashboardTodayService.getTodayFeed(
      req.user.tenantId,
      req.user.id,
      {
        locale: query.locale,
        tz: query.tz,
        includeGreeting: query.includeGreeting,
      },
    );
  }
}
