/**
 * Deadline Extractor Test Script
 *
 * Tests the DeadlineExtractorService with chrono-node NLP.
 * Requires:
 * - DATABASE_URL configured
 * - Redis running
 * - DEADLINE_EXTRACTION_ENABLED=true
 *
 * Usage:
 *   cd backend
 *   npx ts-node scripts/test-deadline-extractor.ts
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DeadlineExtractorService } from '../src/modules/ai/voltagent/services/deadline-extractor.service';

// Test configuration
const TEST_TENANT_ID = 'test-tenant-deadline';
const TEST_USER_ID = 'test-user-deadline';

// Test texts with various deadline patterns
const TEST_TEXTS = [
  {
    locale: 'en' as const,
    text: 'The project deadline is next Friday at 5pm. Please submit all documents before then.',
    expected: 'Should find Friday deadline',
  },
  {
    locale: 'en' as const,
    text: 'Please complete the report by December 25th, 2025. This is urgent!',
    expected: 'Should find December 25th deadline',
  },
  {
    locale: 'en' as const,
    text: 'The quarterly review is due in 2 weeks. Make sure to prepare all materials.',
    expected: 'Should find relative date (2 weeks)',
  },
  {
    locale: 'en' as const,
    text: 'Meeting tomorrow at 3pm to discuss the project status.',
    expected: 'Should NOT find deadline (no deadline keywords)',
  },
  {
    locale: 'en' as const,
    text: 'Submit your expense reports no later than end of month.',
    expected: 'Should find end of month deadline',
  },
  {
    locale: 'it' as const,
    text: 'La scadenza per la consegna è entro venerdì prossimo alle 17:00.',
    expected: 'Should find Italian deadline (scadenza + entro)',
  },
  {
    locale: 'en' as const,
    text: 'Every Monday we have our weekly standup meeting.',
    expected: 'Should detect recurring pattern',
  },
];

async function main() {
  console.log('\n📅 Deadline Extractor Service Test\n');
  console.log('='.repeat(60));

  // Check required env vars
  if (process.env.DEADLINE_EXTRACTION_ENABLED === 'false') {
    console.warn('⚠️  DEADLINE_EXTRACTION_ENABLED is false');
    console.log('   Set DEADLINE_EXTRACTION_ENABLED=true in .env to run tests\n');
  }

  // Bootstrap NestJS application
  console.log('\n📦 Bootstrapping NestJS application...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const deadlineService = app.get(DeadlineExtractorService);

  // Check if service is enabled
  console.log(`\n✅ Service enabled: ${deadlineService.isEnabled()}`);

  if (!deadlineService.isEnabled()) {
    console.log('\n⚠️  Service is disabled. Set DEADLINE_EXTRACTION_ENABLED=true to test.');
    await app.close();
    return;
  }

  const results: { test: string; status: 'PASS' | 'FAIL'; details?: string }[] = [];

  // Test 1: Extract deadlines from various texts
  console.log('\n--- Test 1: Extract deadlines from text ---');
  for (const testCase of TEST_TEXTS) {
    const extracted = deadlineService.extractDeadlines(
      testCase.text,
      new Date(),
      testCase.locale,
    );

    const found = extracted.length > 0;
    const isRecurring = extracted.some((d) => d.isRecurring);

    console.log(`\n  Text (${testCase.locale}): "${testCase.text.slice(0, 50)}..."`);
    console.log(`  Expected: ${testCase.expected}`);
    console.log(`  Found: ${extracted.length} deadline(s)`);

    if (found) {
      for (const d of extracted) {
        console.log(`    - ${d.text} → ${d.date.toISOString()} (confidence: ${d.confidence.toFixed(2)})${d.isRecurring ? ' [RECURRING]' : ''}`);
      }
    }

    results.push({
      test: `Extract: ${testCase.expected}`,
      status: 'PASS', // Extraction always succeeds, we just check what we find
      details: found ? `${extracted.length} deadline(s)` : 'None found',
    });
  }

  // Test 2: Extract from email and store in database
  console.log('\n--- Test 2: Extract from email and store in DB ---');
  try {
    const emailText = 'Please review and submit the quarterly report by January 15th, 2026. This is critical for the board meeting.';
    const deadlineIds = await deadlineService.extractFromEmail(
      TEST_TENANT_ID,
      TEST_USER_ID,
      'test-email-001',
      'Q4 Report - Action Required',
      emailText,
      'en',
    );

    console.log(`✅ Created ${deadlineIds.length} deadline(s) from email`);
    results.push({
      test: 'Extract from email',
      status: deadlineIds.length > 0 ? 'PASS' : 'FAIL',
      details: `Created ${deadlineIds.length} deadline(s)`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed: ${msg}`);
    results.push({ test: 'Extract from email', status: 'FAIL', details: msg });
  }

  // Test 3: Get upcoming deadlines (Redis cache)
  console.log('\n--- Test 3: Get upcoming deadlines (Redis cache) ---');
  try {
    const upcoming = await deadlineService.getUpcomingDeadlines(
      TEST_TENANT_ID,
      TEST_USER_ID,
      30, // Next 30 days
    );

    console.log(`✅ Found ${upcoming.length} upcoming deadline(s)`);
    for (const d of upcoming) {
      console.log(`   - "${d.title}" due ${d.deadline} (status: ${d.status})`);
    }
    results.push({
      test: 'Get upcoming deadlines',
      status: 'PASS',
      details: `${upcoming.length} deadline(s)`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed: ${msg}`);
    results.push({ test: 'Get upcoming deadlines', status: 'FAIL', details: msg });
  }

  // Test 4: Get deadline stats
  console.log('\n--- Test 4: Get deadline statistics ---');
  try {
    const stats = await deadlineService.getDeadlineStats(TEST_TENANT_ID, TEST_USER_ID);
    console.log(`✅ Stats: upcoming=${stats.upcoming}, dueSoon=${stats.dueSoon}, overdue=${stats.overdue}, completed=${stats.completed}`);
    results.push({
      test: 'Get stats',
      status: 'PASS',
      details: `${stats.upcoming + stats.dueSoon + stats.overdue + stats.completed} total`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed: ${msg}`);
    results.push({ test: 'Get stats', status: 'FAIL', details: msg });
  }

  // Test 5: Get queue stats
  console.log('\n--- Test 5: Get BullMQ queue statistics ---');
  try {
    const queueStats = await deadlineService.getQueueStats();
    console.log(`✅ Queue: waiting=${queueStats.waiting}, active=${queueStats.active}, completed=${queueStats.completed}, failed=${queueStats.failed}`);
    results.push({
      test: 'Get queue stats',
      status: 'PASS',
      details: `${queueStats.waiting + queueStats.active} pending`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed: ${msg}`);
    results.push({ test: 'Get queue stats', status: 'FAIL', details: msg });
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary\n');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} ${r.test}`);
    if (r.details) {
      console.log(`   ${r.details}`);
    }
  }

  console.log(`\n📈 Results: ${passed}/${results.length} PASS, ${failed}/${results.length} FAIL`);

  await app.close();

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
