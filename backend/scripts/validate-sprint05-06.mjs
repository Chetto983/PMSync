/**
 * Production validation for Sprint 05 + 06 (AI Features Audit Phase 3)
 * Tests each fix with real Railway data.
 */

const BACKEND = 'https://backend-production-78e1.up.railway.app';
const RESULTS = [];

function log(label, pass, detail = '') {
  const status = pass ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${label}${detail ? ' — ' + detail : ''}`);
  RESULTS.push({ label, pass, detail });
}

async function getSession() {
  // Login with Origin header to satisfy CORS
  const res = await fetch(`${BACKEND}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://mail-agent-indol.vercel.app' },
    body: JSON.stringify({ email: 'admin@pmsync.local', password: 'TestPassword123!' }),
  });
  // Extract Set-Cookie headers
  const cookies = res.headers.getSetCookie?.() || [];
  const sessionCookie = cookies.find(c => c.includes('session_token'));
  if (sessionCookie) return sessionCookie.split(';')[0];
  // Fallback: construct from response
  const data = await res.json().catch(() => null);
  if (data?.token) {
    console.log('WARNING: Using raw token (no HMAC). Some endpoints may fail.');
    return `__Secure-better-auth.session_token=${data.token}`;
  }
  throw new Error(`Login failed: status=${res.status}, cookies=${cookies.length}`);
}

async function getCsrf(cookie) {
  const res = await fetch(`${BACKEND}/api/v1/auth/csrf-token`, {
    headers: { Cookie: cookie },
  });
  const data = await res.json();
  const csrfToken = data?.data?.csrfToken || data?.csrfToken;
  return {
    token: csrfToken,
    cookie: csrfToken ? `csrf=${csrfToken}` : '',
  };
}

async function api(method, path, cookie, csrf, body) {
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  if (csrf) headers['x-csrf-token'] = csrf;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const start = Date.now();
  const res = await fetch(`${BACKEND}/api/v1${path}`, opts);
  const latency = Date.now() - start;
  const json = await res.json().catch(() => null);
  return { status: res.status, data: json?.data || json, latency };
}

async function main() {
  console.log('\n=== Sprint 05+06 Production Validation ===\n');

  // Auth
  const sessionCookie = await getSession();
  const { token: csrfToken, cookie: csrfCookie } = await getCsrf(sessionCookie);
  const cookie = `${sessionCookie}; ${csrfCookie}`;

  // ---- T-0501: Sorted-set semaphore ----
  const health = await api('GET', '/ai/health/detailed', cookie);
  const dlqData = health.data?.data || health.data;
  log('T-0501 Health endpoint live', health.status === 200, `${health.latency}ms`);
  if (dlqData?.services?.dlq) {
    log('T-0501 DLQ stats present', true, `totalFailed: ${dlqData.services.dlq.totalFailed}`);
  }

  // ---- T-0503: Briefing with token budget ----
  const briefing = await api('GET', '/ai/briefing', cookie);
  const brief = briefing.data?.briefing || briefing.data;
  const briefMeta = briefing.data?.meta || brief?.meta || {};
  log('T-0503 Briefing returns', briefing.status === 200, `source=${briefMeta.source}, model=${briefMeta.model}, ${briefing.latency}ms`);
  if (brief?.executiveSummary) {
    log('T-0503 Summary present', brief.executiveSummary.length > 0, `"${brief.executiveSummary.slice(0, 80)}..."`);
  }
  if (brief?.emailVolumeTrends) {
    log('T-0503 Volume trends', true, JSON.stringify(brief.emailVolumeTrends));
  }

  // ---- T-0504: Backfill status ----
  const backfill = await api('GET', '/ai/triage/backfill/status', cookie);
  const bf = backfill.data;
  log('T-0504 Backfill status', backfill.status === 200, `enabled=${bf?.enabled}, interval=${bf?.intervalMinutes}min`);
  if (bf?.queueStats) {
    log('T-0504 Queue stats', true, `completed=${bf.queueStats.completed}, failed=${bf.queueStats.failed}`);
  }

  // ---- T-0601: Draft prompt limits ----
  // Hard limit: >10000 chars
  const longInstruction = 'a'.repeat(12000);
  const draftHard = await api('POST', '/ai/drafts/generate', cookie, csrfToken, {
    emailId: 'test', instruction: longInstruction,
  });
  log('T-0601 Hard limit (12000 chars) → 400', draftHard.status === 400,
    draftHard.data?.error?.message || draftHard.data?.message || '');

  // Soft limit: 3000 chars (should truncate to 2000 but proceed)
  const medInstruction = 'b'.repeat(3000);
  const draftSoft = await api('POST', '/ai/drafts/generate', cookie, csrfToken, {
    emailId: 'test', instruction: medInstruction,
  });
  // Will get email not found (fake ID) but instruction accepted
  log('T-0601 Soft limit (3000 chars) accepted', draftSoft.status !== 400,
    `status=${draftSoft.status}, ${draftSoft.latency}ms`);

  // ---- T-0604: Notifications ----
  const notifs = await api('GET', '/ai/notifications', cookie);
  log('T-0604 GET notifications', notifs.status === 200,
    `count=${notifs.data?.notifications?.length ?? '?'}`);

  const markRead = await api('POST', '/ai/notifications/mark-read', cookie, csrfToken, { ids: ['fake'] });
  log('T-0604 POST mark-read', markRead.status === 201,
    `marked=${markRead.data?.marked ?? '?'}`);

  // ---- T-0502: Follow-up detection ----
  const detect = await api('POST', '/ai/follow-ups/detect', cookie, csrfToken, {});
  log('T-0502 Follow-up detect', detect.status === 200 || detect.status === 201,
    `source=${detect.data?.meta?.source}, warnings=${JSON.stringify(detect.data?.meta?.warnings || [])}, ${detect.latency}ms`);

  // ---- Summary ----
  console.log('\n=== SUMMARY ===');
  const passed = RESULTS.filter(r => r.pass).length;
  const failed = RESULTS.filter(r => !r.pass).length;
  console.log(`${passed} PASSED, ${failed} FAILED out of ${RESULTS.length} checks\n`);

  if (failed > 0) {
    console.log('FAILURES:');
    RESULTS.filter(r => !r.pass).forEach(r => console.log(`  ✗ ${r.label}: ${r.detail}`));
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
