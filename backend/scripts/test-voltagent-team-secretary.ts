/**
 * VoltAgent AI Secretary Test - Real Team Collaboration
 *
 * Simulates a REAL team collaboration scenario where:
 * - User has 3 email accounts (Work/Google, Personal/Microsoft, Info/Libero)
 * - AI acts as an intelligent secretary managing all 3 accounts
 * - Real emails flow between accounts simulating team/client communication
 *
 * SCENARIO: Project coordination with client
 *
 * Day 1: Client emails Work account about project
 * AI Secretary:
 *   1. Summarizes client email
 *   2. Drafts response from Work account
 *   3. Forwards summary to Personal (for after-hours reference)
 *   4. Files copy in Info account for records
 *
 * Day 2: Follow-up and scheduling
 *   5. Check calendar availability
 *   6. Propose meeting times to client
 *   7. Coordinate across all accounts
 *
 * WARNING: Sends REAL emails between your accounts!
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-voltagent-team-secretary.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoltAgentService } from '../src/modules/ai/voltagent/voltagent.service';
import { HitlService } from '../src/modules/ai/voltagent/services/hitl.service';

interface EmailAccount {
  id: string;
  email: string;
  type: string;
  scope?: string;
  displayName?: string;
}

async function runTeamSecretaryTest() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║       VoltAgent AI SECRETARY - Team Collaboration Test       ║
║       Simulating: 3 accounts working as a team               ║
║       Purpose: AI acts as intelligent secretary              ║
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

  // Get all active providers with their scope
  const providers = await prisma.providerConfig.findMany({
    where: { tenantId: user.tenantId, isActive: true },
    select: { id: true, email: true, providerType: true, displayName: true, scope: true },
    orderBy: { isDefault: 'desc' },
  });

  // Organize accounts by purpose
  const accounts: Record<string, EmailAccount> = {};

  for (const p of providers) {
    const email = p.email.toLowerCase();
    const type = p.providerType.toLowerCase();
    const scope = (p.scope || '').toLowerCase();

    // Determine account role based on scope or email pattern
    if (scope.includes('work') || scope.includes('lavoro') || type === 'google' || email.includes('gmail')) {
      if (!accounts.work) {
        accounts.work = { id: p.id, email: p.email, type, scope: p.scope ?? undefined, displayName: p.displayName ?? undefined };
      }
    }
    if (scope.includes('personal') || scope.includes('personale') || type === 'microsoft' || email.includes('outlook') || email.includes('hotmail')) {
      if (!accounts.personal) {
        accounts.personal = { id: p.id, email: p.email, type, scope: p.scope ?? undefined, displayName: p.displayName ?? undefined };
      }
    }
    if (scope.includes('info') || email.includes('libero') || type === 'generic') {
      if (!accounts.info) {
        accounts.info = { id: p.id, email: p.email, type, scope: p.scope ?? undefined, displayName: p.displayName ?? undefined };
      }
    }
  }

  // If we don't have 3 distinct accounts, assign remaining
  const allAccounts = providers.map((p) => ({
    id: p.id,
    email: p.email,
    type: p.providerType,
    scope: p.scope ?? undefined,
    displayName: p.displayName ?? undefined,
  }));

  if (!accounts.work && allAccounts[0]) accounts.work = allAccounts[0];
  if (!accounts.personal && allAccounts[1]) accounts.personal = allAccounts[1];
  if (!accounts.info && allAccounts[2]) accounts.info = allAccounts[2];

  console.log('🏢 TEAM ACCOUNTS CONFIGURATION:');
  console.log(`${'─'.repeat(60)}`);
  if (accounts.work) console.log(`   📊 WORK:     ${accounts.work.email} ${accounts.work.scope ? `[${accounts.work.scope}]` : ''}`);
  if (accounts.personal) console.log(`   🏠 PERSONAL: ${accounts.personal.email} ${accounts.personal.scope ? `[${accounts.personal.scope}]` : ''}`);
  if (accounts.info) console.log(`   📋 INFO:     ${accounts.info.email} ${accounts.info.scope ? `[${accounts.info.scope}]` : ''}`);
  console.log();

  if (Object.keys(accounts).length < 2) {
    console.error('❌ Need at least 2 configured email accounts for team test');
    console.log('   Configure account scopes in the frontend (Work, Personal, Info, etc.)');
    await prisma.$disconnect();
    return;
  }

  // Bootstrap NestJS
  console.log('🚀 Starting VoltAgent AI Secretary...\n');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const voltAgentService = app.get(VoltAgentService);
  const hitlService = app.get(HitlService);
  const conversationId = `team-secretary-${Date.now()}`;

  // Generate unique test identifier
  const testId = `TS-${Date.now().toString(36).toUpperCase()}`;
  const projectName = 'MailAgent';
  const clientName = 'Marco Rossi';

  console.log(`${'═'.repeat(60)}`);
  console.log(`🤖 AI SECRETARY SESSION: ${testId}`);
  console.log(`${'═'.repeat(60)}\n`);

  // Define the team collaboration scenario
  const scenario = [
    // ========== PHASE 1: CLIENT INQUIRY ==========
    {
      phase: '📥 PHASE 1: Client Inquiry Management',
      steps: [
        {
          name: 'Simulate client email arrival',
          instruction: accounts.work
            ? `Immagina che ${clientName} (cliente@example.com) abbia appena inviato una email al mio account ${accounts.work.email} con oggetto "[${testId}] Richiesta preventivo ${projectName}" chiedendo: "Buongiorno, sarei interessato al vostro progetto ${projectName}. Potete inviarmi un preventivo e disponibilità per una call questa settimana? Grazie, ${clientName}"`
            : 'Skip - no work account',
          skip: !accounts.work,
        },
        {
          name: 'AI summarizes client request',
          instruction: `Riassumi brevemente la richiesta del cliente ${clientName} riguardo ${projectName}`,
        },
        {
          name: 'Check my calendar availability this week',
          instruction: 'Controlla la mia disponibilità per questa settimana per una call con il cliente. Quali slot ho liberi?',
        },
        {
          name: 'Draft professional response to client',
          instruction: `Scrivi una bozza di risposta professionale a ${clientName} da inviare dal mio account di lavoro. Includi: ringraziamento, conferma interesse, e proponi 2-3 slot per una call basandoti sulla mia disponibilità.`,
        },
      ],
    },

    // ========== PHASE 2: INTERNAL COORDINATION ==========
    {
      phase: '📤 PHASE 2: Internal Team Coordination',
      steps: [
        {
          name: 'Forward summary to personal (after-hours reference)',
          instruction:
            accounts.work && accounts.personal
              ? `Dal mio account ${accounts.work.email}, inoltra un riepilogo della richiesta di ${clientName} al mio account personale ${accounts.personal.email} con nota: "Riepilogo cliente per riferimento fuori ufficio - ${testId}"`
              : 'Skip - missing accounts',
          skip: !accounts.work || !accounts.personal,
          autoApprove: true,
        },
        {
          name: 'Archive copy in info/records account',
          instruction:
            accounts.work && accounts.info
              ? `Invia una copia della corrispondenza con ${clientName} anche al mio account archivio ${accounts.info.email} per tenere traccia - oggetto: "[ARCHIVIO] ${testId} - ${clientName}"`
              : 'Skip - missing info account',
          skip: !accounts.work || !accounts.info,
          autoApprove: true,
        },
      ],
    },

    // ========== PHASE 3: FOLLOW-UP ACTIONS ==========
    {
      phase: '📋 PHASE 3: Task Management',
      steps: [
        {
          name: 'List action items from client conversation',
          instruction: `Quali sono le azioni che devo completare per il cliente ${clientName}? Elenca i task.`,
        },
        {
          name: 'Create calendar reminder',
          instruction: `Crea un promemoria nel calendario per domani alle 9:00: "Follow-up ${clientName} - ${testId}"`,
          autoApprove: true,
        },
        {
          name: 'Search for related contacts',
          instruction: `Cerca nei miei contatti se ho già informazioni su ${clientName} o sulla sua azienda`,
        },
      ],
    },

    // ========== PHASE 4: CROSS-ACCOUNT EMAIL FLOW ==========
    {
      phase: '✉️ PHASE 4: Real Cross-Account Email Test',
      steps: [
        {
          name: 'Send test email: Work -> Personal',
          instruction:
            accounts.work && accounts.personal
              ? `Dal mio account di lavoro ${accounts.work.email}, invia una email al mio account personale ${accounts.personal.email} con oggetto "[${testId}] Test Work->Personal" e corpo: "Test sincronizzazione email tra account di lavoro e personale. Timestamp: ${new Date().toISOString()}"`
              : 'Skip',
          skip: !accounts.work || !accounts.personal,
          autoApprove: true,
          waitForSync: 8000,
        },
        {
          name: 'Reply from Personal -> Work',
          instruction:
            accounts.personal && accounts.work
              ? `Dall'account personale ${accounts.personal.email}, rispondi all'email con oggetto "[${testId}] Test Work->Personal" dicendo: "Confermato! Email ricevuta correttamente."`
              : 'Skip',
          skip: !accounts.work || !accounts.personal,
          autoApprove: true,
          waitForSync: 5000,
        },
        {
          name: 'Send test email: Personal -> Info',
          instruction:
            accounts.personal && accounts.info
              ? `Dal mio account personale ${accounts.personal.email}, invia una email al mio account info ${accounts.info.email} con oggetto "[${testId}] Test Personal->Info" e corpo: "Backup test email per archivio."`
              : 'Skip',
          skip: !accounts.personal || !accounts.info,
          autoApprove: true,
          waitForSync: 5000,
        },
        {
          name: 'Verify all test emails',
          instruction: `Cerca tutte le email con "${testId}" nell'oggetto e dimmi quante ne trovi in totale su tutti i miei account`,
        },
      ],
    },

    // ========== PHASE 5: AI SECRETARY INTELLIGENCE ==========
    {
      phase: '🧠 PHASE 5: AI Secretary Intelligence',
      steps: [
        {
          name: 'Summarize today email activity',
          instruction: "Fammi un riepilogo delle email che ho gestito oggi. Quante ne ho inviate e ricevute? C'è qualcosa di urgente?",
        },
        {
          name: 'Prioritize my inbox',
          instruction: 'Analizza le mie email non lette e suggerisci quale dovrei gestire prima basandoti su urgenza e importanza',
        },
        {
          name: 'Context awareness test',
          instruction: `Ricordami: chi è ${clientName}, cosa mi ha chiesto, e cosa devo fare per lui?`,
        },
      ],
    },
  ];

  // Execute the scenario
  const results: { phase: string; step: string; status: string; duration: number; error?: string }[] = [];
  let totalSteps = 0;

  console.log('⚠️  Starting REAL email test in 5 seconds...\n');
  await new Promise((r) => setTimeout(r, 5000));

  for (const phase of scenario) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(phase.phase);
    console.log(`${'═'.repeat(60)}`);

    for (const step of phase.steps) {
      totalSteps++;

      if (step.skip) {
        console.log(`\n⏭️  [SKIP] ${step.name}`);
        results.push({ phase: phase.phase, step: step.name, status: 'skipped', duration: 0 });
        continue;
      }

      console.log(`\n🧪 ${step.name}`);
      console.log(`${'─'.repeat(50)}`);
      console.log(`👤 "${step.instruction.substring(0, 100)}${step.instruction.length > 100 ? '...' : ''}"\n`);

      try {
        const startTime = Date.now();

        const result = await voltAgentService.chat(step.instruction, {
          tenantId: user.tenantId,
          userId: user.id,
          conversationId,
          locale: 'it',
          skipCache: true,
        });

        const duration = Date.now() - startTime;

        // Handle HITL if needed
        if (result.pendingActions && result.pendingActions.length > 0) {
          console.log(`   🔐 HITL: ${result.pendingActions.length} azione(i) in attesa`);

          for (const action of result.pendingActions) {
            console.log(`   📋 ${action.type}: ${action.summary || 'No summary'}`);

            if ((step as { autoApprove?: boolean }).autoApprove) {
              console.log('   ✅ Auto-approvazione...');
              await hitlService.resolveAction(action.id, {
                userId: user.id,
                decision: 'APPROVED',
                reason: 'Auto-approvato dal test AI Secretary',
              });
              console.log('   ✅ Azione eseguita!');
            } else {
              console.log('   ⏸️  Azione non approvata (manuale)');
            }
          }
        }

        console.log(`   🤖 ${result.text?.substring(0, 200)}${(result.text?.length ?? 0) > 200 ? '...' : ''}`);
        console.log(`   ⏱️  ${duration}ms`);

        results.push({ phase: phase.phase, step: step.name, status: 'passed', duration });

        // Wait for sync if needed
        const waitTime = (step as { waitForSync?: number }).waitForSync;
        if (waitTime) {
          console.log(`   ⏳ Waiting ${waitTime}ms for email sync...`);
          await new Promise((r) => setTimeout(r, waitTime));
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`   ❌ ERROR: ${errorMsg.substring(0, 100)}`);
        results.push({ phase: phase.phase, step: step.name, status: 'failed', duration: 0, error: errorMsg });
      }

      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Final Summary
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           AI SECRETARY TEST RESULTS - ${testId}              ║
╚══════════════════════════════════════════════════════════════╝

📊 Statistics:
   Total Steps: ${totalSteps}
   ✅ Passed:   ${passed}
   ❌ Failed:   ${failed}
   ⏭️  Skipped:  ${skipped}

📈 Success Rate: ${((passed / (totalSteps - skipped)) * 100).toFixed(1)}%

📧 Account Summary:
   Work:     ${accounts.work?.email || 'Not configured'}
   Personal: ${accounts.personal?.email || 'Not configured'}
   Info:     ${accounts.info?.email || 'Not configured'}
`);

  if (failed > 0) {
    console.log('❌ Failed Steps:');
    results
      .filter((r) => r.status === 'failed')
      .forEach((r) => console.log(`   - ${r.step}: ${r.error?.substring(0, 80)}`));
  }

  // Verify test emails exist
  const testEmails = await prisma.email.count({
    where: { tenantId: user.tenantId, subject: { contains: testId } },
  });
  console.log(`\n📬 Test emails in database: ${testEmails}`);

  // Cleanup
  await app.close();
  await prisma.$disconnect();

  console.log('\n✅ AI Secretary test completed!');
  console.log(`   Test ID: ${testId}`);
  console.log(`   Check your email accounts to verify the full flow.`);

  process.exit(failed > 0 ? 1 : 0);
}

runTeamSecretaryTest().catch(console.error);
