/**
 * Analytics Controller
 * Phase 9e: Extracted from voltagent.controller.ts (2026-01-23)
 *
 * Handles email analytics, dashboard stats, and AI-powered analysis.
 */
import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/guards/tenant.guard';
import { QuotaGuard, RequiresQuota } from '../../../subscription/guards/quota.guard';
import { AnalyticsService } from '../services/analytics.service';
import type { AnalyticsResult, EmailAnalytics, DashboardAnalytics } from '../services/analytics.service';

interface AuthenticatedRequest {
  user: {
    userId: string;
    tenantId: string;
    role: string;
  };
}

@ApiTags('VoltAgent Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, QuotaGuard)
@Controller('api/v1/voltagent')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Get dashboard analytics with email statistics and insights.
   */
  @Get('analytics/dashboard')
  @ApiOperation({
    summary: 'Get dashboard analytics',
    description: `Returns comprehensive dashboard analytics including:
    - **Email summary**: Total emails, unread count, sent/received today
    - **Volume trends**: Email volume over the past week
    - **Top senders**: Most frequent email senders
    - **Hourly distribution**: Email activity by hour of day
    - **AI insights**: Actionable recommendations based on email patterns`,
  })
  async getDashboardAnalytics(@Req() req: AuthenticatedRequest): Promise<{
    success: boolean;
    analytics: DashboardAnalytics;
  }> {
    const { tenantId, userId } = req.user;
    const analytics = await this.analyticsService.getDashboardAnalytics(tenantId, userId);

    return {
      success: true,
      analytics,
    };
  }

  /**
   * Get email analytics for a specific period.
   */
  @Get('analytics/email')
  @ApiOperation({
    summary: 'Get email analytics',
    description: `Returns detailed email analytics for the specified period:
    - **Volume trends**: Sent vs received over time
    - **Top senders**: Most frequent email senders (top 10)
    - **Hourly distribution**: When you receive the most emails
    - **Insights**: AI-generated recommendations

    Periods: day, week (default), month`,
  })
  async getEmailAnalytics(
    @Req() req: AuthenticatedRequest,
    @Query('period') period?: 'day' | 'week' | 'month',
  ): Promise<{
    success: boolean;
    analytics: EmailAnalytics;
  }> {
    const { tenantId, userId } = req.user;
    const analytics = await this.analyticsService.getEmailAnalytics(
      tenantId,
      userId,
      period || 'week',
    );

    return {
      success: true,
      analytics,
    };
  }

  /**
   * Run AI-powered custom analytics using Mistral code_interpreter.
   */
  @Post('analytics/ai')
  @HttpCode(HttpStatus.OK)
  @RequiresQuota('ai')
  @ApiOperation({
    summary: 'Run AI-powered analytics',
    description: `Execute AI-powered analytics using Mistral's code_interpreter tool.
    This allows for complex data analysis with Python code execution.`,
  })
  async runAiAnalytics(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      query: string;
      data?: Record<string, unknown>;
      locale?: string;
    },
  ): Promise<{
    success: boolean;
    result: AnalyticsResult;
  }> {
    const { tenantId, userId } = req.user;

    const result = await this.analyticsService.runAiAnalytics(
      tenantId,
      userId,
      body.query,
      body.data || {},
      body.locale || 'en',
    );

    return {
      success: true,
      result,
    };
  }

  /**
   * Invalidate analytics cache for the current user.
   */
  @Post('analytics/invalidate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Invalidate analytics cache',
    description: 'Clears cached analytics data for the current user.',
  })
  async invalidateAnalyticsCache(@Req() req: AuthenticatedRequest): Promise<{
    success: boolean;
    message: string;
  }> {
    const { tenantId, userId } = req.user;
    await this.analyticsService.invalidateCache(tenantId, userId);

    return {
      success: true,
      message: 'Analytics cache invalidated',
    };
  }

  /**
   * Check if analytics service is enabled.
   */
  @Get('analytics/status')
  @ApiOperation({
    summary: 'Get analytics service status',
    description: 'Returns whether the analytics service is enabled and configured.',
  })
  async getAnalyticsStatus(): Promise<{
    success: boolean;
    enabled: boolean;
  }> {
    return {
      success: true,
      enabled: this.analyticsService.isEnabled(),
    };
  }
}
