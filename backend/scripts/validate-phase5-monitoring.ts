/**
 * Phase 5 Validation Script: Monitoring & Observability
 *
 * Checks implementation status:
 * - 5.1: ResilienceService metrics endpoints
 * - 5.2: Alerting thresholds
 *
 * Usage:
 *   cd backend
 *   npx ts-node ./scripts/validate-phase5-monitoring.ts
 */
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: string;
}

const results: TestResult[] = [];
const BACKEND_ROOT = path.resolve(__dirname, '..');

// ========================================
// 5.1: ResilienceService Metrics Endpoints
// ========================================
async function test51Metrics(): Promise<void> {
  const testName = '5.1: ResilienceService Metrics Endpoints';
  const start = Date.now();

  try {
    // Check for resilience controller
    const controllersDir = path.join(BACKEND_ROOT, 'src/modules/email-sync/controllers');
    const expectedController = path.join(controllersDir, 'resilience.controller.ts');

    const hasController = fs.existsSync(expectedController);

    // Check for metrics in resilience.service.ts
    const resilienceService = path.join(
      BACKEND_ROOT,
      'src/modules/email-sync/drivers/resilience/resilience.service.ts',
    );
    const content = fs.readFileSync(resilienceService, 'utf-8');

    // These methods exist but are not exposed via API
    const metricsMethod = content.includes('getAllCircuitStatus') || content.includes('getAllRateLimitStatus');

    if (hasController) {
      results.push({
        name: testName,
        passed: true,
        duration: Date.now() - start,
        details: 'Resilience controller exists with metrics endpoints',
      });
    } else if (metricsMethod) {
      results.push({
        name: testName,
        passed: false,
        duration: Date.now() - start,
        details: 'ResilienceService has metrics methods but no API controller. Need to implement /api/v1/email-sync/resilience/* endpoints',
      });
    } else {
      results.push({
        name: testName,
        passed: false,
        duration: Date.now() - start,
        details: 'No metrics implementation found. Phase 5.1 not started.',
      });
    }
  } catch (error) {
    results.push({
      name: testName,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ========================================
// 5.2: Alerting Thresholds
// ========================================
async function test52Alerting(): Promise<void> {
  const testName = '5.2: Alerting Thresholds';
  const start = Date.now();

  try {
    // Check for alerting service or configuration
    const alertingPatterns = [
      'AlertService',
      'alerting',
      'ALERT_THRESHOLD',
      'queue utilization',
      'circuit breaker.*alert',
    ];

    // Search in key files
    const filesToCheck = [
      'src/modules/email-sync/services/queue.service.ts',
      'src/modules/email-sync/drivers/resilience/resilience.service.ts',
      'src/common/services/queue-health.service.ts',
    ];

    let foundAlerting = false;
    const foundIn: string[] = [];

    for (const file of filesToCheck) {
      const filePath = path.join(BACKEND_ROOT, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const pattern of alertingPatterns) {
          if (new RegExp(pattern, 'i').test(content)) {
            foundAlerting = true;
            foundIn.push(path.basename(file));
            break;
          }
        }
      }
    }

    if (foundAlerting) {
      results.push({
        name: testName,
        passed: true,
        duration: Date.now() - start,
        details: `Alerting logic found in: ${[...new Set(foundIn)].join(', ')}`,
      });
    } else {
      results.push({
        name: testName,
        passed: false,
        duration: Date.now() - start,
        details: 'No alerting thresholds implemented. Phase 5.2 not started. Need to add alerts for: queue utilization > 80%, circuit breaker trips, degraded mode > 5min',
      });
    }
  } catch (error) {
    results.push({
      name: testName,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ========================================
// Check Health Endpoints Exist
// ========================================
async function testHealthEndpoints(): Promise<void> {
  const testName = 'Health Endpoints (Prerequisite)';
  const start = Date.now();

  try {
    const healthServicePath = path.join(BACKEND_ROOT, 'src/common/services/queue-health.service.ts');

    if (fs.existsSync(healthServicePath)) {
      const content = fs.readFileSync(healthServicePath, 'utf-8');
      const hasHealthCheck = content.includes('checkQueueHealth') || content.includes('checkRedisHealth');

      results.push({
        name: testName,
        passed: true,
        duration: Date.now() - start,
        details: hasHealthCheck
          ? 'Queue health service exists with health check methods'
          : 'Queue health service exists but may need additional methods',
      });
    } else {
      results.push({
        name: testName,
        passed: false,
        duration: Date.now() - start,
        details: 'Queue health service not found',
      });
    }
  } catch (error) {
    results.push({
      name: testName,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ========================================
// Main
// ========================================
async function main() {
  console.log('='.repeat(60));
  console.log('Phase 5 Validation: Monitoring & Observability');
  console.log('='.repeat(60));
  console.log('Checking monitoring implementation status\n');

  // Run all tests
  await testHealthEndpoints();
  await test51Metrics();
  await test52Alerting();

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60) + '\n');

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const status = result.passed ? '✅ PASS' : '⚠️  TODO';
    console.log(`${status} ${result.name} (${result.duration}ms)`);
    if (result.details) {
      console.log(`       ${result.details}`);
    }
    if (result.error) {
      console.log(`       Error: ${result.error}`);
    }
    result.passed ? passed++ : failed++;
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`Total: ${passed} implemented, ${failed} pending`);
  console.log('-'.repeat(60));

  if (failed > 0) {
    console.log('\n⚠️  PHASE 5 PARTIALLY IMPLEMENTED');
    console.log('Some monitoring features need implementation.');
    console.log('This is optional for production but recommended for observability.');
  } else {
    console.log('\n✅ PHASE 5 VALIDATION PASSED');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
