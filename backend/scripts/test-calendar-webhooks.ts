/**
 * Test script for calendar webhook subscriptions
 *
 * Usage:
 *   npx ts-node scripts/test-calendar-webhooks.ts [providerId]
 *
 * Example:
 *   npx ts-node scripts/test-calendar-webhooks.ts
 *   npx ts-node scripts/test-calendar-webhooks.ts cmiz39hqi0003aoyhyaihfukt
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { GoogleCalendarWebhookService } from '../src/modules/calendar/services/google-calendar-webhook.service';
import { MicrosoftCalendarWebhookService } from '../src/modules/calendar/services/microsoft-calendar-webhook.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const providerId = process.argv[2];

  console.log('🚀 Bootstrapping NestJS application...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  const prisma = app.get(PrismaService);
  const googleWebhook = app.get(GoogleCalendarWebhookService);
  const microsoftWebhook = app.get(MicrosoftCalendarWebhookService);

  try {
    // Show overall webhook stats
    console.log('\n📊 Calendar Webhook Statistics:');
    console.log('================================');

    const googleStats = await googleWebhook.getStats();
    console.log('\n🔴 Google Calendar:');
    console.log(`  Active subscriptions: ${googleStats.activeSubscriptions}`);
    console.log(`  Recent notifications (24h): ${googleStats.recentNotifications}`);

    const microsoftStats = await microsoftWebhook.getStats();
    console.log('\n🔵 Microsoft Calendar:');
    console.log(`  Active subscriptions: ${microsoftStats.activeSubscriptions}`);
    console.log(`  Recent notifications (24h): ${microsoftStats.recentNotifications}`);

    // List all calendar webhook subscriptions
    const calendarSubscriptions = await prisma.webhookSubscription.findMany({
      where: {
        OR: [
          { resourcePath: { startsWith: '/calendar/' } },
          { resourcePath: '/me/events' },
        ],
        isActive: true,
      },
      include: {
        provider: {
          select: { email: true, providerType: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log(`\n📋 All Calendar Webhook Subscriptions (${calendarSubscriptions.length}):`);
    for (const sub of calendarSubscriptions) {
      const expiresIn = sub.expiresAt
        ? Math.round((sub.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60))
        : 'unknown';
      console.log(`  - ${sub.provider?.email || sub.providerId} (${sub.providerType})`);
      console.log(`    Resource: ${sub.resourcePath}`);
      console.log(`    Expires in: ${expiresIn} hours`);
      console.log(`    Notifications: ${sub.notificationCount}`);
      console.log(`    Last notification: ${sub.lastNotificationAt || 'never'}`);
    }

    // If specific provider ID provided, test setup
    if (providerId) {
      const provider = await prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider) {
        console.error(`\n❌ Provider not found: ${providerId}`);
        process.exit(1);
      }

      if (!provider.supportsCalendar) {
        console.error(`\n❌ Provider does not support calendar: ${provider.email}`);
        process.exit(1);
      }

      console.log(`\n🔧 Testing webhook setup for: ${provider.email} (${provider.providerType})`);

      if (provider.providerType === 'google') {
        console.log('\n🔴 Setting up Google Calendar watch...');
        await googleWebhook.setupWatch(providerId);
        console.log('✅ Google Calendar watch setup complete!');
      } else if (provider.providerType === 'microsoft') {
        console.log('\n🔵 Setting up Microsoft Calendar subscription...');
        await microsoftWebhook.setupSubscription(providerId);
        console.log('✅ Microsoft Calendar subscription setup complete!');
      }

      // Show updated subscription
      const newSubscription = await prisma.webhookSubscription.findFirst({
        where: {
          providerId,
          OR: [
            { resourcePath: { startsWith: '/calendar/' } },
            { resourcePath: '/me/events' },
          ],
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (newSubscription) {
        console.log('\n📋 Created/Updated Subscription:');
        console.log(`  Subscription ID: ${newSubscription.subscriptionId}`);
        console.log(`  Resource: ${newSubscription.resourcePath}`);
        console.log(`  Webhook URL: ${newSubscription.webhookUrl}`);
        console.log(`  Expires: ${newSubscription.expiresAt}`);
      }
    } else {
      // Show available providers
      const providers = await prisma.providerConfig.findMany({
        where: { isActive: true, supportsCalendar: true },
        select: { id: true, email: true, providerType: true },
      });

      if (providers.length > 0) {
        console.log('\n💡 Available providers for testing:');
        for (const p of providers) {
          console.log(`  npx ts-node scripts/test-calendar-webhooks.ts ${p.id}`);
          console.log(`    → ${p.email} (${p.providerType})`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
