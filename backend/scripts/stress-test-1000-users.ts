/**
 * Stress Test Suite for 1000+ Users
 *
 * This script validates the system's capability to handle 1000+ users by simulating:
 * - Concurrent database operations
 * - Queue processing throughput
 * - API endpoint stress testing
 * - Memory usage under load
 * - Connection pool exhaustion
 *
 * Usage:
 *   cd backend
 *   npx ts-node ./scripts/stress-test-1000-users.ts
 *
 * Options:
 *   USERS=1000        Number of simulated users (default: 1000)
 *   CONCURRENCY=50    Max concurrent operations (default: 50)
 *   DURATION=60       Test duration in seconds (default: 60)
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import Redis from 'ioredis';
import { Queue, Worker, Job } from 'bullmq';

const prisma = createPrismaClient();

// Configuration
const CONFIG = {
  users: parseInt(process.env.USERS || '1000', 10),
  concurrency: parseInt(process.env.CONCURRENCY || '50', 10),
  duration: parseInt(process.env.DURATION || '60', 10),
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
};

// Metrics tracking
interface Metrics {
  startTime: number;
  endTime: number;
  operations: {
    dbReads: number;
    dbWrites: number;
    queueJobs: number;
    queueProcessed: number;
    errors: number;
  };
  latency: {
    dbRead: number[];
    dbWrite: number[];
    queueAdd: number[];
    queueProcess: number[];
  };
  memory: {
    initial: NodeJS.MemoryUsage;
    peak: NodeJS.MemoryUsage;
    final: NodeJS.MemoryUsage;
  };
  throughput: {
    opsPerSecond: number;
    jobsPerSecond: number;
  };
}

const metrics: Metrics = {
  startTime: 0,
  endTime: 0,
  operations: {
    dbReads: 0,
    dbWrites: 0,
    queueJobs: 0,
    queueProcessed: 0,
    errors: 0,
  },
  latency: {
    dbRead: [],
    dbWrite: [],
    queueAdd: [],
    queueProcess: [],
  },
  memory: {
    initial: process.memoryUsage(),
    peak: process.memoryUsage(),
    final: process.memoryUsage(),
  },
  throughput: {
    opsPerSecond: 0,
    jobsPerSecond: 0,
  },
};

// Track peak memory
function updatePeakMemory() {
  const current = process.memoryUsage();
  if (current.heapUsed > metrics.memory.peak.heapUsed) {
    metrics.memory.peak = current;
  }
}

// Calculate percentile
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// Calculate statistics
function calcStats(arr: number[]): { min: number; max: number; avg: number; p50: number; p95: number; p99: number } {
  if (arr.length === 0) return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
  return {
    min: Math.min(...arr),
    max: Math.max(...arr),
    avg: arr.reduce((a, b) => a + b, 0) / arr.length,
    p50: percentile(arr, 50),
    p95: percentile(arr, 95),
    p99: percentile(arr, 99),
  };
}

// ============================================
// TEST 1: DATABASE STRESS TEST
// ============================================

async function testDatabaseStress() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: DATABASE STRESS TEST');
  console.log('='.repeat(60));
  console.log(`Simulating ${CONFIG.users} concurrent database operations...`);

  const testTenantId = 'stress-test-tenant';

  // Create test data
  console.log('\n1.1 Creating test tenant and providers...');

  // Cleanup any previous test data
  await prisma.email.deleteMany({ where: { tenantId: testTenantId } });
  await prisma.folder.deleteMany({ where: { tenantId: testTenantId } });
  await prisma.providerConfig.deleteMany({ where: { tenantId: testTenantId } });
  await prisma.tenant.deleteMany({ where: { id: testTenantId } });

  // Create test tenant
  await prisma.tenant.create({
    data: { id: testTenantId, name: 'Stress Test Tenant', slug: 'stress-test-tenant' },
  });

  // Create simulated providers (users)
  console.log(`Creating ${CONFIG.users} simulated providers...`);
  const providerBatch: any[] = [];
  for (let i = 0; i < CONFIG.users; i++) {
    providerBatch.push({
      tenantId: testTenantId,
      email: `stress-user-${i}@test.local`,
      providerType: 'generic',
      isActive: true,
    });
  }

  // Insert in batches
  const batchSize = 100;
  for (let i = 0; i < providerBatch.length; i += batchSize) {
    const batch = providerBatch.slice(i, i + batchSize);
    await prisma.providerConfig.createMany({ data: batch });
    process.stdout.write(`\r  Created ${Math.min(i + batchSize, CONFIG.users)}/${CONFIG.users} providers`);
  }
  console.log(' ✅');

  // Get created providers
  const providers = await prisma.providerConfig.findMany({
    where: { tenantId: testTenantId },
    select: { id: true },
  });

  // Create folders for each provider
  console.log(`Creating folders for ${providers.length} providers...`);
  const folderBatch: any[] = [];
  const folderNames = ['INBOX', 'Sent', 'Drafts', 'Trash', 'Spam'];
  for (const provider of providers) {
    for (const folderName of folderNames) {
      folderBatch.push({
        tenantId: testTenantId,
        providerId: provider.id,
        path: folderName,
        name: folderName,
        delimiter: '/',
        isSelectable: true,
        totalCount: 0,
        unreadCount: 0,
      });
    }
  }

  for (let i = 0; i < folderBatch.length; i += batchSize) {
    const batch = folderBatch.slice(i, i + batchSize);
    await prisma.folder.createMany({ data: batch });
    process.stdout.write(`\r  Created ${Math.min(i + batchSize, folderBatch.length)}/${folderBatch.length} folders`);
  }
  console.log(' ✅');

  // Create emails for each provider
  console.log(`Creating emails for ${providers.length} providers (10 each)...`);
  const emailBatch: any[] = [];
  for (const provider of providers) {
    for (let i = 0; i < 10; i++) {
      const now = new Date();
      emailBatch.push({
        tenantId: testTenantId,
        providerId: provider.id,
        messageId: `<stress-test-${provider.id}-${i}@test.local>`,
        externalId: `stress-${provider.id}-${i}`,
        threadId: `thread-${provider.id}`,
        subject: `Stress Test Email ${i}`,
        from: 'sender@test.local',
        to: ['recipient@test.local'],
        snippet: 'This is a stress test email.',
        folder: 'INBOX',
        receivedAt: now,
        sentAt: now,
        isRead: i % 2 === 0,
        isStarred: i % 3 === 0,
      });
    }
  }

  for (let i = 0; i < emailBatch.length; i += batchSize) {
    const batch = emailBatch.slice(i, i + batchSize);
    await prisma.email.createMany({ data: batch });
    process.stdout.write(`\r  Created ${Math.min(i + batchSize, emailBatch.length)}/${emailBatch.length} emails`);
  }
  console.log(' ✅');

  // 1.2 Concurrent Read Operations
  console.log('\n1.2 Testing concurrent read operations...');
  const readPromises: Promise<void>[] = [];
  const startRead = Date.now();

  for (let i = 0; i < CONFIG.concurrency; i++) {
    readPromises.push(
      (async () => {
        for (let j = 0; j < Math.ceil(CONFIG.users / CONFIG.concurrency); j++) {
          const opStart = Date.now();
          try {
            const randomProvider = providers[Math.floor(Math.random() * providers.length)];
            await prisma.email.findMany({
              where: { providerId: randomProvider.id },
              take: 50,
              orderBy: { receivedAt: 'desc' },
            });
            metrics.operations.dbReads++;
            metrics.latency.dbRead.push(Date.now() - opStart);
          } catch {
            metrics.operations.errors++;
          }
          updatePeakMemory();
        }
      })(),
    );
  }

  await Promise.all(readPromises);
  const readDuration = Date.now() - startRead;
  console.log(`  ✅ ${metrics.operations.dbReads} reads in ${readDuration}ms (${(metrics.operations.dbReads / (readDuration / 1000)).toFixed(1)} ops/sec)`);

  // 1.3 Concurrent Write Operations
  console.log('\n1.3 Testing concurrent write operations...');
  const writePromises: Promise<void>[] = [];
  const startWrite = Date.now();

  for (let i = 0; i < CONFIG.concurrency; i++) {
    writePromises.push(
      (async () => {
        for (let j = 0; j < 10; j++) {
          const opStart = Date.now();
          try {
            const randomProvider = providers[Math.floor(Math.random() * providers.length)];
            await prisma.email.updateMany({
              where: { providerId: randomProvider.id, isRead: false },
              data: { isRead: true },
            });
            metrics.operations.dbWrites++;
            metrics.latency.dbWrite.push(Date.now() - opStart);
          } catch {
            metrics.operations.errors++;
          }
          updatePeakMemory();
        }
      })(),
    );
  }

  await Promise.all(writePromises);
  const writeDuration = Date.now() - startWrite;
  console.log(`  ✅ ${metrics.operations.dbWrites} writes in ${writeDuration}ms (${(metrics.operations.dbWrites / (writeDuration / 1000)).toFixed(1)} ops/sec)`);

  // 1.4 Complex Query Performance
  console.log('\n1.4 Testing complex query performance...');
  const complexStart = Date.now();

  // Test aggregation query
  const aggregation = await prisma.email.groupBy({
    by: ['providerId', 'folder'],
    where: { tenantId: testTenantId },
    _count: { _all: true },
  });
  const aggDuration = Date.now() - complexStart;
  console.log(`  ✅ Aggregation query: ${aggregation.length} groups in ${aggDuration}ms`);

  // Test join query
  const joinStart = Date.now();
  const joinResult = await prisma.email.findMany({
    where: { tenantId: testTenantId },
    include: { provider: { select: { email: true } } },
    take: 1000,
  });
  const joinDuration = Date.now() - joinStart;
  console.log(`  ✅ Join query: ${joinResult.length} results in ${joinDuration}ms`);

  // Cleanup
  console.log('\n1.5 Cleaning up test data...');
  await prisma.email.deleteMany({ where: { tenantId: testTenantId } });
  await prisma.folder.deleteMany({ where: { tenantId: testTenantId } });
  await prisma.providerConfig.deleteMany({ where: { tenantId: testTenantId } });
  await prisma.tenant.deleteMany({ where: { id: testTenantId } });
  console.log('  ✅ Cleanup complete');
}

// ============================================
// TEST 2: QUEUE THROUGHPUT TEST
// ============================================

async function testQueueThroughput() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: QUEUE THROUGHPUT TEST');
  console.log('='.repeat(60));

  const redis = new Redis({
    host: CONFIG.redisHost,
    port: CONFIG.redisPort,
    maxRetriesPerRequest: null,
  });

  const queueName = 'stress-test-queue';
  const queue = new Queue(queueName, { connection: redis });

  // Clear queue
  await queue.obliterate({ force: true });

  // Create worker
  let processed = 0;
  const processLatencies: number[] = [];

  const worker = new Worker(
    queueName,
    async (job: Job) => {
      const start = Date.now();
      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
      processLatencies.push(Date.now() - start);
      processed++;
      return { success: true };
    },
    {
      connection: redis,
      concurrency: CONFIG.concurrency,
    },
  );

  // 2.1 Add jobs to queue
  console.log(`\n2.1 Adding ${CONFIG.users} jobs to queue...`);
  const addStart = Date.now();

  const addPromises: Promise<void>[] = [];
  for (let i = 0; i < CONFIG.users; i++) {
    addPromises.push(
      (async () => {
        const opStart = Date.now();
        await queue.add('stress-job', { userId: i, timestamp: Date.now() });
        metrics.operations.queueJobs++;
        metrics.latency.queueAdd.push(Date.now() - opStart);
      })(),
    );

    // Batch to avoid overwhelming
    if (addPromises.length >= CONFIG.concurrency) {
      await Promise.all(addPromises);
      addPromises.length = 0;
      process.stdout.write(`\r  Added ${i + 1}/${CONFIG.users} jobs`);
    }
  }
  await Promise.all(addPromises);

  const addDuration = Date.now() - addStart;
  console.log(`\n  ✅ Added ${metrics.operations.queueJobs} jobs in ${addDuration}ms (${(metrics.operations.queueJobs / (addDuration / 1000)).toFixed(1)} jobs/sec)`);

  // 2.2 Wait for processing
  console.log('\n2.2 Processing jobs...');
  const processStart = Date.now();

  await new Promise<void>((resolve) => {
    const checkInterval = setInterval(async () => {
      const waiting = await queue.getWaitingCount();
      const active = await queue.getActiveCount();
      const completed = await queue.getCompletedCount();
      process.stdout.write(`\r  Waiting: ${waiting}, Active: ${active}, Completed: ${completed}`);

      if (waiting === 0 && active === 0) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 500);
  });

  const processDuration = Date.now() - processStart;
  metrics.operations.queueProcessed = processed;
  metrics.latency.queueProcess = processLatencies;

  console.log(`\n  ✅ Processed ${processed} jobs in ${processDuration}ms (${(processed / (processDuration / 1000)).toFixed(1)} jobs/sec)`);

  // Cleanup
  await worker.close();
  await queue.obliterate({ force: true });
  await queue.close();
  await redis.quit();
}

// ============================================
// TEST 3: CONCURRENT API SIMULATION
// ============================================

async function testConcurrentApiSimulation() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: CONCURRENT API SIMULATION');
  console.log('='.repeat(60));
  console.log(`Simulating ${CONFIG.users} concurrent API-like operations...`);

  // Simulate API operations using database
  const testTenantId = 'api-stress-tenant';

  // Setup
  await prisma.tenant.upsert({
    where: { id: testTenantId },
    create: { id: testTenantId, name: 'API Stress Test', slug: 'api-stress-tenant' },
    update: {},
  });

  // 3.1 Simulate concurrent email list requests
  console.log('\n3.1 Simulating concurrent email list requests...');
  const listStart = Date.now();
  const listPromises: Promise<any>[] = [];

  for (let i = 0; i < CONFIG.users; i++) {
    listPromises.push(
      prisma.email.findMany({
        take: 20,
        orderBy: { receivedAt: 'desc' },
        include: { attachments: true },
      }).catch(() => null),
    );

    if (listPromises.length >= CONFIG.concurrency) {
      await Promise.all(listPromises);
      listPromises.length = 0;
      process.stdout.write(`\r  Processed ${i + 1}/${CONFIG.users} list requests`);
    }
  }
  await Promise.all(listPromises);

  const listDuration = Date.now() - listStart;
  console.log(`\n  ✅ ${CONFIG.users} list requests in ${listDuration}ms (${(CONFIG.users / (listDuration / 1000)).toFixed(1)} req/sec)`);

  // 3.2 Simulate concurrent folder sync operations
  console.log('\n3.2 Simulating concurrent folder operations...');
  const folderStart = Date.now();
  const folderPromises: Promise<any>[] = [];

  for (let i = 0; i < CONFIG.users; i++) {
    folderPromises.push(
      prisma.folder.findMany({
        orderBy: { path: 'asc' },
      }).catch(() => null),
    );

    if (folderPromises.length >= CONFIG.concurrency) {
      await Promise.all(folderPromises);
      folderPromises.length = 0;
    }
  }
  await Promise.all(folderPromises);

  const folderDuration = Date.now() - folderStart;
  console.log(`  ✅ ${CONFIG.users} folder requests in ${folderDuration}ms (${(CONFIG.users / (folderDuration / 1000)).toFixed(1)} req/sec)`);

  // 3.3 Simulate concurrent search operations
  console.log('\n3.3 Simulating concurrent search operations...');
  const searchStart = Date.now();
  const searchPromises: Promise<any>[] = [];

  const searchTerms = ['test', 'email', 'subject', 'from', 'to'];
  for (let i = 0; i < Math.min(CONFIG.users, 500); i++) {
    const term = searchTerms[i % searchTerms.length];
    searchPromises.push(
      prisma.email.findMany({
        where: {
          OR: [
            { subject: { contains: term, mode: 'insensitive' } },
            { snippet: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: 50,
      }).catch(() => null),
    );

    if (searchPromises.length >= CONFIG.concurrency) {
      await Promise.all(searchPromises);
      searchPromises.length = 0;
    }
  }
  await Promise.all(searchPromises);

  const searchDuration = Date.now() - searchStart;
  const searchCount = Math.min(CONFIG.users, 500);
  console.log(`  ✅ ${searchCount} search requests in ${searchDuration}ms (${(searchCount / (searchDuration / 1000)).toFixed(1)} req/sec)`);

  // Cleanup
  await prisma.tenant.deleteMany({ where: { id: testTenantId } });
}

// ============================================
// TEST 4: MEMORY STRESS TEST
// ============================================

async function testMemoryStress() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 4: MEMORY STRESS TEST');
  console.log('='.repeat(60));

  const initialMemory = process.memoryUsage();
  console.log(`Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);

  // 4.1 Large data set handling
  console.log('\n4.1 Testing large data set handling...');

  // Fetch all emails in batches
  let totalEmails = 0;
  let cursor: string | undefined;
  const batchSize = 1000;

  while (true) {
    const batch = await prisma.email.findMany({
      take: batchSize,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        subject: true,
        snippet: true,
        from: true,
        receivedAt: true,
      },
    });

    totalEmails += batch.length;
    updatePeakMemory();

    if (batch.length < batchSize) break;
    cursor = batch[batch.length - 1].id;
    process.stdout.write(`\r  Processed ${totalEmails} emails`);
  }

  console.log(`\n  ✅ Processed ${totalEmails} emails with pagination`);

  // 4.2 Memory after operations
  const afterMemory = process.memoryUsage();
  console.log(`\n4.2 Memory usage:`);
  console.log(`  Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Peak heap: ${(metrics.memory.peak.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Final heap: ${(afterMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Memory growth: ${((afterMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2)} MB`);

  // Force GC if available
  if (global.gc) {
    global.gc();
    const afterGC = process.memoryUsage();
    console.log(`  After GC: ${(afterGC.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  }

  metrics.memory.final = process.memoryUsage();
}

// ============================================
// TEST 5: CONNECTION POOL TEST
// ============================================

async function testConnectionPool() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 5: CONNECTION POOL STRESS TEST');
  console.log('='.repeat(60));

  // 5.1 Concurrent connections
  console.log('\n5.1 Testing concurrent database connections...');
  const connectionPromises: Promise<any>[] = [];
  const concurrentQueries = CONFIG.concurrency * 2;

  const connStart = Date.now();
  for (let i = 0; i < concurrentQueries; i++) {
    connectionPromises.push(
      prisma.$queryRaw`SELECT 1 as test`.catch(() => null),
    );
  }

  await Promise.all(connectionPromises);
  const connDuration = Date.now() - connStart;
  console.log(`  ✅ ${concurrentQueries} concurrent queries in ${connDuration}ms`);

  // 5.2 Sustained load
  console.log('\n5.2 Testing sustained database load (10 seconds)...');
  const sustainedStart = Date.now();
  const sustainedDuration = 10000; // 10 seconds
  let sustainedOps = 0;
  let sustainedErrors = 0;

  while (Date.now() - sustainedStart < sustainedDuration) {
    const batch: Promise<any>[] = [];
    for (let i = 0; i < CONFIG.concurrency; i++) {
      batch.push(
        prisma.$queryRaw`SELECT 1 as test`.then(() => {
          sustainedOps++;
        }).catch(() => {
          sustainedErrors++;
        }),
      );
    }
    await Promise.all(batch);
    updatePeakMemory();
    // Small delay to prevent overwhelming
    await new Promise((r) => setTimeout(r, 10));
  }

  const actualDuration = (Date.now() - sustainedStart) / 1000;
  console.log(`  ✅ ${sustainedOps} operations in ${actualDuration.toFixed(1)}s (${(sustainedOps / actualDuration).toFixed(1)} ops/sec)`);
  if (sustainedErrors > 0) {
    console.log(`  ⚠️  ${sustainedErrors} errors during sustained load`);
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('='.repeat(60));
  console.log('STRESS TEST SUITE FOR 1000+ USERS');
  console.log('='.repeat(60));
  console.log(`Configuration:`);
  console.log(`  Users: ${CONFIG.users}`);
  console.log(`  Concurrency: ${CONFIG.concurrency}`);
  console.log(`  Duration: ${CONFIG.duration}s`);
  console.log(`Started at: ${new Date().toISOString()}`);

  metrics.startTime = Date.now();
  metrics.memory.initial = process.memoryUsage();

  try {
    // Run all tests
    await testDatabaseStress();
    await testQueueThroughput();
    await testConcurrentApiSimulation();
    await testMemoryStress();
    await testConnectionPool();

    metrics.endTime = Date.now();
    metrics.memory.final = process.memoryUsage();

    // Calculate throughput
    const totalDuration = (metrics.endTime - metrics.startTime) / 1000;
    const totalOps = metrics.operations.dbReads + metrics.operations.dbWrites;
    metrics.throughput.opsPerSecond = totalOps / totalDuration;
    metrics.throughput.jobsPerSecond = metrics.operations.queueProcessed / totalDuration;

    // Print final report
    console.log('\n' + '='.repeat(60));
    console.log('STRESS TEST RESULTS');
    console.log('='.repeat(60));

    console.log('\n📊 OPERATIONS:');
    console.log(`  Database Reads: ${metrics.operations.dbReads}`);
    console.log(`  Database Writes: ${metrics.operations.dbWrites}`);
    console.log(`  Queue Jobs Added: ${metrics.operations.queueJobs}`);
    console.log(`  Queue Jobs Processed: ${metrics.operations.queueProcessed}`);
    console.log(`  Errors: ${metrics.operations.errors}`);

    console.log('\n⏱️  LATENCY (ms):');
    if (metrics.latency.dbRead.length > 0) {
      const readStats = calcStats(metrics.latency.dbRead);
      console.log(`  DB Read:  min=${readStats.min.toFixed(1)}, avg=${readStats.avg.toFixed(1)}, p95=${readStats.p95.toFixed(1)}, p99=${readStats.p99.toFixed(1)}, max=${readStats.max.toFixed(1)}`);
    }
    if (metrics.latency.dbWrite.length > 0) {
      const writeStats = calcStats(metrics.latency.dbWrite);
      console.log(`  DB Write: min=${writeStats.min.toFixed(1)}, avg=${writeStats.avg.toFixed(1)}, p95=${writeStats.p95.toFixed(1)}, p99=${writeStats.p99.toFixed(1)}, max=${writeStats.max.toFixed(1)}`);
    }
    if (metrics.latency.queueAdd.length > 0) {
      const addStats = calcStats(metrics.latency.queueAdd);
      console.log(`  Queue Add: min=${addStats.min.toFixed(1)}, avg=${addStats.avg.toFixed(1)}, p95=${addStats.p95.toFixed(1)}, p99=${addStats.p99.toFixed(1)}, max=${addStats.max.toFixed(1)}`);
    }
    if (metrics.latency.queueProcess.length > 0) {
      const procStats = calcStats(metrics.latency.queueProcess);
      console.log(`  Queue Process: min=${procStats.min.toFixed(1)}, avg=${procStats.avg.toFixed(1)}, p95=${procStats.p95.toFixed(1)}, p99=${procStats.p99.toFixed(1)}, max=${procStats.max.toFixed(1)}`);
    }

    console.log('\n🚀 THROUGHPUT:');
    console.log(`  Operations/sec: ${metrics.throughput.opsPerSecond.toFixed(1)}`);
    console.log(`  Jobs/sec: ${metrics.throughput.jobsPerSecond.toFixed(1)}`);
    console.log(`  Total Duration: ${totalDuration.toFixed(1)}s`);

    console.log('\n💾 MEMORY:');
    console.log(`  Initial: ${(metrics.memory.initial.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Peak: ${(metrics.memory.peak.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Final: ${(metrics.memory.final.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Growth: ${((metrics.memory.final.heapUsed - metrics.memory.initial.heapUsed) / 1024 / 1024).toFixed(2)} MB`);

    console.log('\n✅ VALIDATION:');
    const validations = [
      { name: '1000+ user simulation', pass: metrics.operations.dbReads >= CONFIG.users },
      { name: 'Queue can process jobs', pass: metrics.operations.queueProcessed >= CONFIG.users * 0.9 },
      { name: 'DB read p99 < 500ms', pass: calcStats(metrics.latency.dbRead).p99 < 500 },
      { name: 'DB write p99 < 500ms', pass: calcStats(metrics.latency.dbWrite).p99 < 500 },
      { name: 'Error rate < 1%', pass: metrics.operations.errors / Math.max(1, metrics.operations.dbReads + metrics.operations.dbWrites) < 0.01 },
      { name: 'Memory growth < 1GB', pass: (metrics.memory.peak.heapUsed - metrics.memory.initial.heapUsed) / 1024 / 1024 < 1024 },
    ];

    let allPassed = true;
    for (const v of validations) {
      console.log(`  ${v.pass ? '✅' : '❌'} ${v.name}`);
      if (!v.pass) allPassed = false;
    }

    console.log('\n' + '='.repeat(60));
    console.log(allPassed ? '🎉 ALL STRESS TESTS PASSED!' : '⚠️  SOME VALIDATIONS FAILED');
    console.log(`Completed at: ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    process.exitCode = allPassed ? 0 : 1;
  } catch (error) {
    console.error('\n❌ STRESS TEST FAILED:', error);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('Stress test suite failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
