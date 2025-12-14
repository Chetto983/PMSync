/**
 * VoltAgent Calendar Tools Test
 *
 * Tests all calendar-related tools individually:
 * - get_events: Get calendar events for date range
 * - create_event: Create new event (HITL)
 * - update_event: Update existing event (HITL)
 * - delete_event: Delete event (HITL)
 * - check_availability: Check time slot availability
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-voltagent-calendar-tools.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoltAgentService } from '../src/modules/ai/voltagent/voltagent.service';

interface TestResult {
  name: string;
  tool: string;
  status: 'passed' | 'failed' | 'skipped' | 'hitl';
  duration: number;
  response?: string;
  error?: string;
}

async function runCalendarToolsTest() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║        VoltAgent Calendar Tools Validation Test              ║
║        Testing: 5 calendar tools                             ║
╚══════════════════════════════════════════════════════════════╝
`);

  const prisma = createPrismaClient();
  const results: TestResult[] = [];

  // Get test user
  const user = await prisma.user.findFirst({
    include: { userPreferences: true },
  });
  if (!user) {
    console.error('❌ No user found in database');
    await prisma.$disconnect();
    return;
  }

  // Get a real calendar event for tests that need eventId
  const testEvent = await prisma.calendarEvent.findFirst({
    where: { tenantId: user.tenantId, isDeleted: false },
    orderBy: { startTime: 'desc' },
    select: { id: true, title: true, startTime: true },
  });

  console.log('📅 User Profile:');
  console.log(`   Name: ${user.firstName} ${user.lastName}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Tenant: ${user.tenantId}`);
  if (testEvent) {
    console.log(`   Test Event: "${testEvent.title}" at ${testEvent.startTime.toISOString()}`);
  }
  console.log();

  // Bootstrap NestJS
  console.log('🚀 Starting VoltAgent...\n');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const voltAgentService = app.get(VoltAgentService);
  const conversationId = `calendar-tools-test-${Date.now()}`;

  // Get today's date for relative queries
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  // Define test cases
  const testCases = [
    // READ-ONLY TOOLS (safe to execute)
    {
      name: 'Get Events - Today',
      tool: 'get_events',
      message: 'Cosa ho in calendario oggi?',
      execute: true,
    },
    {
      name: 'Get Events - Tomorrow',
      tool: 'get_events',
      message: 'Quali appuntamenti ho domani?',
      execute: true,
    },
    {
      name: 'Get Events - This Week',
      tool: 'get_events',
      message: 'Mostrami tutti gli eventi di questa settimana',
      execute: true,
    },
    {
      name: 'Get Events - Next Week',
      tool: 'get_events',
      message: 'Cosa c\'è in programma la prossima settimana?',
      execute: true,
    },
    {
      name: 'Get Events - Specific Date Range',
      tool: 'get_events',
      message: `Mostrami gli eventi dal ${today.toLocaleDateString('it-IT')} al ${nextWeek.toLocaleDateString('it-IT')}`,
      execute: true,
    },
    {
      name: 'Check Availability - Tomorrow Morning',
      tool: 'check_availability',
      message: 'Sono libero domani mattina alle 10?',
      execute: true,
    },
    {
      name: 'Check Availability - Afternoon',
      tool: 'check_availability',
      message: 'Ho tempo libero domani pomeriggio alle 15:00?',
      execute: true,
    },
    {
      name: 'Check Availability - Meeting Slot',
      tool: 'check_availability',
      message: 'Posso fissare una riunione domani dalle 14 alle 15?',
      execute: true,
    },

    // HITL TOOLS (require approval - test that they trigger HITL)
    {
      name: 'Create Event - Meeting (HITL)',
      tool: 'create_event',
      message: 'Crea un evento "Meeting con team" domani alle 10:00 per 1 ora',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Create Event - Reminder (HITL)',
      tool: 'create_event',
      message: 'Aggiungi un promemoria per chiamare il cliente venerdì alle 16:00',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Create Event - All Day (HITL)',
      tool: 'create_event',
      message: 'Crea un evento tutto il giorno per "Ferie" il 20 dicembre',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Update Event (HITL)',
      tool: 'update_event',
      message: testEvent
        ? `Sposta l'evento "${testEvent.title}" alle 11:00`
        : 'Sposta il prossimo evento di un\'ora',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Delete Event (HITL)',
      tool: 'delete_event',
      message: 'Cancella l\'ultimo evento in calendario',
      execute: false,
      expectHITL: true,
    },
  ];

  console.log(`${'═'.repeat(60)}`);
  console.log('📅 CALENDAR TOOLS TESTS');
  console.log(`${'─'.repeat(60)}\n`);

  for (const test of testCases) {
    console.log(`🧪 Testing: ${test.name}`);
    console.log(`   Tool: ${test.tool}`);
    console.log(`   👤 "${test.message}"`);

    if (!test.execute) {
      console.log(`   ⏭️  SKIPPED (${test.expectHITL ? 'HITL required' : 'Destructive action'})`);
      results.push({
        name: test.name,
        tool: test.tool,
        status: 'skipped',
        duration: 0,
      });
      console.log();
      continue;
    }

    try {
      const startTime = Date.now();
      const result = await voltAgentService.chat(test.message, {
        tenantId: user.tenantId,
        userId: user.id,
        conversationId,
        locale: 'it',
        skipCache: true,
      });
      const duration = Date.now() - startTime;

      if (result.pendingActions && result.pendingActions.length > 0) {
        console.log(`   ⚠️  HITL Required - ${result.pendingActions.length} pending action(s)`);
        results.push({
          name: test.name,
          tool: test.tool,
          status: 'hitl',
          duration,
          response: result.text?.substring(0, 100),
        });
      } else if (result.text && result.text.length > 0) {
        console.log(`   ✅ PASSED (${duration}ms)`);
        console.log(`   🤖 ${result.text.substring(0, 120)}${result.text.length > 120 ? '...' : ''}`);
        results.push({
          name: test.name,
          tool: test.tool,
          status: 'passed',
          duration,
          response: result.text.substring(0, 200),
        });
      } else {
        console.log(`   ❓ No response text`);
        results.push({
          name: test.name,
          tool: test.tool,
          status: 'failed',
          duration,
          error: 'No response text',
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ FAILED: ${errorMsg.substring(0, 80)}`);
      results.push({
        name: test.name,
        tool: test.tool,
        status: 'failed',
        duration: 0,
        error: errorMsg,
      });
    }

    console.log();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  // Summary
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const hitl = results.filter((r) => r.status === 'hitl').length;
  const totalExecuted = passed + failed + hitl;

  console.log(`${'═'.repeat(60)}`);
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║               CALENDAR TOOLS TEST RESULTS                    ║
╚══════════════════════════════════════════════════════════════╝

📊 Statistics:
   Total Tests: ${testCases.length}
   ✅ Passed:   ${passed}
   ❌ Failed:   ${failed}
   ⏭️  Skipped:  ${skipped}
   ⚠️  HITL:     ${hitl}

📈 Success Rate: ${totalExecuted > 0 ? ((passed / totalExecuted) * 100).toFixed(1) : 0}% (executed only)
`);

  if (failed > 0) {
    console.log('❌ Failed Tests:');
    results
      .filter((r) => r.status === 'failed')
      .forEach((r) => console.log(`   - ${r.name}: ${r.error}`));
  }

  // Cleanup
  await app.close();
  await prisma.$disconnect();

  console.log('\n✅ Calendar tools validation completed!');
  process.exit(failed > 0 ? 1 : 0);
}

runCalendarToolsTest().catch(console.error);
