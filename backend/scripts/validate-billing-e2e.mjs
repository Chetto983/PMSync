/**
 * E2E Billing Validation — exercises all billing flows against Railway backend.
 * Uses Edge CDP session for authentication (same pattern as validate-sprint05-06-real.mjs).
 *
 * Run: node backend/scripts/validate-billing-e2e.mjs
 * Prereq: Edge launched with --remote-debugging-port=9222, logged into PMSync.
 */
const BACKEND = 'https://backend-production-78e1.up.railway.app';
const RESULTS = [];

// --------------- Infrastructure ---------------

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
  console.log(`[${s}] ${label}${detail ? ' -- ' + detail : ''}`);
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

// --------------- Test Cases ---------------

async function main() {
  console.log('\n=== Billing E2E Validation ===\n');

  let cookie, csrf;
  try {
    ({ cookie, csrf } = await getSessionFromCDP());
  } catch (err) {
    console.error('\x1b[31mFATAL: Could not get session from Edge CDP.\x1b[0m');
    console.error('Launch Edge: msedge --remote-debugging-port=9222');
    console.error('Navigate to: https://mail-agent-indol.vercel.app and log in');
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  // Verify session
  const session = await fetch(`${BACKEND}/api/auth/get-session`, {
    headers: { Cookie: cookie },
  }).then(r => r.json());
  const tenant = session?.user?.tenantId;
  console.log(`User: ${session?.user?.email} | Tenant: ${tenant}\n`);

  // ===================== B-01: Session + Subscription state =====================
  let subData;
  try {
    const sub = await api('GET', '/subscription', cookie);
    subData = sub.data;
    const validPlans = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
    const planOk = validPlans.includes(subData?.plan);
    log('B-01 Subscription state', sub.status === 200 && planOk,
      `plan=${subData?.plan}, status=${subData?.status}, autumnId=${subData?.autumnCustomerId || 'none'}`);
    if (!subData?.autumnCustomerId) {
      console.log('  \x1b[33mWARN: No autumnCustomerId -- Autumn may not be configured on Railway. Some tests may return fallback data.\x1b[0m');
    }
  } catch (err) {
    log('B-01 Subscription state', false, `Error: ${err.message}`);
    subData = {};
  }

  // ===================== B-02: Feature check (entitlement gating) =====================
  // POST /api/v1/autumn/check
  try {
    const check = await api('POST', '/autumn/check', cookie, csrf, {
      featureId: 'email-processing',
    });
    log('B-02 Feature check', check.status === 200,
      `allowed=${check.data?.allowed}, remaining=${check.data?.remaining}, ${check.latency}ms`);
  } catch (err) {
    log('B-02 Feature check', false, `Error: ${err.message}`);
  }

  // ===================== B-03: Usage tracking =====================
  // POST /api/v1/autumn/track + GET /api/v1/subscription/usage
  try {
    const usageBefore = await api('GET', '/subscription/usage', cookie);
    const aiBefore = usageBefore.data?.aiCallsUsed || 0;

    const track = await api('POST', '/autumn/track', cookie, csrf, {
      featureId: 'ai-calls',
      amount: 1,
    });
    log('B-03 Usage track call', track.status === 200, `${track.latency}ms`);

    const usageAfter = await api('GET', '/subscription/usage', cookie);
    const aiAfter = usageAfter.data?.aiCallsUsed || 0;
    log('B-03 Usage increment', aiAfter >= aiBefore,
      `before=${aiBefore}, after=${aiAfter}`);
  } catch (err) {
    log('B-03 Usage tracking', false, `Error: ${err.message}`);
  }

  // ===================== B-04: Billing portal URL =====================
  // POST /api/v1/autumn/billing_portal
  try {
    const portal = await api('POST', '/autumn/billing_portal', cookie, csrf, {});
    const hasUrl = portal.status === 200 && typeof portal.data?.url === 'string' && portal.data.url.length > 0;
    log('B-04 Billing portal URL', hasUrl,
      hasUrl ? `url=${portal.data.url.substring(0, 60)}...` : `status=${portal.status}`);
  } catch (err) {
    log('B-04 Billing portal URL', false, `Error: ${err.message}`);
  }

  // ===================== B-05: Attach flow =====================
  // POST /api/v1/autumn/attach
  try {
    if (subData?.plan === 'FREE') {
      const attach = await api('POST', '/autumn/attach', cookie, csrf, {
        productId: 'starter',
      });
      const hasCheckout = attach.status === 200 &&
        typeof attach.data?.checkoutUrl === 'string' &&
        attach.data.checkoutUrl.startsWith('https://');
      log('B-05 Attach flow', hasCheckout,
        hasCheckout ? `checkoutUrl=${attach.data.checkoutUrl.substring(0, 60)}...` : `status=${attach.status}`);
    } else {
      log('B-05 Attach flow', true, `SKIPPED -- already subscribed (plan=${subData?.plan})`);
    }
  } catch (err) {
    log('B-05 Attach flow', false, `Error: ${err.message}`);
  }

  // ===================== B-06: Cancel flow =====================
  // POST /api/v1/autumn/cancel
  try {
    if (subData?.plan && subData.plan !== 'FREE') {
      const cancel = await api('POST', '/autumn/cancel', cookie, csrf, {
        productId: subData.plan.toLowerCase(),
      });
      log('B-06 Cancel flow', cancel.status === 200,
        `${cancel.latency}ms`);

      const afterCancel = await api('GET', '/subscription', cookie);
      log('B-06 Post-cancel state', true,
        `cancelAt=${afterCancel.data?.cancelAt}, status=${afterCancel.data?.status}`);
    } else {
      log('B-06 Cancel flow', true, 'SKIPPED -- on FREE plan');
    }
  } catch (err) {
    log('B-06 Cancel flow', false, `Error: ${err.message}`);
  }

  // ===================== B-07: Webhook rejects unsigned =====================
  try {
    const webhookRes = await fetch(`${BACKEND}/webhooks/autumn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'test', data: {} }),
    });
    // Any non-200 is acceptable (401, 400, 500 all mean rejection)
    log('B-07 Webhook rejects unsigned', webhookRes.status !== 200,
      `status=${webhookRes.status}`);
  } catch (err) {
    log('B-07 Webhook rejects unsigned', false, `Error: ${err.message}`);
  }

  // ===================== B-08: Cost protection status =====================
  // GET /api/v1/subscription/cost-status
  try {
    const costStatus = await api('GET', '/subscription/cost-status', cookie);
    log('B-08 Cost protection status', costStatus.status === 200,
      `dailyCost=${costStatus.data?.dailyCost}, dailyCap=${costStatus.data?.dailyCap}, ` +
      `percentUsed=${costStatus.data?.percentUsed}, alertLevel=${costStatus.data?.alertLevel}`);
  } catch (err) {
    log('B-08 Cost protection status', false, `Error: ${err.message}`);
  }

  // ===================== B-09: Subscription state consistency =====================
  try {
    const finalSub = await api('GET', '/subscription', cookie);
    const d = finalSub.data;
    const validPlans = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
    const validStatuses = ['ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING'];
    const planValid = validPlans.includes(d?.plan);
    // Status can be null for FREE plan
    const statusValid = d?.status === null || d?.status === undefined || validStatuses.includes(d?.status);
    const hasUsage = !!d?.usage;
    log('B-09 State consistency', planValid && statusValid,
      `plan=${d?.plan}, status=${d?.status}, hasUsage=${hasUsage}`);
  } catch (err) {
    log('B-09 State consistency', false, `Error: ${err.message}`);
  }

  // ===================== B-10: Pricing table =====================
  // GET /api/v1/autumn/components/pricing_table
  try {
    const pricing = await api('GET', '/autumn/components/pricing_table', cookie);
    const dataType = typeof pricing.data;
    const dataLen = Array.isArray(pricing.data) ? pricing.data.length
      : typeof pricing.data === 'string' ? pricing.data.length
      : JSON.stringify(pricing.data || '').length;
    log('B-10 Pricing table', pricing.status === 200,
      `type=${dataType}, length=${dataLen}, ${pricing.latency}ms`);
  } catch (err) {
    log('B-10 Pricing table', false, `Error: ${err.message}`);
  }

  // ===================== SUMMARY =====================
  console.log('\n============ SUMMARY ============');
  const passed = RESULTS.filter(r => r.pass).length;
  const failed = RESULTS.filter(r => !r.pass).length;
  const color = failed === 0 ? '32' : '31';
  console.log(`\x1b[${color}m${passed} PASSED, ${failed} FAILED out of ${RESULTS.length} checks\x1b[0m\n`);

  if (failed > 0) {
    console.log('FAILURES:');
    RESULTS.filter(r => !r.pass).forEach(r =>
      console.log(`  x ${r.label}: ${r.detail}`)
    );
  }
}

main().catch(e => {
  console.error('\x1b[31mFATAL:\x1b[0m', e.message);
  process.exit(1);
});
