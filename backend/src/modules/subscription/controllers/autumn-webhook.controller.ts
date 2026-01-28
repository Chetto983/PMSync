/**
 * AutumnWebhookController - Autumn/Stripe webhook handler
 *
 * Handles webhooks from Autumn/Stripe for subscription lifecycle events.
 * Validates signatures and updates local subscription state.
 *
 * @see backend/docs/P10-SUBSCRIPTION-BILLING-ROADMAP.md
 */

import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  RawBodyRequest,
  Req,
  Optional,
  Inject,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import {
  ApiTags,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { SubscriptionService } from '../services/subscription.service';
import { WebhookRetryService, AutumnEventType } from '../services/webhook-retry.service';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';

interface AutumnWebhookEvent {
  id?: string; // Event ID for idempotency
  type: AutumnEventType;
  data: {
    customer_id: string;
    subscription_id?: string;
    product_id?: string;
    status?: string;
    current_period_start?: string;
    current_period_end?: string;
    cancel_at?: string;
  };
}

@ApiTags('Webhooks')
@Controller('webhooks/autumn')
export class AutumnWebhookController {
  private readonly logger = new Logger(AutumnWebhookController.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly subscriptionService: SubscriptionService,
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(WebhookRetryService) private readonly webhookRetryService?: WebhookRetryService,
  ) {
    this.webhookSecret = this.config.get<string>('AUTUMN_WEBHOOK_SECRET') || '';
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint() // Hide from Swagger docs for security
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-autumn-signature') signature: string,
    @Body() event: AutumnWebhookEvent,
  ): Promise<{ received: boolean }> {
    // Validate webhook signature
    if (this.webhookSecret && !this.validateSignature(req.rawBody, signature)) {
      this.logger.warn('Invalid webhook signature');
      throw new BadRequestException('Invalid signature');
    }

    const eventId = event.id || randomUUID();
    this.logger.log(`Received Autumn webhook: ${event.type} (${eventId})`);

    try {
      await this.processEvent(event);
      return { received: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Webhook processing failed: ${msg}`);

      // Enqueue for retry if service available (don't throw - return success to Autumn)
      if (this.webhookRetryService) {
        try {
          await this.webhookRetryService.enqueue({
            eventId,
            eventType: event.type,
            tenantId: event.data.customer_id,
            data: event.data,
            receivedAt: new Date().toISOString(),
          });
          this.logger.log(`Webhook ${eventId} enqueued for retry`);
          return { received: true }; // Acknowledge to prevent Autumn retries
        } catch (queueError) {
          this.logger.error(`Failed to enqueue webhook for retry: ${queueError}`);
        }
      }

      throw error; // Re-throw if no retry service or queue failed
    }
  }

  /**
   * Process webhook event
   */
  private async processEvent(event: AutumnWebhookEvent): Promise<void> {
    const { type, data } = event;
    const tenantId = data.customer_id;

    switch (type) {
      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(tenantId, data);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(tenantId, data);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(tenantId);
        break;

      case 'customer.subscription.paused':
        await this.handleSubscriptionPaused(tenantId);
        break;

      case 'customer.subscription.resumed':
        await this.handleSubscriptionResumed(tenantId);
        break;

      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(tenantId, data);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(tenantId);
        break;

      default:
        this.logger.debug(`Unhandled webhook event: ${type}`);
    }
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  private async handleSubscriptionCreated(
    tenantId: string,
    data: AutumnWebhookEvent['data'],
  ): Promise<void> {
    const plan = this.mapProductToPlan(data.product_id);

    this.logger.log(`Subscription created for ${tenantId}: ${plan}`);

    await this.subscriptionService.updatePlan(
      tenantId,
      plan,
      data.subscription_id,
    );
  }

  private async handleSubscriptionUpdated(
    tenantId: string,
    data: AutumnWebhookEvent['data'],
  ): Promise<void> {
    const plan = this.mapProductToPlan(data.product_id);

    this.logger.log(`Subscription updated for ${tenantId}: ${plan}`);

    await this.subscriptionService.updatePlan(
      tenantId,
      plan,
      data.subscription_id,
    );
  }

  private async handleSubscriptionDeleted(tenantId: string): Promise<void> {
    this.logger.log(`Subscription deleted for ${tenantId}`);

    // Downgrade to free plan
    await this.subscriptionService.updatePlan(tenantId, SubscriptionPlan.FREE);
    await this.subscriptionService.updateStatus(tenantId, SubscriptionStatus.CANCELED);
  }

  private async handleSubscriptionPaused(tenantId: string): Promise<void> {
    this.logger.log(`Subscription paused for ${tenantId}`);

    // Note: PAUSED status not in schema, use PAST_DUE as closest equivalent
    await this.subscriptionService.updateStatus(tenantId, SubscriptionStatus.PAST_DUE);
  }

  private async handleSubscriptionResumed(tenantId: string): Promise<void> {
    this.logger.log(`Subscription resumed for ${tenantId}`);

    await this.subscriptionService.updateStatus(tenantId, SubscriptionStatus.ACTIVE);
  }

  private async handlePaymentSucceeded(
    tenantId: string,
    _data: AutumnWebhookEvent['data'],
  ): Promise<void> {
    this.logger.log(`Payment succeeded for ${tenantId}`);

    // Reset usage counters on successful payment (new billing period)
    await this.subscriptionService.resetUsage(tenantId);
    await this.subscriptionService.updateStatus(tenantId, SubscriptionStatus.ACTIVE);
  }

  private async handlePaymentFailed(tenantId: string): Promise<void> {
    this.logger.warn(`Payment failed for ${tenantId}`);

    await this.subscriptionService.updateStatus(tenantId, SubscriptionStatus.PAST_DUE);
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Map Autumn product ID to subscription plan
   */
  private mapProductToPlan(productId?: string): SubscriptionPlan {
    if (!productId) return SubscriptionPlan.FREE;

    const productMap: Record<string, SubscriptionPlan> = {
      'free': SubscriptionPlan.FREE,
      'starter': SubscriptionPlan.STARTER,
      'professional': SubscriptionPlan.PROFESSIONAL,
      'pro': SubscriptionPlan.PROFESSIONAL,
      'enterprise': SubscriptionPlan.ENTERPRISE,
    };

    return productMap[productId.toLowerCase()] || SubscriptionPlan.FREE;
  }

  /**
   * Validate webhook signature using HMAC-SHA256
   *
   * Autumn/Stripe sends signature in format: sha256=HMAC_HEX
   * We compute HMAC of raw body and compare with timing-safe comparison
   * to prevent timing attacks.
   *
   * @see https://docs.stripe.com/webhooks/signatures
   */
  private validateSignature(
    rawBody: Buffer | undefined,
    signature: string,
  ): boolean {
    // If no webhook secret configured, allow in development only
    if (!this.webhookSecret) {
      this.logger.warn(
        'AUTUMN_WEBHOOK_SECRET not configured - webhook signature validation disabled',
      );
      return process.env.NODE_ENV !== 'production';
    }

    if (!rawBody || !signature) {
      this.logger.warn('Missing rawBody or signature for webhook validation');
      return false;
    }

    try {
      // Compute expected HMAC-SHA256 signature
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(rawBody)
        .digest('hex');

      // Normalize signature format (handle both "sha256=xxx" and plain "xxx")
      const receivedSig = signature.startsWith('sha256=')
        ? signature.slice(7)
        : signature;

      // Convert to buffers for timing-safe comparison
      const expected = Buffer.from(expectedSignature, 'utf8');
      const received = Buffer.from(receivedSig, 'utf8');

      // Length check first (timingSafeEqual requires same length)
      if (expected.length !== received.length) {
        this.logger.warn('Webhook signature length mismatch');
        return false;
      }

      // Timing-safe comparison to prevent timing attacks
      const isValid = crypto.timingSafeEqual(expected, received);

      if (!isValid) {
        this.logger.warn('Webhook signature verification failed');
      }

      return isValid;
    } catch (error) {
      this.logger.error(`Webhook signature validation error: ${error}`);
      return false;
    }
  }
}
