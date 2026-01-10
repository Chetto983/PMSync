
import { Controller, Get, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from '../services/analytics.service';
import { JwtAuthGuard } from '../../../modules/auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../modules/auth/guards/tenant.guard';
import { AuthenticatedRequest } from '../../../common/types/request.types';

type PeriodType = 'day' | 'week' | 'month';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('emails')
  @ApiOperation({ summary: 'Get email analytics', description: 'Returns email volume by month' })
  @ApiResponse({ status: 200, description: 'Email analytics returned successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getEmailAnalytics(@Request() req: AuthenticatedRequest) {
    return this.analyticsService.getEmailAnalytics(req.user.tenantId);
  }

  @Get('ai-usage')
  @ApiOperation({ summary: 'Get AI usage statistics', description: 'Returns AI actions (composes, summaries, etc.)' })
  @ApiQuery({ name: 'period', enum: ['day', 'week', 'month'], required: false })
  @ApiResponse({ status: 200, description: 'AI usage stats returned successfully' })
  async getAiUsage(
    @Request() req: AuthenticatedRequest,
    @Query('period') period?: PeriodType,
  ) {
    return this.analyticsService.getAiUsageStats(req.user.tenantId, period || 'week');
  }

  @Get('productivity')
  @ApiOperation({ summary: 'Get productivity metrics', description: 'Returns email processing, follow-ups, deadlines' })
  @ApiQuery({ name: 'period', enum: ['day', 'week', 'month'], required: false })
  @ApiResponse({ status: 200, description: 'Productivity metrics returned successfully' })
  async getProductivity(
    @Request() req: AuthenticatedRequest,
    @Query('period') period?: PeriodType,
  ) {
    return this.analyticsService.getProductivityMetrics(req.user.tenantId, period || 'week');
  }

  @Get('triage')
  @ApiOperation({ summary: 'Get auto-triage statistics', description: 'Returns AI triage stats and pending count' })
  @ApiResponse({ status: 200, description: 'Triage stats returned successfully' })
  async getTriageStats(@Request() req: AuthenticatedRequest) {
    return this.analyticsService.getTriageStats(req.user.tenantId);
  }

  @Get('totals')
  @ApiOperation({ summary: 'Get email totals', description: 'Returns total email counts by folder' })
  @ApiResponse({ status: 200, description: 'Email totals returned successfully' })
  async getEmailTotals(@Request() req: AuthenticatedRequest) {
    return this.analyticsService.getEmailTotals(req.user.tenantId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get email stats for period', description: 'Returns sent/received/unread for period' })
  @ApiQuery({ name: 'period', enum: ['day', 'week', 'month'], required: false })
  @ApiResponse({ status: 200, description: 'Email stats returned successfully' })
  async getEmailStats(
    @Request() req: AuthenticatedRequest,
    @Query('period') period?: PeriodType,
  ) {
    return this.analyticsService.getEmailStats(req.user.tenantId, period || 'week');
  }
}
