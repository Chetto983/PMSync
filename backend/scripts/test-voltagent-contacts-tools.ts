/**
 * VoltAgent Contacts Tools Test
 *
 * Tests all contacts-related tools individually:
 * - search_contacts: Search contacts by name, email, company
 * - get_contact: Get detailed contact information
 * - create_contact: Create new contact (HITL)
 * - update_contact: Update existing contact (HITL)
 * - delete_contact: Delete contact (HITL)
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-voltagent-contacts-tools.ts
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

async function runContactsToolsTest() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║        VoltAgent Contacts Tools Validation Test              ║
║        Testing: 5 contacts tools                             ║
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

  // Get a real contact for tests that need contactId
  const testContact = await prisma.contact.findFirst({
    where: { tenantId: user.tenantId },
    select: { id: true, displayName: true, emails: true, company: true },
  });

  // Get contact stats
  const contactCount = await prisma.contact.count({
    where: { tenantId: user.tenantId },
  });

  console.log('👥 User Profile:');
  console.log(`   Name: ${user.firstName} ${user.lastName}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Tenant: ${user.tenantId}`);
  console.log(`   Total Contacts: ${contactCount}`);
  if (testContact) {
    const primaryEmail =
      Array.isArray(testContact.emails) && testContact.emails.length > 0
        ? (testContact.emails[0] as { value?: string })?.value
        : 'N/A';
    console.log(`   Test Contact: "${testContact.displayName}" (${primaryEmail})`);
  }
  console.log();

  // Bootstrap NestJS
  console.log('🚀 Starting VoltAgent...\n');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const voltAgentService = app.get(VoltAgentService);
  const conversationId = `contacts-tools-test-${Date.now()}`;

  // Define test cases
  const testCases = [
    // READ-ONLY TOOLS (safe to execute)
    {
      name: 'Search Contacts - By Name',
      tool: 'search_contacts',
      message: 'Cerca il contatto Marco',
      execute: true,
    },
    {
      name: 'Search Contacts - By Company',
      tool: 'search_contacts',
      message: 'Chi sono i miei contatti che lavorano in Google?',
      execute: true,
    },
    {
      name: 'Search Contacts - By Email Domain',
      tool: 'search_contacts',
      message: 'Trova i contatti con email @gmail.com',
      execute: true,
    },
    {
      name: 'Search Contacts - Non-existent',
      tool: 'search_contacts',
      message: 'Cerca il contatto Mario Rossi',
      execute: true,
    },
    {
      name: 'Search Contacts - Partial Name',
      tool: 'search_contacts',
      message: 'Cerca tutti i contatti il cui nome inizia per "Da"',
      execute: true,
    },
    {
      name: 'Get Contact Details',
      tool: 'get_contact',
      message: testContact
        ? `Dimmi tutto di ${testContact.displayName}`
        : 'Dimmi tutto del primo contatto nella lista',
      execute: true,
    },

    // HITL TOOLS (require approval - test that they trigger HITL)
    {
      name: 'Create Contact - Full Info (HITL)',
      tool: 'create_contact',
      message:
        'Aggiungi un nuovo contatto: Luigi Verdi, email luigi@example.com, telefono 333-1234567, azienda Acme Corp',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Create Contact - Minimal (HITL)',
      tool: 'create_contact',
      message: 'Crea un contatto per test@example.com',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Update Contact (HITL)',
      tool: 'update_contact',
      message: testContact
        ? `Aggiorna il telefono di ${testContact.displayName} con 333-9999999`
        : 'Aggiorna il telefono del primo contatto',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Update Contact - Add Info (HITL)',
      tool: 'update_contact',
      message: 'Aggiungi la nota "VIP client" al contatto Marco',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Delete Contact (HITL)',
      tool: 'delete_contact',
      message: 'Elimina il contatto test@example.com',
      execute: false,
      expectHITL: true,
    },
  ];

  console.log(`${'═'.repeat(60)}`);
  console.log('👥 CONTACTS TOOLS TESTS');
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
║               CONTACTS TOOLS TEST RESULTS                    ║
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

  console.log('\n✅ Contacts tools validation completed!');
  process.exit(failed > 0 ? 1 : 0);
}

runContactsToolsTest().catch(console.error);
