import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiCookieAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { AnalyticsService } from './analytics.service';

@ApiTags('CRM - Analytics')
@ApiCookieAuth()
@Controller('crm/analytics')
@UseGuards(TenantGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('csat')
  @ApiOperation({ summary: 'Get CSAT aggregation metrics' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'assigneeId', required: false, type: String })
  async getCsat(
    @Req() req: Request,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('assigneeId') assigneeId?: string,
  ) {
    const tenantId = (req as any).user.tenantId;
    return this.analyticsService.getCsatAggregation({
      tenantId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      assigneeId,
    });
  }

  @Get('service')
  @ApiOperation({ summary: 'Get service metrics (response time, SLA, CSAT)' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getServiceMetrics(
    @Req() req: Request,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const tenantId = (req as any).user.tenantId;
    return this.analyticsService.getServiceMetrics(
      tenantId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }
}
