/**
 * QuotaGuard - Quota enforcement guard
 *
 * Guards routes that consume quota (emails, AI calls).
 * Checks both usage limits and cost protection before allowing requests.
 *
 * Usage:
 * ```typescript
 * @UseGuards(TenantGuard, QuotaGuard)
 * @RequiresQuota('ai')  // or 'email'
 * @Post('smart-reply')
 * async smartReply() { ... }
 * ```
 *
 * @see backend/docs/P10-SUBSCRIPTION-BILLING-ROADMAP.md Part 6
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionService } from '../services/subscription.service';
import { UsageTrackingService } from '../services/usage-tracking.service';
import { CostProtectionService } from '../services/cost-protection.service';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { getErrorTranslations, type SupportedLocale } from '../../ai/locales';

/**
 * Quota type metadata key
 */
export const QUOTA_TYPE_KEY = 'quota_type';

/**
 * Decorator to specify required quota type
 */
export const RequiresQuota = (type: 'email' | 'ai') =>
  SetMetadata(QUOTA_TYPE_KEY, type);

/**
 * Feature requirement metadata key
 */
export const FEATURE_KEY = 'required_feature';

/**
 * Decorator to specify required feature
 */
export const RequiresFeature = (feature: string) =>
  SetMetadata(FEATURE_KEY, feature);

@Injectable()
export class QuotaGuard implements CanActivate {
  private readonly logger = new Logger(QuotaGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptionService: SubscriptionService,
    private readonly usageTracking: UsageTrackingService,
    private readonly costProtection: CostProtectionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.tenantId) {
      throw new ForbiddenException('Authentication required');
    }

    const tenantId = user.tenantId;
    // Get locale from request header or default to 'en'
    const locale: SupportedLocale = (request.headers?.['accept-language']?.startsWith('it') ? 'it' : 'en');
    const t = getErrorTranslations(locale);

    // Get subscription
    const subscription = await this.subscriptionService.getOrCreateSubscription(
      tenantId,
    );

    // Check subscription status
    if (subscription.status === SubscriptionStatus.CANCELED) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_CANCELED',
        message: t.subscription?.canceled || 'Your subscription has been canceled. Please reactivate to continue.',
      });
    }

    if (subscription.status === SubscriptionStatus.PAST_DUE) {
      throw new ForbiddenException({
        code: 'PAYMENT_PAST_DUE',
        message: t.subscription?.pastDue || 'Your payment is past due. Please update your payment method.',
      });
    }

    // Check required feature
    const requiredFeature = this.reflector.get<string>(
      FEATURE_KEY,
      context.getHandler(),
    );

    if (requiredFeature) {
      const hasFeature = this.subscriptionService.hasFeature(
        subscription.plan,
        requiredFeature,
      );

      if (!hasFeature) {
        throw new ForbiddenException({
          code: 'FEATURE_NOT_AVAILABLE',
          message: t.subscription?.featureNotAvailable?.(requiredFeature) ||
            `This feature requires a higher plan. Please upgrade to access ${requiredFeature}.`,
          feature: requiredFeature,
          currentPlan: subscription.plan,
        });
      }
    }

    // Check quota type
    const quotaType = this.reflector.get<'email' | 'ai'>(
      QUOTA_TYPE_KEY,
      context.getHandler(),
    );

    if (quotaType) {
      await this.checkQuota(tenantId, quotaType, subscription, locale);
    }

    // Check cost protection (for AI operations)
    // ENTERPRISE plans have no cost cap (dailyCap = null), so skip this check
    if (quotaType === 'ai' && subscription.plan !== SubscriptionPlan.ENTERPRISE) {
      const costStatus = await this.costProtection.getStatus(tenantId);

      if (costStatus.isBlocked && costStatus.dailyCap !== null) {
        throw new ForbiddenException({
          code: 'DAILY_COST_LIMIT_REACHED',
          message: t.ai.costLimitDaily,
          dailyCost: costStatus.dailyCost,
          dailyCap: costStatus.dailyCap,
        });
      }
    }

    return true;
  }

  /**
   * Check specific quota type
   * ENTERPRISE plans have unlimited quota (limit = -1), so check is skipped
   */
  private async checkQuota(
    tenantId: string,
    type: 'email' | 'ai',
    subscription: { monthlyEmailLimit: number; monthlyAICallLimit: number },
    locale: SupportedLocale,
  ): Promise<void> {
    const t = getErrorTranslations(locale);

    if (type === 'email') {
      // ENTERPRISE: unlimited (-1) - skip check
      if (subscription.monthlyEmailLimit === -1) {
        return;
      }

      const hasQuota = await this.usageTracking.checkEmailQuota(
        tenantId,
        subscription.monthlyEmailLimit,
      );

      if (!hasQuota) {
        throw new ForbiddenException({
          code: 'EMAIL_QUOTA_EXCEEDED',
          message: t.subscription?.emailQuotaExceeded?.(subscription.monthlyEmailLimit) ||
            `You've reached your monthly email limit. Upgrade for more capacity.`,
          limit: subscription.monthlyEmailLimit,
        });
      }
    }

    if (type === 'ai') {
      // ENTERPRISE: unlimited (-1) - skip check
      if (subscription.monthlyAICallLimit === -1) {
        return;
      }

      const hasQuota = await this.usageTracking.checkAIQuota(
        tenantId,
        subscription.monthlyAICallLimit,
      );

      if (!hasQuota) {
        throw new ForbiddenException({
          code: 'AI_QUOTA_EXCEEDED',
          message: t.ai.quotaExceeded,
          limit: subscription.monthlyAICallLimit,
        });
      }
    }
  }
}
