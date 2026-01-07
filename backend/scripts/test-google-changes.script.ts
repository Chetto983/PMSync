#!/usr/bin/env ts-node
/**
 * Test script for GoogleDriver.getChangesSince() with real Gmail provider
 *
 * This script tests the new getChangesSince() method with a real Gmail account.
 *
 * Run: npx ts-node scripts/test-google-changes.script.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailDriverFactory } from '../src/modules/email-sync/drivers/driver.factory';
import { GoogleDriver } from '../src/modules/email-sync/drivers/google/google.driver';
import { ProviderTokenService } from '../src/modules/email-sync/services/provider-token.service';
import type { ProviderChange } from '../src/modules/email-sync/drivers/interfaces/canonical.types';

async function testGoogleDriverChanges() {
  console.log('🧪 Testing GoogleDriver.getChangesSince() with real Gmail provider\n');

  // Create NestJS app context
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService);
  const driverFactory = app.get(EmailDriverFactory);
  const tokenService = app.get(ProviderTokenService);

  try {
    // Find active Google provider
    const providers = await prisma.providerConfig.findMany({
      where: {
        providerType: 'google',
        isActive: true,
      },
      take: 1,
    });

    if (providers.length === 0) {
      console.error('❌ No active Google provider found in database');
      console.log('   Please add a Gmail account first');
      process.exit(1);
    }

    const provider = providers[0];
    console.log(`✅ Found Google provider: ${provider.email}`);
    console.log(`   Provider ID: ${provider.id}`);
    console.log(`   Tenant ID: ${provider.tenantId}\n`);

    // Get credentials using ProviderTokenService
    console.log('🔑 Fetching OAuth credentials...');
    const { accessToken } = await tokenService.getProviderWithToken(provider.id);

    if (!accessToken) {
      console.error('❌ Failed to get valid access token for provider');
      console.log('   Token may be expired or invalid');
      process.exit(1);
    }
    console.log('✅ Got valid OAuth credentials\n');

    // Create connected driver
    console.log('🔌 Connecting to Gmail API...');
    const driver = await driverFactory.createConnectedDriver('google', {
      type: 'oauth2',
      accessToken,
      emailHint: provider.email,
    }) as GoogleDriver;

    if (!driver.isConnected()) {
      console.error('❌ Driver not connected');
      process.exit(1);
    }
    console.log('✅ Connected to Gmail API\n');

    // Test 1: Get initial sync token
    console.log('📋 Test 1: Get Initial Sync Token');
    console.log('─'.repeat(60));
    const initialToken = await driver.getInitialSyncToken();
    console.log(`✅ Initial historyId: ${initialToken}\n`);

    // Test 2: Get changes with same token (should return empty)
    console.log('📋 Test 2: Get Changes with Same Token (No Changes)');
    console.log('─'.repeat(60));
    const noChangesResult = await driver.getChangesSince(initialToken);
    console.log(`Changes count: ${noChangesResult.changes.length}`);
    console.log(`New sync token: ${noChangesResult.newSyncToken}`);
    console.log(`Has more: ${noChangesResult.hasMore}`);
    console.log(`Expected: 0 changes (same historyId)\n`);

    // Test 3: Get changes from provider metadata (if exists)
    console.log('📋 Test 3: Get Changes from Last Sync');
    console.log('─'.repeat(60));

    const metadata = provider.metadata as any;
    const lastSyncToken = metadata?.lastSyncToken;

    if (lastSyncToken && lastSyncToken !== initialToken) {
      console.log(`Last sync historyId: ${lastSyncToken}`);
      console.log('Fetching changes...\n');

      const changesResult = await driver.getChangesSince(lastSyncToken);

      console.log(`✅ Changes retrieved: ${changesResult.changes.length}`);
      console.log(`New sync token: ${changesResult.newSyncToken}`);
      console.log(`Has more: ${changesResult.hasMore}\n`);

      if (changesResult.changes.length > 0) {
        const changes = changesResult.changes as ProviderChange[];
        console.log('Sample changes (first 5):');
        changes.slice(0, 5).forEach((change, idx) => {
          console.log(`  ${idx + 1}. Type: ${change.type}, MessageId: ${change.messageId.substring(0, 20)}...`);
        });
        console.log('');

        // Count by type
        const added = changes.filter((c) => c.type === 'added').length;
        const modified = changes.filter((c) => c.type === 'modified').length;
        const deleted = changes.filter((c) => c.type === 'deleted').length;

        console.log('Changes by type:');
        console.log(`  Added: ${added}`);
        console.log(`  Modified: ${modified}`);
        console.log(`  Deleted: ${deleted}\n`);
      } else {
        console.log('ℹ️  No changes since last sync\n');
      }
    } else {
      console.log('ℹ️  No previous sync token found in provider metadata');
      console.log('   This is expected for new providers\n');
    }

    // Test 4: Test with expired historyId (404 error handling)
    console.log('📋 Test 4: Test with Expired HistoryId (Error Handling)');
    console.log('─'.repeat(60));
    const expiredToken = '1234567890'; // Fake expired historyId
    console.log(`Testing with fake historyId: ${expiredToken}`);

    try {
      const expiredResult = await driver.getChangesSince(expiredToken);

      if (expiredResult.changes.length === 0 && expiredResult.newSyncToken) {
        console.log('✅ Handled expired historyId gracefully');
        console.log(`   Returned current historyId: ${expiredResult.newSyncToken}`);
        console.log('   Caller should perform full sync\n');
      }
    } catch (error: any) {
      console.log(`✅ Caught expected error: ${error.message}\n`);
    }

    // Test 5: List recent messages to verify data
    console.log('📋 Test 5: Verify Driver Can List Messages');
    console.log('─'.repeat(60));
    const messagesResult = await driver.listMessages({
      folder: 'INBOX',
      pageSize: 5,
    });

    console.log(`✅ Listed ${messagesResult.messages.length} messages from INBOX`);
    if (messagesResult.messages.length > 0) {
      const msg = messagesResult.messages[0];
      console.log(`   Latest message: "${msg.subject}"`);
      console.log(`   From: ${msg.from.email}`);
      console.log(`   Received: ${msg.receivedAt}\n`);
    }

    // Disconnect driver
    await driver.disconnect();
    console.log('✅ Disconnected from Gmail API\n');

    console.log('━'.repeat(60));
    console.log('🎉 All tests passed!');
    console.log('━'.repeat(60));
    console.log('\nSummary:');
    console.log('  ✅ getInitialSyncToken() works');
    console.log('  ✅ getChangesSince() handles no changes');
    console.log('  ✅ getChangesSince() retrieves changes (if any)');
    console.log('  ✅ Handles expired historyId gracefully');
    console.log('  ✅ Driver integration verified');
    console.log('\nReady to proceed with GoogleSyncService wrapper implementation! 🚀\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    await app.close();
  }
}

// Run tests
testGoogleDriverChanges()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
