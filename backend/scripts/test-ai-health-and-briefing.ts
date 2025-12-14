/**
 * AI Health & Daily Briefing Comprehensive Test
 *
 * Tests the newly implemented features:
 * 1. AI Health Endpoint (`GET /ai/health`) - Public endpoint for monitoring
 * 2. Daily Briefing Service - Pre-computed email summaries
 *
 * Prerequisites:
 * - Running PostgreSQL and Redis
 * - At least one user with emails in the database
 *
 * Usage:
 *   npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-ai-health-and-briefing.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DailyBriefingService } from '../src/modules/ai/voltagent/services/daily-briefing.service';
import { MistralService } from '../src/modules/ai/services/mistral.service';
import { CacheService } from '../src/common/services/cache.service';

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

function logResult(result: TestResult) {
  const icon = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⏭️';
  console.log(`${icon} ${result.name} (${result.duration}ms)`);
  if (result.details) {
    console.log(`   ${result.details}`);
  }
  if (result.error) {
    console.log(`   Error: ${result.error}`);
  }
  results.push(result);
}

async function testHealthEndpointComponents(
  mistralService: MistralService,
  cacheService: CacheService,
): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  PART 1: AI Health Endpoint Components');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Test 1: MistralService circuit breaker
  const start1 = Date.now();
  try {
    const circuitBreaker = mistralService.getCircuitBreakerStatus();
    logResult({
      name: 'MistralService.getCircuitBreakerStatus()',
      status: 'passed',
      duration: Date.now() - start1,
      details: `state=${circuitBreaker.state}, failures=${circuitBreaker.failures}, lastSuccess=${new Date(circuitBreaker.lastSuccess).toISOString()}`,
    });
  } catch (error) {
    logResult({
      name: 'MistralService.getCircuitBreakerStatus()',
      status: 'failed',
      duration: Date.now() - start1,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Test 2: CacheService health check
  const start2 = Date.now();
  try {
    const isHealthy = cacheService.isHealthy();
    logResult({
      name: 'CacheService.isHealthy()',
      status: 'passed',
      duration: Date.now() - start2,
      details: `Redis connected: ${isHealthy}`,
    });
  } catch (error) {
    logResult({
      name: 'CacheService.isHealthy()',
      status: 'failed',
      duration: Date.now() - start2,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Test 3: Simulated health response structure
  const start3 = Date.now();
  try {
    const circuitBreaker = mistralService.getCircuitBreakerStatus();
    const cacheConnected = cacheService.isHealthy();

    const mistralHealthy = circuitBreaker.state === 'closed';
    const mistralDegraded = circuitBreaker.state === 'half-open';

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (mistralHealthy && cacheConnected) {
      overallStatus = 'healthy';
    } else if (circuitBreaker.state === 'open' && !cacheConnected) {
      overallStatus = 'unhealthy';
    } else {
      overallStatus = 'degraded';
    }

    const healthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        mistral: {
          status: mistralHealthy ? 'healthy' : mistralDegraded ? 'degraded' : 'unhealthy',
          circuitBreaker: circuitBreaker.state,
          failures: circuitBreaker.failures,
          lastSuccess: new Date(circuitBreaker.lastSuccess).toISOString(),
        },
        cache: {
          status: cacheConnected ? 'healthy' : 'unhealthy',
          connected: cacheConnected,
        },
      },
    };

    console.log('\n   Simulated /ai/health response:');
    console.log('   ' + JSON.stringify(healthResponse, null, 2).replace(/\n/g, '\n   '));

    logResult({
      name: 'Health endpoint response structure',
      status: 'passed',
      duration: Date.now() - start3,
      details: `Overall status: ${overallStatus}`,
    });
  } catch (error) {
    logResult({
      name: 'Health endpoint response structure',
      status: 'failed',
      duration: Date.now() - start3,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function testDailyBriefingService(
  briefingService: DailyBriefingService,
  tenantId: string,
  userId: string,
): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  PART 2: Daily Briefing Service');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Test 1: Get service status
  const start1 = Date.now();
  try {
    const status = await briefingService.getStatus();
    logResult({
      name: 'DailyBriefingService.getStatus()',
      status: 'passed',
      duration: Date.now() - start1,
      details: `enabled=${status.enabled}, scheduleHour=${status.scheduleHour}, batchSize=${status.batchSize}`,
    });

    if (status.queueStats) {
      console.log(`   Queue stats: waiting=${status.queueStats.waiting}, active=${status.queueStats.active}, completed=${status.queueStats.completed}`);
    }
  } catch (error) {
    logResult({
      name: 'DailyBriefingService.getStatus()',
      status: 'failed',
      duration: Date.now() - start1,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Test 2: Check for cached briefing
  const start2 = Date.now();
  try {
    const cachedBriefing = await briefingService.getBriefing(tenantId, userId);
    if (cachedBriefing) {
      logResult({
        name: 'DailyBriefingService.getBriefing() - cached',
        status: 'passed',
        duration: Date.now() - start2,
        details: `Found cached briefing from ${cachedBriefing.generatedAt}`,
      });
      console.log(`   Summary: ${cachedBriefing.summary.substring(0, 100)}...`);
      console.log(`   Stats: unread=${cachedBriefing.stats.totalUnread}, newToday=${cachedBriefing.stats.newToday}`);
    } else {
      logResult({
        name: 'DailyBriefingService.getBriefing() - cached',
        status: 'passed',
        duration: Date.now() - start2,
        details: 'No cached briefing found (expected for first run)',
      });
    }
  } catch (error) {
    logResult({
      name: 'DailyBriefingService.getBriefing() - cached',
      status: 'failed',
      duration: Date.now() - start2,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Test 3: Generate on-demand briefing
  const start3 = Date.now();
  try {
    console.log('\n   Generating on-demand briefing (may take 5-15 seconds)...');
    const briefing = await briefingService.generateBriefingOnDemand(tenantId, userId);

    logResult({
      name: 'DailyBriefingService.generateBriefingOnDemand()',
      status: 'passed',
      duration: Date.now() - start3,
      details: `Generated briefing valid until ${briefing.validUntil}`,
    });

    console.log('\n   === BRIEFING CONTENT ===');
    console.log(`   Summary: ${briefing.summary}`);
    console.log(`   Stats:`);
    console.log(`     - Total unread: ${briefing.stats.totalUnread}`);
    console.log(`     - New today: ${briefing.stats.newToday}`);
    console.log(`     - Requires response: ${briefing.stats.requiresResponse}`);

    if (briefing.highlights.length > 0) {
      console.log(`   Highlights:`);
      briefing.highlights.forEach((h, i) => console.log(`     ${i + 1}. ${h}`));
    }

    if (briefing.urgent.length > 0) {
      console.log(`   Urgent items:`);
      briefing.urgent.forEach((u, i) => console.log(`     ${i + 1}. ${u}`));
    }
  } catch (error) {
    logResult({
      name: 'DailyBriefingService.generateBriefingOnDemand()',
      status: 'failed',
      duration: Date.now() - start3,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Test 4: Verify briefing is now cached
  const start4 = Date.now();
  try {
    const cachedBriefing = await briefingService.getBriefing(tenantId, userId);
    if (cachedBriefing) {
      logResult({
        name: 'Verify briefing cached after generation',
        status: 'passed',
        duration: Date.now() - start4,
        details: `Cached briefing retrieved successfully`,
      });
    } else {
      logResult({
        name: 'Verify briefing cached after generation',
        status: 'failed',
        duration: Date.now() - start4,
        details: 'Briefing was not cached (Redis may be unavailable)',
      });
    }
  } catch (error) {
    logResult({
      name: 'Verify briefing cached after generation',
      status: 'failed',
      duration: Date.now() - start4,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║      AI Health & Daily Briefing Comprehensive Test               ║
║      Testing: Health endpoint + Daily briefing service           ║
╚══════════════════════════════════════════════════════════════════╝
`);

  const prisma = createPrismaClient();

  // Get test user
  const user = await prisma.user.findFirst({
    where: { isActive: true },
    include: { userPreferences: true },
  });

  if (!user) {
    console.error('❌ No active user found in database');
    await prisma.$disconnect();
    process.exit(1);
  }

  // Get email stats for context
  const emailCount = await prisma.email.count({
    where: { tenantId: user.tenantId },
  });

  const unreadCount = await prisma.email.count({
    where: { tenantId: user.tenantId, isRead: false },
  });

  console.log('📧 Test Context:');
  console.log(`   User: ${user.firstName} ${user.lastName} (${user.email})`);
  console.log(`   Tenant: ${user.tenantId}`);
  console.log(`   Timezone: ${user.userPreferences?.timezone || 'UTC (default)'}`);
  console.log(`   Total emails: ${emailCount}`);
  console.log(`   Unread emails: ${unreadCount}`);

  // Bootstrap NestJS
  console.log('\n🚀 Starting application context...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const mistralService = app.get(MistralService);
  const cacheService = app.get(CacheService);
  const briefingService = app.get(DailyBriefingService);

  try {
    // Run tests
    await testHealthEndpointComponents(mistralService, cacheService);
    await testDailyBriefingService(briefingService, user.tenantId, user.id);

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const passed = results.filter((r) => r.status === 'passed').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`   Total tests: ${results.length}`);
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   ⏭️ Skipped: ${skipped}`);
    console.log(`   ⏱️ Total duration: ${totalDuration}ms`);

    if (failed > 0) {
      console.log('\n   Failed tests:');
      results
        .filter((r) => r.status === 'failed')
        .forEach((r) => console.log(`   - ${r.name}: ${r.error}`));
    }

    console.log(`\n${failed === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}\n`);

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch(console.error);
