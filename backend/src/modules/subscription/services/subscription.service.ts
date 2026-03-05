/**
 * SubscriptionService - Subscription CRUD operations
 *
 * Manages tenant subscriptions with Autumn integration.
 * Handles plan changes, usage tracking, and period resets.
 *
 * @see backend/docs/P10-SUBSCRIPTION-BILLING-ROADMAP.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Subscription, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { UsageTrackingService } from './usage-tracking.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';

/**
 * Plan limits configuration
 * Based on competitor analysis: Shortwave/SaneBox range
 */
export const PLAN_LIMITS: Record<SubscriptionPlan, {
  monthlyEmailLimit: number;
  monthlyAICallLimit: number;
  maxUsers: number;
  maxProviders: number;
  features: string[];
}> = {
  FREE: {
    monthlyEmailLimit: 100,
    monthlyAICallLimit: 50,
    maxUsers: 1,
    maxProviders: 1,
    features: ['basic_email'],
  },
  STARTER: {
    monthlyEmailLimit: 1000,
    monthlyAICallLimit: 500,
    maxUsers: 1,
    maxProviders: 2,
    features: ['basic_email', 'smart_replies', 'summaries'],
  },
  PROFESSIONAL: {
    monthlyEmailLimit: 10000,
    monthlyAICallLimit: 5000,
    maxUsers: 5,
    maxProviders: 5,
    features: ['basic_email', 'smart_replies', 'summaries', 'auto_triage', 'briefings', 'rag'],
  },
  ENTERPRISE: {
    monthlyEmailLimit: -1, // Unlimited
    monthlyAICallLimit: -1, // Unlimited
    maxUsers: -1, // Unlimited
    maxProviders: -1, // Unlimited
    features: ['all'],
  },
};

export interface SubscriptionWithUsage extends Subscription {
  usage: {
    emailsProcessed: number;
    aiCallsUsed: number;
    emailsRemaining: number;
    aiCallsRemaining: number;
    percentEmailUsed: number;
    percentAIUsed: number;
  };
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usageTracking: UsageTrackingService,
  ) {}

  /**
   * Get or create subscription for tenant
   */
  async getOrCreateSubscription(tenantId: string): Promise<Subscription> {
    try {
      // Uses withoutTenantScopingAsync because this is called from guards/interceptors
      // that may run before CorrelationInterceptor sets AsyncLocalStorage context.
      // tenantId is explicitly provided in where clause, so scoping is safe.
      let subscription = await withoutTenantScopingAsync(() =>
        this.prisma.subscription.findUnique({
          where: { tenantId },
        }),
      );

      if (!subscription) {
        this.logger.log(`Creating FREE subscription for tenant ${tenantId}`);
        const { features: _features, maxProviders: _maxProviders, ...freePlanLimits } = PLAN_LIMITS.FREE;
        subscription = await withoutTenantScopingAsync(() =>
          this.prisma.subscription.create({
            data: {
              tenantId,
              plan: SubscriptionPlan.FREE,
              status: SubscriptionStatus.ACTIVE,
              ...freePlanLimits,
              usageResetAt: this.getNextResetDate(),
            },
          }),
        );
      }

      return subscription;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to load/create subscription for tenant ${tenantId}. Falling back to transient FREE plan. ${message}`,
      );
      return this.buildFallbackSubscription(tenantId);
    }
  }

  /**
   * Get subscription with real-time usage stats
   */
  async getSubscriptionWithUsage(tenantId: string): Promise<SubscriptionWithUsage> {
    const subscription = await this.getOrCreateSubscription(tenantId);

    // Get real-time usage from Redis
    let emailsProcessed = 0;
    let aiCallsUsed = 0;
    try {
      const usage = await this.usageTracking.getUsage(tenantId);
      emailsProcessed = usage.emailsProcessed;
      aiCallsUsed = usage.aiCallsUsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Usage tracking unavailable for tenant ${tenantId}: ${message}`);
    }

    // Calculate remaining and percentages
    const emailsRemaining = subscription.monthlyEmailLimit === -1
      ? -1
      : Math.max(0, subscription.monthlyEmailLimit - emailsProcessed);

    const aiCallsRemaining = subscription.monthlyAICallLimit === -1
      ? -1
      : Math.max(0, subscription.monthlyAICallLimit - aiCallsUsed);

    const percentEmailUsed = subscription.monthlyEmailLimit === -1
      ? 0
      : Math.min(100, Math.round((emailsProcessed / subscription.monthlyEmailLimit) * 100));

    const percentAIUsed = subscription.monthlyAICallLimit === -1
      ? 0
      : Math.min(100, Math.round((aiCallsUsed / subscription.monthlyAICallLimit) * 100));

    return {
      ...subscription,
      emailsProcessed,
      aiCallsUsed,
      usage: {
        emailsProcessed,
        aiCallsUsed,
        emailsRemaining,
        aiCallsRemaining,
        percentEmailUsed,
        percentAIUsed,
      },
    };
  }

  /**
   * Update subscription plan
   */
  async updatePlan(
    tenantId: string,
    newPlan: SubscriptionPlan,
    autumnSubscriptionId?: string,
  ): Promise<Subscription> {
    const subscription = await this.getOrCreateSubscription(tenantId);
    const planLimits = PLAN_LIMITS[newPlan];

    this.logger.log(`Updating subscription for tenant ${tenantId}: ${subscription.plan} -> ${newPlan}`);

    return this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        plan: newPlan,
        monthlyEmailLimit: planLimits.monthlyEmailLimit,
        monthlyAICallLimit: planLimits.monthlyAICallLimit,
        maxUsers: planLimits.maxUsers,
        autumnSubscriptionId,
        // Reset usage on plan upgrade
        ...(newPlan !== subscription.plan && {
          emailsProcessed: 0,
          aiCallsUsed: 0,
          usageResetAt: this.getNextResetDate(),
        }),
      },
    });
  }

  /**
   * Link Autumn customer ID
   */
  async linkAutumnCustomer(tenantId: string, autumnCustomerId: string): Promise<Subscription> {
    const subscription = await this.getOrCreateSubscription(tenantId);

    return this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { autumnCustomerId },
    });
  }

  /**
   * Update subscription status
   */
  async updateStatus(tenantId: string, status: SubscriptionStatus): Promise<Subscription> {
    const subscription = await this.getOrCreateSubscription(tenantId);

    this.logger.log(`Updating subscription status for tenant ${tenantId}: ${subscription.status} -> ${status}`);

    return this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status },
    });
  }

  /**
   * Cancel subscription (sets cancelAt date)
   */
  async cancelSubscription(tenantId: string, cancelAtPeriodEnd: boolean): Promise<Subscription> {
    const subscription = await this.getOrCreateSubscription(tenantId);

    const cancelAt = cancelAtPeriodEnd && subscription.currentPeriodEnd
      ? subscription.currentPeriodEnd
      : new Date();

    this.logger.log(`Canceling subscription for tenant ${tenantId}, cancelAt: ${cancelAt}`);

    return this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAt,
        status: cancelAtPeriodEnd ? SubscriptionStatus.ACTIVE : SubscriptionStatus.CANCELED,
      },
    });
  }

  /**
   * Reset usage counters (called by scheduler at period end)
   */
  async resetUsage(tenantId: string): Promise<void> {
    const subscription = await this.getOrCreateSubscription(tenantId);

    this.logger.log(`Resetting usage for tenant ${tenantId}`);

    // Reset Redis counters
    await this.usageTracking.resetUsage(tenantId);

    // Update Prisma (for persistence)
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        emailsProcessed: 0,
        aiCallsUsed: 0,
        usageResetAt: this.getNextResetDate(),
      },
    });
  }

  /**
   * Sync usage from Redis to Prisma (for persistence)
   */
  async syncUsageToPrisma(tenantId: string): Promise<void> {
    const { emailsProcessed, aiCallsUsed } = await this.usageTracking.getUsage(tenantId);

    await this.prisma.subscription.updateMany({
      where: { tenantId },
      data: { emailsProcessed, aiCallsUsed },
    });
  }

  /**
   * Check if feature is available for plan
   */
  hasFeature(plan: SubscriptionPlan, feature: string): boolean {
    const planFeatures = PLAN_LIMITS[plan].features;
    return planFeatures.includes('all') || planFeatures.includes(feature);
  }

  /**
   * Get subscriptions due for usage reset
   */
  async getSubscriptionsDueForReset(): Promise<Subscription[]> {
    return this.prisma.subscription.findMany({
      where: {
        usageResetAt: { lte: new Date() },
        status: SubscriptionStatus.ACTIVE,
      },
    });
  }

  /**
   * Calculate next reset date (first of next month)
   */
  private getNextResetDate(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  private buildFallbackSubscription(tenantId: string): Subscription {
    const now = new Date();
    return {
      id: `transient-${tenantId}`,
      tenantId,
      autumnCustomerId: null,
      autumnSubscriptionId: null,
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.ACTIVE,
      monthlyEmailLimit: PLAN_LIMITS.FREE.monthlyEmailLimit,
      monthlyAICallLimit: PLAN_LIMITS.FREE.monthlyAICallLimit,
      maxUsers: PLAN_LIMITS.FREE.maxUsers,
      emailsProcessed: 0,
      aiCallsUsed: 0,
      usageResetAt: this.getNextResetDate(),
      currentPeriodStart: now,
      currentPeriodEnd: this.getNextResetDate(),
      cancelAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }
}
