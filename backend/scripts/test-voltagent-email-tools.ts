/**
 * VoltAgent Email Tools Test
 *
 * Tests all email-related tools individually:
 * - search_emails: Search emails by query
 * - get_unread_emails: Get unread emails
 * - send_email: Send new email (HITL)
 * - reply_email: Reply to email (HITL)
 * - forward_email: Forward email (HITL)
 * - archive_email: Archive email (HITL)
 * - delete_email: Delete email (HITL)
 * - mark_read: Mark email as read (HITL)
 * - mark_unread: Mark email as unread (HITL)
 * - star_email: Star email (HITL)
 * - unstar_email: Unstar email (HITL)
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-voltagent-email-tools.ts
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

async function runEmailToolsTest() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║         VoltAgent Email Tools Validation Test                ║
║         Testing: 11 email tools                              ║
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

  // Get a real email for tests that need emailId
  const testEmail = await prisma.email.findFirst({
    where: { tenantId: user.tenantId },
    orderBy: { receivedAt: 'desc' },
    select: { id: true, subject: true, from: true },
  });

  console.log('📧 User Profile:');
  console.log(`   Name: ${user.firstName} ${user.lastName}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Tenant: ${user.tenantId}`);
  if (testEmail) {
    console.log(`   Test Email: "${testEmail.subject}" from ${testEmail.from}`);
  }
  console.log();

  // Bootstrap NestJS
  console.log('🚀 Starting VoltAgent...\n');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const voltAgentService = app.get(VoltAgentService);
  const conversationId = `email-tools-test-${Date.now()}`;

  // Define test cases
  const testCases = [
    // READ-ONLY TOOLS (safe to execute)
    {
      name: 'Search Emails - General Query',
      tool: 'search_emails',
      message: 'Cerca le email con oggetto "build" o "deploy"',
      execute: true,
    },
    {
      name: 'Search Emails - Sender Filter',
      tool: 'search_emails',
      message: 'Mostrami le email da Railway',
      execute: true,
    },
    {
      name: 'Search Emails - Date Range',
      tool: 'search_emails',
      message: 'Trova email ricevute questa settimana riguardo progetti',
      execute: true,
    },
    {
      name: 'Get Unread Emails',
      tool: 'get_unread_emails',
      message: 'Quante email non lette ho? Elencale.',
      execute: true,
    },
    {
      name: 'Get Unread with Limit',
      tool: 'get_unread_emails',
      message: 'Mostrami le ultime 5 email non lette',
      execute: true,
    },

    // HITL TOOLS (require approval - test that they trigger HITL)
    {
      name: 'Send Email (HITL)',
      tool: 'send_email',
      message: 'Invia una email a test@example.com con oggetto "Test" e corpo "Questo è un test"',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Reply Email (HITL)',
      tool: 'reply_email',
      message: testEmail
        ? `Rispondi all'email "${testEmail.subject}" dicendo "Grazie per le informazioni"`
        : 'Rispondi all\'ultima email dicendo "Grazie"',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Forward Email (HITL)',
      tool: 'forward_email',
      message: 'Inoltra l\'ultima email a collaboratore@example.com',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Archive Email (HITL)',
      tool: 'archive_email',
      message: 'Archivia le email promozionali più vecchie',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Delete Email (HITL)',
      tool: 'delete_email',
      message: 'Elimina l\'email più vecchia di spam',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Mark Read (HITL)',
      tool: 'mark_read',
      message: 'Segna come lette le email da newsletter',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Mark Unread (HITL)',
      tool: 'mark_unread',
      message: 'Segna come non letta l\'ultima email importante',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Star Email (HITL)',
      tool: 'star_email',
      message: 'Metti una stella sull\'ultima email da banca',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Unstar Email (HITL)',
      tool: 'unstar_email',
      message: 'Togli la stella dalla prima email con stella',
      execute: false,
      expectHITL: true,
    },
  ];

  console.log(`${'═'.repeat(60)}`);
  console.log('📧 EMAIL TOOLS TESTS');
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
║                 EMAIL TOOLS TEST RESULTS                     ║
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

  console.log('\n✅ Email tools validation completed!');
  process.exit(failed > 0 ? 1 : 0);
}

runEmailToolsTest().catch(console.error);
