/**
 * AutumnWebhookService - Event routing and idempotent processing
 *
 * Processes Autumn billing webhook events with Redis-based deduplication.
 * Routes events to appropriate subscription service methods.
 *
 * Event types:
 * - customer.products.updated: Plan changes (upgrade, downgrade, cancel, etc.)
 * - balances.limit_reached: Usage limit hit
 * - balances.usage_alert_triggered: Usage warning threshold
 *
 * @see backend/docs/P10-SUBSCRIPTION-BILLING-ROADMAP.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionPlan } from '@prisma/client';
import { SubscriptionStatus } from '@prisma/client';
import { SubscriptionService } from './subscription.service';
import { BillingAlertService } from './billing-alert.service';
import { CostProtectionService } from './cost-protection.service';
import { RedisLockService } from '../../../common/services/redis-lock.service';
import type { AutumnWebhookPayload } from '../dto/subscription.dto';

/** TTL for idempotency dedup key: 24 hours */
const DEDUP_TTL_MS = 86_400_000;

@Injectable()
export class AutumnWebhookService {
  private readonly logger = new Logger(AutumnWebhookService.name);
  private readonly planMapping: Record<string, string> | null;

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly billingAlertService: BillingAlertService,
    private readonly costProtectionService: CostProtectionService,
    private readonly redisLock: RedisLockService,
    private readonly configService: ConfigService,
  ) {
    const raw = this.configService.get<string>('AUTUMN_PLAN_MAPPING');
    this.planMapping = raw ? this.safeParse(raw) : null;
  }

  /**
   * Process an Autumn webhook event with idempotency.
   * Duplicate svix-id events return early with no side effects.
   */
  async processEvent(svixId: string, payload: AutumnWebhookPayload): Promise<void> {
    // Idempotency check: 24h dedup window
    const isNew = await this.redisLock.setNX(
      `webhook:autumn:${svixId}`,
      DEDUP_TTL_MS,
    );

    if (!isNew) {
      this.logger.debug(`Duplicate webhook event skipped: ${svixId}`);
      return;
    }

    const tenantId = payload.data.customer_id;

    switch (payload.type) {
      case 'customer.products.updated':
        await this.handleProductUpdate(tenantId, payload.data);
        break;

      case 'balances.limit_reached':
        this.logger.warn(
          `Balance limit reached for tenant ${tenantId}, feature: ${payload.data.feature_id}`,
        );
        await this.costProtectionService.checkAndAlert(tenantId);
        break;

      case 'balances.usage_alert_triggered':
        this.logger.warn(
          `Usage alert triggered for tenant ${tenantId}, feature: ${payload.data.feature_id}`,
        );
        break;

      default:
        this.logger.warn(`Unknown webhook event type: ${payload.type}`);
        break;
    }
  }

  /**
   * Handle customer.products.updated scenarios
   */
  private async handleProductUpdate(
    tenantId: string,
    data: AutumnWebhookPayload['data'],
  ): Promise<void> {
    switch (data.scenario) {
      case 'new':
      case 'upgrade':
      case 'downgrade': {
        const plan = this.mapProductToPlan(data.product_id, data.product_name);
        await this.subscriptionService.updatePlan(tenantId, plan);
        await this.subscriptionService.updateStatus(tenantId, SubscriptionStatus.ACTIVE);
        this.logger.log(
          `Tenant ${tenantId} plan updated to ${plan} (scenario: ${data.scenario})`,
        );
        break;
      }

      case 'renew':
        await this.subscriptionService.updateStatus(tenantId, SubscriptionStatus.ACTIVE);
        this.logger.log(`Tenant ${tenantId} subscription renewed`);
        break;

      case 'past_due':
        await this.subscriptionService.updateStatus(tenantId, SubscriptionStatus.PAST_DUE);
        this.logger.warn(`Tenant ${tenantId} subscription is past due`);
        break;

      case 'cancel':
        // Actual cancellation lifecycle handled by SubscriptionLifecycleService daily check
        this.logger.log(
          `Tenant ${tenantId} cancellation received -- lifecycle service handles transition`,
        );
        break;

      case 'expired':
        await this.subscriptionService.updatePlan(tenantId, SubscriptionPlan.FREE);
        await this.subscriptionService.updateStatus(tenantId, SubscriptionStatus.CANCELED);
        this.logger.log(`Tenant ${tenantId} subscription expired -- downgraded to FREE`);
        break;

      case 'scheduled':
        this.logger.log(
          `Tenant ${tenantId} scheduled change received -- no immediate action`,
        );
        break;

      default:
        this.logger.warn(
          `Unknown product update scenario: ${data.scenario} for tenant ${tenantId}`,
        );
        break;
    }
  }

  /**
   * Map Autumn product_id to SubscriptionPlan enum.
   * Uses AUTUMN_PLAN_MAPPING env var (JSON) or product_name heuristic.
   */
  private mapProductToPlan(
    productId?: string,
    productName?: string,
  ): SubscriptionPlan {
    // Try env-based mapping first
    if (productId && this.planMapping) {
      const mapped = this.planMapping[productId];
      if (mapped && mapped in SubscriptionPlan) {
        return mapped as SubscriptionPlan;
      }
    }

    // Fallback: product_name heuristic
    if (productName) {
      const upper = productName.toUpperCase();
      for (const plan of Object.values(SubscriptionPlan) as string[]) {
        if (upper.includes(plan)) {
          return plan as SubscriptionPlan;
        }
      }
    }

    this.logger.warn(
      `Could not map product to plan: productId=${productId}, productName=${productName}. Defaulting to STARTER.`,
    );
    return SubscriptionPlan.STARTER;
  }

  private safeParse(raw: string): Record<string, string> | null {
    try {
      return JSON.parse(raw);
    } catch {
      this.logger.error(`Failed to parse AUTUMN_PLAN_MAPPING: ${raw}`);
      return null;
    }
  }
}
