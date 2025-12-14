/**
 * VoltAgent Real Email Scenario Test
 *
 * REAL END-TO-END TEST with actual email sending between providers:
 * - Google (Gmail)
 * - Microsoft (Outlook)
 * - Libero (IMAP)
 *
 * Scenario:
 * 1. Google sends email to Microsoft asking about a project
 * 2. Microsoft replies to Google with project details
 * 3. Microsoft forwards the thread to Libero for backup
 * 4. Libero replies-all with confirmation
 * 5. Google archives the thread
 *
 * WARNING: This test sends REAL emails! Use test accounts if possible.
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-voltagent-real-email-scenario.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoltAgentService } from '../src/modules/ai/voltagent/voltagent.service';
import { HitlService } from '../src/modules/ai/voltagent/services/hitl.service';

interface Provider {
  id: string;
  email: string;
  type: string;
  displayName?: string;
  scope?: string;
}

interface TestStep {
  name: string;
  fromProvider: string; // 'google', 'microsoft', 'libero'
  action: string;
  message: string;
  autoApprove?: boolean;
  waitForSync?: number; // ms to wait for sync
}

async function runRealEmailScenario() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║     VoltAgent REAL Email Scenario Test                       ║
║     Testing: Google <-> Microsoft <-> Libero                 ║
║     WARNING: This sends REAL emails!                         ║
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

  // Get all active providers
  const providers = await prisma.providerConfig.findMany({
    where: { tenantId: user.tenantId, isActive: true },
    select: { id: true, email: true, providerType: true, displayName: true, scope: true },
  });

  // Map providers by type
  const providerMap: Record<string, Provider> = {};
  for (const p of providers) {
    const type = p.providerType.toLowerCase();
    if (type === 'google' || type === 'microsoft') {
      providerMap[type] = { id: p.id, email: p.email, type, displayName: p.displayName ?? undefined, scope: p.scope ?? undefined };
    } else if (type === 'generic' || p.email.includes('libero')) {
      providerMap['libero'] = { id: p.id, email: p.email, type: 'libero', displayName: p.displayName ?? undefined, scope: p.scope ?? undefined };
    }
  }

  console.log('📧 Connected Providers:');
  for (const [key, p] of Object.entries(providerMap)) {
    console.log(`   ${key.toUpperCase()}: ${p.email} ${p.scope ? `(${p.scope})` : ''}`);
  }
  console.log();

  // Validate we have at least 2 providers
  const availableProviders = Object.keys(providerMap);
  if (availableProviders.length < 2) {
    console.error('❌ Need at least 2 providers (Google, Microsoft, or Libero) for this test');
    console.log('   Found:', availableProviders.join(', '));
    await prisma.$disconnect();
    return;
  }

  // Bootstrap NestJS
  console.log('🚀 Starting VoltAgent...\n');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const voltAgentService = app.get(VoltAgentService);
  const hitlService = app.get(HitlService);
  const conversationId = `real-scenario-${Date.now()}`;

  // Build scenario based on available providers
  const scenario: TestStep[] = [];
  const testSubject = `[TEST] VoltAgent Scenario ${new Date().toISOString().split('T')[0]}`;

  // Step 1: First provider sends to second
  const first = availableProviders[0];
  const second = availableProviders[1];
  const third = availableProviders[2]; // may be undefined

  scenario.push({
    name: `📤 ${first.toUpperCase()} sends project inquiry to ${second.toUpperCase()}`,
    fromProvider: first,
    action: 'send',
    message: `Usando l'account ${providerMap[first].email}, invia una email a ${providerMap[second].email} con oggetto "${testSubject}" e corpo: "Ciao, sto testando VoltAgent. Come procede il progetto MailAgent? Fammi sapere lo stato attuale. Grazie!"`,
    autoApprove: true,
    waitForSync: 5000,
  });

  // Step 2: Second replies
  scenario.push({
    name: `↩️ ${second.toUpperCase()} replies to ${first.toUpperCase()}`,
    fromProvider: second,
    action: 'reply',
    message: `Cerca l'ultima email con oggetto "${testSubject}" e rispondi dicendo: "Il progetto procede bene! Abbiamo completato le feature principali. Ti aggiorno presto con i dettagli."`,
    autoApprove: true,
    waitForSync: 5000,
  });

  // Step 3: Forward to third if available, otherwise forward back
  if (third && providerMap[third]) {
    scenario.push({
      name: `➡️ ${second.toUpperCase()} forwards to ${third.toUpperCase()}`,
      fromProvider: second,
      action: 'forward',
      message: `Inoltra l'ultima email con oggetto "${testSubject}" a ${providerMap[third].email} con messaggio: "Ti giro questa conversazione per tua info."`,
      autoApprove: true,
      waitForSync: 5000,
    });

    // Step 4: Third replies all
    scenario.push({
      name: `📨 ${third.toUpperCase()} replies-all with confirmation`,
      fromProvider: third,
      action: 'reply',
      message: `Cerca l'email inoltrataami e rispondi a tutti dicendo: "Grazie per l'aggiornamento! Confermo ricezione."`,
      autoApprove: true,
      waitForSync: 3000,
    });
  }

  // Final step: Archive
  scenario.push({
    name: `📦 ${first.toUpperCase()} archives the conversation`,
    fromProvider: first,
    action: 'archive',
    message: `Archivia tutte le email con oggetto che contiene "${testSubject}"`,
    autoApprove: true,
  });

  console.log(`${'═'.repeat(60)}`);
  console.log('📋 TEST SCENARIO');
  console.log(`${'─'.repeat(60)}`);
  scenario.forEach((step, i) => {
    console.log(`   ${i + 1}. ${step.name}`);
  });
  console.log(`${'═'.repeat(60)}\n`);

  // Ask for confirmation
  console.log('⚠️  This test will send REAL emails between your accounts!');
  console.log('   Press Ctrl+C now to abort, or wait 5 seconds to continue...\n');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Execute scenario
  const results: { step: string; status: string; duration: number; error?: string }[] = [];

  for (let i = 0; i < scenario.length; i++) {
    const step = scenario[i];
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Step ${i + 1}/${scenario.length}: ${step.name}`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`👤 "${step.message}"\n`);

    try {
      const startTime = Date.now();

      // Send message to VoltAgent
      const result = await voltAgentService.chat(step.message, {
        tenantId: user.tenantId,
        userId: user.id,
        conversationId,
        locale: 'it',
        skipCache: true,
      });

      const duration = Date.now() - startTime;

      // Check for HITL actions
      if (result.pendingActions && result.pendingActions.length > 0 && step.autoApprove) {
        console.log(`   🔐 HITL: ${result.pendingActions.length} action(s) pending`);

        for (const action of result.pendingActions) {
          console.log(`   📋 Action: ${action.type} - ${action.summary || 'No summary'}`);

          if (step.autoApprove) {
            console.log('   ✅ Auto-approving action...');

            // Approve the action
            await hitlService.resolveAction(action.id, {
              userId: user.id,
              decision: 'APPROVED',
              reason: 'Auto-approved by test script',
            });

            console.log('   ✅ Action approved and executed!');
          }
        }
      }

      console.log(`   🤖 Response: ${result.text?.substring(0, 150)}${(result.text?.length ?? 0) > 150 ? '...' : ''}`);
      console.log(`   ⏱️  Duration: ${duration}ms`);

      results.push({
        step: step.name,
        status: 'passed',
        duration,
      });

      // Wait for sync if specified
      if (step.waitForSync) {
        console.log(`   ⏳ Waiting ${step.waitForSync}ms for email sync...`);
        await new Promise((resolve) => setTimeout(resolve, step.waitForSync));
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ ERROR: ${errorMsg}`);
      results.push({
        step: step.name,
        status: 'failed',
        duration: 0,
        error: errorMsg,
      });
    }
  }

  // Summary
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              REAL EMAIL SCENARIO RESULTS                     ║
╚══════════════════════════════════════════════════════════════╝

📊 Statistics:
   Total Steps: ${scenario.length}
   ✅ Passed:   ${passed}
   ❌ Failed:   ${failed}

📈 Success Rate: ${((passed / scenario.length) * 100).toFixed(1)}%
`);

  if (failed > 0) {
    console.log('❌ Failed Steps:');
    results
      .filter((r) => r.status === 'failed')
      .forEach((r) => console.log(`   - ${r.step}: ${r.error}`));
  }

  // Verify emails were synced
  console.log('\n📬 Verifying email sync...');
  const syncedEmails = await prisma.email.count({
    where: {
      tenantId: user.tenantId,
      subject: { contains: testSubject },
    },
  });
  console.log(`   Found ${syncedEmails} emails with test subject in database`);

  // Cleanup
  await app.close();
  await prisma.$disconnect();

  console.log('\n✅ Real email scenario test completed!');
  console.log(`   Check your email accounts to verify the emails were delivered.`);

  process.exit(failed > 0 ? 1 : 0);
}

runRealEmailScenario().catch(console.error);
