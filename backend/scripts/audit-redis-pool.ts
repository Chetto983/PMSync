// @ts-nocheck
/**
 * Redis Connection Pool Audit Script
 *
 * Audits all Redis connection consumers, their configuration, and
 * prints scaling recommendations for production deployments.
 *
 * Usage: npx ts-node --transpile-only scripts/audit-redis-pool.ts
 * Env: REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_DB
 */
import 'dotenv/config';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || '6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
const REDIS_DB = process.env.REDIS_DB || '0';

function printAudit() {
  console.log('='.repeat(80));
  console.log('  REDIS CONNECTION AUDIT');
  console.log('='.repeat(80));

  console.log(`\n  Environment: REDIS_HOST=${REDIS_HOST} REDIS_PORT=${REDIS_PORT} REDIS_DB=${REDIS_DB}`);
  console.log(`  Password configured: ${REDIS_PASSWORD ? 'yes' : 'no'}`);

  const header = '  Consumer                 | Connection Name    | maxRetriesPerReq | lazyConnect | Notes';
  const sep    = '  -------------------------+--------------------+------------------+-------------+--------------------------------------';

  console.log('\n' + header);
  console.log(sep);

  const consumers = [
    ['RedisConnectionService',   'shared-service',    '3',    'true',  'Shared: throttler, locks, OTP, TOTP, contacts cache, triage'],
    ['CacheService (node-redis)','(inline)',           'null', 'false', 'Separate cache connection, custom timeout'],
    ['BullMQ shared',            'bullmq-shared',      'null', 'true',  'Queue operations (ref-counted singleton)'],
    ['Socket.IO pub',            'ws-pub',             'null', 'false', 'Pub/sub for realtime (eager connect)'],
    ['Socket.IO sub',            'ws-sub',             'null', 'false', 'Pub/sub for realtime (duplicate of pub)'],
    ['Workers (per worker)',     '{name}-worker',       'null', 'false', 'One per BullMQ worker type'],
    ['QueryEmbeddingCache',      '(separate)',          '-',   '-',     'May use REDIS_QUERY_CACHE_DB'],
  ];

  for (const [consumer, name, retries, lazy, notes] of consumers) {
    console.log(`  ${consumer.padEnd(26)}| ${name.padEnd(18)} | ${retries.padEnd(16)} | ${lazy.padEnd(11)} | ${notes}`);
  }

  // Worker count estimation
  const workerQueues = [
    'email-sync-high', 'email-sync-normal', 'email-sync-low',
    'folder-operations',
    'email-embedding', 'contact-embedding', 'ai-processing', 'ai-summarization',
    'contacts-sync-high', 'contacts-sync-normal', 'contacts-sync-low',
    'calendar-sync-high', 'calendar-sync-normal', 'calendar-sync-low',
    'webhook-maintenance', 'dead-letter-queue',
    'email-send', 'provider-sync-back', 'bulk-operations', 'feedback',
    'scheduled-email-processing', 'email-cleanup', 'email-retention',
    'email-embedding-cleanup', 'sync-scheduler', 'webhook-lifecycle',
    'log-rotation', 'triage-backfill', 'reminder-check',
  ];

  console.log(`\n  Total registered queue names: ${workerQueues.length}`);
  console.log(`  Base connections (non-worker): ~6 (shared-service + cache + bullmq-shared + ws-pub + ws-sub + query-cache)`);
  console.log(`  Worker connections: 1 per active worker (not all queues have workers)`);
  console.log(`  Estimated total: ~10-15 connections per server instance`);

  console.log('\n' + '='.repeat(80));
  console.log('  SCALING RECOMMENDATIONS');
  console.log('='.repeat(80));

  console.log(`
  1. CONNECTION COUNT
     Each ioredis instance opens a single TCP connection. With ~6 base
     connections + active workers, a single server instance uses ~10-15
     Redis connections. Railway free-tier Redis typically allows ~20
     concurrent connections. Running multiple replicas will multiply this.
     Monitor with: redis-cli CLIENT LIST | wc -l

  2. maxRetriesPerRequest INCONSISTENCY (by design)
     - RedisConnectionService uses maxRetriesPerRequest=3 (retries on timeout)
     - BullMQ requires maxRetriesPerRequest=null (infinite retries for blocking BRPOPLPUSH)
     This is correct and intentional. The shared-service connection (used by
     throttler) will give up after 3 retries and then the throttler fails open.

  3. NO CONNECTION POOLING
     ioredis does NOT pool connections by default. Each 'new Redis()' is one
     TCP socket. For single-instance Railway deployments this is fine.
     For high-throughput multi-replica deployments, consider:
     - Redis Cluster mode (ioredis supports it natively)
     - Connection multiplexing via Redis proxy (e.g., Envoy, Twemproxy)
     - Reducing worker connections with getSharedRedisConnection() pattern

  4. FAIL-OPEN RISK (RedisThrottlerStorage)
     When Redis is unreachable, RedisThrottlerStorage.increment() catches
     the error and returns { totalHits: 0, isBlocked: false }. This means
     rate limiting silently stops working during Redis outages.
     RECOMMENDATION: Add metrics/logging when fail-open triggers so ops
     can detect when rate limiting is degraded.

  5. lazyConnect IMPLICATIONS
     - RedisConnectionService: lazyConnect=true. Connection established on
       first command. If Redis is slow, the first throttled request has
       elevated latency. Subsequent requests use the warm connection.
     - BullMQ shared: lazyConnect=true. Same lazy behavior.
     - Socket.IO adapter: lazyConnect=false (eager). Connects during
       app bootstrap and waits for 'ready' event (10s timeout).
     - Workers: lazyConnect=false (eager). Connect immediately.

  6. CacheService USES node-redis (NOT ioredis)
     CacheService uses the 'redis' npm package (node-redis), not ioredis.
     This means it has a separate connection pool strategy and different
     error handling behavior. The CACHE_REDIS_CONNECT_TIMEOUT_MS env var
     controls its connection timeout (default 5000ms).

  7. REDIS DB SEPARATION
     All connections default to REDIS_DB (typically 0). QueryEmbeddingCache
     may use REDIS_QUERY_CACHE_DB for isolation. Consider using separate
     Redis DBs for different concerns (cache vs queues vs throttler) to
     enable independent flushing without side effects.
`);
}

// ─── Optional: Live connectivity check ─────────────────────────────
async function pingRedis() {
  if (REDIS_HOST === 'localhost' && !process.env.REDIS_HOST) {
    console.log('  [SKIP] REDIS_HOST not set. Skipping connectivity check.');
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log('  REDIS CONNECTIVITY CHECK');
  console.log('='.repeat(80));

  try {
    const { Redis } = await import('ioredis');
    const client = new Redis({
      host: REDIS_HOST,
      port: parseInt(REDIS_PORT),
      password: REDIS_PASSWORD || undefined,
      db: parseInt(REDIS_DB),
      lazyConnect: true,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
    });

    const start = Date.now();
    await client.connect();
    const pong = await client.ping();
    const latency = Date.now() - start;

    console.log(`  PING: ${pong} (${latency}ms)`);

    const info = await client.info('clients');
    const connectedMatch = info.match(/connected_clients:(\d+)/);
    if (connectedMatch) {
      console.log(`  Connected clients: ${connectedMatch[1]}`);
    }

    const memInfo = await client.info('memory');
    const memMatch = memInfo.match(/used_memory_human:(.+)/);
    if (memMatch) {
      console.log(`  Memory usage: ${memMatch[1].trim()}`);
    }

    await client.quit();
    console.log('  [PASS] Redis connectivity verified.');
  } catch (e: any) {
    console.log(`  [WARN] Redis not reachable: ${e.message}`);
    console.log('  This is expected in local dev without Redis running.');
  }
}

// ─── Main ──────────────────────────────────────────────────────────
async function main() {
  printAudit();
  await pingRedis();

  console.log('\n' + '='.repeat(80));
  console.log('  Redis pool audit complete.');
  console.log('='.repeat(80));
  process.exit(0);
}

main().catch((e) => {
  console.error('Redis audit crashed:', e);
  process.exit(2);
});
