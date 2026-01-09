#!/usr/bin/env ts-node
/**
 * @deprecated DEPRECATED - 2025-01-09
 *
 * This test file is OBSOLETE and will not run.
 *
 * REASON: The multi-agent architecture was completely replaced with VoltAgent.
 * - Old architecture: class-based agents (RouterAgent, GeneralAgent, etc.)
 * - New architecture: factory functions (createSupervisorAgent, createEmailAgent, etc.)
 * - Module path changed: src/modules/ai/multi-agent -> src/modules/ai/voltagent
 *
 * For stress testing, use these alternatives:
 * - test-prisma-retry.ts - Tests database retry under concurrent load
 * - test-contact-rag-isolation.ts - Tests tenant isolation in RAG
 * - stress-test-atomic-sync.ts - Tests folder sync under concurrent load
 *
 * TODO: Create new stress test using VoltAgent architecture if needed.
 *
 * Original description:
 * Multi-Tenant Stress Test for Multi-Agent System
 *
 * Tests scalability and robustness under load:
 * - Simulates multiple tenants (default: 10)
 * - Simulates multiple users per tenant (default: 100 each = 1000 total)
 * - Concurrent requests with controlled parallelism
 * - Measures: latency, throughput, error rate, p50/p95/p99
 * - Validates multi-tenant isolation
 *
 * Usage:
 *   npx ts-node scripts/stress-test-multi-tenant.ts
 *   npx ts-node scripts/stress-test-multi-tenant.ts --tenants=20 --users=50 --concurrency=50
 */

console.log('DEPRECATED: This test uses obsolete multi-agent architecture.');
console.log('The VoltAgent architecture replaced it. See file header for alternatives.');
process.exit(0);

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { ConfigService } from '@nestjs/config';
import { RouterAgent } from '../src/modules/ai/multi-agent/agents/router.agent';
import { GeneralAgent } from '../src/modules/ai/multi-agent/agents/general.agent';
import { EmailAgent } from '../src/modules/ai/multi-agent/agents/email.agent';
import { CalendarAgent } from '../src/modules/ai/multi-agent/agents/calendar.agent';
import { ContactsAgent } from '../src/modules/ai/multi-agent/agents/contacts.agent';
import { AgentContext, AgentIntent } from '../src/modules/ai/multi-agent/interfaces/agent-context.interface';

// =============================================================================
// CONFIGURATION
// =============================================================================

interface StressTestConfig {
  numTenants: number;
  usersPerTenant: number;
  maxConcurrency: number;
  requestsPerUser: number;
  warmupRequests: number;
  realTenantId?: string;
}

// Parse command line args
function parseArgs(): StressTestConfig {
  const args = process.argv.slice(2);
  const config: StressTestConfig = {
    numTenants: 10,
    usersPerTenant: 100,
    maxConcurrency: 20,
    requestsPerUser: 1,
    warmupRequests: 5,
    realTenantId: 'cmi31xyel0000yhukbwp6l714',
  };

  for (const arg of args) {
    const [key, value] = arg.replace('--', '').split('=');
    switch (key) {
      case 'tenants':
        config.numTenants = parseInt(value, 10);
        break;
      case 'users':
        config.usersPerTenant = parseInt(value, 10);
        break;
      case 'concurrency':
        config.maxConcurrency = parseInt(value, 10);
        break;
      case 'requests':
        config.requestsPerUser = parseInt(value, 10);
        break;
    }
  }

  return config;
}

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

// =============================================================================
// MOCK CONFIG SERVICE
// =============================================================================

const mockConfigService = {
  get: (key: string) => {
    const config: Record<string, string | undefined> = {
      MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
      AI_DEFAULT_MODEL: process.env.AI_DEFAULT_MODEL || 'mistral-small-latest',
    };
    return config[key];
  },
} as unknown as ConfigService;

// =============================================================================
// TEST SCENARIOS
// =============================================================================

interface TestScenario {
  name: string;
  message: string;
  language: 'en' | 'it';
  expectedIntent: AgentIntent;
  agent: 'general' | 'email' | 'calendar' | 'contacts';
}

const scenarios: TestScenario[] = [
  { name: 'Greeting EN', message: 'Hello, what can you help me with?', language: 'en', expectedIntent: AgentIntent.GENERAL, agent: 'general' },
  { name: 'Greeting IT', message: 'Ciao, cosa puoi fare per me?', language: 'it', expectedIntent: AgentIntent.GENERAL, agent: 'general' },
  { name: 'Email EN', message: 'Send an email to my team', language: 'en', expectedIntent: AgentIntent.EMAIL, agent: 'email' },
  { name: 'Email IT', message: 'Invia una email al mio team', language: 'it', expectedIntent: AgentIntent.EMAIL, agent: 'email' },
  { name: 'Calendar EN', message: 'Schedule a meeting tomorrow', language: 'en', expectedIntent: AgentIntent.CALENDAR, agent: 'calendar' },
  { name: 'Calendar IT', message: 'Programma una riunione domani', language: 'it', expectedIntent: AgentIntent.CALENDAR, agent: 'calendar' },
  { name: 'Contacts EN', message: 'Find contact John', language: 'en', expectedIntent: AgentIntent.CONTACTS, agent: 'contacts' },
  { name: 'Contacts IT', message: 'Trova contatto Giovanni', language: 'it', expectedIntent: AgentIntent.CONTACTS, agent: 'contacts' },
];

// =============================================================================
// METRICS TRACKING
// =============================================================================

interface RequestMetrics {
  tenantId: string;
  userId: string;
  scenario: string;
  success: boolean;
  latencyMs: number;
  timestamp: number;
  error?: string;
}

class MetricsCollector {
  private metrics: RequestMetrics[] = [];
  private startTime: number = 0;
  private completedRequests = 0;
  private totalRequests = 0;

  start(totalRequests: number) {
    this.startTime = Date.now();
    this.totalRequests = totalRequests;
    this.completedRequests = 0;
  }

  record(metric: RequestMetrics) {
    this.metrics.push(metric);
    this.completedRequests++;

    // Progress indicator every 50 requests
    if (this.completedRequests % 50 === 0 || this.completedRequests === this.totalRequests) {
      const progress = ((this.completedRequests / this.totalRequests) * 100).toFixed(1);
      const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
      const rps = (this.completedRequests / (Date.now() - this.startTime) * 1000).toFixed(2);
      process.stdout.write(`\r  Progress: ${progress}% (${this.completedRequests}/${this.totalRequests}) | ${elapsed}s | ${rps} req/s    `);
    }
  }

  getReport() {
    const totalDuration = Date.now() - this.startTime;
    const successful = this.metrics.filter(m => m.success);
    const failed = this.metrics.filter(m => !m.success);

    // Latency statistics
    const latencies = successful.map(m => m.latencyMs).sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
    const avg = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const min = latencies[0] || 0;
    const max = latencies[latencies.length - 1] || 0;

    // Per-tenant breakdown
    const byTenant = new Map<string, RequestMetrics[]>();
    for (const m of this.metrics) {
      const list = byTenant.get(m.tenantId) || [];
      list.push(m);
      byTenant.set(m.tenantId, list);
    }

    // Per-scenario breakdown
    const byScenario = new Map<string, RequestMetrics[]>();
    for (const m of this.metrics) {
      const list = byScenario.get(m.scenario) || [];
      list.push(m);
      byScenario.set(m.scenario, list);
    }

    return {
      totalRequests: this.metrics.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      errorRate: ((failed.length / this.metrics.length) * 100).toFixed(2),
      totalDurationMs: totalDuration,
      throughput: ((this.metrics.length / totalDuration) * 1000).toFixed(2),
      latency: { min, max, avg: avg.toFixed(0), p50, p95, p99 },
      byTenant,
      byScenario,
      errors: failed.slice(0, 10).map(f => ({ tenant: f.tenantId, user: f.userId, error: f.error })),
    };
  }
}

// =============================================================================
// CONCURRENT EXECUTION
// =============================================================================

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  maxConcurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (const task of tasks) {
    const p = task().then(result => {
      results.push(result);
    });
    executing.push(p);

    if (executing.length >= maxConcurrency) {
      await Promise.race(executing);
      // Remove completed promises
      for (let i = executing.length - 1; i >= 0; i--) {
        const status = await Promise.race([executing[i].then(() => 'done'), Promise.resolve('pending')]);
        if (status === 'done') {
          executing.splice(i, 1);
        }
      }
    }
  }

  await Promise.all(executing);
  return results;
}

// =============================================================================
// TEST EXECUTION
// =============================================================================

async function runStressTest(config: StressTestConfig) {
  log('\n' + '█'.repeat(80), colors.magenta);
  log('  MULTI-TENANT STRESS TEST', colors.bright + colors.magenta);
  log('█'.repeat(80), colors.magenta);

  // Validate API key
  if (!process.env.MISTRAL_API_KEY) {
    log('\n✗ MISTRAL_API_KEY not set', colors.red);
    process.exit(1);
  }

  // Display configuration
  const totalUsers = config.numTenants * config.usersPerTenant;
  const totalRequests = totalUsers * config.requestsPerUser;

  console.log('\n  Configuration:');
  log(`    Tenants: ${config.numTenants}`, colors.cyan);
  log(`    Users per tenant: ${config.usersPerTenant}`, colors.cyan);
  log(`    Total simulated users: ${totalUsers}`, colors.cyan);
  log(`    Requests per user: ${config.requestsPerUser}`, colors.cyan);
  log(`    Total requests: ${totalRequests}`, colors.cyan);
  log(`    Max concurrency: ${config.maxConcurrency}`, colors.cyan);

  // Initialize agents
  console.log('\n  Initializing agents...');
  const routerAgent = new RouterAgent(mockConfigService);
  const generalAgent = new GeneralAgent(mockConfigService);
  const emailAgent = new EmailAgent(mockConfigService);
  const calendarAgent = new CalendarAgent(mockConfigService);
  const contactsAgent = new ContactsAgent(mockConfigService);

  const agents = {
    general: generalAgent,
    email: emailAgent,
    calendar: calendarAgent,
    contacts: contactsAgent,
  };

  log('  ✓ Agents initialized', colors.green);

  // Warmup
  console.log('\n  Warming up (first few requests may be slower)...');
  for (let i = 0; i < config.warmupRequests; i++) {
    const scenario = scenarios[i % scenarios.length];
    const context: AgentContext = {
      tenantId: 'warmup-tenant',
      userId: 'warmup-user',
      userMessage: scenario.message,
      preferences: { language: scenario.language },
      enrichedContext: { relevantEmails: [], relevantEvents: [], relevantContacts: [] },
    };
    await routerAgent.classifyIntent(context);
  }
  log('  ✓ Warmup complete', colors.green);

  // Generate test tasks
  console.log('\n  Generating test tasks...');
  const metrics = new MetricsCollector();
  const tasks: (() => Promise<RequestMetrics>)[] = [];

  for (let t = 0; t < config.numTenants; t++) {
    const tenantId = t === 0 && config.realTenantId ? config.realTenantId : `stress-tenant-${t.toString().padStart(4, '0')}`;

    for (let u = 0; u < config.usersPerTenant; u++) {
      const userId = `user-${u.toString().padStart(5, '0')}`;

      for (let r = 0; r < config.requestsPerUser; r++) {
        const scenario = scenarios[(t + u + r) % scenarios.length];

        tasks.push(async () => {
          const context: AgentContext = {
            tenantId,
            userId,
            userMessage: scenario.message,
            preferences: { language: scenario.language },
            enrichedContext: { relevantEmails: [], relevantEvents: [], relevantContacts: [] },
          };

          const startTime = Date.now();
          let success = false;
          let error: string | undefined;

          try {
            // First classify intent
            const intentResult = await routerAgent.classifyIntent(context);

            // Then process with appropriate agent
            const agent = agents[scenario.agent];
            await agent.process(context);

            // Validate intent classification
            if (intentResult.intent === scenario.expectedIntent) {
              success = true;
            } else {
              error = `Intent mismatch: expected ${scenario.expectedIntent}, got ${intentResult.intent}`;
            }
          } catch (err) {
            error = err instanceof Error ? err.message : String(err);
          }

          const metric: RequestMetrics = {
            tenantId,
            userId,
            scenario: scenario.name,
            success,
            latencyMs: Date.now() - startTime,
            timestamp: Date.now(),
            error,
          };

          metrics.record(metric);
          return metric;
        });
      }
    }
  }

  log(`  ✓ Generated ${tasks.length} tasks`, colors.green);

  // Execute stress test
  console.log('\n  Running stress test...\n');
  metrics.start(tasks.length);

  await runWithConcurrency(tasks, config.maxConcurrency);

  console.log('\n');

  // Generate report
  const report = metrics.getReport();

  console.log('\n' + '='.repeat(80));
  log('  STRESS TEST RESULTS', colors.bright + colors.cyan);
  console.log('='.repeat(80));

  // Overall metrics
  console.log('\n  Overall Metrics:');
  log(`    Total Requests: ${report.totalRequests}`, colors.cyan);
  log(`    Successful: ${report.successfulRequests}`, colors.green);
  log(`    Failed: ${report.failedRequests}`, report.failedRequests > 0 ? colors.red : colors.green);
  log(`    Error Rate: ${report.errorRate}%`, parseFloat(report.errorRate) > 5 ? colors.red : colors.green);
  log(`    Duration: ${(report.totalDurationMs / 1000).toFixed(2)}s`, colors.cyan);
  log(`    Throughput: ${report.throughput} req/s`, colors.cyan);

  // Latency breakdown
  console.log('\n  Latency (ms):');
  log(`    Min: ${report.latency.min}`, colors.cyan);
  log(`    Avg: ${report.latency.avg}`, colors.cyan);
  log(`    P50: ${report.latency.p50}`, colors.cyan);
  log(`    P95: ${report.latency.p95}`, report.latency.p95 > 5000 ? colors.yellow : colors.cyan);
  log(`    P99: ${report.latency.p99}`, report.latency.p99 > 10000 ? colors.red : colors.cyan);
  log(`    Max: ${report.latency.max}`, colors.cyan);

  // Per-tenant breakdown (sample)
  console.log('\n  Per-Tenant Sample (first 5):');
  let tenantCount = 0;
  for (const [tenantId, tenantMetrics] of report.byTenant) {
    if (tenantCount++ >= 5) break;
    const success = tenantMetrics.filter(m => m.success).length;
    const avgLatency = tenantMetrics.reduce((a, m) => a + m.latencyMs, 0) / tenantMetrics.length;
    log(`    ${tenantId}: ${success}/${tenantMetrics.length} (${avgLatency.toFixed(0)}ms avg)`, success === tenantMetrics.length ? colors.green : colors.yellow);
  }

  // Per-scenario breakdown
  console.log('\n  Per-Scenario Breakdown:');
  for (const [scenarioName, scenarioMetrics] of report.byScenario) {
    const success = scenarioMetrics.filter(m => m.success).length;
    const avgLatency = scenarioMetrics.reduce((a, m) => a + m.latencyMs, 0) / scenarioMetrics.length;
    log(`    ${scenarioName}: ${success}/${scenarioMetrics.length} (${avgLatency.toFixed(0)}ms avg)`, success === scenarioMetrics.length ? colors.green : colors.yellow);
  }

  // Errors (if any)
  if (report.errors.length > 0) {
    console.log('\n  Sample Errors:');
    for (const err of report.errors) {
      log(`    ${err.tenant}/${err.user}: ${err.error}`, colors.red);
    }
  }

  // Summary
  console.log('\n' + '-'.repeat(80));
  const passRate = (report.successfulRequests / report.totalRequests) * 100;
  if (passRate >= 99) {
    log(`  ✓ STRESS TEST PASSED - ${passRate.toFixed(2)}% success rate`, colors.bright + colors.green);
  } else if (passRate >= 95) {
    log(`  ⚠ STRESS TEST WARNING - ${passRate.toFixed(2)}% success rate`, colors.bright + colors.yellow);
  } else {
    log(`  ✗ STRESS TEST FAILED - ${passRate.toFixed(2)}% success rate`, colors.bright + colors.red);
  }
  console.log('-'.repeat(80));

  // Scalability assessment
  console.log('\n  Scalability Assessment:');
  const avgLatencyNum = parseFloat(report.latency.avg);
  if (avgLatencyNum < 2000) {
    log(`    ✓ Average latency (${report.latency.avg}ms) is excellent for AI workloads`, colors.green);
  } else if (avgLatencyNum < 5000) {
    log(`    ⚠ Average latency (${report.latency.avg}ms) is acceptable`, colors.yellow);
  } else {
    log(`    ✗ Average latency (${report.latency.avg}ms) needs optimization`, colors.red);
  }

  if (parseFloat(report.throughput) >= 10) {
    log(`    ✓ Throughput (${report.throughput} req/s) is good`, colors.green);
  } else if (parseFloat(report.throughput) >= 5) {
    log(`    ⚠ Throughput (${report.throughput} req/s) could be improved`, colors.yellow);
  } else {
    log(`    ✗ Throughput (${report.throughput} req/s) is low - consider scaling`, colors.red);
  }

  console.log('\n  Recommendations for 1000+ users:');
  log('    1. Use connection pooling for database connections', colors.dim);
  log('    2. Implement request queuing with Redis/Bull for high load', colors.dim);
  log('    3. Consider horizontal scaling with multiple backend instances', colors.dim);
  log('    4. Cache frequent intent classifications', colors.dim);
  log('    5. Use Mistral batch API for bulk operations', colors.dim);

  console.log('\n');
  process.exit(report.failedRequests > report.totalRequests * 0.05 ? 1 : 0);
}

// Run stress test
const config = parseArgs();
runStressTest(config).catch(error => {
  console.error('Stress test failed:', error);
  process.exit(1);
});
