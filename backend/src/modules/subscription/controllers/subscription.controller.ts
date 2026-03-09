/**
 * SubscriptionController - Subscription API endpoints
 *
 * Provides endpoints for subscription management, usage stats, and cost protection.
 *
 * @see backend/docs/P10-SUBSCRIPTION-BILLING-ROADMAP.md
 */

import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { SubscriptionService, PLAN_LIMITS } from '../services/subscription.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { UsageTrackingService } from '../services/usage-tracking.service';
import { CostProtectionService } from '../services/cost-protection.service';
import {
  CancelSubscriptionDto,
  SubscriptionResponseDto,
  CostProtectionStatusDto,
  UsageStatsDto,
} from '../dto/subscription.dto';

@ApiTags('Subscription')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('subscription')
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly usageTracking: UsageTrackingService,
    private readonly costProtection: CostProtectionService,
    private readonly prisma: PrismaService,
  ) {}

  // ==========================================================================
  // Subscription Management
  // ==========================================================================

  @Get()
  @ApiOperation({ summary: 'Get current subscription with usage stats' })
  @ApiResponse({
    status: 200,
    description: 'Subscription details with real-time usage',
    type: SubscriptionResponseDto,
  })
  async getSubscription(
    @Request() req: AuthenticatedRequest,
  ): Promise<SubscriptionResponseDto> {
    const subscription = await this.subscriptionService.getSubscriptionWithUsage(
      req.user.tenantId,
    );

    return {
      id: subscription.id,
      tenantId: subscription.tenantId,
      plan: subscription.plan,
      status: subscription.status,
      monthlyEmailLimit: subscription.monthlyEmailLimit,
      monthlyAICallLimit: subscription.monthlyAICallLimit,
      maxUsers: subscription.maxUsers,
      usage: subscription.usage,
      autumnCustomerId: subscription.autumnCustomerId ?? undefined,
      currentPeriodEnd: subscription.currentPeriodEnd ?? undefined,
      cancelAt: subscription.cancelAt ?? undefined,
      usageResetAt: subscription.usageResetAt,
    };
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get real-time usage statistics' })
  @ApiResponse({
    status: 200,
    description: 'Usage statistics',
    type: UsageStatsDto,
  })
  async getUsage(@Request() req: AuthenticatedRequest): Promise<UsageStatsDto> {
    const subscription = await this.subscriptionService.getSubscriptionWithUsage(
      req.user.tenantId,
    );
    return subscription.usage;
  }

  @Get('cost-status')
  @ApiOperation({ summary: 'Get cost protection status' })
  @ApiResponse({
    status: 200,
    description: 'Cost protection status with alert levels',
    type: CostProtectionStatusDto,
  })
  async getCostStatus(
    @Request() req: AuthenticatedRequest,
  ): Promise<CostProtectionStatusDto> {
    return this.costProtection.getStatus(req.user.tenantId);
  }

  @Get('limits')
  @ApiOperation({ summary: 'Get subscription limits with current usage counts' })
  @ApiResponse({
    status: 200,
    description: 'Subscription limits and current counts',
  })
  async getLimits(@Request() req: AuthenticatedRequest): Promise<{
    limits: {
      maxProviders: number;
      currentProviders: number;
      canAddProvider: boolean;
      maxUsers: number;
      currentUsers: number;
      canAddUser: boolean;
    };
  }> {
    const subscription = await this.subscriptionService.getOrCreateSubscription(
      req.user.tenantId,
    );
    const planLimits = PLAN_LIMITS[subscription.plan];

    const currentProviders = await this.prisma.providerConfig.count({
      where: { tenantId: req.user.tenantId, isActive: true },
    });

    const currentUsers = await this.prisma.user.count({
      where: { tenantId: req.user.tenantId },
    });

    return {
      limits: {
        maxProviders: planLimits.maxProviders,
        currentProviders,
        canAddProvider: planLimits.maxProviders === -1 || currentProviders < planLimits.maxProviders,
        maxUsers: planLimits.maxUsers,
        currentUsers,
        canAddUser: planLimits.maxUsers === -1 || currentUsers < planLimits.maxUsers,
      },
    };
  }

  @Get('features')
  @ApiOperation({ summary: 'Get available features for current plan' })
  @ApiResponse({
    status: 200,
    description: 'Feature availability map',
  })
  async getFeatures(@Request() req: AuthenticatedRequest): Promise<{
    features: Record<string, boolean>;
  }> {
    const subscription = await this.subscriptionService.getOrCreateSubscription(
      req.user.tenantId,
    );

    const featureList = [
      'basic_email',
      'smart_replies',
      'summaries',
      'auto_triage',
      'briefings',
      'rag',
    ];

    const features: Record<string, boolean> = {};
    for (const feature of featureList) {
      features[feature] = this.subscriptionService.hasFeature(
        subscription.plan,
        feature,
      );
    }

    return { features };
  }

  @Post('cancel')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel subscription' })
  @ApiResponse({
    status: 200,
    description: 'Subscription canceled',
    type: SubscriptionResponseDto,
  })
  async cancelSubscription(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CancelSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    await this.subscriptionService.cancelSubscription(
      req.user.tenantId,
      dto.cancelAtPeriodEnd ?? true,
    );

    const withUsage = await this.subscriptionService.getSubscriptionWithUsage(
      req.user.tenantId,
    );

    return {
      id: withUsage.id,
      tenantId: withUsage.tenantId,
      plan: withUsage.plan,
      status: withUsage.status,
      monthlyEmailLimit: withUsage.monthlyEmailLimit,
      monthlyAICallLimit: withUsage.monthlyAICallLimit,
      maxUsers: withUsage.maxUsers,
      usage: withUsage.usage,
      autumnCustomerId: withUsage.autumnCustomerId ?? undefined,
      currentPeriodEnd: withUsage.currentPeriodEnd ?? undefined,
      cancelAt: withUsage.cancelAt ?? undefined,
      usageResetAt: withUsage.usageResetAt,
    };
  }

  // ==========================================================================
  // Cost Analytics
  // ==========================================================================

  @Get('cost-breakdown')
  @ApiOperation({ summary: 'Get daily cost breakdown by operation type' })
  @ApiResponse({
    status: 200,
    description: 'Cost breakdown by AI operation',
  })
  async getCostBreakdown(@Request() req: AuthenticatedRequest): Promise<{
    total: number;
    byOperation: Record<string, number>;
  }> {
    return this.costProtection.getDailyBreakdown(req.user.tenantId);
  }

  @Get('feature-usage')
  @ApiOperation({ summary: 'Get feature usage breakdown for today' })
  @ApiResponse({
    status: 200,
    description: 'Feature usage counts',
  })
  async getFeatureUsage(@Request() req: AuthenticatedRequest): Promise<{
    smartReplies: number;
    summaries: number;
    triage: number;
    briefings: number;
    embeddings: number;
  }> {
    return this.usageTracking.getFeatureUsage(req.user.tenantId);
  }
}
