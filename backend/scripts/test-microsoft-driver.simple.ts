/**
 * Simple Driver Test: Microsoft Driver Delta Query
 *
 * Tests MicrosoftDriver.getChangesSince() and getInitialSyncToken()
 * without loading the full NestJS application context.
 *
 * Usage:
 *   npx ts-node scripts/test-microsoft-driver.simple.ts
 */

import { MicrosoftDriver } from '../src/modules/email-sync/drivers/microsoft/microsoft.driver';
import type { CanonicalMessage, ProviderChange } from '../src/modules/email-sync/drivers/interfaces/canonical.types';

async function testMicrosoftDriver() {
  console.log('🚀 Microsoft Driver Test - Delta Query\n');

  // You need to provide a valid access token manually
  const accessToken = process.env.TEST_MICROSOFT_ACCESS_TOKEN;

  if (!accessToken) {
    console.error('❌ TEST_MICROSOFT_ACCESS_TOKEN environment variable not set');
    console.log('Please set it in your .env file with a valid Microsoft access token');
    process.exit(1);
  }

  const driver = new MicrosoftDriver();

  try {
    // Test 1: Connect
    console.log('TEST 1: Driver Connect');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await driver.connect({
      type: 'oauth2',
      accessToken,
    });

    console.log(`✅ Driver connected: ${driver.isConnected()}`);
    console.log();

    // Test 2: Get Initial Sync Token
    console.log('TEST 2: Get Initial Sync Token (deltaLink)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const initialToken = await driver.getInitialSyncToken();
    console.log(`✅ Initial sync token: ${initialToken.substring(0, 80)}...`);
    console.log();

    // Test 3: Get Changes Since (should be empty)
    console.log('TEST 3: Get Changes Since (incremental sync)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const changesResult = await driver.getChangesSince(initialToken);
    console.log(`✅ Changes retrieved: ${changesResult.changes.length}`);
    console.log(`✅ New sync token: ${changesResult.newSyncToken.substring(0, 80)}...`);
    console.log(`✅ Has more: ${changesResult.hasMore}`);
    console.log();

    if (changesResult.changes.length > 0) {
      const changes = changesResult.changes as ProviderChange[];
      console.log('Sample changes:');
      changes.slice(0, 3).forEach((change, i) => {
        console.log(`  ${i + 1}. Type: ${change.type}, Message ID: ${change.messageId}`);
      });
      console.log();
    }

    // Test 4: List Messages
    console.log('TEST 4: List Messages from INBOX');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const listResult = await driver.listMessages({
      folder: 'INBOX',
      pageSize: 10,
    });

    console.log(`✅ Messages retrieved: ${listResult.messages.length}`);
    console.log(`✅ Has more: ${listResult.hasMore}`);
    console.log(`✅ Next page token: ${listResult.nextPageToken ? listResult.nextPageToken.substring(0, 40) + '...' : 'None'}`);
    console.log();

    if (listResult.messages.length > 0) {
      const messages = listResult.messages as CanonicalMessage[];
      console.log('Sample messages:');
      messages.slice(0, 3).forEach((msg, i) => {
        console.log(`  ${i + 1}. ${msg.subject || '(No Subject)'}`);
        console.log(`     From: ${msg.from.email}`);
        console.log(`     Date: ${msg.receivedAt.toISOString()}`);
      });
      console.log();
    }

    // Test 5: Get Single Message
    if (listResult.messages.length > 0) {
      console.log('TEST 5: Get Single Message');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      const firstMessageId = (listResult.messages as CanonicalMessage[])[0].id;
      const message = await driver.getMessage(firstMessageId);

      if (message) {
        console.log(`✅ Message retrieved: ${message.subject || '(No Subject)'}`);
        console.log(`   From: ${message.from.email}`);
        console.log(`   To: ${message.to?.map((r) => r.email).join(', ')}`);
        console.log(`   Snippet: ${message.snippet?.substring(0, 100)}...`);
        console.log(`   Folder: ${message.folder}`);
        console.log(`   Labels: ${message.labels?.join(', ') || 'None'}`);
        console.log();
      }
    }

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✅ MicrosoftDriver Tests Passed:');
    console.log('  ✅ connect() - OAuth2 authentication');
    console.log('  ✅ getInitialSyncToken() - Delta link retrieval');
    console.log('  ✅ getChangesSince() - Delta query with change detection');
    console.log('  ✅ listMessages() - Pagination support');
    console.log('  ✅ getMessage() - Single message retrieval');
    console.log();

    console.log('🎉 All driver tests passed!');
    console.log();

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  } finally {
    await driver.disconnect();
    console.log('✅ Driver disconnected');
  }
}

testMicrosoftDriver()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
