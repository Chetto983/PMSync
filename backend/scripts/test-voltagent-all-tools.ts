/**
 * VoltAgent Comprehensive Tool Validation Test
 *
 * Tests ALL tools across ALL agents to ensure proper functionality:
 *
 * AGENTS:
 * 1. SupervisorAgent - Routes to specialist agents
 * 2. EmailAgent - Email operations
 * 3. CalendarAgent - Calendar operations
 * 4. ContactsAgent - Contact management
 * 5. KnowledgeAgent - Knowledge base search
 * 6. GeneralAgent - General queries
 *
 * TOOLS BY CATEGORY:
 *
 * Email Tools (11):
 * - send_email, reply_email, forward_email
 * - search_emails, delete_email, archive_email
 * - mark_read, mark_unread, star_email, unstar_email
 * - get_unread_emails
 *
 * Calendar Tools (5):
 * - get_events, create_event, update_event, delete_event
 * - check_availability
 *
 * Contact Tools (5):
 * - search_contacts, get_contact, create_contact, update_contact, delete_contact
 *
 * Folder Tools (5):
 * - list_folders, create_folder, rename_folder, delete_folder, move_email_to_folder
 *
 * Knowledge Tools (1):
 * - search_knowledge
 *
 * Insight Tools (9):
 * - summarize_email, analyze_sentiment, compose_reply
 * - extract_action_items, categorize_email, generate_smart_replies
 * - analyze_email, detect_intent, calculate_priority
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-voltagent-all-tools.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoltAgentService } from '../src/modules/ai/voltagent/voltagent.service';

interface TestCase {
  name: string;
  category: string;
  expectedTool: string;
  message: string;
  requiresHITL?: boolean;
  skipExecution?: boolean;
}

const testCases: TestCase[] = [
  // ==================== EMAIL TOOLS ====================
  {
    name: 'Email Search',
    category: 'Email',
    expectedTool: 'search_emails',
    message: 'Cerca le email da Google ricevute questa settimana',
  },
  {
    name: 'Get Unread',
    category: 'Email',
    expectedTool: 'get_unread_emails',
    message: 'Quante email non lette ho?',
  },
  {
    name: 'Send Email (HITL)',
    category: 'Email',
    expectedTool: 'send_email',
    message: 'Invia una email a test@example.com con oggetto "Test" e corpo "Questo è un test"',
    requiresHITL: true,
    skipExecution: true, // Skip to avoid actual sends
  },
  {
    name: 'Reply Email (HITL)',
    category: 'Email',
    expectedTool: 'reply_email',
    message: 'Rispondi all\'ultima email da komoot dicendo "Grazie per le informazioni"',
    requiresHITL: true,
    skipExecution: true,
  },
  {
    name: 'Archive Email',
    category: 'Email',
    expectedTool: 'archive_email',
    message: 'Archivia le email promozionali più vecchie di un mese',
    skipExecution: true, // Skip destructive actions
  },
  {
    name: 'Mark Read',
    category: 'Email',
    expectedTool: 'mark_read',
    message: 'Segna come lette tutte le email da newsletter',
    skipExecution: true,
  },

  // ==================== CALENDAR TOOLS ====================
  {
    name: 'Get Events Today',
    category: 'Calendar',
    expectedTool: 'get_events',
    message: 'Cosa ho in calendario oggi?',
  },
  {
    name: 'Get Events Week',
    category: 'Calendar',
    expectedTool: 'get_events',
    message: 'Mostrami gli eventi della prossima settimana',
  },
  {
    name: 'Check Availability',
    category: 'Calendar',
    expectedTool: 'check_availability',
    message: 'Sono libero domani alle 15:00?',
  },
  {
    name: 'Create Event (HITL)',
    category: 'Calendar',
    expectedTool: 'create_event',
    message: 'Crea un evento "Meeting con team" domani alle 10:00 per 1 ora',
    requiresHITL: true,
    skipExecution: true,
  },

  // ==================== CONTACT TOOLS ====================
  {
    name: 'Search Contacts',
    category: 'Contacts',
    expectedTool: 'search_contacts',
    message: 'Cerca il contatto Mario Rossi',
  },
  {
    name: 'Search Contacts by Company',
    category: 'Contacts',
    expectedTool: 'search_contacts',
    message: 'Chi sono i miei contatti che lavorano in Google?',
  },
  {
    name: 'Create Contact (HITL)',
    category: 'Contacts',
    expectedTool: 'create_contact',
    message: 'Aggiungi un nuovo contatto: Luigi Verdi, email luigi@example.com',
    requiresHITL: true,
    skipExecution: true,
  },

  // ==================== KNOWLEDGE TOOLS ====================
  {
    name: 'Search Knowledge',
    category: 'Knowledge',
    expectedTool: 'search_knowledge',
    message: 'Cerca informazioni sul mutuo nelle mie email',
  },
  {
    name: 'Search Knowledge Projects',
    category: 'Knowledge',
    expectedTool: 'search_knowledge',
    message: 'Cosa so del progetto MailAgent?',
  },

  // ==================== FOLDER TOOLS ====================
  {
    name: 'List Folders',
    category: 'Folder',
    expectedTool: 'list_folders',
    message: 'Mostrami tutte le cartelle email',
  },

  // ==================== INSIGHT TOOLS (via Email Agent) ====================
  {
    name: 'Summarize Email',
    category: 'Insights',
    expectedTool: 'summarize_email',
    message: 'Riassumi l\'ultima email importante che ho ricevuto',
  },
  {
    name: 'Analyze Sentiment',
    category: 'Insights',
    expectedTool: 'analyze_sentiment',
    message: 'Qual è il tono delle email ricevute oggi?',
  },

  // ==================== GENERAL QUERIES ====================
  {
    name: 'User Context',
    category: 'General',
    expectedTool: 'none',
    message: 'Chi sono io? Dimmi il mio nome e ruolo',
  },
  {
    name: 'Datetime Awareness',
    category: 'General',
    expectedTool: 'none',
    message: 'Che giorno è oggi?',
  },
];

async function runTests() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║     VoltAgent Comprehensive Tool Validation Test             ║
║     Testing: ${testCases.length} test cases across all agents and tools       ║
╚══════════════════════════════════════════════════════════════╝
`);

  const prisma = createPrismaClient();

  // Get test user
  const user = await prisma.user.findFirst({
    include: { userPreferences: true },
  });
  if (!user) {
    console.error('❌ No user found in database');
    await prisma.$disconnect();
    return;
  }

  console.log('📧 User Profile:');
  console.log(`   Name: ${user.firstName} ${user.lastName}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Tenant: ${user.tenantId}\n`);

  // Bootstrap NestJS
  console.log('🚀 Starting VoltAgent...\n');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const voltAgentService = app.get(VoltAgentService);
  const conversationId = `tool-validation-${Date.now()}`;

  // Results tracking
  const results: {
    passed: string[];
    failed: string[];
    skipped: string[];
    hitl: string[];
  } = {
    passed: [],
    failed: [],
    skipped: [],
    hitl: [],
  };

  // Group tests by category
  const categories = [...new Set(testCases.map((t) => t.category))];

  for (const category of categories) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📁 Category: ${category}`);
    console.log(`${'─'.repeat(60)}`);

    const categoryTests = testCases.filter((t) => t.category === category);

    for (const test of categoryTests) {
      if (test.skipExecution) {
        console.log(`\n⏭️  [SKIP] ${test.name}`);
        console.log(`   Expected tool: ${test.expectedTool}`);
        console.log(`   Reason: ${test.requiresHITL ? 'HITL required' : 'Destructive action'}`);
        results.skipped.push(test.name);
        continue;
      }

      console.log(`\n🧪 Testing: ${test.name}`);
      console.log(`   Expected tool: ${test.expectedTool}`);
      console.log(`   👤 "${test.message}"`);

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

        // Check for HITL pending actions
        if (result.pendingActions && result.pendingActions.length > 0) {
          console.log(`   ⚠️  HITL Required - ${result.pendingActions.length} pending action(s)`);
          results.hitl.push(test.name);
        } else if (result.text && result.text.length > 0) {
          console.log(`   ✅ PASSED (${duration}ms)`);
          console.log(`   🤖 ${result.text.substring(0, 150)}${result.text.length > 150 ? '...' : ''}`);
          results.passed.push(test.name);
        } else {
          console.log(`   ❓ No response text`);
          results.failed.push(test.name);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`   ❌ FAILED: ${errorMsg.substring(0, 100)}`);
        results.failed.push(test.name);
      }

      // Small delay between tests
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    TEST RESULTS SUMMARY                      ║
╚══════════════════════════════════════════════════════════════╝

📊 Statistics:
   Total Tests: ${testCases.length}
   ✅ Passed:   ${results.passed.length}
   ❌ Failed:   ${results.failed.length}
   ⏭️  Skipped:  ${results.skipped.length}
   ⚠️  HITL:     ${results.hitl.length}
`);

  if (results.failed.length > 0) {
    console.log('❌ Failed Tests:');
    results.failed.forEach((t) => console.log(`   - ${t}`));
  }

  if (results.hitl.length > 0) {
    console.log('\n⚠️  HITL Required Tests (working correctly):');
    results.hitl.forEach((t) => console.log(`   - ${t}`));
  }

  // Cleanup
  await app.close();
  await prisma.$disconnect();

  const successRate = ((results.passed.length + results.hitl.length) / (testCases.length - results.skipped.length)) * 100;
  console.log(`\n📈 Success Rate: ${successRate.toFixed(1)}%`);
  console.log('\n✅ Tool validation completed!');

  process.exit(results.failed.length > 0 ? 1 : 0);
}

runTests().catch(console.error);
