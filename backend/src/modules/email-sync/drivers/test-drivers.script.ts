/**
 * Test Script for Email Drivers
 *
 * Run with: npx ts-node -r tsconfig-paths/register src/modules/email-sync/drivers/test-drivers.script.ts
 *
 * Tests GoogleDriver and MicrosoftDriver with real account data.
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProviderTokenService } from '../services/provider-token.service';
import { EmailDriverFactory } from './driver.factory';
import { DriverCredentials } from './interfaces/email-driver.interface';
import { ProviderType } from './interfaces/canonical.types';

async function bootstrap() {
  console.log('\n========================================');
  console.log('  EMAIL DRIVERS TEST SCRIPT');
  console.log('========================================\n');

  // Create NestJS application context
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const prisma = app.get(PrismaService);
  const tokenService = app.get(ProviderTokenService);
  const driverFactory = app.get(EmailDriverFactory);

  try {
    // Get all active providers
    const providers = await prisma.providerConfig.findMany({
      where: {
        isActive: true,
        providerType: { in: ['google', 'microsoft'] },
      },
      select: {
        id: true,
        email: true,
        providerType: true,
        tenantId: true,
      },
    });

    console.log(`Found ${providers.length} active providers\n`);

    if (providers.length === 0) {
      console.log('No active providers found. Please add a Google or Microsoft account first.');
      return;
    }

    // Test each provider
    for (const provider of providers) {
      console.log('----------------------------------------');
      console.log(`Testing: ${provider.email} (${provider.providerType})`);
      console.log('----------------------------------------\n');

      try {
        // Get decrypted token
        const { accessToken } = await tokenService.getProviderWithToken(provider.id);
        console.log(`[OK] Got access token (${accessToken.substring(0, 20)}...)`);

        // Create credentials
        const credentials: DriverCredentials = {
          type: 'oauth2',
          accessToken,
        };

        // Create connected driver
        const driver = await driverFactory.createConnectedDriver(
          provider.providerType as ProviderType,
          credentials,
        );
        console.log(`[OK] Driver connected`);

        // Test 1: List folders
        console.log('\n--- Test 1: List Folders ---');
        const folders = await driver.listFolders();
        console.log(`[OK] Found ${folders.length} folders:`);
        folders.slice(0, 10).forEach((f) => {
          console.log(`     - ${f.name} (${f.type}) [${f.id}]`);
        });
        if (folders.length > 10) {
          console.log(`     ... and ${folders.length - 10} more`);
        }

        // Test 2: List messages in INBOX
        console.log('\n--- Test 2: List INBOX Messages ---');
        const inboxResult = await driver.listMessages({
          folder: 'INBOX',
          pageSize: 5,
        });
        console.log(`[OK] Found ${inboxResult.messages.length} messages (hasMore: ${inboxResult.hasMore})`);
        console.log(`     Total estimate: ${inboxResult.totalEstimate || 'N/A'}`);

        if (inboxResult.messages.length > 0) {
          console.log('\n     Recent messages:');
          inboxResult.messages.forEach((m, i) => {
            console.log(`     ${i + 1}. "${m.subject?.substring(0, 50)}..." from ${m.from?.email || 'unknown'}`);
          });

          // Test 3: Get full message details
          console.log('\n--- Test 3: Get Message Details ---');
          const firstMessage = inboxResult.messages[0];
          const fullMessage = await driver.getMessage(firstMessage.id);
          if (fullMessage) {
            console.log(`[OK] Got message details:`);
            console.log(`     ID: ${fullMessage.id}`);
            console.log(`     ThreadID: ${fullMessage.threadId || 'N/A'}`);
            console.log(`     Subject: ${fullMessage.subject}`);
            console.log(`     From: ${fullMessage.from?.name || ''} <${fullMessage.from?.email}>`);
            console.log(`     To: ${fullMessage.to?.map((t) => t.email).join(', ')}`);
            console.log(`     Date: ${fullMessage.receivedAt}`);
            console.log(`     Read: ${fullMessage.isRead}, Starred: ${fullMessage.isStarred}`);
            console.log(`     Has attachments: ${fullMessage.hasAttachments} (${fullMessage.attachments?.length || 0})`);
            console.log(`     Body text length: ${fullMessage.bodyText?.length || 0} chars`);
            console.log(`     Body HTML length: ${fullMessage.bodyHtml?.length || 0} chars`);
          }
        }

        // Test 4: List SENT messages
        console.log('\n--- Test 4: List SENT Messages ---');
        const sentResult = await driver.listMessages({
          folder: 'SENT',
          pageSize: 3,
        });
        console.log(`[OK] Found ${sentResult.messages.length} sent messages`);

        // Test 5: List TRASH messages
        console.log('\n--- Test 5: List TRASH Messages ---');
        const trashResult = await driver.listMessages({
          folder: 'TRASH',
          pageSize: 3,
        });
        console.log(`[OK] Found ${trashResult.messages.length} trash messages`);

        // Disconnect
        await driver.disconnect();
        console.log('\n[OK] Driver disconnected');

        console.log(`\n[SUCCESS] All tests passed for ${provider.email}\n`);
      } catch (error) {
        console.error(`\n[FAIL] Error testing ${provider.email}:`, error instanceof Error ? error.message : error);
      }
    }
  } catch (error) {
    console.error('Test script error:', error);
  } finally {
    await app.close();
    console.log('\n========================================');
    console.log('  TEST COMPLETE');
    console.log('========================================\n');
  }
}

bootstrap().catch(console.error);
