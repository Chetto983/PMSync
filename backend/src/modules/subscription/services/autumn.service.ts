/**
 * AutumnService - Autumn SDK Wrapper
 *
 * Integrates with Autumn billing platform for usage-based subscriptions.
 * @see https://useautumn.com/
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Autumn } from 'autumn-js';
import { SubscriptionService, PLAN_LIMITS } from './subscription.service';

export const AUTUMN_FEATURE_IDS = {
  EMAILS: 'email-processing',
  AI_CALLS: 'ai-calls',
  CONNECTIONS: 'email-connections',
  USERS: 'team-users',
  AUTO_TRIAGE: 'auto-triage',
  SMART_REPLIES: 'smart-replies',
  RAG_SEARCH: 'rag-search',
  DAILY_BRIEFING: 'daily-briefing',
} as const;

export interface AutumnCustomerData {
  name: string;
  email: string;
}

export interface AttachResult {
  success: boolean;
  checkoutUrl?: string;
  error?: string;
}

export interface CheckResult {
  allowed: boolean;
  remaining?: number;
  total?: number;
  unlimited?: boolean;
}

@Injectable()
export class AutumnService implements OnModuleInit {
  private readonly logger = new Logger(AutumnService.name);
  private autumn: Autumn | null = null;
  private readonly secretKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly subscriptionService: SubscriptionService,
  ) {
    this.secretKey = this.config.get<string>('AUTUMN_SECRET_KEY') || '';
  }

  onModuleInit() {
    if (this.secretKey) {
      this.autumn = new Autumn({ secretKey: this.secretKey });
      this.logger.log('Autumn SDK initialized');
    } else {
      this.logger.warn('AUTUMN_SECRET_KEY not configured - billing features disabled');
    }
  }

  isConfigured(): boolean {
    return this.autumn !== null;
  }

  async createCustomer(
    tenantId: string,
    customerData: AutumnCustomerData,
  ): Promise<{ customerId: string } | null> {
    if (!this.autumn) {
      this.logger.warn('Autumn not configured, skipping customer creation');
      return null;
    }

    try {
      await this.autumn.customers.create({
        id: tenantId,
        name: customerData.name,
        email: customerData.email,
      });
      await this.subscriptionService.linkAutumnCustomer(tenantId, tenantId);
      this.logger.log(`Created Autumn customer: ${tenantId}`);
      return { customerId: tenantId };
    } catch (error) {
      this.logger.error(`Failed to create Autumn customer: ${error}`);
      return null;
    }
  }

  async getBillingPortalUrl(
    tenantId: string,
    returnUrl: string,
  ): Promise<{ url: string } | null> {
    if (!this.autumn) return null;

    try {
      const result = await this.autumn.customers.billingPortal(tenantId, {
        return_url: returnUrl,
      });
      return { url: result.data?.url || '' };
    } catch (error) {
      this.logger.error(`Failed to get billing portal URL: ${error}`);
      return null;
    }
  }

  async attach(
    tenantId: string,
    productId: string,
    customerData: AutumnCustomerData,
  ): Promise<AttachResult> {
    if (!this.autumn) {
      return { success: false, error: 'Autumn not configured' };
    }

    try {
      const result = await this.autumn.attach({
        customer_id: tenantId,
        customer_data: customerData,
        product_id: productId,
      });

      if (result.data?.checkout_url) {
        return { success: true, checkoutUrl: result.data.checkout_url };
      }
      return { success: true };
    } catch (error) {
      this.logger.error(`Autumn attach failed: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  async checkFeature(
    tenantId: string,
    featureId: string,
    customerData?: AutumnCustomerData,
  ): Promise<CheckResult> {
    if (!this.autumn) {
      return this.localFeatureCheck(tenantId, featureId);
    }

    try {
      const result = await this.autumn.check({
        customer_id: tenantId,
        feature_id: featureId,
        ...(customerData && { customer_data: customerData }),
      });

      const data = result.data;
      return {
        allowed: data?.allowed ?? false,
        remaining: data?.balance ?? undefined,
        total: data?.included_usage ?? undefined,
        unlimited: data?.unlimited ?? undefined,
      };
    } catch (error) {
      this.logger.error(`Autumn check failed: ${error}`);
      return this.localFeatureCheck(tenantId, featureId);
    }
  }

  async trackUsage(
    tenantId: string,
    featureId: string,
    amount: number = 1,
    customerData?: AutumnCustomerData,
  ): Promise<boolean> {
    if (!this.autumn) return false;

    try {
      await this.autumn.track({
        customer_id: tenantId,
        feature_id: featureId,
        value: amount,
        ...(customerData && { customer_data: customerData }),
      });
      this.logger.debug(`Tracked usage: ${tenantId} - ${featureId}: ${amount}`);
      return true;
    } catch (error) {
      this.logger.error(`Autumn track failed: ${error}`);
      return false;
    }
  }

  async cancelSubscription(tenantId: string, productId?: string): Promise<boolean> {
    if (!this.autumn) return false;

    try {
      if (!productId) {
        this.logger.warn('No product_id provided - skipping Autumn cancel');
        await this.subscriptionService.cancelSubscription(tenantId, true);
        return true;
      }

      await this.autumn.cancel({
        customer_id: tenantId,
        product_id: productId,
      });
      await this.subscriptionService.cancelSubscription(tenantId, true);
      this.logger.log(`Canceled subscription for tenant ${tenantId}`);
      return true;
    } catch (error) {
      this.logger.error(`Autumn cancel failed: ${error}`);
      return false;
    }
  }

  async getPricingTable(_tenantId?: string): Promise<{ plans: PlanInfo[] }> {
    return this.getLocalPricingTable();
  }

  private async localFeatureCheck(tenantId: string, featureId: string): Promise<CheckResult> {
    const subscription = await this.subscriptionService.getSubscriptionWithUsage(tenantId);

    switch (featureId) {
      case AUTUMN_FEATURE_IDS.EMAILS:
        return {
          allowed: subscription.usage.emailsRemaining !== 0,
          remaining: subscription.usage.emailsRemaining,
          total: subscription.monthlyEmailLimit,
          unlimited: subscription.monthlyEmailLimit === -1,
        };

      case AUTUMN_FEATURE_IDS.AI_CALLS:
        return {
          allowed: subscription.usage.aiCallsRemaining !== 0,
          remaining: subscription.usage.aiCallsRemaining,
          total: subscription.monthlyAICallLimit,
          unlimited: subscription.monthlyAICallLimit === -1,
        };

      case AUTUMN_FEATURE_IDS.SMART_REPLIES:
      case AUTUMN_FEATURE_IDS.AUTO_TRIAGE:
      case AUTUMN_FEATURE_IDS.RAG_SEARCH:
      case AUTUMN_FEATURE_IDS.DAILY_BRIEFING: {
        const hasFeature = this.subscriptionService.hasFeature(
          subscription.plan,
          featureId.replace(/-/g, '_'),
        );
        return { allowed: hasFeature };
      }

      default:
        return { allowed: true };
    }
  }

  private getLocalPricingTable(): { plans: PlanInfo[] } {
    return {
      plans: [
        {
          id: 'free',
          name: 'Free',
          price: 0,
          currency: 'USD',
          interval: 'month',
          features: PLAN_LIMITS.FREE.features,
          limits: { emails: PLAN_LIMITS.FREE.monthlyEmailLimit, aiCalls: PLAN_LIMITS.FREE.monthlyAICallLimit },
        },
        {
          id: 'starter',
          name: 'Starter',
          price: 7,
          currency: 'USD',
          interval: 'month',
          features: PLAN_LIMITS.STARTER.features,
          limits: { emails: PLAN_LIMITS.STARTER.monthlyEmailLimit, aiCalls: PLAN_LIMITS.STARTER.monthlyAICallLimit },
        },
        {
          id: 'professional',
          name: 'Professional',
          price: 15,
          currency: 'USD',
          interval: 'month',
          features: PLAN_LIMITS.PROFESSIONAL.features,
          limits: { emails: PLAN_LIMITS.PROFESSIONAL.monthlyEmailLimit, aiCalls: PLAN_LIMITS.PROFESSIONAL.monthlyAICallLimit },
        },
        {
          id: 'enterprise',
          name: 'Enterprise',
          price: null,
          currency: 'USD',
          interval: 'month',
          features: ['all'],
          limits: { emails: -1, aiCalls: -1 },
        },
      ],
    };
  }
}

interface PlanInfo {
  id: string;
  name: string;
  price: number | null;
  currency: string;
  interval: string;
  features: string[];
  limits: { emails: number; aiCalls: number };
}
