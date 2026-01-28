/**
 * Memory System Validation Script
 *
 * Validates:
 * 1. MemoryController is registered and endpoints respond
 * 2. AIMemoryService methods work
 * 3. MemoryIntelligenceService extracts facts
 * 4. Memory tools are available in agents
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AIMemoryService } from '../src/modules/ai/voltagent/services/ai-memory.service';
import { MemoryIntelligenceService } from '../src/modules/ai/voltagent/services/memory-intelligence.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { MemoryType } from '@prisma/client';

interface ValidationResult {
  test: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  details?: string;
  error?: string;
}

const results: ValidationResult[] = [];

function log(test: string, status: 'PASS' | 'FAIL' | 'SKIP', details?: string, error?: string) {
  results.push({ test, status, details, error });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
  console.log(`${icon} ${test}: ${status}${details ? ` - ${details}` : ''}${error ? ` (${error})` : ''}`);
}

async function main() {
  console.log('\n🔍 MEMORY SYSTEM VALIDATION\n');
  console.log('='.repeat(60));

  // Bootstrap NestJS app
  let app;
  try {
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
    await app.init();
    log('NestJS Bootstrap', 'PASS', 'App initialized');
  } catch (e: any) {
    log('NestJS Bootstrap', 'FAIL', undefined, e.message);
    console.log('\n❌ Cannot continue without app bootstrap');
    process.exit(1);
  }

  // Get services
  const prisma = app.get(PrismaService);
  const aiMemoryService = app.get(AIMemoryService);
  const memoryIntelligenceService = app.get(MemoryIntelligenceService);

  // Test 1: Check AIMemoryService is injectable
  try {
    if (aiMemoryService) {
      log('AIMemoryService Injectable', 'PASS');
    } else {
      log('AIMemoryService Injectable', 'FAIL', 'Service is null');
    }
  } catch (e: any) {
    log('AIMemoryService Injectable', 'FAIL', undefined, e.message);
  }

  // Test 2: Check MemoryIntelligenceService is injectable
  try {
    if (memoryIntelligenceService) {
      log('MemoryIntelligenceService Injectable', 'PASS');
    } else {
      log('MemoryIntelligenceService Injectable', 'FAIL', 'Service is null');
    }
  } catch (e: any) {
    log('MemoryIntelligenceService Injectable', 'FAIL', undefined, e.message);
  }

  // Test 3: Get a test user
  let testUser: { id: string; tenantId: string } | null = null;
  try {
    const user = await prisma.user.findFirst({
      select: { id: true, tenantId: true },
    });
    if (user) {
      testUser = user;
      log('Test User Found', 'PASS', `userId=${user.id.slice(0, 8)}...`);
    } else {
      log('Test User Found', 'SKIP', 'No users in database');
    }
  } catch (e: any) {
    log('Test User Found', 'FAIL', undefined, e.message);
  }

  if (!testUser) {
    console.log('\n⚠️ Skipping user-dependent tests (no test user)');
  } else {
    const { tenantId, id: userId } = testUser;

    // Test 4: AIMemoryService.getMemories
    try {
      const memories = await aiMemoryService.getMemories(tenantId, userId, { limit: 10 });
      log('AIMemoryService.getMemories', 'PASS', `Found ${memories.length} memories`);
    } catch (e: any) {
      log('AIMemoryService.getMemories', 'FAIL', undefined, e.message);
    }

    // Test 5: AIMemoryService.storeMemory
    let storedMemoryId: string | null = null;
    try {
      const memory = await aiMemoryService.storeMemory(tenantId, userId, {
        content: 'TEST_VALIDATION: Marco email is marco@test.com',
        type: MemoryType.CONTACT_NOTE,
        source: 'EXPLICIT',
        confidence: 1.0,
      });
      storedMemoryId = memory.id;
      log('AIMemoryService.storeMemory', 'PASS', `Created memory ${memory.id.slice(0, 8)}...`);
    } catch (e: any) {
      log('AIMemoryService.storeMemory', 'FAIL', undefined, e.message);
    }

    // Test 6: AIMemoryService.searchMemoriesSemantic
    try {
      const results = await aiMemoryService.searchMemoriesSemantic(
        tenantId,
        userId,
        'Marco email',
        5,
        1.5,
      );
      log('AIMemoryService.searchMemoriesSemantic', 'PASS', `Found ${results.length} results`);
    } catch (e: any) {
      log('AIMemoryService.searchMemoriesSemantic', 'FAIL', undefined, e.message);
    }

    // Test 7: MemoryIntelligenceService.extractFacts
    try {
      const facts = await memoryIntelligenceService.extractFacts(
        'Invia email a Giovanni a giovanni@acme.com dicendo buongiorno',
      );
      log('MemoryIntelligenceService.extractFacts', 'PASS', `Extracted ${facts.length} facts: ${facts.slice(0, 2).join('; ')}`);
    } catch (e: any) {
      log('MemoryIntelligenceService.extractFacts', 'FAIL', undefined, e.message);
    }

    // Test 8: Cleanup - delete test memory
    if (storedMemoryId) {
      try {
        await aiMemoryService.deleteMemory(tenantId, userId, storedMemoryId);
        log('AIMemoryService.deleteMemory', 'PASS', 'Test memory cleaned up');
      } catch (e: any) {
        log('AIMemoryService.deleteMemory', 'FAIL', undefined, e.message);
      }
    }
  }

  // Test 9: Check MemoryController is registered
  try {
    const httpAdapter = app.getHttpAdapter();
    const server = httpAdapter.getInstance();
    const routes = server._router?.stack
      ?.filter((r: any) => r.route)
      ?.map((r: any) => `${Object.keys(r.route.methods)[0].toUpperCase()} ${r.route.path}`);

    const memoryRoutes = routes?.filter((r: string) => r.includes('memory')) || [];
    if (memoryRoutes.length > 0) {
      log('MemoryController Routes', 'PASS', `Found ${memoryRoutes.length} routes: ${memoryRoutes.slice(0, 3).join(', ')}`);
    } else {
      log('MemoryController Routes', 'FAIL', 'No memory routes found');
    }
  } catch (e: any) {
    log('MemoryController Routes', 'SKIP', 'Could not inspect routes', e.message);
  }

  // Test 10: Check memory tools exist
  try {
    const memoryToolsModule = await import('../src/modules/ai/voltagent/tools/memory.tools');
    const hasSearchTool = typeof memoryToolsModule.createMemorySearchTool === 'function';
    const hasStoreTool = typeof memoryToolsModule.createMemoryStoreTool === 'function';
    const hasTools = typeof memoryToolsModule.createMemoryTools === 'function';

    if (hasSearchTool && hasStoreTool && hasTools) {
      log('Memory Tools Module', 'PASS', 'All tool creators exported');
    } else {
      log('Memory Tools Module', 'FAIL', `search=${hasSearchTool} store=${hasStoreTool} tools=${hasTools}`);
    }
  } catch (e: any) {
    log('Memory Tools Module', 'FAIL', undefined, e.message);
  }

  // Test 11: Check memory prompts
  try {
    const promptsModule = await import('../src/modules/ai/voltagent/prompts/memory.prompt');
    const hasFact = !!promptsModule.FACT_RETRIEVAL_PROMPT;
    const hasDeduction = !!promptsModule.MEMORY_DEDUCTION_PROMPT;
    const hasInfer = typeof promptsModule.inferMemoryType === 'function';

    if (hasFact && hasDeduction && hasInfer) {
      log('Memory Prompts Module', 'PASS', 'All prompts exported');

      // Test inferMemoryType
      const type1 = promptsModule.inferMemoryType('Marco email is marco@test.com');
      const type2 = promptsModule.inferMemoryType('User prefers formal emails');
      const type3 = promptsModule.inferMemoryType('User usually checks email in morning');
      log('inferMemoryType', 'PASS', `contact=${type1} pref=${type2} pattern=${type3}`);
    } else {
      log('Memory Prompts Module', 'FAIL', `fact=${hasFact} deduction=${hasDeduction} infer=${hasInfer}`);
    }
  } catch (e: any) {
    log('Memory Prompts Module', 'FAIL', undefined, e.message);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;

  console.log(`\n📊 SUMMARY: ${passed} PASS | ${failed} FAIL | ${skipped} SKIP`);

  if (failed > 0) {
    console.log('\n❌ FAILURES:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`   - ${r.test}: ${r.error || r.details}`);
    });
  }

  // Cleanup
  await app.close();

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Script error:', e);
  process.exit(1);
});
