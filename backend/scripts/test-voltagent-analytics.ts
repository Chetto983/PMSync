/**
 * VoltAgent Analytics Test
 *
 * Tests the Mistral Agents API code_interpreter integration for analytics.
 * This test passes REAL email data from the database to the AI for analysis.
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-voltagent-analytics.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AnalyticsService } from '../src/modules/ai/voltagent/services/analytics.service';
import { clearAnalyticsCache, clearAnalyticsAgentPool } from '../src/modules/ai/voltagent/tools/analytics.tools';

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  response?: unknown;
  error?: string;
}

async function runAnalyticsTest() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           VoltAgent Analytics Test                           ║
║           Testing: Mistral Agents API code_interpreter       ║
╚══════════════════════════════════════════════════════════════╝
`);

  const prisma = createPrismaClient();
  const results: TestResult[] = [];

  // Get test user
  const user = await prisma.user.findFirst({
    include: { userPreferences: true },
  });
  if (!user) {
    console.error('No user found in database');
    await prisma.$disconnect();
    return;
  }

  console.log('User Profile:');
  console.log(`   Name: ${user.firstName} ${user.lastName}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Tenant: ${user.tenantId}`);
  console.log();

  // Bootstrap NestJS
  console.log('Starting Analytics Service...\n');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const analyticsService = app.get(AnalyticsService);

  // Clear cache to force fresh API calls
  console.log('Clearing analytics cache to force fresh Mistral API calls...');
  clearAnalyticsCache();
  clearAnalyticsAgentPool();
  console.log('Cache cleared!\n');

  // Fetch REAL email data from database for analysis
  // Exclude SPAM and TRASH - they're junk and shouldn't be in analytics
  console.log('Fetching real email data from database (excluding SPAM/TRASH)...');
  const emails = await prisma.email.findMany({
    where: {
      tenantId: user.tenantId,
      folder: { notIn: ['SPAM', 'TRASH'] },
    },
    select: {
      id: true,
      subject: true,
      from: true,
      folder: true,
      isRead: true,
      receivedAt: true,
    },
    orderBy: { receivedAt: 'desc' },
    take: 100, // Last 100 emails for analysis
  });

  // Aggregate data for AI analysis
  const emailsByFolder: Record<string, number> = {};
  const emailsByDay: Record<string, number> = {};
  const emailsByHour: Record<string, number> = {};
  let unreadCount = 0;

  for (const email of emails) {
    // By folder
    emailsByFolder[email.folder] = (emailsByFolder[email.folder] || 0) + 1;

    // By day of week
    const dayName = email.receivedAt.toLocaleDateString('en', { weekday: 'short' });
    emailsByDay[dayName] = (emailsByDay[dayName] || 0) + 1;

    // By hour
    const hour = email.receivedAt.getHours();
    const hourKey = `${hour.toString().padStart(2, '0')}:00`;
    emailsByHour[hourKey] = (emailsByHour[hourKey] || 0) + 1;

    if (!email.isRead) unreadCount++;
  }

  const realEmailData = {
    totalEmails: emails.length,
    unreadCount,
    emailsByFolder,
    emailsByDay,
    emailsByHour,
    recentSubjects: emails.slice(0, 10).map((e) => e.subject?.substring(0, 50) || 'No subject'),
  };

  console.log('Real email data aggregated:');
  console.log(`  Total: ${realEmailData.totalEmails} emails`);
  console.log(`  Unread: ${realEmailData.unreadCount}`);
  console.log(`  Folders: ${Object.keys(emailsByFolder).join(', ')}`);
  console.log();

  // Define test cases
  const testCases = [
    {
      name: 'Dashboard Analytics',
      fn: async () => {
        return analyticsService.getDashboardAnalytics(user.tenantId, user.id);
      },
      execute: true,
    },
    {
      name: 'Email Analytics (7 days)',
      fn: async () => {
        return analyticsService.getEmailAnalytics(user.tenantId, user.id, 'week');
      },
      execute: true,
    },
    {
      name: 'Email Analytics (30 days)',
      fn: async () => {
        return analyticsService.getEmailAnalytics(user.tenantId, user.id, 'month');
      },
      execute: true,
    },
    {
      name: 'AI Analytics - Real Email Volume (Mistral code_interpreter)',
      fn: async () => {
        return analyticsService.runAiAnalytics(
          user.tenantId,
          user.id,
          'Analyze email distribution by folder and day of week. Create a summary with key insights.',
          realEmailData,
          'en',
        );
      },
      execute: true,
    },
    {
      name: 'AI Analytics - Peak Hours Analysis',
      fn: async () => {
        return analyticsService.runAiAnalytics(
          user.tenantId,
          user.id,
          'Analyze when emails arrive most frequently (by hour). Identify peak email hours and suggest best times to check email.',
          { emailsByHour: realEmailData.emailsByHour, totalEmails: realEmailData.totalEmails },
          'en',
        );
      },
      execute: true,
    },
    {
      name: 'AI Analytics - Italian (Analisi email)',
      fn: async () => {
        return analyticsService.runAiAnalytics(
          user.tenantId,
          user.id,
          'Analizza la distribuzione delle email per cartella. Fornisci un riepilogo con i principali insight.',
          { emailsByFolder: realEmailData.emailsByFolder, unreadCount: realEmailData.unreadCount },
          'it',
        );
      },
      execute: true,
    },
    {
      name: 'Cache Hit Test (should be fast)',
      fn: async () => {
        // Should hit cache from first AI call
        return analyticsService.runAiAnalytics(
          user.tenantId,
          user.id,
          'Analyze email distribution by folder and day of week. Create a summary with key insights.',
          realEmailData,
          'en',
        );
      },
      execute: true,
    },
  ];

  console.log(`${'═'.repeat(60)}`);
  console.log('ANALYTICS TESTS');
  console.log(`${'─'.repeat(60)}\n`);

  for (const test of testCases) {
    console.log(`Testing: ${test.name}`);

    if (!test.execute) {
      console.log(`   SKIPPED`);
      results.push({
        name: test.name,
        status: 'skipped',
        duration: 0,
      });
      console.log();
      continue;
    }

    try {
      const startTime = Date.now();
      const result = await test.fn();
      const duration = Date.now() - startTime;

      if (result) {
        console.log(`   PASSED (${duration}ms)`);

        // Show summary of result
        if (typeof result === 'object' && result !== null) {
          const r = result as Record<string, unknown>;
          if ('success' in r) {
            console.log(`   Success: ${r.success}`);
          }
          if ('fromCache' in r) {
            console.log(`   From Cache: ${r.fromCache}`);
          }
          if ('answer' in r && typeof r.answer === 'string') {
            console.log(`   Answer: ${r.answer.substring(0, 150)}${r.answer.length > 150 ? '...' : ''}`);
          }
          if ('insights' in r && Array.isArray(r.insights) && r.insights.length > 0) {
            console.log(`   Insights: ${r.insights.length} items`);
          }
          if ('visualization' in r && r.visualization) {
            console.log(`   Visualization: Base64 image generated`);
          }
          if ('chartData' in r) {
            console.log(`   Chart Data: Available for frontend rendering`);
          }
        }

        // Flag slow responses
        if (duration > 30000) {
          console.log(`   SLOW: Analytics taking >30s`);
        }

        results.push({
          name: test.name,
          status: 'passed',
          duration,
          response: result,
        });
      } else {
        console.log(`   No response received`);
        results.push({
          name: test.name,
          status: 'failed',
          duration,
          error: 'No response',
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`   FAILED: ${errorMsg.substring(0, 100)}`);
      results.push({
        name: test.name,
        status: 'failed',
        duration: 0,
        error: errorMsg,
      });
    }

    console.log();
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Rate limiting
  }

  // Summary
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const avgDuration =
    results.filter((r) => r.status === 'passed').reduce((sum, r) => sum + r.duration, 0) / (passed || 1);

  console.log(`${'═'.repeat(60)}`);
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║               ANALYTICS TEST RESULTS                         ║
╚══════════════════════════════════════════════════════════════╝

Statistics:
   Total Tests: ${testCases.length}
   Passed:   ${passed}
   Failed:   ${failed}
   Skipped:  ${skipped}

Performance:
   Average Response: ${(avgDuration / 1000).toFixed(2)}s
   ${avgDuration > 15000 ? 'Analytics operations are slow (>15s average)' : 'Performance acceptable'}

Success Rate: ${((passed / (testCases.length - skipped)) * 100).toFixed(1)}%
`);

  if (failed > 0) {
    console.log('Failed Tests:');
    results.filter((r) => r.status === 'failed').forEach((r) => console.log(`   - ${r.name}: ${r.error}`));
  }

  // Cleanup
  await app.close();
  await prisma.$disconnect();

  console.log('\nAnalytics test completed!');
  process.exit(failed > 0 ? 1 : 0);
}

runAnalyticsTest().catch(console.error);
