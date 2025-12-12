/**
 * Script to trigger webhook renewal manually
 * This will recreate any expired webhooks
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/trigger-webhook-renewal.ts
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { WebhookLifecycleService } from '../src/modules/email-sync/services/webhook-lifecycle.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  console.log('🚀 Bootstrapping NestJS application...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  const prisma = app.get(PrismaService);
  const webhookLifecycle = app.get(WebhookLifecycleService);

  try {
    // Show current webhook status
    console.log('\n📊 Current Webhook Status:');
    console.log('==========================');

    const webhooks = await prisma.webhookSubscription.findMany({
      where: {
        resourcePath: {
          in: ['gmail/mailbox', '/me/mailFolders/inbox/messages'],
        },
      },
      include: {
        provider: {
          select: { email: true, providerType: true },
        },
      },
    });

    const now = new Date();
    for (const w of webhooks) {
      const isExpired = w.expiresAt && w.expiresAt < now;
      const status = isExpired ? '❌ EXPIRED' : '✅ Active';
      console.log(`\n${w.provider?.email} (${w.providerType}):`);
      console.log(`  Resource: ${w.resourcePath}`);
      console.log(`  Status: ${status}`);
      console.log(`  Expires: ${w.expiresAt}`);
      console.log(`  Notifications: ${w.notificationCount}`);
    }

    // Trigger renewal
    console.log('\n🔄 Triggering webhook renewal...');
    await webhookLifecycle.renewExpiringWebhooks();
    console.log('✅ Webhook renewal completed!');

    // Show updated status
    console.log('\n📊 Updated Webhook Status:');
    console.log('===========================');

    const updatedWebhooks = await prisma.webhookSubscription.findMany({
      where: {
        resourcePath: {
          in: ['gmail/mailbox', '/me/mailFolders/inbox/messages'],
        },
      },
      include: {
        provider: {
          select: { email: true, providerType: true },
        },
      },
    });

    for (const w of updatedWebhooks) {
      const isExpired = w.expiresAt && w.expiresAt < now;
      const status = isExpired ? '❌ EXPIRED' : '✅ Active';
      console.log(`\n${w.provider?.email} (${w.providerType}):`);
      console.log(`  Resource: ${w.resourcePath}`);
      console.log(`  Status: ${status}`);
      console.log(`  Expires: ${w.expiresAt}`);
      console.log(`  Notifications: ${w.notificationCount}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
