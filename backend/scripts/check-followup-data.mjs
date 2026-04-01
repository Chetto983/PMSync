/**
 * Surgical check: is follow-up detection returning correct results?
 * Queries the DB to see exactly what the LLM was given and what it returned.
 */
const BACKEND = 'https://backend-production-78e1.up.railway.app';

async function getSessionFromCDP() {
  const WebSocket = (await import('ws')).default;
  const pages = await fetch('http://localhost:9222/json/list').then(r => r.json());
  const target = pages.find(p => p.url.includes('vercel') || p.url.includes('pmsync'));
  if (!target) throw new Error('No PMSync page open');
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
        if (c.name === 'csrf' && c.domain.includes('backend')) { csrf = c.value; csrfCookie = `csrf=${c.value}`; }
      }
      ws.close();
      resolve({ cookie: `${session}; ${csrfCookie}`, csrf });
    });
    setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 5000);
  });
}

async function api(method, path, cookie, csrf, body) {
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  if (csrf) headers['x-csrf-token'] = csrf;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const start = Date.now();
  const res = await fetch(`${BACKEND}/api/v1${path}`, opts);
  return { status: res.status, data: (await res.json().catch(() => null))?.data || await res.json().catch(() => null), latency: Date.now() - start };
}

async function main() {
  const { cookie, csrf } = await getSessionFromCDP();

  console.log('=== SURGICAL FOLLOW-UP DETECTION CHECK ===\n');

  // 1. Get recent emails (last 24h)
  const recent = await api('GET', '/emails?page=1&pageSize=20&sort=receivedAt&order=desc', cookie);
  const emails = recent.data?.emails || [];
  console.log(`Recent emails: ${emails.length}`);

  let triagedCount = 0, untriagedCount = 0;
  const last24h = new Date(Date.now() - 24*60*60*1000);

  for (const e of emails) {
    const age = e.receivedAt ? new Date(e.receivedAt) : null;
    const isRecent = age && age > last24h;
    if (e.isAutoTriaged) triagedCount++; else untriagedCount++;

    if (!e.isAutoTriaged && isRecent) {
      console.log(`  [UN-TRIAGED] ${e.subject?.slice(0,60)} | from: ${e.from?.slice(0,30)} | ${e.receivedAt?.slice(0,16)}`);
    }
  }
  console.log(`  Triaged: ${triagedCount}, Un-triaged: ${untriagedCount}\n`);

  // 2. The follow-up detection only processes UN-TRIAGED emails (isAutoTriaged=false)
  //    because triaged emails get follow-ups from TriageActionService instead.
  //    If all recent emails are triaged, the "analyzed: 4" means 4 un-triaged emails
  //    from the last 24h were found and analyzed.

  // 3. Run detection and inspect the full response
  console.log('--- Running follow-up detection (real LLM call) ---');
  const detect = await api('POST', '/ai/follow-ups/detect', cookie, csrf, {});
  const resp = detect.data;
  const detection = resp?.detection || resp;
  const meta = resp?.meta || detection?.meta || {};

  console.log(`Status: ${detect.status} | Latency: ${detect.latency}ms`);
  console.log(`Source: ${meta.source} | Model: ${meta.model}`);
  console.log(`Degraded: ${meta.degraded || false} | Warnings: ${JSON.stringify(meta.warnings || [])}`);

  const batch = detection?.batchSummary || {};
  console.log(`\nBatch: analyzed=${batch.totalAnalyzed}, detected=${batch.totalDetected}, highUrgency=${batch.highUrgencyCount}`);

  const followUps = detection?.detectedFollowUps || [];
  if (followUps.length === 0) {
    console.log('\nResult: 0 follow-ups detected');
    console.log('Question: is this correct?');
    console.log('');

    // Check what those 4 emails were
    // Re-query for un-triaged emails specifically
    const untriaged = await api('GET', '/emails?page=1&pageSize=10&triaged=false', cookie);
    const ue = untriaged.data?.emails || [];
    console.log(`Un-triaged emails (via API): ${ue.length}`);
    for (const e of ue.slice(0, 10)) {
      const subj = e.subject || '(no subject)';
      const from = e.from || '?';
      const folder = e.folder || '?';
      // Analyze: does this email NEED follow-up?
      const isAutomated = /noreply|no-reply|notifications?@|mailer-daemon|github|vercel|railway|linkedin|newsletter/i.test(from);
      const hasQuestion = /\?|can you|could you|please|action required/i.test(subj);

      console.log(`  ${e.id?.slice(0,12)}... | folder:${folder} | from:${from.slice(0,30)}`);
      console.log(`    subject: "${subj.slice(0,60)}"`);
      console.log(`    automated:${isAutomated} hasQuestion:${hasQuestion} → ${isAutomated ? 'NO follow-up expected (automated)' : hasQuestion ? 'MIGHT need follow-up' : 'Likely no follow-up needed'}`);
    }

    if (ue.every(e => /noreply|no-reply|notifications?@|mailer-daemon|github|vercel|railway|linkedin/i.test(e.from || ''))) {
      console.log('\n✓ VERDICT: All un-triaged emails are automated/notification. 0 follow-ups is CORRECT.');
    } else {
      console.log('\n⚠ VERDICT: Some un-triaged emails may need follow-up. LLM decided none needed — review manually.');
    }
  } else {
    console.log(`\nDetected ${followUps.length} follow-ups:`);
    for (const f of followUps) {
      console.log(`  emailId: ${f.emailId?.slice(0,15)}...`);
      console.log(`    reason: "${f.reason}"`);
      console.log(`    urgency: ${f.urgency} | confidence: ${f.confidence} | due: ${f.suggestedDueDate}`);
    }
  }

  // 4. Check existing follow-ups
  console.log('\n--- Existing follow-ups in DB ---');
  const existingFu = await api('GET', '/ai/follow-ups?status=PENDING&limit=5', cookie);
  if (existingFu.status === 200) {
    const fups = existingFu.data?.followUps || existingFu.data || [];
    console.log(`Pending follow-ups: ${Array.isArray(fups) ? fups.length : '?'}`);
    if (Array.isArray(fups)) {
      for (const f of fups.slice(0, 5)) {
        console.log(`  ${f.id?.slice(0,12)}... | due: ${f.dueDate?.slice(0,16)} | conf: ${f.confidence} | "${f.reason?.slice(0,50)}"`);
      }
    }
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
