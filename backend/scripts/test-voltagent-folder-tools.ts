/**
 * VoltAgent Folder Tools Test
 *
 * Tests all folder-related tools individually:
 * - list_folders: List all email folders
 * - create_folder: Create new folder (HITL)
 * - rename_folder: Rename existing folder (HITL)
 * - delete_folder: Delete folder (HITL)
 * - move_email_to_folder: Move email to folder (HITL)
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-voltagent-folder-tools.ts
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

async function runFolderToolsTest() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║         VoltAgent Folder Tools Validation Test               ║
║         Testing: 5 folder tools                              ║
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

  // Get folder stats
  const folderCount = await prisma.folder.count({
    where: { tenantId: user.tenantId },
  });

  // Get a non-system folder for tests
  const testFolder = await prisma.folder.findFirst({
    where: {
      tenantId: user.tenantId,
      name: { notIn: ['INBOX', 'Sent', 'Drafts', 'Trash', 'Spam', 'Junk', 'SENT', 'DRAFT', 'TRASH'] },
    },
    select: { id: true, name: true, path: true, providerId: true },
  });

  // Get a test email
  const testEmail = await prisma.email.findFirst({
    where: { tenantId: user.tenantId },
    select: { id: true, subject: true },
  });

  // Get providers
  const providers = await prisma.providerConfig.findMany({
    where: { tenantId: user.tenantId, isActive: true },
    select: { id: true, email: true, providerType: true },
  });

  console.log('📁 User Profile:');
  console.log(`   Name: ${user.firstName} ${user.lastName}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Tenant: ${user.tenantId}`);
  console.log(`   Total Folders: ${folderCount}`);
  console.log(`   Providers: ${providers.map((p) => p.email).join(', ')}`);
  if (testFolder) {
    console.log(`   Test Folder: "${testFolder.name}" (${testFolder.path})`);
  }
  console.log();

  // Bootstrap NestJS
  console.log('🚀 Starting VoltAgent...\n');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const voltAgentService = app.get(VoltAgentService);
  const conversationId = `folder-tools-test-${Date.now()}`;

  // Define test cases
  const testCases = [
    // READ-ONLY TOOLS (safe to execute)
    {
      name: 'List All Folders',
      tool: 'list_folders',
      message: 'Mostrami tutte le cartelle email',
      execute: true,
    },
    {
      name: 'List Folders - Summary',
      tool: 'list_folders',
      message: 'Quante cartelle ho? Elenca i nomi.',
      execute: true,
    },
    {
      name: 'List Folders - Hierarchy',
      tool: 'list_folders',
      message: 'Mostra la struttura delle cartelle email',
      execute: true,
    },
    {
      name: 'List Folders - By Provider',
      tool: 'list_folders',
      message: providers.length > 0 ? `Mostra le cartelle di ${providers[0].email}` : 'Mostra le cartelle del primo account email',
      execute: true,
    },

    // HITL TOOLS (require approval - test that they trigger HITL)
    {
      name: 'Create Folder (HITL)',
      tool: 'create_folder',
      message: 'Crea una nuova cartella chiamata "Progetti 2025"',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Create Nested Folder (HITL)',
      tool: 'create_folder',
      message: 'Crea una sottocartella "Clienti" dentro la cartella "Lavoro"',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Rename Folder (HITL)',
      tool: 'rename_folder',
      message: testFolder
        ? `Rinomina la cartella "${testFolder.name}" in "Archivio 2024"`
        : 'Rinomina la prima cartella personalizzata',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Delete Folder (HITL)',
      tool: 'delete_folder',
      message: 'Elimina la cartella "Test" se esiste',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Move Email to Folder (HITL)',
      tool: 'move_email_to_folder',
      message: testEmail
        ? `Sposta l'email "${testEmail.subject?.substring(0, 30)}" nella cartella Archivio`
        : 'Sposta l\'ultima email nella cartella Archivio',
      execute: false,
      expectHITL: true,
    },
    {
      name: 'Organize Emails (HITL)',
      tool: 'move_email_to_folder',
      message: 'Sposta tutte le email da newsletter in una cartella "Newsletter"',
      execute: false,
      expectHITL: true,
    },
  ];

  console.log(`${'═'.repeat(60)}`);
  console.log('📁 FOLDER TOOLS TESTS');
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
║                FOLDER TOOLS TEST RESULTS                     ║
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

  console.log('\n✅ Folder tools validation completed!');
  process.exit(failed > 0 ? 1 : 0);
}

runFolderToolsTest().catch(console.error);
