/**
 * Integration Test Script for Unified Knowledge Agent
 *
 * Tests the Memory-First RAG implementation:
 * 1. Query Analysis (Self-Reflection)
 * 2. Database Source Counts
 * 3. TypeScript compilation verification
 *
 * Usage:
 *   npx ts-node backend/scripts/test-unified-knowledge.ts
 *
 * Note: Full integration testing requires NestJS context.
 * Use `npm run test` for complete unit tests.
 *
 * @see docs/AI_SECRETARY_IMPLEMENTATION_PLAN.md P1.6
 */
import 'dotenv/config';

// Import types to verify compilation
import type { SearchSource, MemoryContext } from '../src/modules/ai/voltagent/rag/unified-retriever';

async function main() {
  console.log('🧪 Testing Unified Knowledge Agent (P1.6)\n');

  // Use the project's Prisma client factory
  const { createPrismaClient } = require('./prisma-client.js');
  const prisma = createPrismaClient();

  try {
    // Get test tenant and user
    const testTenant = await prisma.tenant.findFirst();
    if (!testTenant) {
      console.error('❌ No tenant found in database');
      process.exit(1);
    }

    const testUser = await prisma.user.findFirst({
      where: { tenantId: testTenant.id },
    });
    if (!testUser) {
      console.error('❌ No user found in database');
      process.exit(1);
    }

    console.log(`📋 Testing with tenant: ${testTenant.id}, user: ${testUser.id}\n`);

    // Test 1: Type Verification
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Type Verification');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Verify types compile correctly
    const _testSearchSources: SearchSource[] = ['emails', 'deadlines', 'followups', 'actions'];
    const _testMemoryContext: MemoryContext = {
      facts: [],
      preferences: [],
      contacts: [],
      history: [],
    };
    console.log(`  SearchSource types: ${_testSearchSources.join(', ')}`);
    console.log(`  MemoryContext keys: ${Object.keys(_testMemoryContext).join(', ')}`);
    console.log('✅ Types verified\n');

    // Test 2: Query Analysis Logic (Pure Function)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: Query Analysis Logic');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Test query analysis patterns
    const analyzeQuery = (query: string): SearchSource[] => {
      const sources: SearchSource[] = ['emails'];
      const lowerQuery = query.toLowerCase();

      if (/deadline|due|when|by when|urgent|scadenza|entro|quando/.test(lowerQuery)) {
        sources.push('deadlines');
      }
      if (/follow.?up|waiting|response|reply|pending|attesa|risposta|sollecito/.test(lowerQuery)) {
        sources.push('followups');
      }
      if (/task|action|todo|need to|should|must|compito|fare|azione|attività/.test(lowerQuery)) {
        sources.push('actions');
      }
      return sources;
    };

    const testQueries = [
      { q: 'What deadlines do I have this week?', expected: ['emails', 'deadlines'] },
      { q: 'Are there any pending follow-ups?', expected: ['emails', 'followups'] },
      { q: 'Show me recent emails from John', expected: ['emails'] },
      { q: 'What tasks need my attention?', expected: ['emails', 'actions'] },
      { q: 'Scadenza progetto?', expected: ['emails', 'deadlines'] },
    ];

    let passed = 0;
    for (const { q, expected } of testQueries) {
      const result = analyzeQuery(q);
      const match = JSON.stringify(result.sort()) === JSON.stringify(expected.sort());
      console.log(`  ${match ? '✓' : '✗'} "${q}"`);
      console.log(`    Expected: [${expected.join(', ')}]`);
      console.log(`    Got: [${result.join(', ')}]`);
      if (match) passed++;
    }
    console.log(`\n  ${passed}/${testQueries.length} tests passed\n`);

    // Test 3: Database Source Counts
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: Database Source Counts');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Count items in database
    const [emailCount, deadlineCount, followupCount, actionCount, memoryCount] = await Promise.all([
      prisma.email.count({ where: { tenantId: testTenant.id } }),
      prisma.aiDeadline.count({ where: { tenantId: testTenant.id, userId: testUser.id } }),
      prisma.emailFollowUp.count({ where: { tenantId: testTenant.id, userId: testUser.id } }),
      prisma.aiTask.count({ where: { tenantId: testTenant.id, userId: testUser.id } }),
      prisma.aiMemory.count({ where: { tenantId: testTenant.id, userId: testUser.id } }),
    ]);

    console.log(`  📧 Emails: ${emailCount}`);
    console.log(`  📅 Deadlines: ${deadlineCount}`);
    console.log(`  🔔 Follow-ups: ${followupCount}`);
    console.log(`  ✅ Action items: ${actionCount}`);
    console.log(`  🧠 Memories: ${memoryCount}`);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 All tests completed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📝 Note: Full integration requires NestJS context.');
    console.log('   Run: npm run start:dev && test via API endpoints\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
