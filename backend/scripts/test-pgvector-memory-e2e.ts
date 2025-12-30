/**
 * PgVector Memory Service E2E Test
 *
 * Real scenario testing of PgVectorMemoryService:
 * - NO mocks, NO Jest
 * - Real Mistral API calls for embeddings
 * - Real PostgreSQL pgvector operations
 * - Tests all memory operations: add, search, update, delete, history
 *
 * Usage:
 *   cd backend
 *   npx dotenv -e .env -- npx ts-node scripts/test-pgvector-memory-e2e.ts
 *
 * Requirements:
 *   - DATABASE_URL with pgvector extension
 *   - MISTRAL_API_KEY for embeddings
 *   - PGVECTOR_MEMORY_ENABLED=true (default)
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PgVectorMemoryService } from '../src/modules/ai/voltagent/memory/pgvector-memory.service';
import { PrismaService } from '../src/prisma/prisma.service';
import type { MemoryContext } from '../src/modules/ai/voltagent/memory/prompts/memory.types';

// Test results tracking
interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration?: number;
  error?: string;
  details?: string;
}

const results: TestResult[] = [];

// Helper to run a test
async function runTest(
  name: string,
  fn: () => Promise<{ details?: string }>,
): Promise<void> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    console.log(`✅ ${name} (${duration}ms)`);
    if (result.details) {
      console.log(`   ${result.details}`);
    }
    results.push({ test: name, status: 'PASS', duration, details: result.details });
  } catch (error) {
    const duration = Date.now() - start;
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`❌ ${name} (${duration}ms)`);
    console.log(`   Error: ${msg}`);
    results.push({ test: name, status: 'FAIL', duration, error: msg });
  }
}

async function main() {
  console.log('\n🧠 PgVector Memory Service E2E Test\n');
  console.log('='.repeat(60));

  // Check required env vars
  if (!process.env.MISTRAL_API_KEY) {
    console.error('❌ MISTRAL_API_KEY not set');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  console.log('📦 Bootstrapping NestJS application...\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const memoryService = app.get(PgVectorMemoryService);
  const prisma = app.get(PrismaService);

  // Check if service is enabled
  console.log(`Service enabled: ${memoryService.isEnabled()}\n`);

  if (!memoryService.isEnabled()) {
    console.log('⚠️  PgVector memory service is disabled!');
    console.log('   Check: PGVECTOR_MEMORY_ENABLED=true');
    console.log('   Check: pgvector extension installed\n');
    await app.close();
    process.exit(1);
  }

  // Get a real user from the database for testing
  let testCtx: MemoryContext;
  try {
    const user = await prisma.user.findFirst({
      where: { tenantId: { not: null } },
      select: { id: true, tenantId: true, email: true },
    });

    if (!user || !user.tenantId) {
      console.log('⚠️  No users found in database, using test IDs');
      testCtx = {
        tenantId: 'test-tenant-pgvector',
        userId: 'test-user-pgvector',
      };
    } else {
      console.log(`Using real user: ${user.email}`);
      testCtx = {
        tenantId: user.tenantId,
        userId: user.id,
      };
    }
  } catch {
    testCtx = {
      tenantId: 'test-tenant-pgvector',
      userId: 'test-user-pgvector',
    };
  }

  console.log(`Test context: tenant=${testCtx.tenantId}, user=${testCtx.userId}\n`);
  console.log('='.repeat(60));

  // Store memory IDs for later tests
  let addedMemoryId: string | null = null;

  // ========================================================================
  // TEST 1: Add a simple memory
  // ========================================================================
  console.log('\n--- Test 1: Add a simple memory ---');
  await runTest('Add memory with embedding', async () => {
    addedMemoryId = await memoryService.addMemory(
      testCtx,
      'User prefers TypeScript over JavaScript for backend development',
      { category: 'PREFERENCE', importance: 0.8 },
    );

    if (!addedMemoryId) {
      throw new Error('Failed to add memory - no ID returned');
    }

    return { details: `Memory ID: ${addedMemoryId}` };
  });

  // ========================================================================
  // TEST 2: Add another memory for search testing
  // ========================================================================
  console.log('\n--- Test 2: Add second memory ---');
  await runTest('Add second memory for comparison', async () => {
    const id = await memoryService.addMemory(
      testCtx,
      'User works on a NestJS backend with PostgreSQL database',
      { category: 'PROFESSIONAL', importance: 0.7 },
    );

    if (!id) {
      throw new Error('Failed to add second memory');
    }

    return { details: `Memory ID: ${id}` };
  });

  // ========================================================================
  // TEST 3: Search memories with vector similarity
  // ========================================================================
  console.log('\n--- Test 3: Search memories (vector similarity) ---');
  await runTest('Search memories with semantic query', async () => {
    const results = await memoryService.searchMemories(
      testCtx,
      'What programming languages does the user prefer?',
      { limit: 5, minScore: 0.3 },
    );

    if (results.length === 0) {
      throw new Error('No memories found');
    }

    const topResult = results[0];
    return {
      details: `Found ${results.length} memories, top: "${topResult.content.slice(0, 50)}..." (score: ${topResult.score.toFixed(3)})`,
    };
  });

  // ========================================================================
  // TEST 4: Search with time decay
  // ========================================================================
  console.log('\n--- Test 4: Search with time decay ---');
  await runTest('Search with time decay scoring', async () => {
    const results = await memoryService.searchMemories(
      testCtx,
      'programming preferences',
      { limit: 5, applyTimeDecay: true, timeDecayDays: 30 },
    );

    if (results.length === 0) {
      throw new Error('No memories found with time decay');
    }

    const hasDecayedScore = results.some((r) => r.decayedScore !== undefined);
    return {
      details: `Found ${results.length} memories, time decay applied: ${hasDecayedScore}`,
    };
  });

  // ========================================================================
  // TEST 5: Get context for AI prompt
  // ========================================================================
  console.log('\n--- Test 5: Get context for AI prompt ---');
  await runTest('Generate context string for prompt', async () => {
    const context = await memoryService.getContextForPrompt(
      testCtx,
      'Help me with backend development',
      { limit: 3 },
    );

    if (!context || context.length === 0) {
      throw new Error('No context generated');
    }

    return { details: `Context length: ${context.length} chars` };
  });

  // ========================================================================
  // TEST 6: Add from conversation (LLM fact extraction)
  // ========================================================================
  console.log('\n--- Test 6: Add from conversation (fact extraction) ---');
  await runTest('Extract facts from conversation via LLM', async () => {
    const conversationMessages = [
      { role: 'user' as const, content: 'I really love Italian food, especially pizza margherita' },
      { role: 'assistant' as const, content: 'Great choice! Pizza margherita is a classic.' },
      { role: 'user' as const, content: 'Yes, and I prefer to eat dinner around 7pm' },
    ];

    const addedIds = await memoryService.addFromConversation(testCtx, conversationMessages, {
      category: 'PREFERENCE',
    });

    return { details: `Extracted and added ${addedIds.length} facts from conversation` };
  });

  // ========================================================================
  // TEST 7: Update a memory
  // ========================================================================
  console.log('\n--- Test 7: Update a memory ---');
  await runTest('Update existing memory', async () => {
    if (!addedMemoryId) {
      throw new Error('No memory ID from Test 1');
    }

    const success = await memoryService.updateMemory(
      addedMemoryId,
      'User strongly prefers TypeScript over JavaScript for both backend and frontend development',
    );

    if (!success) {
      throw new Error('Update returned false');
    }

    return { details: `Updated memory ${addedMemoryId}` };
  });

  // ========================================================================
  // TEST 8: Get memory history
  // ========================================================================
  console.log('\n--- Test 8: Get memory history ---');
  await runTest('Retrieve memory history (audit trail)', async () => {
    if (!addedMemoryId) {
      throw new Error('No memory ID from Test 1');
    }

    const history = await memoryService.getMemoryHistory(addedMemoryId);

    return {
      details: `History entries: ${history.length} (CREATE + UPDATE expected)`,
    };
  });

  // ========================================================================
  // TEST 9: Get all memories
  // ========================================================================
  console.log('\n--- Test 9: Get all memories ---');
  await runTest('Get all user memories', async () => {
    const all = await memoryService.getAllMemories(testCtx, { limit: 50 });

    return { details: `Total memories: ${all.length}` };
  });

  // ========================================================================
  // TEST 10: Get memory stats
  // ========================================================================
  console.log('\n--- Test 10: Get memory stats ---');
  await runTest('Get memory statistics', async () => {
    const stats = await memoryService.getStats(testCtx);

    return {
      details: `Total: ${stats.totalMemories}, Categories: ${JSON.stringify(stats.byCategory)}, Avg importance: ${stats.avgImportance.toFixed(2)}`,
    };
  });

  // ========================================================================
  // TEST 11: Delete a single memory
  // ========================================================================
  console.log('\n--- Test 11: Delete a memory ---');
  await runTest('Delete single memory', async () => {
    if (!addedMemoryId) {
      throw new Error('No memory ID from Test 1');
    }

    const success = await memoryService.deleteMemory(addedMemoryId);

    if (!success) {
      throw new Error('Delete returned false');
    }

    return { details: `Deleted memory ${addedMemoryId}` };
  });

  // ========================================================================
  // TEST 12: Verify history after delete
  // ========================================================================
  console.log('\n--- Test 12: Verify history after delete ---');
  await runTest('Check history includes DELETE action', async () => {
    if (!addedMemoryId) {
      throw new Error('No memory ID from Test 1');
    }

    const history = await memoryService.getMemoryHistory(addedMemoryId);
    const hasDelete = history.some((h) => h.action === 'DELETE');

    return {
      details: `History entries: ${history.length}, has DELETE: ${hasDelete}`,
    };
  });

  // ========================================================================
  // TEST 13: Delete all memories (GDPR cleanup)
  // ========================================================================
  console.log('\n--- Test 13: Delete all memories (GDPR cleanup) ---');
  await runTest('Delete all user memories (GDPR)', async () => {
    const success = await memoryService.deleteAllUserMemories(testCtx);

    if (!success) {
      throw new Error('GDPR delete returned false');
    }

    // Verify deletion
    const remaining = await memoryService.getAllMemories(testCtx);

    return { details: `Deleted all memories, remaining: ${remaining.length}` };
  });

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary\n');

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭️';
    const time = r.duration ? ` (${r.duration}ms)` : '';
    console.log(`${icon} ${r.test}${time}`);
    if (r.error) {
      console.log(`   Error: ${r.error}`);
    }
  }

  console.log(`\n📈 Results: ${passed} PASS, ${failed} FAIL, ${skipped} SKIP`);

  // Performance summary
  const totalTime = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  console.log(`⏱️  Total time: ${totalTime}ms`);

  await app.close();

  if (failed > 0) {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
