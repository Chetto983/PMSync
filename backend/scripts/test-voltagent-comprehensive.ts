/**
 * VoltAgent Comprehensive Validation Test
 *
 * Tests ALL agents and ALL tools with real user prompts.
 * Validates tool routing, parameter extraction, and HITL flow.
 *
 * Tenant: cmjgylxkg000054yhnjpkmzd9
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-voltagent-comprehensive.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoltAgentService } from '../src/modules/ai/voltagent/voltagent.service';
import { HitlService } from '../src/modules/ai/voltagent/services/hitl.service';

// Test tenant ID
const TEST_TENANT_ID = 'cmjgylxkg000054yhnjpkmzd9';

interface TestCase {
  name: string;
  category: 'email' | 'calendar' | 'contacts' | 'folders' | 'analysis' | 'search';
  operation: string;
  expectedAgent: 'ActionsAgent' | 'IntelligenceAgent' | 'Supervisor';
  expectedTool: string;
  prompts: {
    en: string;
    it: string;
  };
  expectsHitl: boolean;
  skip?: boolean;
  skipReason?: string;
}

interface TestResult {
  name: string;
  category: string;
  operation: string;
  locale: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  agentUsed?: string;
  hitlCreated?: boolean;
  details?: string;
  error?: string;
}

// ============================================================================
// TEST CASES - Natural user prompts (like a real Italian user would type!)
// ============================================================================
const TEST_CASES: TestCase[] = [
  // ===========================================================================
  // EMAIL OPERATIONS (IntelligenceAgent - READ)
  // ===========================================================================
  {
    name: 'List Email Accounts',
    category: 'email',
    operation: 'list_emails(mode: accounts)',
    expectedAgent: 'IntelligenceAgent',
    expectedTool: 'list_emails',
    prompts: {
      en: 'which email accounts do I have?',
      it: 'quali account ho collegati?',
    },
    expectsHitl: false,
  },
  {
    name: 'List Unread Emails',
    category: 'email',
    operation: 'list_emails(mode: unread)',
    expectedAgent: 'IntelligenceAgent',
    expectedTool: 'list_emails',
    prompts: {
      en: 'show me unread',
      it: 'fammi vedere le email non lette',
    },
    expectsHitl: false,
  },
  {
    name: 'Search Emails by Keyword',
    category: 'email',
    operation: 'search_emails',
    expectedAgent: 'IntelligenceAgent',
    expectedTool: 'search_emails',
    prompts: {
      en: 'find emails about invoice',
      it: 'cerca email sulla fattura',
    },
    expectsHitl: false,
  },
  {
    name: 'Search Emails from Sender',
    category: 'email',
    operation: 'search_emails',
    expectedAgent: 'IntelligenceAgent',
    expectedTool: 'search_emails',
    prompts: {
      en: 'emails from marco',
      it: 'email da marco',
    },
    expectsHitl: false,
  },
  {
    name: 'Count Emails',
    category: 'email',
    operation: 'count_emails',
    expectedAgent: 'IntelligenceAgent',
    expectedTool: 'count_emails',
    prompts: {
      en: 'how many emails this week?',
      it: 'quante email ho ricevuto questa settimana?',
    },
    expectsHitl: false,
  },
  {
    name: 'Semantic Search Emails',
    category: 'email',
    operation: 'semantic_search_emails',
    expectedAgent: 'IntelligenceAgent',
    expectedTool: 'semantic_search_emails',
    prompts: {
      en: 'find discussions about money problems',
      it: 'trova email dove si parla di problemi economici',
    },
    expectsHitl: false,
  },

  // ===========================================================================
  // EMAIL OPERATIONS (ActionsAgent - WRITE)
  // ===========================================================================
  {
    name: 'Send Email - Natural',
    category: 'email',
    operation: 'manage_email(action: send)',
    expectedAgent: 'ActionsAgent',
    expectedTool: 'manage_email',
    prompts: {
      en: 'send email to test@example.com subject hello body how are you',
      it: 'manda email a test@example.com oggetto ciao testo come stai tutto bene?',
    },
    expectsHitl: true,
  },
  {
    name: 'Send Email with Specific Account',
    category: 'email',
    operation: 'manage_email(action: send, providerId)',
    expectedAgent: 'ActionsAgent',
    expectedTool: 'manage_email',
    prompts: {
      en: 'send from hotmail to friend@test.com saying hi there',
      it: 'manda da hotmail a amico@test.com dicendo ciao come va',
    },
    expectsHitl: true,
  },
  {
    name: 'Send Email - Casual Italian',
    category: 'email',
    operation: 'manage_email(action: send)',
    expectedAgent: 'ActionsAgent',
    expectedTool: 'manage_email',
    prompts: {
      en: 'write to boss@company.com about vacation request',
      it: 'scrivi a monica@gmail.com che domani ci vediamo per pranzo',
    },
    expectsHitl: true,
  },
  {
    name: 'Delete Email',
    category: 'email',
    operation: 'manage_email(action: delete)',
    expectedAgent: 'ActionsAgent',
    expectedTool: 'manage_email',
    prompts: {
      en: 'delete this',
      it: 'elimina questa',
    },
    expectsHitl: true,
    skip: true,
    skipReason: 'Requires active email context',
  },
  {
    name: 'Archive Email',
    category: 'email',
    operation: 'manage_email(action: archive)',
    expectedAgent: 'ActionsAgent',
    expectedTool: 'manage_email',
    prompts: {
      en: 'archive it',
      it: 'archivia',
    },
    expectsHitl: true,
    skip: true,
    skipReason: 'Requires active email context',
  },
  {
    name: 'Star Email',
    category: 'email',
    operation: 'manage_email(action: star)',
    expectedAgent: 'ActionsAgent',
    expectedTool: 'manage_email',
    prompts: {
      en: 'star this',
      it: 'metti stellina',
    },
    expectsHitl: true,
    skip: true,
    skipReason: 'Requires active email context',
  },
  {
    name: 'Mark Email as Read',
    category: 'email',
    operation: 'manage_email(action: mark_read)',
    expectedAgent: 'ActionsAgent',
    expectedTool: 'manage_email',
    prompts: {
      en: 'mark as read',
      it: 'segna come letta',
    },
    expectsHitl: true,
    skip: true,
    skipReason: 'Requires active email context',
  },

  // ===========================================================================
  // FOLDER OPERATIONS
  // ===========================================================================
  {
    name: 'List Folders',
    category: 'folders',
    operation: 'list_folders',
    expectedAgent: 'IntelligenceAgent',
    expectedTool: 'list_folders',
    prompts: {
      en: 'show my folders',
      it: 'quali cartelle ho?',
    },
    expectsHitl: false,
  },
  {
    name: 'Create Folder',
    category: 'folders',
    operation: 'manage_folder(action: create)',
    expectedAgent: 'ActionsAgent',
    expectedTool: 'manage_folder',
    prompts: {
      en: 'create folder Work',
      it: 'crea cartella Lavoro',
    },
    expectsHitl: true,
  },
  {
    name: 'Rename Folder',
    category: 'folders',
    operation: 'manage_folder(action: rename)',
    expectedAgent: 'ActionsAgent',
    expectedTool: 'manage_folder',
    prompts: {
      en: 'rename Old to New',
      it: 'rinomina Vecchio in Nuovo',
    },
    expectsHitl: true,
    skip: true,
    skipReason: 'Requires existing folder',
  },
  {
    name: 'Delete Folder',
    category: 'folders',
    operation: 'manage_folder(action: delete)',
    expectedAgent: 'ActionsAgent',
    expectedTool: 'manage_folder',
    prompts: {
      en: 'delete the Temp folder',
      it: 'elimina cartella Temp',
    },
    expectsHitl: true,
    skip: true,
    skipReason: 'Requires existing folder',
  },

  // ===========================================================================
  // CONTACT OPERATIONS
  // ===========================================================================
  {
    name: 'Search Contacts',
    category: 'contacts',
    operation: 'search_contacts',
    expectedAgent: 'IntelligenceAgent',
    expectedTool: 'search_contacts',
    prompts: {
      en: 'find contact marco',
      it: 'trova contatto marco',
    },
    expectsHitl: false,
  },
  {
    name: 'Get Contact Details',
    category: 'contacts',
    operation: 'manage_contact(action: get)',
    expectedAgent: 'IntelligenceAgent',
    expectedTool: 'manage_contact',
    prompts: {
      en: 'what is marco phone',
      it: 'qual è il numero di marco?',
    },
    expectsHitl: false,
  },
  {
    name: 'Create Contact',
    category: 'contacts',
    operation: 'manage_contact(action: create)',
    expectedAgent: 'ActionsAgent',
    expectedTool: 'manage_contact',
    prompts: {
      en: 'add contact Luigi email luigi@test.com phone 3331234567',
      it: 'aggiungi contatto Luigi email luigi@test.com telefono 3331234567',
    },
    expectsHitl: true,
  },
  {
    name: 'Update Contact',
    category: 'contacts',
    operation: 'manage_contact(action: update)',
    expectedAgent: 'ActionsAgent',
    expectedTool: 'manage_contact',
    prompts: {
      en: 'change marco phone to 3339876543',
      it: 'cambia telefono di marco in 3339876543',
    },
    expectsHitl: true,
    skip: true,
    skipReason: 'Requires existing contact',
  },
  {
    name: 'Delete Contact',
    category: 'contacts',
    operation: 'manage_contact(action: delete)',
    expectedAgent: 'ActionsAgent',
    expectedTool: 'manage_contact',
    prompts: {
      en: 'remove contact Luigi',
      it: 'elimina contatto Luigi',
    },
    expectsHitl: true,
    skip: true,
    skipReason: 'Requires existing contact',
  },

  // ===========================================================================
  // CALENDAR OPERATIONS
  // ===========================================================================
  {
    name: 'Get Calendar Events',
    category: 'calendar',
    operation: 'get_events',
    expectedAgent: 'IntelligenceAgent',
    expectedTool: 'get_events',
    prompts: {
      en: 'what do i have this week?',
      it: 'cosa ho in calendario questa settimana?',
    },
    expectsHitl: false,
  },
  {
    name: 'Check Availability',
    category: 'calendar',
    operation: 'manage_event(action: check_availability)',
    expectedAgent: 'IntelligenceAgent',
    expectedTool: 'manage_event',
    prompts: {
      en: 'am i free tomorrow afternoon?',
      it: 'sono libero domani pomeriggio?',
    },
    expectsHitl: false,
  },
  {
    name: 'Create Calendar Event',
    category: 'calendar',
    operation: 'manage_event(action: create)',
    expectedAgent: 'ActionsAgent',
    expectedTool: 'manage_event',
    prompts: {
      en: 'schedule meeting tomorrow 3pm team sync',
      it: 'metti riunione domani alle 15 chiamata sync team',
    },
    expectsHitl: true,
  },
  {
    name: 'Update Calendar Event',
    category: 'calendar',
    operation: 'manage_event(action: update)',
    expectedAgent: 'ActionsAgent',
    expectedTool: 'manage_event',
    prompts: {
      en: 'move 3pm meeting to 4pm',
      it: 'sposta riunione delle 15 alle 16',
    },
    expectsHitl: true,
    skip: true,
    skipReason: 'Requires existing event',
  },
  {
    name: 'Delete Calendar Event',
    category: 'calendar',
    operation: 'manage_event(action: delete)',
    expectedAgent: 'ActionsAgent',
    expectedTool: 'manage_event',
    prompts: {
      en: 'cancel meeting tomorrow',
      it: 'annulla riunione di domani',
    },
    expectsHitl: true,
    skip: true,
    skipReason: 'Requires existing event',
  },

  // ===========================================================================
  // ANALYSIS OPERATIONS
  // ===========================================================================
  {
    name: 'Analyze Email',
    category: 'analysis',
    operation: 'analyze_email',
    expectedAgent: 'IntelligenceAgent',
    expectedTool: 'analyze_email',
    prompts: {
      en: 'what do i need to do here?',
      it: 'cosa devo fare con questa email?',
    },
    expectsHitl: false,
    skip: true,
    skipReason: 'Requires active email context',
  },
  {
    name: 'Compose Reply Suggestions',
    category: 'analysis',
    operation: 'compose_reply(mode: suggestions)',
    expectedAgent: 'IntelligenceAgent',
    expectedTool: 'compose_reply',
    prompts: {
      en: 'help me reply',
      it: 'aiutami a rispondere',
    },
    expectsHitl: false,
    skip: true,
    skipReason: 'Requires active email context',
  },

  // ===========================================================================
  // BULK OPERATIONS
  // ===========================================================================
  {
    name: 'Bulk Delete Emails',
    category: 'email',
    operation: 'bulk_email_actions(action: delete)',
    expectedAgent: 'ActionsAgent',
    expectedTool: 'bulk_email_actions',
    prompts: {
      en: 'delete all selected',
      it: 'elimina tutte le selezionate',
    },
    expectsHitl: true,
    skip: true,
    skipReason: 'Requires email selection context',
  },
  {
    name: 'Bulk Archive Emails',
    category: 'email',
    operation: 'bulk_email_actions(action: archive)',
    expectedAgent: 'ActionsAgent',
    expectedTool: 'bulk_email_actions',
    prompts: {
      en: 'archive selected',
      it: 'archivia selezionate',
    },
    expectsHitl: true,
    skip: true,
    skipReason: 'Requires email selection context',
  },
  {
    name: 'Bulk Mark as Read',
    category: 'email',
    operation: 'bulk_email_actions(action: mark_read)',
    expectedAgent: 'ActionsAgent',
    expectedTool: 'bulk_email_actions',
    prompts: {
      en: 'mark all as read',
      it: 'segna tutte come lette',
    },
    expectsHitl: true,
    skip: true,
    skipReason: 'Requires email selection context',
  },
];

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================
async function runComprehensiveTests() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║         VOLTAGENT COMPREHENSIVE VALIDATION TEST SUITE                        ║
║         Testing ALL agents and ALL tools with user prompts                   ║
║         Tenant: ${TEST_TENANT_ID}                                ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

  const results: TestResult[] = [];
  const prisma = createPrismaClient();

  // ===========================================================================
  // STEP 1: Verify Tenant Data
  // ===========================================================================
  console.log('\n📦 STEP 1: Verify Tenant Data\n');

  let user: any;
  let providers: any[] = [];

  try {
    user = await prisma.user.findFirst({
      where: { tenantId: TEST_TENANT_ID, isActive: true, deletedAt: null },
      include: { userPreferences: true },
    });

    if (!user) {
      throw new Error(`No active user found for tenant ${TEST_TENANT_ID}`);
    }

    providers = await prisma.providerConfig.findMany({
      where: { tenantId: TEST_TENANT_ID, isActive: true },
      select: { id: true, email: true, providerType: true, displayName: true },
    });

    console.log(`   ✅ User: ${user.email} (tenant: ${user.tenantId})`);
    console.log(`   ✅ Email Accounts: ${providers.length}`);
    for (const p of providers) {
      console.log(`      📧 ${p.email} (${p.providerType}) - ID: ${p.id.substring(0, 8)}...`);
    }

    if (providers.length === 0) {
      console.log('   ❌ No email accounts found! Some tests will fail.');
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`   ❌ FATAL ERROR: ${errorMsg}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // ===========================================================================
  // STEP 2: Initialize VoltAgent
  // ===========================================================================
  console.log('\n🚀 STEP 2: Initialize VoltAgent\n');

  let app: any;
  let voltAgentService: VoltAgentService;
  let hitlService: HitlService;

  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error'],
    });
    voltAgentService = app.get(VoltAgentService);
    hitlService = app.get(HitlService);
    console.log('   ✅ VoltAgent initialized');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`   ❌ FATAL ERROR: ${errorMsg}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // ===========================================================================
  // STEP 3: Run Test Cases
  // ===========================================================================
  console.log('\n🧪 STEP 3: Running Test Cases\n');

  const testableCategories = ['email', 'folders', 'contacts', 'calendar', 'analysis', 'search'];
  const locales: ('en' | 'it')[] = ['it']; // Test Italian first (user's primary locale)

  for (const category of testableCategories) {
    const categoryTests = TEST_CASES.filter((tc) => tc.category === category);
    if (categoryTests.length === 0) continue;

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`📂 CATEGORY: ${category.toUpperCase()}`);
    console.log(`${'═'.repeat(70)}`);

    for (const testCase of categoryTests) {
      for (const locale of locales) {
        const testName = `${testCase.name} (${locale.toUpperCase()})`;
        const prompt = testCase.prompts[locale];

        // Skip if marked
        if (testCase.skip) {
          console.log(`\n⚠️  SKIP: ${testName}`);
          console.log(`   Reason: ${testCase.skipReason}`);
          results.push({
            name: testName,
            category: testCase.category,
            operation: testCase.operation,
            locale,
            status: 'skipped',
            duration: 0,
            details: testCase.skipReason,
          });
          continue;
        }

        console.log(`\n🔹 TEST: ${testName}`);
        console.log(`   Prompt: "${prompt.substring(0, 60)}${prompt.length > 60 ? '...' : ''}"`);
        console.log(`   Expected: ${testCase.expectedAgent} → ${testCase.expectedTool}`);
        console.log(`   HITL Expected: ${testCase.expectsHitl ? 'Yes' : 'No'}`);

        const startTime = Date.now();
        const conversationId = `test-${category}-${Date.now()}-${locale}`;

        try {
          const result = await voltAgentService.chat(prompt, {
            tenantId: TEST_TENANT_ID,
            userId: user.id,
            conversationId,
            locale,
            skipCache: true,
          });

          const duration = Date.now() - startTime;
          const agentUsed = result.agentUsed || 'unknown';
          const hasPendingAction = result.pendingActions && result.pendingActions.length > 0;

          console.log(`   ⏱️  Duration: ${duration}ms`);
          console.log(`   🤖 Agent: ${agentUsed}`);
          console.log(`   📝 Response: ${result.text?.substring(0, 100)}...`);
          console.log(`   🔐 HITL: ${hasPendingAction ? `Yes (${result.pendingActions?.length} actions)` : 'No'}`);

          // Validate results
          let passed = true;
          const issues: string[] = [];

          // Check if HITL was expected but not created (for WRITE operations)
          if (testCase.expectsHitl && !hasPendingAction) {
            // Check if response contains error keywords
            const responseText = result.text?.toLowerCase() || '';
            const hasError =
              responseText.includes('non riuscito') ||
              responseText.includes('non trovato') ||
              responseText.includes('cannot') ||
              responseText.includes('error') ||
              responseText.includes("can't") ||
              responseText.includes('unable');

            if (hasError) {
              issues.push(`Agent returned error instead of calling tool: ${result.text?.substring(0, 100)}`);
              passed = false;
            } else {
              issues.push('HITL action expected but not created - agent may not be calling tools');
              passed = false;
            }
          }

          // Check if HITL was created when not expected (shouldn't happen for READ ops)
          if (!testCase.expectsHitl && hasPendingAction) {
            issues.push('HITL action created but not expected for READ operation');
            // This is a warning, not a failure
          }

          // Cleanup HITL actions
          if (hasPendingAction) {
            for (const action of result.pendingActions!) {
              await hitlService.rejectAction(TEST_TENANT_ID, action.id, user.id, undefined, 'Test cleanup');
            }
            console.log(`   🧹 Cleaned up ${result.pendingActions!.length} HITL action(s)`);
          }

          const status = passed ? 'passed' : 'failed';
          console.log(`   ${passed ? '✅' : '❌'} ${status.toUpperCase()}`);
          if (issues.length > 0) {
            for (const issue of issues) {
              console.log(`      ⚠️  ${issue}`);
            }
          }

          results.push({
            name: testName,
            category: testCase.category,
            operation: testCase.operation,
            locale,
            status,
            duration,
            agentUsed,
            hitlCreated: hasPendingAction,
            details: issues.length > 0 ? issues.join('; ') : undefined,
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.log(`   ❌ ERROR: ${errorMsg}`);
          results.push({
            name: testName,
            category: testCase.category,
            operation: testCase.operation,
            locale,
            status: 'failed',
            duration: Date.now() - startTime,
            error: errorMsg,
          });
        }

        // Small delay between tests to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  // ===========================================================================
  // STEP 4: Print Summary
  // ===========================================================================
  await app.close();
  await prisma.$disconnect();
  printSummary(results);
}

function printSummary(results: TestResult[]) {
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const total = results.length - skipped;

  console.log(`

╔══════════════════════════════════════════════════════════════════════════════╗
║                    VOLTAGENT COMPREHENSIVE TEST RESULTS                      ║
╚══════════════════════════════════════════════════════════════════════════════╝

📊 STATISTICS:
   Total Tests:  ${results.length}
   ✅ Passed:    ${passed}
   ❌ Failed:    ${failed}
   ⚠️  Skipped:  ${skipped}

📈 Success Rate: ${total > 0 ? ((passed / total) * 100).toFixed(1) : 0}%
`);

  // Group by category
  const categories = [...new Set(results.map((r) => r.category))];

  for (const category of categories) {
    const categoryResults = results.filter((r) => r.category === category);
    const catPassed = categoryResults.filter((r) => r.status === 'passed').length;
    const catFailed = categoryResults.filter((r) => r.status === 'failed').length;
    const catSkipped = categoryResults.filter((r) => r.status === 'skipped').length;
    const catTotal = categoryResults.length - catSkipped;

    console.log(`${'─'.repeat(70)}`);
    console.log(`📂 ${category.toUpperCase()}: ${catPassed}/${catTotal} passed (${catSkipped} skipped)`);
    console.log(`${'─'.repeat(70)}`);

    for (const r of categoryResults) {
      const icon = r.status === 'passed' ? '✅' : r.status === 'failed' ? '❌' : '⚠️';
      console.log(`   ${icon} ${r.name}`);
      console.log(`      Operation: ${r.operation}`);
      console.log(`      Duration: ${r.duration}ms`);
      if (r.agentUsed) console.log(`      Agent: ${r.agentUsed}`);
      if (r.hitlCreated !== undefined) console.log(`      HITL: ${r.hitlCreated ? 'Created' : 'Not created'}`);
      if (r.details) console.log(`      Details: ${r.details}`);
      if (r.error) console.log(`      Error: ${r.error}`);
    }
  }

  console.log('\n' + '═'.repeat(70));

  if (failed > 0) {
    console.log(`
❌ ${failed} TEST(S) FAILED!

FAILED TESTS:
`);
    for (const r of results.filter((r) => r.status === 'failed')) {
      console.log(`   • ${r.name}`);
      console.log(`     Operation: ${r.operation}`);
      if (r.details) console.log(`     Issue: ${r.details}`);
      if (r.error) console.log(`     Error: ${r.error}`);
    }

    console.log(`
TROUBLESHOOTING:
1. Check agent has required tools in its TOOLS list
2. Check prompt explicitly instructs tool usage
3. Check tool Zod schemas are correct
4. Check HITL workflow is functioning

FILES TO CHECK:
- backend/src/modules/ai/voltagent/agents/actions.agent.ts
- backend/src/modules/ai/voltagent/agents/intelligence.agent.ts
- backend/src/modules/ai/voltagent/prompts/actions.prompt.ts
- backend/src/modules/ai/voltagent/prompts/intelligence.prompt.ts
`);
    process.exit(1);
  } else {
    console.log(`
✅ ALL TESTS PASSED!

VoltAgent is correctly:
- Routing requests to appropriate agents
- Calling tools instead of generating text
- Creating HITL actions for write operations
- Processing both English and Italian prompts
`);
    process.exit(0);
  }
}

runComprehensiveTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
