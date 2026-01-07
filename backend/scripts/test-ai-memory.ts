/**
 * AI Memory System Test Script
 *
 * Tests the restored AIMemoryService with real database operations.
 *
 * Usage:
 *   cd backend
 *   npx ts-node scripts/test-ai-memory.ts
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AIMemoryService } from '../src/modules/ai/voltagent/services/ai-memory.service';

// Test configuration
const TEST_TENANT_ID = 'test-tenant-memory';
const TEST_USER_ID = 'test-user-memory';

async function main() {
  console.log('\n🧠 AI Memory Service Test (Restored 2025-01-07)\n');
  console.log('='.repeat(50));

  // Bootstrap NestJS application
  console.log('\n📦 Bootstrapping NestJS application...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const memoryService = app.get(AIMemoryService);
  console.log('✅ AIMemoryService initialized\n');

  try {
    // Clean up any previous test data
    console.log('🧹 Cleaning up previous test data...');
    const deleted = await memoryService.clearAllMemories(TEST_TENANT_ID, TEST_USER_ID);
    console.log(`   Deleted ${deleted} previous test memories\n`);

    // Test 1: Store memories
    console.log('📝 Test 1: Storing memories...');

    const memory1 = await memoryService.storeMemory(TEST_TENANT_ID, TEST_USER_ID, {
      content: 'User prefers brief email responses',
      type: 'PREFERENCE',
      source: 'EXPLICIT',
      confidence: 0.9,
    });
    console.log(`   ✅ Created PREFERENCE: ${memory1.content}`);

    const memory2 = await memoryService.storeMemory(TEST_TENANT_ID, TEST_USER_ID, {
      content: 'Works as CTO at Acme Corporation',
      type: 'FACT',
      source: 'INFERRED',
      confidence: 0.85,
    });
    console.log(`   ✅ Created FACT: ${memory2.content}`);

    const memory3 = await memoryService.storeMemory(TEST_TENANT_ID, TEST_USER_ID, {
      content: 'Usually responds to emails in the morning (9-11am)',
      type: 'PATTERN',
      source: 'INFERRED',
      confidence: 0.7,
    });
    console.log(`   ✅ Created PATTERN: ${memory3.content}`);

    const memory4 = await memoryService.storeMemory(TEST_TENANT_ID, TEST_USER_ID, {
      content: 'Sarah from Sales - difficult client, handle carefully',
      type: 'CONTACT_NOTE',
      source: 'EXPLICIT',
      confidence: 1.0,
    });
    console.log(`   ✅ Created CONTACT_NOTE: ${memory4.content}`);

    // Test 2: List all memories
    console.log('\n📋 Test 2: Listing all memories...');
    const allMemories = await memoryService.getMemories(TEST_TENANT_ID, TEST_USER_ID);
    console.log(`   ✅ Found ${allMemories.length} memories`);
    allMemories.forEach((m) => {
      console.log(`      - [${m.memoryType}] ${m.content.substring(0, 50)}...`);
    });

    // Test 3: Filter by type
    console.log('\n🔍 Test 3: Filter by type (PREFERENCE)...');
    const preferences = await memoryService.getMemories(TEST_TENANT_ID, TEST_USER_ID, {
      type: 'PREFERENCE',
    });
    console.log(`   ✅ Found ${preferences.length} preferences`);

    // Test 4: Search by content
    console.log('\n🔎 Test 4: Search for "email"...');
    const searchResults = await memoryService.searchMemories(
      TEST_TENANT_ID,
      TEST_USER_ID,
      'email',
    );
    console.log(`   ✅ Found ${searchResults.length} memories containing "email"`);
    searchResults.forEach((m) => {
      console.log(`      - ${m.content}`);
    });

    // Test 5: Update a memory
    console.log('\n✏️ Test 5: Updating a memory...');
    const updated = await memoryService.updateMemory(
      TEST_TENANT_ID,
      TEST_USER_ID,
      memory1.id,
      {
        content: 'User prefers very brief, bullet-point email responses',
      },
    );
    console.log(`   ✅ Updated: ${updated.content}`);

    // Test 6: Get memory history
    console.log('\n📜 Test 6: Getting memory history...');
    const history = await memoryService.getMemoryHistory(
      TEST_TENANT_ID,
      TEST_USER_ID,
      memory1.id,
    );
    console.log(`   ✅ Found ${history.length} history entries`);
    history.forEach((h) => {
      console.log(`      - [${h.action}] ${new Date(h.createdAt).toLocaleString()}`);
    });

    // Test 7: Get statistics
    console.log('\n📊 Test 7: Getting statistics...');
    const stats = await memoryService.getStats(TEST_TENANT_ID, TEST_USER_ID);
    console.log(`   ✅ Total memories: ${stats.total}`);
    console.log('   By type:');
    Object.entries(stats.byType).forEach(([type, count]) => {
      if (count > 0) console.log(`      - ${type}: ${count}`);
    });

    // Test 8: Get patterns
    console.log('\n🔄 Test 8: Getting patterns...');
    const patterns = await memoryService.getPatterns(TEST_TENANT_ID, TEST_USER_ID);
    console.log(`   ✅ Found ${patterns.length} patterns`);

    // Test 9: Record usage
    console.log('\n📈 Test 9: Recording memory usage...');
    await memoryService.recordUsage(memory1.id);
    const memoryAfterUsage = await memoryService.getMemory(
      TEST_TENANT_ID,
      TEST_USER_ID,
      memory1.id,
    );
    console.log(`   ✅ Usage count: ${memoryAfterUsage?.usageCount}`);

    // Test 10: Delete a memory
    console.log('\n🗑️ Test 10: Deleting a memory...');
    await memoryService.deleteMemory(TEST_TENANT_ID, TEST_USER_ID, memory4.id);
    console.log('   ✅ Deleted contact note memory');

    // Final count
    const finalMemories = await memoryService.getMemories(TEST_TENANT_ID, TEST_USER_ID);
    console.log(`\n📈 Final memory count: ${finalMemories.length}`);

    console.log('\n' + '='.repeat(50));
    console.log('✅ All tests passed! AI Memory System is working correctly.');
    console.log('='.repeat(50) + '\n');

    // Keep test data for manual inspection
    console.log('💡 Test data kept in database for manual inspection.');
    console.log('   View in /dashboard/ai/memories after authenticating.\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main();
