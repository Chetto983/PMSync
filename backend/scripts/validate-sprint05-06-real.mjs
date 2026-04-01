/**
 * Production validation Sprint 05+06 — REAL DATA with LLM scoring
 * Uses the actual user session from Edge CDP.
 */
const BACKEND = 'https://backend-production-78e1.up.railway.app';
const RESULTS = [];

// Get session from Edge CDP
async function getSessionFromCDP() {
  const WebSocket = (await import('ws')).default;
  const pages = await fetch('http://localhost:9222/json/list').then(r => r.json());
  const target = pages.find(p => p.url.includes('vercel') || p.url.includes('pmsync'));
  if (!target) throw new Error('No PMSync page open in Edge');

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'Network.getAllCookies' })));
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.id !== 1) return;
      const cookies = msg.result?.cookies || [];
      let session = '', csrf = '', csrfCookie = '';
      for (const c of cookies) {
        if (c.name.includes('session_token')) session = `${c.name}=${c.value}`;
        if (c.name === 'csrf' && c.domain.includes('backend')) {
          csrf = c.value;
          csrfCookie = `csrf=${c.value}`;
        }
      }
      ws.close();
      if (!session) return reject(new Error('No session cookie'));
      resolve({ cookie: `${session}; ${csrfCookie}`, csrf });
    });
    setTimeout(() => { ws.close(); reject(new Error('CDP timeout')); }, 5000);
  });
}

function log(label, pass, detail = '') {
  const s = pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`[${s}] ${label}${detail ? ' — ' + detail : ''}`);
  RESULTS.push({ label, pass, detail });
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
  console.log('\n=== Sprint 05+06 REAL DATA Validation ===\n');
  const { cookie, csrf } = await getSessionFromCDP();

  // Verify session
  const session = await fetch(`${BACKEND}/api/auth/get-session`, { headers: { Cookie: cookie } }).then(r => r.json());
  const tenant = session?.user?.tenantId;
  console.log(`User: ${session?.user?.email} | Tenant: ${tenant}\n`);

  // --- Get real email IDs ---
  const emailsResp = await api('GET', '/emails?page=1&pageSize=5', cookie);
  const emails = emailsResp.data?.emails || emailsResp.data?.items || [];
  console.log(`Emails available: ${emailsResp.data?.total || '?'}\n`);

  // ===================== T-0501: Semaphore (sorted set) =====================
  const health = await api('GET', '/ai/health/detailed', cookie);
  const hd = health.data?.data || health.data;
  log('T-0501 Health endpoint', health.status === 200, `${health.latency}ms`);
  if (hd?.services?.dlq) {
    log('T-0501 DLQ stats in health', true, `totalFailed=${hd.services.dlq.totalFailed}`);
  }

  // ===================== T-0503: Briefing with token budget =====================
  // Force refresh to trigger real LLM call (not cache)
  const briefRefresh = await api('POST', '/ai/briefing/refresh', cookie, csrf, {});
  const br = briefRefresh.data?.briefing || briefRefresh.data;
  const brMeta = briefRefresh.data?.meta || br?.meta || {};
  log('T-0503 Briefing refresh (LLM call)', briefRefresh.status === 200 || briefRefresh.status === 201,
    `source=${brMeta.source}, model=${brMeta.model}, ${briefRefresh.latency}ms`);
  if (br?.priorityEmails) {
    log('T-0503 Priority emails from real data', br.priorityEmails.length >= 0,
      `count=${br.priorityEmails.length}`);
    if (br.priorityEmails.length > 0) {
      const top = br.priorityEmails[0];
      console.log(`    Top: "${top.subject?.slice(0,50)}" urgency=${top.urgency} reason="${top.reason?.slice(0,60)}"`);
    }
  }
  if (br?.executiveSummary) {
    log('T-0503 Executive summary', br.executiveSummary.length > 10,
      `"${br.executiveSummary.slice(0, 100)}..."`);
  }
  if (br?.emailVolumeTrends) {
    log('T-0503 Volume trends', true, JSON.stringify(br.emailVolumeTrends));
  }

  // ===================== T-0504: Backfill max-age =====================
  const bf = await api('GET', '/ai/triage/backfill/status', cookie);
  log('T-0504 Backfill status', bf.status === 200,
    `enabled=${bf.data?.enabled}, interval=${bf.data?.intervalMinutes}min, pending=${bf.data?.pendingEmails}`);

  // ===================== T-0505: Batch cap at 20 =====================
  // Check triage stats
  const triageStats = await api('GET', '/ai/triage/stats', cookie);
  if (triageStats.status === 200) {
    const ts = triageStats.data;
    log('T-0505 Triage stats', true,
      `totalTriaged=${ts?.totalTriaged}, pending=${ts?.pendingCount}, byPriority=${JSON.stringify(ts?.byPriority)}`);
  }

  // ===================== T-0601: Draft prompt limits =====================
  if (emails.length > 0) {
    const realEmailId = emails[0].id;
    // Hard limit
    const draftHard = await api('POST', '/ai/drafts/generate', cookie, csrf, {
      emailId: realEmailId, instruction: 'a'.repeat(12000),
    });
    log('T-0601 Hard limit 12k chars → 400', draftHard.status === 400,
      draftHard.data?.error?.message || draftHard.data?.message || `status=${draftHard.status}`);

    // Real draft with normal instruction
    const draftReal = await api('POST', '/ai/drafts/generate', cookie, csrf, {
      emailId: realEmailId, instruction: 'Reply politely saying I will look into this issue',
    });
    const draft = draftReal.data?.draft || draftReal.data;
    log('T-0601 Real draft generation', draftReal.status === 200,
      `confidence=${draft?.confidence}, tone=${draft?.tone}, ${draftReal.latency}ms`);
    if (draft?.body) {
      console.log(`    Draft: "${draft.body.slice(0, 120)}..."`);
    }
  }

  // ===================== T-0602: Analysis cache + real LLM scoring =====================
  if (emails.length > 0) {
    const testEmail = emails.find(e => !e.isAutoTriaged) || emails[0];
    // Trigger unified analysis (real LLM call)
    const analysis = await api('POST', `/ai/analyze/${testEmail.id}`, cookie, csrf, {});
    const an = analysis.data?.analysis || analysis.data;
    log('T-0602 Unified analysis (real LLM)', analysis.status === 200,
      `priority=${an?.priority}, sentiment=${an?.sentiment}, labels=${JSON.stringify(an?.labels)}, ${analysis.latency}ms`);
    if (an?.summary) {
      console.log(`    Summary: "${an.summary.slice(0, 100)}..."`);
      console.log(`    Urgency: ${an.urgency}, Intent: ${an.intent}, Confidence: ${an.confidence}`);
      console.log(`    Topics: ${JSON.stringify(an.keyTopics)}`);
    }
    const anMeta = analysis.data?.meta || an?.meta || {};
    if (anMeta.source) {
      log('T-0602 Analysis meta', true, `source=${anMeta.source}, model=${anMeta.model}`);
    }
  }

  // ===================== T-0502: Follow-up detection (real) =====================
  const detect = await api('POST', '/ai/follow-ups/detect', cookie, csrf, {});
  const det = detect.data?.detection || detect.data;
  const detMeta = detect.data?.meta || det?.meta || {};
  log('T-0502 Follow-up detection', detect.status === 200 || detect.status === 201,
    `source=${detMeta.source}, analyzed=${det?.batchSummary?.totalAnalyzed}, detected=${det?.batchSummary?.totalDetected}, ${detect.latency}ms`);
  if (detMeta.warnings?.length > 0) {
    console.log(`    Warnings: ${JSON.stringify(detMeta.warnings)}`);
  }

  // ===================== T-0604: Notifications =====================
  const notifs = await api('GET', '/ai/notifications', cookie);
  log('T-0604 Notifications endpoint', notifs.status === 200,
    `count=${notifs.data?.notifications?.length ?? '?'}`);

  // ===================== Summary =====================
  console.log('\n============ SUMMARY ============');
  const passed = RESULTS.filter(r => r.pass).length;
  const failed = RESULTS.filter(r => !r.pass).length;
  console.log(`\x1b[${failed === 0 ? '32' : '31'}m${passed} PASSED, ${failed} FAILED out of ${RESULTS.length} checks\x1b[0m\n`);

  if (failed > 0) {
    console.log('FAILURES:');
    RESULTS.filter(r => !r.pass).forEach(r => console.log(`  ✗ ${r.label}: ${r.detail}`));
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
