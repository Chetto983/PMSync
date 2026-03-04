/**
 * Railway Readiness Audit Script
 *
 * Deep audit of backend health, memory, rate limits, DB pool,
 * Redis connections, and API correctness before Railway deploy.
 *
 * Usage: npx ts-node backend/scripts/audit-railway-readiness.ts
 */
import 'dotenv/config';
import axios, { AxiosError } from 'axios';
// @ts-ignore - pg types not installed
import { Client } from 'pg';
import { createClient } from 'redis';

const BASE = process.env.AUDIT_BASE_URL || 'http://localhost:3000';
const NEON_URL = process.env.DATABASE_URL!;
const REDIS_URL = `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}/${process.env.REDIS_DB || 0}`;

interface AuditResult {
  category: string;
  test: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
}

const results: AuditResult[] = [];

function record(category: string, test: string, status: 'PASS' | 'FAIL' | 'WARN', detail: string) {
  results.push({ category, test, status, detail });
  const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
  console.log(`  ${icon} ${test}: ${detail}`);
}

async function httpGet(path: string, timeout = 5000) {
  return axios.get(`${BASE}${path}`, { validateStatus: () => true, timeout });
}

async function httpPost(path: string, data: any, timeout = 5000) {
  return axios.post(`${BASE}${path}`, data, { validateStatus: () => true, timeout });
}

// ─── 1. Health Endpoints ───────────────────────────────────────────
async function auditHealth() {
  console.log('\n📡 HEALTH ENDPOINTS');

  const endpoints = [
    ['/health', 200],
    ['/health/ready', 200],
    ['/health/live', 200],
    ['/health/queues', 200],
    ['/health/queues/all', 200],
    ['/health/metrics', 200],
  ] as const;

  for (const [path, expected] of endpoints) {
    try {
      const start = Date.now();
      const r = await httpGet(path);
      const ms = Date.now() - start;
      if (r.status === expected) {
        record('Health', `GET ${path}`, 'PASS', `${r.status} (${ms}ms)`);
      } else {
        record('Health', `GET ${path}`, 'FAIL', `Expected ${expected}, got ${r.status}`);
      }
    } catch (e) {
      record('Health', `GET ${path}`, 'FAIL', (e as Error).message);
    }
  }

  // Check health response structure
  try {
    const r = await httpGet('/health');
    const body = r.data?.data || r.data;
    const services = body?.services || {};
    for (const [svc, info] of Object.entries(services) as any) {
      const svcStatus = info?.status;
      record('Health', `Service: ${svc}`, svcStatus === 'up' ? 'PASS' : 'WARN', `status=${svcStatus}`);
    }
  } catch (e) {
    record('Health', 'Health body parse', 'FAIL', (e as Error).message);
  }
}

// ─── 2. Auth & Security ───────────────────────────────────────────
async function auditAuth() {
  console.log('\n🔒 AUTH & SECURITY');

  // CSRF protection on POST
  const login = await httpPost('/api/v1/auth/login', { email: 'x@x.com', password: 'x' });
  record('Auth', 'CSRF on POST /auth/login', login.status === 403 ? 'PASS' : 'FAIL',
    `Status ${login.status} (expect 403 CSRF block)`);

  // JWT required on protected routes
  const protectedRoutes = ['/api/v1/emails', '/api/v1/contacts', '/api/v1/calendar/events',
    '/api/v1/providers', '/api/v1/folders', '/api/v1/auth/me'];
  for (const path of protectedRoutes) {
    const r = await httpGet(path);
    record('Auth', `Auth guard ${path}`, r.status === 401 ? 'PASS' : 'FAIL',
      `Status ${r.status} (expect 401)`);
  }

  // Swagger docs accessible
  const swagger = await httpGet('/api/docs-json');
  record('Auth', 'Swagger /api/docs-json', swagger.status === 200 ? 'PASS' : 'FAIL',
    `Status ${swagger.status}`);
}

// ─── 3. Rate Limiting ─────────────────────────────────────────────
async function auditRateLimits() {
  console.log('\n🚦 RATE LIMITING');

  // Fire 10 sequential requests to /health
  let passed = 0;
  let blocked = 0;
  for (let i = 0; i < 10; i++) {
    const r = await httpGet('/health');
    if (r.status === 200) passed++;
    else if (r.status === 429) blocked++;
  }

  if (blocked > 0) {
    record('RateLimit', 'Health endpoint rate-limited', 'FAIL',
      `${blocked}/10 blocked by 429. Health MUST be excluded from throttler!`);
  } else {
    record('RateLimit', 'Health endpoint not rate-limited', 'PASS', `${passed}/10 passed`);
  }

  // Check if rate limit headers are present
  const r = await httpGet('/api/v1/emails');
  const retryAfter = r.headers['retry-after'];
  if (r.status === 429) {
    record('RateLimit', 'Rate limit currently active', 'WARN',
      `429 on /emails — rate limit may be exhausted from prior tests. Retry-After: ${retryAfter || 'not set'}`);
  } else {
    record('RateLimit', 'API rate limit check', 'PASS', `Status ${r.status}`);
  }
}

// ─── 4. Database (Neon) ───────────────────────────────────────────
async function auditDatabase() {
  console.log('\n🗄️  DATABASE (Neon)');

  const client = new Client({ connectionString: NEON_URL });
  try {
    const start = Date.now();
    await client.connect();
    const connectMs = Date.now() - start;
    record('DB', 'Neon connection', 'PASS', `Connected in ${connectMs}ms`);

    // Version
    const ver = await client.query('SELECT version()');
    record('DB', 'PostgreSQL version', 'PASS', ver.rows[0].version.split(',')[0]);

    // Table count
    const tables = await client.query(
      "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
    record('DB', 'Tables', 'PASS', `${tables.rows[0].count} tables`);

    // Extensions
    const exts = await client.query("SELECT extname FROM pg_extension ORDER BY extname");
    const extNames = exts.rows.map((r: any) => r.extname);
    const required = ['vector', 'pg_trgm', 'btree_gin'];
    for (const ext of required) {
      record('DB', `Extension: ${ext}`, extNames.includes(ext) ? 'PASS' : 'FAIL',
        extNames.includes(ext) ? 'installed' : 'MISSING');
    }

    // Connection pool check
    const poolRes = await client.query(
      "SELECT count(*) as active FROM pg_stat_activity WHERE datname = current_database()");
    const activeConns = parseInt(poolRes.rows[0].active);
    record('DB', 'Active connections', activeConns <= 20 ? 'PASS' : 'WARN',
      `${activeConns} active (limit should be ~20)`);

    // Migration status
    const migrations = await client.query(
      "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5");
    record('DB', 'Migrations applied', 'PASS',
      `${migrations.rows.length} recent: ${migrations.rows.map((r: any) => r.migration_name).join(', ')}`);

    // DB size
    const sizeRes = await client.query("SELECT pg_size_pretty(pg_database_size(current_database())) as size");
    record('DB', 'Database size', 'PASS', sizeRes.rows[0].size);

  } catch (e) {
    record('DB', 'Neon connection', 'FAIL', (e as Error).message);
  } finally {
    await client.end();
  }
}

// ─── 5. Redis ─────────────────────────────────────────────────────
async function auditRedis() {
  console.log('\n🔴 REDIS');

  const client = createClient({ url: REDIS_URL });
  try {
    await client.connect();
    record('Redis', 'Connection', 'PASS', 'Connected');

    const info = await client.info('memory');
    const usedMem = info.match(/used_memory_human:(.+)/)?.[1]?.trim();
    const peakMem = info.match(/used_memory_peak_human:(.+)/)?.[1]?.trim();
    record('Redis', 'Memory usage', 'PASS', `Used: ${usedMem}, Peak: ${peakMem}`);

    const infoClients = await client.info('clients');
    const connected = infoClients.match(/connected_clients:(\d+)/)?.[1];
    const connCount = parseInt(connected || '0');
    record('Redis', 'Connected clients', connCount <= 15 ? 'PASS' : 'WARN',
      `${connCount} connections (target ≤12 after optimization)`);

    const infoKeys = await client.info('keyspace');
    record('Redis', 'Keyspace', 'PASS', infoKeys.trim().split('\n').slice(1).join(', ') || 'empty');

  } catch (e) {
    record('Redis', 'Connection', 'FAIL', (e as Error).message);
  } finally {
    await client.disconnect();
  }
}

// ─── 6. Memory & Process ──────────────────────────────────────────
async function auditMemory() {
  console.log('\n🧠 MEMORY & PROCESS');

  const memUsage = process.memoryUsage();
  record('Memory', 'Audit script RSS', 'PASS',
    `${Math.round(memUsage.rss / 1024 / 1024)} MB`);

  // Estimate backend memory from health response time pattern
  // (We can't directly inspect the backend process from here)
  const start = Date.now();
  const r = await httpGet('/health');
  const healthMs = Date.now() - start;
  record('Memory', 'Health response time', healthMs < 1000 ? 'PASS' : 'WARN',
    `${healthMs}ms (should be <1000ms)`);

  // Metrics endpoint (triggers multiple DB queries — memory pressure test)
  const start2 = Date.now();
  const metrics = await httpGet('/health/metrics', 10000);
  const metricsMs = Date.now() - start2;
  record('Memory', 'Metrics endpoint (heavy)', metricsMs < 3000 ? 'PASS' : 'WARN',
    `${metricsMs}ms (triggers ~10 DB queries)`);
}

// ─── 7. Concurrency Stress ────────────────────────────────────────
async function auditConcurrency() {
  console.log('\n⚡ CONCURRENCY STRESS');

  // 10 parallel health checks (Railway + monitoring + user)
  const start = Date.now();
  const promises = Array.from({ length: 10 }, () => httpGet('/health', 10000));
  const responses = await Promise.all(promises);
  const elapsed = Date.now() - start;
  const ok = responses.filter(r => r.status === 200).length;
  const blocked = responses.filter(r => r.status === 429).length;

  if (blocked > 0) {
    record('Concurrency', '10 parallel /health', 'FAIL',
      `${blocked}/10 rate-limited (429). Exclude health from ThrottlerGuard!`);
  } else {
    record('Concurrency', '10 parallel /health', ok === 10 ? 'PASS' : 'WARN',
      `${ok}/10 OK in ${elapsed}ms`);
  }
}

// ─── 8. Railway-Specific Checks ───────────────────────────────────
async function auditRailwayConfig() {
  console.log('\n🚂 RAILWAY CONFIG');

  // Check Dockerfile exists
  const fs = await import('fs');
  const dockerfilePath = 'd:/MailAgent/backend/Dockerfile.railway';
  record('Railway', 'Dockerfile.railway exists',
    fs.existsSync(dockerfilePath) ? 'PASS' : 'FAIL', dockerfilePath);

  // Check railway.toml
  const tomlPath = 'd:/MailAgent/backend/railway.toml';
  record('Railway', 'railway.toml exists',
    fs.existsSync(tomlPath) ? 'PASS' : 'FAIL', tomlPath);

  if (fs.existsSync(tomlPath)) {
    const toml = fs.readFileSync(tomlPath, 'utf8');
    const hasHealthcheck = toml.includes('healthcheckPath');
    record('Railway', 'Healthcheck configured', hasHealthcheck ? 'PASS' : 'FAIL',
      hasHealthcheck ? 'Found in railway.toml' : 'MISSING — Railway needs healthcheckPath');
  }

  // Check NODE_OPTIONS for memory limit
  const nodeOptions = process.env.NODE_OPTIONS || '';
  record('Railway', 'NODE_OPTIONS memory limit',
    nodeOptions.includes('max-old-space-size') ? 'PASS' : 'WARN',
    nodeOptions || 'Not set — add --max-old-space-size=450 for 512MB Railway');

  // Check env vars that MUST be set on Railway
  const requiredEnvs = [
    'DATABASE_URL', 'REDIS_HOST', 'JWT_SECRET', 'AES_SECRET_KEY',
    'GMAIL_CLIENT_ID', 'MICROSOFT_CLIENT_ID', 'MISTRAL_API_KEY',
    'S3_ENDPOINT', 'S3_ACCESS_KEY', 'S3_BUCKET', 'SMTP_HOST',
  ];
  for (const env of requiredEnvs) {
    record('Railway', `ENV ${env}`, process.env[env] ? 'PASS' : 'FAIL',
      process.env[env] ? 'set' : 'MISSING — must set on Railway');
  }
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   Railway Readiness Audit                ║');
  console.log('║   Backend: ' + BASE.padEnd(30) + '║');
  console.log('╚══════════════════════════════════════════╝');

  await auditHealth();
  await auditAuth();
  await auditRateLimits();
  await auditDatabase();
  await auditRedis();
  await auditMemory();
  await auditConcurrency();
  await auditRailwayConfig();

  // Summary
  console.log('\n═══════════════════════════════════════════');
  const pass = results.filter(r => r.status === 'PASS').length;
  const warn = results.filter(r => r.status === 'WARN').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log(`\n📊 RESULTS: ${pass} PASS | ${warn} WARN | ${fail} FAIL`);

  if (fail > 0) {
    console.log('\n❌ FAILURES (must fix before deploy):');
    results.filter(r => r.status === 'FAIL').forEach(r =>
      console.log(`   - [${r.category}] ${r.test}: ${r.detail}`));
  }
  if (warn > 0) {
    console.log('\n⚠️  WARNINGS (should fix):');
    results.filter(r => r.status === 'WARN').forEach(r =>
      console.log(`   - [${r.category}] ${r.test}: ${r.detail}`));
  }

  if (fail === 0) {
    console.log('\n✅ READY FOR RAILWAY DEPLOY');
  } else {
    console.log('\n❌ NOT READY — fix failures first');
  }

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Audit crashed:', e);
  process.exit(2);
});
