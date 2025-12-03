/**
 * Manually renew expired webhooks
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { WebhookLifecycleService } from '../src/modules/email-sync/services/webhook-lifecycle.service';
import { PrismaService } from '../src/prisma/prisma.service';

const TENANT_ID = 'cmi31xyel0000yhukbwp6l714';

async function main() {
  console.log('🚀 Starting webhook renewal...\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const webhookService = app.get(WebhookLifecycleService);
    const prisma = app.get(PrismaService);

    // Check current webhook status
    console.log('=== CURRENT WEBHOOK STATUS ===\n');
    const webhooks = await prisma.webhookSubscription.findMany({
      where: {
        provider: { tenantId: TENANT_ID },
      },
      include: {
        provider: { select: { email: true, providerType: true } },
      },
    });

    for (const w of webhooks) {
      const expired = w.expiresAt && new Date(w.expiresAt) < new Date();
      console.log(`${w.provider.providerType}: ${w.resourcePath}`);
      console.log(`  Active: ${w.isActive}`);
      console.log(`  Expires: ${w.expiresAt} ${expired ? '(EXPIRED!)' : ''}`);
      console.log(`  Last notification: ${w.lastNotificationAt}`);
      console.log('');
    }

    // Trigger renewal for all webhooks
    console.log('=== RENEWING WEBHOOKS ===\n');
    await webhookService.renewExpiringWebhooks();

    // Or recreate all webhooks
    console.log('\n=== RECREATING ALL WEBHOOKS ===\n');
    const result = await webhookService.createAllWebhooks();
    console.log(`Created: ${result.created}, Failed: ${result.failed}`);

    // Check status again
    console.log('\n=== UPDATED WEBHOOK STATUS ===\n');
    const updatedWebhooks = await prisma.webhookSubscription.findMany({
      where: {
        provider: { tenantId: TENANT_ID },
      },
      include: {
        provider: { select: { email: true, providerType: true } },
      },
    });

    for (const w of updatedWebhooks) {
      const expired = w.expiresAt && new Date(w.expiresAt) < new Date();
      console.log(`${w.provider.providerType}: ${w.resourcePath}`);
      console.log(`  Active: ${w.isActive}`);
      console.log(`  Expires: ${w.expiresAt} ${expired ? '(EXPIRED!)' : ''}`);
      console.log('');
    }

    console.log('✅ Webhook renewal complete!');
  } finally {
    await app.close();
  }
}

main().catch(console.error);
