/**
 * SubscriptionModule - P10 Subscription & Billing
 *
 * Integrates Autumn SDK for usage-based billing with aggressive cost protection.
 * Based on research: 88% savings using Hybrid GDPR strategy (Mistral + Azure Embed)
 *
 * @see backend/docs/P10-SUBSCRIPTION-BILLING-ROADMAP.md
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SubscriptionService } from './services/subscription.service';
import { UsageTrackingService } from './services/usage-tracking.service';
import { AutumnService } from './services/autumn.service';
import { CostProtectionService } from './services/cost-protection.service';
import { SubscriptionController } from './controllers/subscription.controller';
import { AutumnController } from './controllers/autumn.controller';
import { AutumnWebhookController } from './controllers/autumn-webhook.controller';
import { QuotaGuard } from './guards/quota.guard';
import { CacheModule } from '../../common/services/cache.module';

@Module({
  imports: [
    PrismaModule,
    CacheModule, // For Redis-based usage counters
  ],
  providers: [
    SubscriptionService,
    UsageTrackingService,
    AutumnService,
    CostProtectionService,
    QuotaGuard,
  ],
  controllers: [
    SubscriptionController,
    AutumnController,
    AutumnWebhookController,
  ],
  exports: [
    SubscriptionService,
    UsageTrackingService,
    AutumnService,
    CostProtectionService,
    QuotaGuard,
  ],
})
export class SubscriptionModule {}
