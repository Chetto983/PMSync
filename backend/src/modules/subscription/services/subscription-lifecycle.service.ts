/**
 * SubscriptionLifecycleService - Scheduled subscription maintenance
 *
 * Handles automated subscription lifecycle events:
 * - Monthly usage reset (1st of month at 00:00 UTC)
 * - Daily expiry check (02:00 UTC)
 * - Downgrade past-due subscriptions after grace period
 *
 * Uses BullMQ scheduled jobs for horizontal scaling.
 *
 * @see backend/docs/P10-SUBSCRIPTION-BILLING-ROADMAP.md
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UsageTrackingService } from './usage-tracking.service';
import { SubscriptionService } from './subscription.service';
import {
  ScheduledJobsQueueService,
  ScheduledJobType,
  SCHEDULED_JOB_PATTERNS,
} from '../../../common/services/scheduled-jobs.queue';
import { SubscriptionStatus, SubscriptionPlan } from '@prisma/client';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping';

// Extend ScheduledJobType enum (must match declaration in scheduled-jobs.queue.ts)
// Note: TypeScript enums can't be extended, so we register handlers for new jobs here
const SUBSCRIPTION_JOB_TYPES = {
  USAGE_RESET: 'subscription-usage-reset' as unknown as ScheduledJobType,
  EXPIRY_CHECK: 'subscription-expiry-check' as unknown as ScheduledJobType,
};

// Add patterns for new job types
const SUBSCRIPTION_JOB_PATTERNS = {
  [SUBSCRIPTION_JOB_TYPES.USAGE_RESET]: '0 0 1 * *', // 1st of month at 00:00
  [SUBSCRIPTION_JOB_TYPES.EXPIRY_CHECK]: '0 2 * * *', // Daily at 02:00
};

// Grace period for past-due subscriptions (days)
const PAST_DUE_GRACE_DAYS = 7;

@Injectable()
export class SubscriptionLifecycleService implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usageTracking: UsageTrackingService,
    private readonly subscriptionService: SubscriptionService,
    private readonly scheduledJobs: ScheduledJobsQueueService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Register handlers for subscription lifecycle jobs
    // Handlers must return void, so we wrap and ignore the return value
    this.scheduledJobs.registerHandler(
      SUBSCRIPTION_JOB_TYPES.USAGE_RESET,
      () => withoutTenantScopingAsync(async () => { await this.runMonthlyUsageReset(); }),
    );

    this.scheduledJobs.registerHandler(
      SUBSCRIPTION_JOB_TYPES.EXPIRY_CHECK,
      () => withoutTenantScopingAsync(async () => { await this.runExpiryCheck(); }),
    );

    // Register the cron patterns (will be picked up on next initializeRepeatableJobs call)
    Object.assign(SCHEDULED_JOB_PATTERNS, SUBSCRIPTION_JOB_PATTERNS);

    this.logger.log('SubscriptionLifecycleService handlers registered');
  }

  // ==========================================================================
  // Monthly Usage Reset (1st of month)
  // ==========================================================================

  /**
   * Reset usage counters for all active subscriptions
   * Runs on the 1st of each month at 00:00 UTC
   */
  async runMonthlyUsageReset(): Promise<{ processed: number; errors: number }> {
    this.logger.log('Starting monthly usage reset');
    const startTime = Date.now();

    let processed = 0;
    let errors = 0;

    try {
      // Get all active subscriptions
      const subscriptions = await this.prisma.subscription.findMany({
        where: {
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
        },
        select: { tenantId: true },
      });

      this.logger.log(`Found ${subscriptions.length} active subscriptions to reset`);

      // Process in batches of 50 to avoid overwhelming Redis
      const batchSize = 50;
      for (let i = 0; i < subscriptions.length; i += batchSize) {
        const batch = subscriptions.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (sub) => {
            try {
              await this.usageTracking.resetUsage(sub.tenantId);
              processed++;
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              this.logger.error(`Failed to reset usage for ${sub.tenantId}: ${msg}`);
              errors++;
            }
          }),
        );
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Monthly usage reset completed: ${processed} processed, ${errors} errors, ${duration}ms`,
      );

      return { processed, errors };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Monthly usage reset failed: ${msg}`);
      throw error;
    }
  }

  // ==========================================================================
  // Daily Expiry Check (02:00 UTC)
  // ==========================================================================

  /**
   * Check for expired/past-due subscriptions and downgrade if needed
   * Runs daily at 02:00 UTC
   */
  async runExpiryCheck(): Promise<{
    expired: number;
    downgraded: number;
    errors: number;
  }> {
    this.logger.log('Starting subscription expiry check');
    const startTime = Date.now();

    let expired = 0;
    let downgraded = 0;
    const errors = 0;

    try {
      // Check for trials that have expired
      const expiredTrials = await this.checkExpiredTrials();
      expired += expiredTrials;

      // Check for past-due subscriptions past grace period
      const pastDueDowngrades = await this.checkPastDueSubscriptions();
      downgraded += pastDueDowngrades;

      const duration = Date.now() - startTime;
      this.logger.log(
        `Expiry check completed: ${expired} expired, ${downgraded} downgraded, ${errors} errors, ${duration}ms`,
      );

      return { expired, downgraded, errors };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Expiry check failed: ${msg}`);
      throw error;
    }
  }

  /**
   * Check and handle expired trial subscriptions
   */
  private async checkExpiredTrials(): Promise<number> {
    const now = new Date();

    // Find trials with expired currentPeriodEnd (trial period tracked via period fields)
    const expiredTrials = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.TRIALING,
        currentPeriodEnd: { lt: now },
      },
      select: { tenantId: true, id: true },
    });

    if (expiredTrials.length === 0) {
      return 0;
    }

    this.logger.log(`Found ${expiredTrials.length} expired trials`);

    let processed = 0;
    for (const trial of expiredTrials) {
      try {
        // Downgrade to free plan
        await this.subscriptionService.updatePlan(trial.tenantId, SubscriptionPlan.FREE);
        await this.subscriptionService.updateStatus(trial.tenantId, SubscriptionStatus.ACTIVE);

        this.logger.log(`Trial expired for ${trial.tenantId}, downgraded to FREE`);
        processed++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to expire trial for ${trial.tenantId}: ${msg}`);
      }
    }

    return processed;
  }

  /**
   * Check and handle past-due subscriptions past grace period
   */
  private async checkPastDueSubscriptions(): Promise<number> {
    const gracePeriodCutoff = new Date();
    gracePeriodCutoff.setDate(gracePeriodCutoff.getDate() - PAST_DUE_GRACE_DAYS);

    // Find past-due subscriptions older than grace period
    const pastDueSubs = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.PAST_DUE,
        updatedAt: { lt: gracePeriodCutoff },
        plan: { not: SubscriptionPlan.FREE },
      },
      select: { tenantId: true, id: true, plan: true },
    });

    if (pastDueSubs.length === 0) {
      return 0;
    }

    this.logger.log(`Found ${pastDueSubs.length} past-due subscriptions past grace period`);

    let processed = 0;
    for (const sub of pastDueSubs) {
      try {
        // Downgrade to free plan
        await this.subscriptionService.updatePlan(sub.tenantId, SubscriptionPlan.FREE);
        await this.subscriptionService.updateStatus(sub.tenantId, SubscriptionStatus.CANCELED);

        this.logger.warn(
          `Past-due subscription ${sub.tenantId} (${sub.plan}) downgraded to FREE after ${PAST_DUE_GRACE_DAYS}-day grace period`,
        );
        processed++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to downgrade past-due ${sub.tenantId}: ${msg}`);
      }
    }

    return processed;
  }

  // ==========================================================================
  // Manual Triggers (for admin/testing)
  // ==========================================================================

  /**
   * Manually trigger usage reset for a specific tenant
   */
  async resetTenantUsage(tenantId: string): Promise<void> {
    this.logger.log(`Manual usage reset for ${tenantId}`);
    await this.usageTracking.resetUsage(tenantId);
    await this.subscriptionService.resetUsage(tenantId);
  }

  /**
   * Get lifecycle status summary
   */
  async getLifecycleStatus(): Promise<{
    totalActive: number;
    totalTrialing: number;
    totalPastDue: number;
    totalCanceled: number;
    pastDueOverGrace: number;
  }> {
    const gracePeriodCutoff = new Date();
    gracePeriodCutoff.setDate(gracePeriodCutoff.getDate() - PAST_DUE_GRACE_DAYS);

    const [active, trialing, pastDue, canceled, pastDueOverGrace] = await Promise.all([
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.ACTIVE } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.TRIALING } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.PAST_DUE } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.CANCELED } }),
      this.prisma.subscription.count({
        where: {
          status: SubscriptionStatus.PAST_DUE,
          updatedAt: { lt: gracePeriodCutoff },
        },
      }),
    ]);

    return {
      totalActive: active,
      totalTrialing: trialing,
      totalPastDue: pastDue,
      totalCanceled: canceled,
      pastDueOverGrace,
    };
  }
}
