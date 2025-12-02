/**
 * Fix Microsoft Webhook - Delete expired and recreate
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MicrosoftWebhookService } from '../src/modules/email-sync/services/microsoft-webhook.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

const MS_PROVIDER_ID = 'cmi7m4qz907ydyhj4vwqdbnj5';
const TENANT_ID = 'cmi31xyel0000yhukbwp6l714';

async function main() {
  console.log('🚀 Fixing Microsoft Webhook...\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const msWebhook = app.get(MicrosoftWebhookService);
    const prisma = app.get(PrismaService);
    const config = app.get(ConfigService);

    // Step 1: Delete expired Microsoft webhook records
    console.log('=== DELETING EXPIRED MS WEBHOOKS ===\n');
    const deleted = await prisma.webhookSubscription.deleteMany({
      where: {
        providerId: MS_PROVIDER_ID,
        providerType: 'microsoft',
      },
    });
    console.log(`Deleted ${deleted.count} expired webhook records`);

    // Step 2: Create new webhook subscriptions
    console.log('\n=== CREATING NEW MS WEBHOOKS ===\n');

    // Derive webhook URL from API_PUBLIC_URL
    const configuredUrl = config.get<string>('MICROSOFT_EMAIL_WEBHOOK_URL');
    const apiUrl = config.get<string>('API_PUBLIC_URL', 'http://localhost:3000');
    const webhookUrl = configuredUrl || `${apiUrl}/webhooks/microsoft/notifications`;
    console.log(`Using webhook URL: ${webhookUrl}`);

    try {
      await msWebhook.createSubscription({
        providerId: MS_PROVIDER_ID,
        providerType: 'microsoft',
        webhookUrl,
      });
      console.log('✅ Microsoft email webhook created');
    } catch (err: any) {
      console.error('❌ Failed to create Microsoft email webhook:', err.message);
    }

    // Step 3: Verify
    console.log('\n=== VERIFYING ===\n');
    const webhooks = await prisma.webhookSubscription.findMany({
      where: { providerId: MS_PROVIDER_ID },
    });

    for (const w of webhooks) {
      console.log(`${w.resourcePath}`);
      console.log(`  Active: ${w.isActive}`);
      console.log(`  Expires: ${w.expiresAt}`);
      console.log(`  Subscription ID: ${w.subscriptionId}`);
    }

    console.log('\n✅ Microsoft webhook fix complete!');
  } finally {
    await app.close();
  }
}

main().catch(console.error);
