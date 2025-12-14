/**
 * Long-Term Memory Test Script
 *
 * Tests the LongTermMemoryService with real Mistral API calls.
 * Requires:
 * - DATABASE_URL configured
 * - MISTRAL_API_KEY configured
 * - MEM0_ENABLED=true
 *
 * Usage:
 *   cd backend
 *   npx ts-node scripts/test-long-term-memory.ts
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { LongTermMemoryService } from '../src/modules/ai/voltagent/memory';

// Test configuration
const TEST_TENANT_ID = 'test-tenant-memory';
const TEST_USER_ID = 'test-user-memory';

async function main() {
  console.log('\n🧠 Long-Term Memory Service Test\n');
  console.log('='.repeat(50));

  // Check required env vars
  if (!process.env.MISTRAL_API_KEY) {
    console.error('❌ MISTRAL_API_KEY not set');
    process.exit(1);
  }

  if (process.env.MEM0_ENABLED !== 'true') {
    console.warn('⚠️  MEM0_ENABLED is not "true", service will be disabled');
    console.log('   Set MEM0_ENABLED=true in .env to run tests\n');
  }

  // Bootstrap NestJS application
  console.log('\n📦 Bootstrapping NestJS application...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const memoryService = app.get(LongTermMemoryService);

  // Check if service is enabled
  console.log(`\n✅ Service enabled: ${memoryService.isEnabled()}`);

  if (!memoryService.isEnabled()) {
    console.log('\n⚠️  Service is disabled. Set MEM0_ENABLED=true to test.');
    await app.close();
    return;
  }

  const results: { test: string; status: 'PASS' | 'FAIL'; error?: string }[] = [];

  // Test 1: Add a fact
  console.log('\n--- Test 1: Add a fact ---');
  try {
    const factId = await memoryService.addFact(
      TEST_TENANT_ID,
      TEST_USER_ID,
      'User prefers morning meetings between 9am and 11am',
      { category: 'PREFERENCE', importance: 0.8 },
    );
    console.log(`✅ Added fact: ${factId}`);
    results.push({ test: 'Add fact', status: 'PASS' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to add fact: ${msg}`);
    results.push({ test: 'Add fact', status: 'FAIL', error: msg });
  }

  // Test 2: Add memory from conversation
  console.log('\n--- Test 2: Add memory from conversation ---');
  try {
    const memoryId = await memoryService.addMemory(
      TEST_TENANT_ID,
      TEST_USER_ID,
      [
        { role: 'user', content: 'I work in the marketing department' },
        { role: 'assistant', content: 'Noted! I\'ll remember you work in marketing.' },
      ],
      { category: 'GENERAL', importance: 0.6 },
    );
    console.log(`✅ Added memory: ${memoryId}`);
    results.push({ test: 'Add memory from conversation', status: 'PASS' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to add memory: ${msg}`);
    results.push({ test: 'Add memory from conversation', status: 'FAIL', error: msg });
  }

  // Test 3: Search memories
  console.log('\n--- Test 3: Search memories ---');
  try {
    const searchResults = await memoryService.searchMemories(
      TEST_TENANT_ID,
      TEST_USER_ID,
      'What time does the user prefer for meetings?',
      { limit: 5 },
    );
    console.log(`✅ Found ${searchResults.length} memories`);
    for (const mem of searchResults) {
      console.log(`   - [${mem.category}] ${mem.memory} (score: ${mem.score?.toFixed(3)})`);
    }
    results.push({ test: 'Search memories', status: 'PASS' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to search memories: ${msg}`);
    results.push({ test: 'Search memories', status: 'FAIL', error: msg });
  }

  // Test 4: Get context for prompt
  console.log('\n--- Test 4: Get context for AI prompt ---');
  try {
    const context = await memoryService.getContextForPrompt(
      TEST_TENANT_ID,
      TEST_USER_ID,
      'Schedule a meeting',
    );
    if (context) {
      console.log(`✅ Context generated (${context.length} chars)`);
      console.log(context.slice(0, 200) + '...');
    } else {
      console.log('✅ No context (empty)');
    }
    results.push({ test: 'Get context for prompt', status: 'PASS' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to get context: ${msg}`);
    results.push({ test: 'Get context for prompt', status: 'FAIL', error: msg });
  }

  // Test 5: Get all memories
  console.log('\n--- Test 5: Get all memories ---');
  try {
    const allMemories = await memoryService.getAllMemories(
      TEST_TENANT_ID,
      TEST_USER_ID,
    );
    console.log(`✅ Total memories: ${allMemories.length}`);
    results.push({ test: 'Get all memories', status: 'PASS' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to get all memories: ${msg}`);
    results.push({ test: 'Get all memories', status: 'FAIL', error: msg });
  }

  // Test 6: Get stats
  console.log('\n--- Test 6: Get memory stats ---');
  try {
    const stats = await memoryService.getStats(TEST_TENANT_ID, TEST_USER_ID);
    console.log(`✅ Stats: ${stats.totalMemories} memories, avg importance: ${stats.avgImportance.toFixed(2)}`);
    console.log(`   Categories: ${JSON.stringify(stats.byCategory)}`);
    results.push({ test: 'Get stats', status: 'PASS' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to get stats: ${msg}`);
    results.push({ test: 'Get stats', status: 'FAIL', error: msg });
  }

  // Test 7: Delete all memories (GDPR)
  console.log('\n--- Test 7: Delete all memories (GDPR cleanup) ---');
  try {
    const deletedCount = await memoryService.deleteUserMemories(
      TEST_TENANT_ID,
      TEST_USER_ID,
    );
    console.log(`✅ Deleted ${deletedCount} memories`);
    results.push({ test: 'Delete all memories (GDPR)', status: 'PASS' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to delete memories: ${msg}`);
    results.push({ test: 'Delete all memories (GDPR)', status: 'FAIL', error: msg });
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary\n');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} ${r.test}`);
    if (r.error) {
      console.log(`   Error: ${r.error}`);
    }
  }

  console.log(`\n📈 Results: ${passed}/${results.length} PASS, ${failed}/${results.length} FAIL`);

  await app.close();

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
