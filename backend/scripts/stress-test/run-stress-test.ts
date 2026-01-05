/**
 * Production Stress Test - 1000 User Validation
 *
 * Tests the email system under heavy concurrent load:
 * 1. Concurrent email sync from multiple tenants
 * 2. Folder CRUD operations during sync
 * 3. API endpoint load testing
 * 4. Memory/CPU monitoring
 * 5. Data integrity validation
 *
 * PREREQUISITES:
 * 1. Run setup-test-tenants.ts first
 * 2. Set DISABLE_EMBEDDINGS=true to avoid Mistral rate limits
 * 3. Ensure Redis and PostgreSQL are running
 *
 * Run: DISABLE_EMBEDDINGS=true npx ts-node -r dotenv/config scripts/stress-test/run-stress-test.ts
 */

import 'dotenv/config';
import { createPrismaClient } from '../../src/prisma/prisma-client.factory';
import Redis from 'ioredis';
import * as http from 'http';
import * as https from 'https';

const prisma = createPrismaClient();

interface StressTestConfig {
  scenario: 'smoke' | 'load' | 'stress' | 'spike';
  concurrentUsers: number;
  durationSeconds: number;
  rampUpSeconds: number;
  apiBaseUrl: string;
}

interface TestMetrics {
  name: string;
  requests: number;
  successes: number;
  failures: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  maxLatencyMs: number;
  errorsPerType: Map<string, number>;
}

interface SystemMetrics {
  timestamp: Date;
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  rssMaxMB: number;
  activeConnections: number;
  redisMemoryMB: number;
}

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function log(msg: string, color = colors.reset): void {
  console.log(`${color}${msg}${colors.reset}`);
}

function progressBar(current: number, total: number, label: string): void {
  const width = 40;
  const percent = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  process.stdout.write(`\r${colors.cyan}${label}${colors.reset} [${bar}] ${percent}%`);
  if (current === total) console.log();
}

// Scenario configurations
const SCENARIOS: Record<string, Omit<StressTestConfig, 'apiBaseUrl'>> = {
  smoke: {
    scenario: 'smoke',
    concurrentUsers: 10,
    durationSeconds: 60,
    rampUpSeconds: 5,
  },
  load: {
    scenario: 'load',
    concurrentUsers: 100,
    durationSeconds: 300,
    rampUpSeconds: 30,
  },
  stress: {
    scenario: 'stress',
    concurrentUsers: 500,
    durationSeconds: 600,
    rampUpSeconds: 60,
  },
  spike: {
    scenario: 'spike',
    concurrentUsers: 1000,
    durationSeconds: 1800,
    rampUpSeconds: 10, // Sudden spike
  },
};

// ============================================
// HTTP Client for API Testing
// ============================================
class HttpClient {
  private agent: http.Agent | https.Agent;

  constructor(private baseUrl: string, maxSockets: number = 100) {
    const isHttps = baseUrl.startsWith('https');
    this.agent = isHttps
      ? new https.Agent({ keepAlive: true, maxSockets })
      : new http.Agent({ keepAlive: true, maxSockets });
  }

  async request(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<{ status: number; data: unknown; latencyMs: number }> {
    const start = Date.now();
    const url = new URL(path, this.baseUrl);
    const isHttps = url.protocol === 'https:';

    return new Promise((resolve, reject) => {
      const options = {
        method,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        agent: this.agent,
      };

      const req = (isHttps ? https : http).request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const latencyMs = Date.now() - start;
          try {
            resolve({
              status: res.statusCode || 0,
              data: data ? JSON.parse(data) : null,
              latencyMs,
            });
          } catch {
            resolve({ status: res.statusCode || 0, data, latencyMs });
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  destroy(): void {
    this.agent.destroy();
  }
}

// ============================================
// Metrics Collector
// ============================================
class MetricsCollector {
  private latencies: Map<string, number[]> = new Map();
  private errors: Map<string, Map<string, number>> = new Map();
  private counts: Map<string, { success: number; failure: number }> = new Map();
  private systemMetrics: SystemMetrics[] = [];
  private metricsInterval?: NodeJS.Timeout;

  startSystemMonitoring(redis: Redis, intervalMs: number = 1000): void {
    this.metricsInterval = setInterval(async () => {
      const mem = process.memoryUsage();
      let redisMemory = 0;

      try {
        const info = await redis.info('memory');
        const match = info.match(/used_memory:(\d+)/);
        if (match) {
          redisMemory = parseInt(match[1], 10) / (1024 * 1024);
        }
      } catch {
        // Redis might be disconnected
      }

      this.systemMetrics.push({
        timestamp: new Date(),
        heapUsedMB: mem.heapUsed / (1024 * 1024),
        heapTotalMB: mem.heapTotal / (1024 * 1024),
        externalMB: mem.external / (1024 * 1024),
        rssMaxMB: mem.rss / (1024 * 1024),
        activeConnections: 0, // Would need socket tracking
        redisMemoryMB: redisMemory,
      });
    }, intervalMs);
  }

  stopSystemMonitoring(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
  }

  recordRequest(name: string, latencyMs: number, success: boolean, errorType?: string): void {
    // Record latency
    if (!this.latencies.has(name)) {
      this.latencies.set(name, []);
    }
    this.latencies.get(name)!.push(latencyMs);

    // Record success/failure
    if (!this.counts.has(name)) {
      this.counts.set(name, { success: 0, failure: 0 });
    }
    const counts = this.counts.get(name)!;
    if (success) {
      counts.success++;
    } else {
      counts.failure++;
      // Record error type
      if (errorType) {
        if (!this.errors.has(name)) {
          this.errors.set(name, new Map());
        }
        const errorMap = this.errors.get(name)!;
        errorMap.set(errorType, (errorMap.get(errorType) || 0) + 1);
      }
    }
  }

  getMetrics(name: string): TestMetrics {
    const latencies = this.latencies.get(name) || [];
    const counts = this.counts.get(name) || { success: 0, failure: 0 };
    const errors = this.errors.get(name) || new Map();

    if (latencies.length === 0) {
      return {
        name,
        requests: 0,
        successes: 0,
        failures: 0,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        maxLatencyMs: 0,
        errorsPerType: errors,
      };
    }

    const sorted = [...latencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    return {
      name,
      requests: counts.success + counts.failure,
      successes: counts.success,
      failures: counts.failure,
      avgLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
      p95LatencyMs: sorted[p95Index] || 0,
      p99LatencyMs: sorted[p99Index] || 0,
      maxLatencyMs: Math.max(...latencies),
      errorsPerType: errors,
    };
  }

  getSystemMetricsSummary(): {
    peakHeapMB: number;
    peakRssMB: number;
    avgHeapMB: number;
    peakRedisMB: number;
  } {
    if (this.systemMetrics.length === 0) {
      return { peakHeapMB: 0, peakRssMB: 0, avgHeapMB: 0, peakRedisMB: 0 };
    }

    const heapValues = this.systemMetrics.map((m) => m.heapUsedMB);
    const rssValues = this.systemMetrics.map((m) => m.rssMaxMB);
    const redisValues = this.systemMetrics.map((m) => m.redisMemoryMB);

    return {
      peakHeapMB: Math.max(...heapValues),
      peakRssMB: Math.max(...rssValues),
      avgHeapMB: heapValues.reduce((a, b) => a + b, 0) / heapValues.length,
      peakRedisMB: Math.max(...redisValues),
    };
  }

  getAllMetrics(): TestMetrics[] {
    return Array.from(this.latencies.keys()).map((name) => this.getMetrics(name));
  }
}

// ============================================
// Test Workers
// ============================================

// Worker: Concurrent Email Sync Simulation
async function syncWorker(
  workerId: number,
  providerId: string,
  metrics: MetricsCollector,
  durationMs: number
): Promise<void> {
  const endTime = Date.now() + durationMs;

  while (Date.now() < endTime) {
    const start = Date.now();
    try {
      // Simulate sync operation - query emails and update folder counts
      const emails = await prisma.email.findMany({
        where: { providerId },
        take: 100,
        orderBy: { receivedAt: 'desc' },
      });

      // Simulate folder count update (atomic operation)
      await prisma.folder.updateMany({
        where: { providerId },
        data: { updatedAt: new Date() },
      });

      metrics.recordRequest('sync', Date.now() - start, true);
    } catch (error) {
      const errorType = error instanceof Error ? error.constructor.name : 'Unknown';
      metrics.recordRequest('sync', Date.now() - start, false, errorType);
    }

    // Small delay between syncs
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
  }
}

// Worker: Folder CRUD Operations
async function folderCrudWorker(
  workerId: number,
  providerId: string,
  redis: Redis,
  metrics: MetricsCollector,
  durationMs: number
): Promise<void> {
  const endTime = Date.now() + durationMs;
  const lockKey = `folder-crud:${providerId}`;

  while (Date.now() < endTime) {
    const start = Date.now();
    try {
      // Try to acquire lock
      const acquired = await redis.set(lockKey, 'locked', 'PX', 5000, 'NX');
      if (acquired !== 'OK') {
        metrics.recordRequest('folder_crud', Date.now() - start, false, 'LockContention');
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }

      try {
        // Random CRUD operation
        const op = Math.floor(Math.random() * 3);

        if (op === 0) {
          // Create folder
          const folderName = `stress-test-${Date.now()}-${workerId}`;
          // Get tenantId from provider
          const provider = await prisma.providerConfig.findUnique({
            where: { id: providerId },
            select: { tenantId: true },
          });
          if (provider) {
            await prisma.folder.create({
              data: {
                tenantId: provider.tenantId,
                providerId,
                name: folderName,
                path: folderName,
                totalCount: 0,
                unreadCount: 0,
                uidValidity: String(Math.floor(Math.random() * 1000000)),
                uidNext: 1,
              },
            });
          }
        } else if (op === 1) {
          // Update folder
          await prisma.folder.updateMany({
            where: {
              providerId,
              name: { startsWith: 'stress-test-' },
            },
            data: { updatedAt: new Date() },
          });
        } else {
          // Delete old stress test folders
          await prisma.folder.deleteMany({
            where: {
              providerId,
              name: { startsWith: 'stress-test-' },
              createdAt: { lt: new Date(Date.now() - 60000) },
            },
          });
        }

        metrics.recordRequest('folder_crud', Date.now() - start, true);
      } finally {
        await redis.del(lockKey);
      }
    } catch (error) {
      const errorType = error instanceof Error ? error.constructor.name : 'Unknown';
      metrics.recordRequest('folder_crud', Date.now() - start, false, errorType);
    }

    // Delay between operations
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 1000));
  }
}

// Worker: API Endpoint Load Test
async function apiWorker(
  workerId: number,
  client: HttpClient,
  userId: string,
  metrics: MetricsCollector,
  durationMs: number
): Promise<void> {
  const endTime = Date.now() + durationMs;

  // Mock JWT for API calls
  const authHeader = { Authorization: `Bearer stress-test-token-${userId}` };

  while (Date.now() < endTime) {
    try {
      // Random API endpoint
      const endpoints = [
        { method: 'GET', path: `/api/v1/email/folders` },
        { method: 'GET', path: `/api/v1/email/messages?limit=20` },
        { method: 'GET', path: `/api/v1/contacts?limit=20` },
        { method: 'GET', path: `/api/v1/calendar/events?limit=20` },
      ];

      const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];

      const result = await client.request(endpoint.method, endpoint.path, undefined, authHeader);
      const success = result.status >= 200 && result.status < 400;

      metrics.recordRequest(
        `api:${endpoint.path.split('?')[0]}`,
        result.latencyMs,
        success,
        success ? undefined : `HTTP_${result.status}`
      );
    } catch (error) {
      const errorType = error instanceof Error ? error.message : 'Unknown';
      metrics.recordRequest('api:error', 0, false, errorType);
    }

    // Delay between requests
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 400));
  }
}

// Worker: Database Stress (P2034 deadlock testing)
async function dbStressWorker(
  workerId: number,
  providerId: string,
  metrics: MetricsCollector,
  durationMs: number
): Promise<void> {
  const endTime = Date.now() + durationMs;

  while (Date.now() < endTime) {
    const start = Date.now();
    try {
      // Concurrent updates to same emails - designed to trigger P2034
      await prisma.$transaction(async (tx) => {
        const emails = await tx.email.findMany({
          where: { providerId },
          take: 10,
          orderBy: { receivedAt: 'desc' },
        });

        for (const email of emails) {
          await tx.email.update({
            where: { id: email.id },
            data: { updatedAt: new Date() },
          });
        }
      });

      metrics.recordRequest('db_stress', Date.now() - start, true);
    } catch (error) {
      const isPrismaError = error && typeof error === 'object' && 'code' in error;
      const errorCode = isPrismaError ? (error as { code: string }).code : 'Unknown';
      metrics.recordRequest('db_stress', Date.now() - start, false, errorCode);
    }

    await new Promise((r) => setTimeout(r, 50));
  }
}

// ============================================
// Data Integrity Validator
// ============================================
async function validateDataIntegrity(): Promise<{
  passed: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  // Check 1: No negative folder counts
  const negativeCounts = await prisma.folder.count({
    where: {
      OR: [{ totalCount: { lt: 0 } }, { unreadCount: { lt: 0 } }],
    },
  });
  if (negativeCounts > 0) {
    issues.push(`${negativeCounts} folders have negative counts`);
  }

  // Check 2: unreadCount <= totalCount (using raw query)
  const invalidUnreadResult = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "folders" WHERE "unreadCount" > "totalCount"
  `;
  const invalidUnread = Number(invalidUnreadResult[0]?.count || 0);
  if (invalidUnread > 0) {
    issues.push(`${invalidUnread} folders have unreadCount > totalCount`);
  }

  // Check 3: Emails with empty folder path
  const emptyFolderEmails = await prisma.email.count({
    where: {
      folder: '',
    },
  });
  if (emptyFolderEmails > 0) {
    issues.push(`${emptyFolderEmails} emails with empty folder path`);
  }

  // Check 4: System folders exist (should not be deleted)
  const systemFolders = await prisma.folder.count({
    where: {
      isSystem: true,
    },
  });
  // Just log for info - system folders should exist
  if (systemFolders === 0) {
    issues.push('No system folders found - possible data corruption');
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

// ============================================
// Main Stress Test Runner
// ============================================
async function runStressTest(config: StressTestConfig): Promise<void> {
  log('\n' + '═'.repeat(70), colors.yellow);
  log(`  STRESS TEST: ${config.scenario.toUpperCase()}`, colors.bold + colors.yellow);
  log('═'.repeat(70) + '\n', colors.yellow);

  log('Configuration:', colors.cyan);
  log(`  Concurrent Users: ${config.concurrentUsers}`);
  log(`  Duration: ${config.durationSeconds}s`);
  log(`  Ramp-up: ${config.rampUpSeconds}s`);
  log(`  API Base URL: ${config.apiBaseUrl}`);
  log('');

  // Check prerequisites
  const aiEnabled = process.env.DISABLE_AI !== 'true';
  const embeddingsEnabled = process.env.DISABLE_EMBEDDINGS !== 'true';
  if (aiEnabled || embeddingsEnabled) {
    log('⚠️  WARNING: AI/Embeddings not disabled!', colors.yellow);
    log('  Set DISABLE_EMBEDDINGS=true and DISABLE_AI=true for accurate results', colors.yellow);
    log('');
  }

  // Initialize
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  });

  const client = new HttpClient(config.apiBaseUrl, config.concurrentUsers);
  const metrics = new MetricsCollector();

  // Get test providers
  const testProviders = await prisma.providerConfig.findMany({
    where: { email: { contains: 'stress-tenant' } },
    select: { id: true, userId: true, tenantId: true },
    take: config.concurrentUsers,
  });

  if (testProviders.length < config.concurrentUsers) {
    log(`⚠️  Only ${testProviders.length} test tenants available (need ${config.concurrentUsers})`, colors.yellow);
    log('  Run setup-test-tenants.ts first to create more\n', colors.yellow);
  }

  // Start system monitoring
  metrics.startSystemMonitoring(redis);

  const startTime = Date.now();
  const durationMs = config.durationSeconds * 1000;
  const workers: Promise<void>[] = [];

  log('Starting workers...', colors.cyan);

  // Ramp up workers
  const rampUpIntervalMs = (config.rampUpSeconds * 1000) / testProviders.length;

  for (let i = 0; i < testProviders.length; i++) {
    const provider = testProviders[i];
    const remainingTime = durationMs - (Date.now() - startTime);

    if (remainingTime <= 0) break;

    // Spawn workers for this user
    workers.push(syncWorker(i, provider.id, metrics, remainingTime));
    workers.push(folderCrudWorker(i, provider.id, redis, metrics, remainingTime));
    workers.push(dbStressWorker(i, provider.id, metrics, remainingTime));

    // API worker only if server is running
    if (config.apiBaseUrl && provider.userId) {
      workers.push(apiWorker(i, client, provider.userId, metrics, remainingTime));
    }

    progressBar(i + 1, testProviders.length, 'Spawning workers');

    // Ramp up delay
    if (i < testProviders.length - 1) {
      await new Promise((r) => setTimeout(r, rampUpIntervalMs));
    }
  }

  log(`\n${workers.length} workers running...`, colors.green);

  // Progress display
  const progressInterval = setInterval(() => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const remaining = config.durationSeconds - elapsed;
    const syncMetrics = metrics.getMetrics('sync');
    process.stdout.write(
      `\r${colors.dim}Elapsed: ${elapsed}s | Remaining: ${remaining}s | Syncs: ${syncMetrics.successes}/${syncMetrics.requests}${colors.reset}`
    );
  }, 1000);

  // Wait for all workers
  await Promise.allSettled(workers);

  clearInterval(progressInterval);
  console.log('\n');

  // Stop monitoring
  metrics.stopSystemMonitoring();

  // Cleanup
  client.destroy();
  await redis.quit();

  // Validate data integrity
  log('Validating data integrity...', colors.cyan);
  const integrity = await validateDataIntegrity();

  // Print results
  log('\n' + '═'.repeat(70), colors.green);
  log('  STRESS TEST RESULTS', colors.bold + colors.green);
  log('═'.repeat(70) + '\n', colors.green);

  const allMetrics = metrics.getAllMetrics();
  for (const m of allMetrics) {
    const successRate = m.requests > 0 ? ((m.successes / m.requests) * 100).toFixed(1) : '0';
    const color = m.failures === 0 ? colors.green : colors.yellow;
    log(`${m.name}:`, color);
    log(`  Requests: ${m.requests} (${successRate}% success)`);
    log(`  Latency: avg=${m.avgLatencyMs}ms, p95=${m.p95LatencyMs}ms, p99=${m.p99LatencyMs}ms, max=${m.maxLatencyMs}ms`);
    if (m.failures > 0) {
      log(`  Errors:`, colors.red);
      for (const [type, count] of m.errorsPerType) {
        log(`    ${type}: ${count}`);
      }
    }
    log('');
  }

  // System metrics summary
  const sysSummary = metrics.getSystemMetricsSummary();
  log('System Resources:', colors.cyan);
  log(`  Peak Heap: ${sysSummary.peakHeapMB.toFixed(1)} MB`);
  log(`  Avg Heap: ${sysSummary.avgHeapMB.toFixed(1)} MB`);
  log(`  Peak RSS: ${sysSummary.peakRssMB.toFixed(1)} MB`);
  log(`  Peak Redis: ${sysSummary.peakRedisMB.toFixed(1)} MB`);
  log('');

  // Data integrity
  log('Data Integrity:', integrity.passed ? colors.green : colors.red);
  if (integrity.passed) {
    log('  ✅ All checks passed');
  } else {
    for (const issue of integrity.issues) {
      log(`  ❌ ${issue}`);
    }
  }
  log('');

  // Final verdict
  const totalRequests = allMetrics.reduce((sum, m) => sum + m.requests, 0);
  const totalFailures = allMetrics.reduce((sum, m) => sum + m.failures, 0);
  const overallSuccessRate = totalRequests > 0 ? ((totalRequests - totalFailures) / totalRequests) * 100 : 0;

  const p99Latencies = allMetrics.map((m) => m.p99LatencyMs).filter((l) => l > 0);
  const maxP99 = p99Latencies.length > 0 ? Math.max(...p99Latencies) : 0;

  log('═'.repeat(70), colors.bold);
  log('  VERDICT', colors.bold);
  log('═'.repeat(70));

  const passed =
    integrity.passed && overallSuccessRate >= 95 && maxP99 < 500;

  if (passed) {
    log(`\n  ✅ STRESS TEST PASSED`, colors.green + colors.bold);
    log(`\n  Ready for ${config.concurrentUsers} concurrent users!`, colors.green);
  } else {
    log(`\n  ❌ STRESS TEST FAILED`, colors.red + colors.bold);
    if (!integrity.passed) log('  - Data integrity issues', colors.red);
    if (overallSuccessRate < 95) log(`  - Success rate ${overallSuccessRate.toFixed(1)}% < 95%`, colors.red);
    if (maxP99 >= 500) log(`  - P99 latency ${maxP99}ms >= 500ms`, colors.red);
  }

  log('\n');
}

// ============================================
// CLI
// ============================================
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const scenarioArg = args.find((a) => a.startsWith('--scenario='))?.split('=')[1] || 'smoke';
  const apiUrl = args.find((a) => a.startsWith('--api='))?.split('=')[1] || 'http://localhost:3000';

  if (!SCENARIOS[scenarioArg]) {
    log(`Unknown scenario: ${scenarioArg}`, colors.red);
    log(`Available: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(1);
  }

  const config: StressTestConfig = {
    ...SCENARIOS[scenarioArg],
    apiBaseUrl: apiUrl,
  };

  try {
    await runStressTest(config);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
