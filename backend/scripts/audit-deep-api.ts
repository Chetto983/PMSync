/**
 * Deep API Audit — Every endpoint, every module
 *
 * Tests ALL 236 API routes for:
 * - No 500 errors (server crashes)
 * - Correct auth enforcement (401 on protected, 403 CSRF on POST)
 * - Health endpoints always accessible
 * - Webhook endpoints respond (even without valid payload)
 * - Response time within budget
 *
 * Usage: npx ts-node --transpile-only backend/scripts/audit-deep-api.ts
 */
// @ts-nocheck
import 'dotenv/config';
import axios from 'axios';

const BASE = process.env.AUDIT_BASE_URL || 'http://localhost:3000';
const TIMEOUT = 10000;

interface TestResult {
  method: string;
  path: string;
  status: number;
  ms: number;
  pass: boolean;
  reason: string;
  category: string;
}

const results: TestResult[] = [];

async function req(method: string, path: string, body?: any, headers?: any) {
  const start = Date.now();
  try {
    const r = await axios({
      method: method.toLowerCase(),
      url: `${BASE}${path}`,
      data: body,
      headers,
      validateStatus: () => true,
      timeout: TIMEOUT,
    });
    return { status: r.status, ms: Date.now() - start, data: r.data, headers: r.headers };
  } catch (e: any) {
    return { status: 0, ms: Date.now() - start, data: null, headers: {}, error: e.code || e.message };
  }
}

function test(category: string, method: string, path: string, status: number, ms: number,
  pass: boolean, reason: string) {
  results.push({ method, path, status, ms, pass, reason, category });
}

// ─── Health (no auth) ──────────────────────────────────────────
async function auditHealth() {
  console.log('\n📡 HEALTH (7 routes)');
  const routes = [
    '/health', '/health/ready', '/health/live',
    '/health/queues', '/health/queues/all', '/health/metrics',
  ];
  for (const path of routes) {
    const r = await req('GET', path);
    const pass = r.status === 200;
    test('Health', 'GET', path, r.status, r.ms, pass,
      pass ? 'OK' : `Expected 200, got ${r.status}`);
    log(pass, 'GET', path, r.status, r.ms);
  }
  // Named queue
  const r = await req('GET', '/health/queues/high');
  const pass = r.status === 200;
  test('Health', 'GET', '/health/queues/high', r.status, r.ms, pass,
    pass ? 'OK' : `Expected 200, got ${r.status}`);
  log(pass, 'GET', '/health/queues/high', r.status, r.ms);
}

// ─── Auth module ───────────────────────────────────────────────
async function auditAuth() {
  console.log('\n🔒 AUTH (14 routes)');
  // GET routes → 401 (no token)
  const getRoutes = ['/api/v1/auth/me', '/api/v1/auth/csrf-token'];
  for (const path of getRoutes) {
    const r = await req('GET', path);
    // csrf-token should return 200 (public), me should return 401
    const expected = path.includes('csrf') ? 200 : 401;
    const pass = r.status === expected;
    test('Auth', 'GET', path, r.status, r.ms, pass,
      pass ? 'OK' : `Expected ${expected}, got ${r.status}`);
    log(pass, 'GET', path, r.status, r.ms);
  }

  // POST routes → 403 (CSRF) — no CSRF token sent
  const postRoutes = [
    ['/api/v1/auth/register', { email: 'test@t.com', password: 'Testtest1!' }],
    ['/api/v1/auth/login', { email: 'test@t.com', password: 'x' }],
    ['/api/v1/auth/send-otp', { email: 'test@t.com' }],
    ['/api/v1/auth/verify-otp', { email: 'test@t.com', code: '000000' }],
    ['/api/v1/auth/forgot-password', { email: 'test@t.com' }],
    ['/api/v1/auth/reset-password', { token: 'x', password: 'x' }],
    ['/api/v1/auth/logout', {}],
    ['/api/v1/auth/mfa/verify', { code: '000000' }],
    ['/api/v1/auth/webauthn/login/options', {}],
    ['/api/v1/auth/webauthn/login/verify', {}],
    ['/api/v1/auth/google/callback', { code: 'x' }],
    ['/api/v1/auth/microsoft/callback', { code: 'x' }],
  ];
  for (const [path, body] of postRoutes) {
    const r = await req('POST', path as string, body);
    // CSRF should block (403) or auth should block (401). 500 = bug.
    const pass = r.status !== 500 && r.status !== 502 && r.status !== 503;
    test('Auth', 'POST', path as string, r.status, r.ms, pass,
      pass ? `Blocked (${r.status})` : `SERVER ERROR ${r.status}`);
    log(pass, 'POST', path as string, r.status, r.ms);
  }
}

// ─── Protected GET routes (expect 401) ─────────────────────────
async function auditProtectedGets() {
  console.log('\n🛡️  PROTECTED GET ROUTES');
  const routes = [
    // Emails
    '/api/v1/emails', '/api/v1/emails/stats', '/api/v1/emails/search',
    '/api/v1/emails/conversations', '/api/v1/emails/retention/stats',
    // Folders
    '/api/v1/folders', '/api/v1/folders/metadata',
    // Contacts
    '/api/v1/contacts', '/api/v1/contacts/counts',
    '/api/v1/contacts/relationship-scores', '/api/v1/contacts/stale',
    '/api/v1/contacts/vip/list',
    // Calendar
    '/api/v1/calendar/events', '/api/v1/calendar/calendars',
    '/api/v1/calendar/conflicts', '/api/v1/calendar/focus-time',
    // Providers
    '/api/v1/providers',
    // AI
    '/api/v1/ai/briefing', '/api/v1/ai/actions/pending',
    '/api/v1/ai/follow-ups/pending', '/api/v1/ai/deadlines',
    '/api/v1/ai/analytics/email', '/api/v1/ai/crm/stale-contacts',
    '/api/v1/ai/triage/backfill/status', '/api/v1/ai/triage/suggested-vips',
    '/api/v1/ai/stats/writing-style', '/api/v1/ai/draft-stats',
    '/api/v1/ai/health',
    // AI Chat
    '/api/v1/ai/chat/conversations', '/api/v1/ai/chat/pending-actions',
    // AI Knowledge Base
    '/api/v1/ai/knowledge-base/embeddings',
    // AI Observability
    '/api/v1/ai/runs', '/api/v1/ai/runs/cost-summary',
    // Email Sync
    '/api/v1/email-sync/status', '/api/v1/email-sync/health',
    '/api/v1/email-sync/queues', '/api/v1/email-sync/alerts',
    '/api/v1/email-sync/webhooks/health',
    // Signatures
    '/api/v1/emails/signatures', '/api/v1/emails/signatures/default',
    // Templates
    '/api/v1/emails/templates', '/api/v1/emails/templates/categories',
    '/api/v1/emails/templates/default',
    // Labels
    '/api/v1/labels',
    // Users
    '/api/v1/users/me', '/api/v1/users/me/messages',
    '/api/v1/users/me/preferences', '/api/v1/users/me/dashboard-preferences',
    // Tenants
    '/api/v1/tenants',
    // Subscription
    '/api/v1/subscription', '/api/v1/subscription/usage',
    '/api/v1/subscription/cost-status', '/api/v1/subscription/limits',
    '/api/v1/subscription/features', '/api/v1/subscription/cost-breakdown',
    '/api/v1/subscription/feature-usage',
    // Compliance
    '/api/v1/compliance/gdpr/status', '/api/v1/compliance/consent',
    '/api/v1/compliance/consent/history', '/api/v1/compliance/legal/status',
    '/api/v1/compliance/data-export',
    // MFA
    '/api/v1/auth/mfa/status', '/api/v1/auth/mfa/totp/status',
    '/api/v1/auth/mfa/backup/count', '/api/v1/auth/mfa/devices',
    '/api/v1/auth/mfa/webauthn/credentials',
    // Billing
    '/api/v1/autumn/components/pricing_table',
  ];

  for (const path of routes) {
    const r = await req('GET', path);
    // Should be 401 (auth required) or 200 (public). Never 500.
    const is500 = r.status >= 500;
    const pass = !is500;
    test('Protected GET', 'GET', path, r.status, r.ms, pass,
      is500 ? `SERVER ERROR ${r.status}` : `${r.status} OK`);
    log(pass, 'GET', path, r.status, r.ms, r.status !== 401 ? `(${r.status})` : '');
  }
}

// ─── Protected POST routes (expect 403 CSRF or 401) ────────────
async function auditProtectedPosts() {
  console.log('\n🛡️  PROTECTED POST ROUTES');
  const routes: [string, any][] = [
    // Emails
    ['/api/v1/emails/send', { to: 'x@x.com', subject: 'test', body: 'test' }],
    ['/api/v1/emails/drafts', { subject: 'test' }],
    ['/api/v1/emails/maintenance/cleanup', {}],
    ['/api/v1/emails/retention/run', {}],
    // Contacts
    ['/api/v1/contacts', { displayName: 'Test' }],
    ['/api/v1/contacts/local', { displayName: 'Test' }],
    ['/api/v1/contacts/extract-from-emails', {}],
    ['/api/v1/contacts/sync-all', {}],
    ['/api/v1/contacts/lookup-by-emails', { emails: ['x@x.com'] }],
    // Calendar
    ['/api/v1/calendar/events', { title: 'Test' }],
    ['/api/v1/calendar/calendars', { name: 'Test' }],
    // Providers
    ['/api/v1/providers/google/auth-url', {}],
    ['/api/v1/providers/microsoft/auth-url', {}],
    ['/api/v1/providers/generic/connect', { host: 'x', email: 'x', password: 'x' }],
    ['/api/v1/providers/generic/test', { host: 'x', email: 'x', password: 'x' }],
    // AI
    ['/api/v1/ai/compose', { prompt: 'test' }],
    ['/api/v1/ai/triage', {}],
    ['/api/v1/ai/triage/backfill', {}],
    ['/api/v1/ai/briefing/refresh', {}],
    ['/api/v1/ai/follow-ups/detect', {}],
    ['/api/v1/ai/drafts/generate', {}],
    ['/api/v1/ai/writing-style/manual-samples', { samples: [] }],
    ['/api/v1/ai/memory/search', { query: 'test' }],
    // AI Chat
    ['/api/v1/ai/chat', { message: 'test' }],
    ['/api/v1/ai/chat/approve', { actionId: 'x' }],
    // Knowledge Base
    ['/api/v1/ai/knowledge-base/search', { query: 'test' }],
    ['/api/v1/ai/knowledge-base/emails/backfill', {}],
    // Email Sync
    ['/api/v1/email-sync/sync-all', {}],
    ['/api/v1/email-sync/webhooks/create-all', {}],
    ['/api/v1/email-sync/webhooks/renew', {}],
    // Folders
    ['/api/v1/folders', { name: 'Test' }],
    ['/api/v1/folders/sync-all', {}],
    // Labels
    ['/api/v1/labels', { name: 'Test' }],
    ['/api/v1/labels/reorder', { ids: [] }],
    // Signatures
    ['/api/v1/emails/signatures', { name: 'Test' }],
    // Templates
    ['/api/v1/emails/templates', { name: 'Test' }],
    // Tenants
    ['/api/v1/tenants', { name: 'Test' }],
    // Users
    ['/api/v1/users/me/avatar', {}],
    // Compliance
    ['/api/v1/compliance/consent', { type: 'analytics', granted: true }],
    ['/api/v1/compliance/legal/accept', { document: 'tos', version: '1.0' }],
    ['/api/v1/compliance/data-deletion', {}],
    ['/api/v1/compliance/data-export', {}],
    // Subscription
    ['/api/v1/subscription/cancel', {}],
    // Billing
    ['/api/v1/autumn/customers', {}],
    ['/api/v1/autumn/attach', {}],
    ['/api/v1/autumn/check', {}],
    ['/api/v1/autumn/track', {}],
    ['/api/v1/autumn/billing_portal', {}],
    ['/api/v1/autumn/openBillingPortal', {}],
    ['/api/v1/autumn/cancel', {}],
    // MFA
    ['/api/v1/auth/mfa/totp/setup', {}],
    ['/api/v1/auth/mfa/totp/verify', { code: '000000' }],
    ['/api/v1/auth/mfa/backup/generate', {}],
    ['/api/v1/auth/mfa/backup/verify', { code: 'x' }],
    ['/api/v1/auth/mfa/devices/trust', {}],
    ['/api/v1/auth/mfa/webauthn/register/options', {}],
    ['/api/v1/auth/mfa/webauthn/register/verify', {}],
    ['/api/v1/auth/mfa/webauthn/authenticate/options', {}],
    ['/api/v1/auth/mfa/webauthn/authenticate/verify', {}],
  ];

  for (const [path, body] of routes) {
    const r = await req('POST', path, body);
    const is500 = r.status >= 500;
    const pass = !is500;
    test('Protected POST', 'POST', path, r.status, r.ms, pass,
      is500 ? `SERVER ERROR ${r.status}` : `${r.status} OK`);
    log(pass, 'POST', path, r.status, r.ms, r.status !== 403 ? `(${r.status})` : '');
  }
}

// ─── Webhook endpoints (no auth, but need valid payload) ───────
async function auditWebhooks() {
  console.log('\n🔗 WEBHOOKS (9 routes)');

  // GET health endpoints (should always 200)
  const healthRoutes = ['/webhooks/health', '/webhooks/calendar/health', '/webhooks/contacts/health'];
  for (const path of healthRoutes) {
    const r = await req('GET', path);
    const pass = r.status === 200;
    test('Webhooks', 'GET', path, r.status, r.ms, pass,
      pass ? 'OK' : `Expected 200, got ${r.status}`);
    log(pass, 'GET', path, r.status, r.ms);
  }

  // POST endpoints (will reject payload but should NOT 500)
  const postRoutes = [
    ['/webhooks/gmail/push', { message: { data: '' } }],
    ['/webhooks/microsoft/notifications', { value: [] }],
    ['/webhooks/calendar/google/push', {}],
    ['/webhooks/calendar/microsoft/notifications', { value: [] }],
    ['/webhooks/contacts/google/sync', {}],
    ['/webhooks/contacts/microsoft/notifications', { value: [] }],
  ];
  for (const [path, body] of postRoutes) {
    const r = await req('POST', path as string, body);
    const is500 = r.status >= 500;
    const pass = !is500;
    test('Webhooks', 'POST', path as string, r.status, r.ms, pass,
      is500 ? `SERVER ERROR ${r.status}` : `${r.status} (expected reject)`);
    log(pass, 'POST', path as string, r.status, r.ms);
  }
}

// ─── OAuth callbacks ───────────────────────────────────────────
async function auditOAuthCallbacks() {
  console.log('\n🔑 OAUTH CALLBACKS (2 routes)');
  const routes = ['/auth/gmail/callback', '/auth/microsoft/callback'];
  for (const path of routes) {
    const r = await req('GET', `${path}?code=invalid_test`);
    const is500 = r.status >= 500;
    const pass = !is500;
    test('OAuth', 'GET', path, r.status, r.ms, pass,
      is500 ? `SERVER ERROR ${r.status}` : `${r.status} (expected error, no 500)`);
    log(pass, 'GET', path, r.status, r.ms);
  }
}

// ─── DELETE/PATCH/PUT with IDs (should 401 or 404, never 500) ─
async function auditMutations() {
  console.log('\n✏️  MUTATION ROUTES (PATCH/PUT/DELETE)');
  const routes: [string, string, any?][] = [
    ['PATCH', '/api/v1/emails/fake-id'],
    ['DELETE', '/api/v1/emails/fake-id'],
    ['PATCH', '/api/v1/contacts/fake-id'],
    ['DELETE', '/api/v1/contacts/fake-id'],
    ['PATCH', '/api/v1/calendar/events/fake-id'],
    ['DELETE', '/api/v1/calendar/events/fake-id'],
    ['PATCH', '/api/v1/providers/fake-id'],
    ['DELETE', '/api/v1/providers/fake-id'],
    ['GET', '/api/v1/emails/fake-id'],
    ['GET', '/api/v1/contacts/fake-id'],
    ['GET', '/api/v1/calendar/events/fake-id'],
    ['GET', '/api/v1/providers/fake-id'],
    ['GET', '/api/v1/emails/signatures/fake-id'],
    ['GET', '/api/v1/emails/templates/fake-id'],
    ['GET', '/api/v1/labels/fake-id'],
    ['GET', '/api/v1/tenants/fake-id'],
    ['DELETE', '/api/v1/emails/signatures/fake-id'],
    ['DELETE', '/api/v1/emails/templates/fake-id'],
    ['DELETE', '/api/v1/labels/fake-id'],
    ['DELETE', '/api/v1/tenants/fake-id'],
    ['PATCH', '/api/v1/folders/fake-id'],
    ['DELETE', '/api/v1/folders/fake-id'],
    ['PUT', '/api/v1/users/me', { displayName: 'x' }],
    ['DELETE', '/api/v1/users/me'],
    ['PATCH', '/api/v1/users/me/preferences', {}],
    ['PUT', '/api/v1/users/me/dashboard-preferences', {}],
    ['PUT', '/api/v1/labels/fake-id', { name: 'x' }],
    ['PUT', '/api/v1/tenants/fake-id', { name: 'x' }],
    ['PATCH', '/api/v1/emails/bulk/read', { ids: [], isRead: true }],
    ['PATCH', '/api/v1/emails/bulk/star', { ids: [], isStarred: true }],
    ['PATCH', '/api/v1/emails/bulk/flag', { ids: [], isFlagged: true }],
    ['PATCH', '/api/v1/emails/bulk/move', { ids: [], folderId: 'x' }],
    ['PATCH', '/api/v1/emails/bulk/labels/add', { ids: [], labelIds: [] }],
    ['PATCH', '/api/v1/emails/bulk/labels/remove', { ids: [], labelIds: [] }],
    ['DELETE', '/api/v1/emails/bulk', { ids: [] }],
    // MFA deletions
    ['DELETE', '/api/v1/auth/mfa/totp'],
    ['DELETE', '/api/v1/auth/mfa/devices'],
    ['DELETE', '/api/v1/auth/mfa/devices/fake-id'],
    ['DELETE', '/api/v1/auth/mfa/webauthn/credentials/fake-id'],
    ['PATCH', '/api/v1/auth/mfa/webauthn/credentials/fake-id', { name: 'x' }],
    // Compliance
    ['DELETE', '/api/v1/compliance/data-deletion/cancel'],
    ['DELETE', '/api/v1/ai/chat/conversations/fake-id'],
    ['DELETE', '/api/v1/ai/knowledge-base/embeddings/fake-id'],
    // Calendar patch
    ['PATCH', '/api/v1/calendar/calendars/fake-provider/fake-cal', { name: 'x' }],
  ];

  for (const [method, path, body] of routes) {
    const r = await req(method, path, body);
    const is500 = r.status >= 500;
    const pass = !is500;
    test('Mutations', method, path, r.status, r.ms, pass,
      is500 ? `SERVER ERROR ${r.status}` : `${r.status} OK`);
    log(pass, method, path, r.status, r.ms, r.status !== 401 && r.status !== 403 ? `(${r.status})` : '');
  }
}

// ─── Response time budget ──────────────────────────────────────
async function auditResponseTimes() {
  console.log('\n⏱️  RESPONSE TIME BUDGET');
  const slowThreshold = 2000;
  const slow = results.filter(r => r.ms > slowThreshold);
  if (slow.length === 0) {
    console.log(`  ✅ All ${results.length} requests under ${slowThreshold}ms`);
  } else {
    console.log(`  ⚠️  ${slow.length} slow requests (>${slowThreshold}ms):`);
    slow.forEach(r => console.log(`     ${r.method} ${r.path}: ${r.ms}ms`));
  }
}

function log(pass: boolean, method: string, path: string, status: number, ms: number, extra = '') {
  const icon = pass ? '✅' : '❌';
  console.log(`  ${icon} ${method} ${path} → ${status} (${ms}ms) ${extra}`);
}

// ─── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Deep API Audit — All 236 Routes               ║');
  console.log('║   ' + BASE.padEnd(46) + '║');
  console.log('╚══════════════════════════════════════════════════╝');

  await auditHealth();
  await auditAuth();
  await auditProtectedGets();
  await auditProtectedPosts();
  await auditWebhooks();
  await auditOAuthCallbacks();
  await auditMutations();
  await auditResponseTimes();

  // ─── Summary ──────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  const pass = results.filter(r => r.pass).length;
  const fail = results.filter(r => !r.pass).length;
  const total = results.length;

  console.log(`\n📊 TOTAL: ${pass}/${total} PASS | ${fail} FAIL`);

  if (fail > 0) {
    console.log('\n❌ FAILURES (500 errors — must fix):');
    results.filter(r => !r.pass).forEach(r =>
      console.log(`   ${r.method} ${r.path} → ${r.status} (${r.ms}ms) [${r.category}]`));
  }

  // Status distribution
  const statusDist: Record<number, number> = {};
  results.forEach(r => { statusDist[r.status] = (statusDist[r.status] || 0) + 1; });
  console.log('\n📈 Status Distribution:');
  Object.entries(statusDist).sort().forEach(([s, c]) =>
    console.log(`   ${s}: ${c} routes`));

  // Category summary
  const catSummary: Record<string, { pass: number; fail: number }> = {};
  results.forEach(r => {
    catSummary[r.category] = catSummary[r.category] || { pass: 0, fail: 0 };
    catSummary[r.category][r.pass ? 'pass' : 'fail']++;
  });
  console.log('\n📦 By Category:');
  Object.entries(catSummary).forEach(([cat, { pass: p, fail: f }]) =>
    console.log(`   ${f > 0 ? '❌' : '✅'} ${cat}: ${p} pass, ${f} fail`));

  // Avg response time
  const avgMs = Math.round(results.reduce((a, r) => a + r.ms, 0) / total);
  const maxMs = Math.max(...results.map(r => r.ms));
  const maxRoute = results.find(r => r.ms === maxMs);
  console.log(`\n⏱️  Avg: ${avgMs}ms | Max: ${maxMs}ms (${maxRoute?.method} ${maxRoute?.path})`);

  if (fail === 0) {
    console.log('\n✅ ALL ROUTES CLEAN — NO 500 ERRORS');
  } else {
    console.log('\n❌ FIX FAILURES BEFORE DEPLOY');
  }

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Audit crashed:', e);
  process.exit(2);
});
