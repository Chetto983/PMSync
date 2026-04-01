/**
 * Force triage on real emails, then run follow-up detection.
 * Measures LLM latency, prompt quality, and scoring accuracy.
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
  const latency = Date.now() - start;
  const json = await res.json().catch(() => null);
  return { status: res.status, data: json?.data || json, latency };
}

async function main() {
  const { cookie, csrf } = await getSessionFromCDP();
  const session = await fetch(`${BACKEND}/api/auth/get-session`, { headers: { Cookie: cookie } }).then(r => r.json());
  console.log(`User: ${session?.user?.email}\n`);

  // ========== STEP 1: Force triage on real emails ==========
  console.log('=== STEP 1: FORCE TRIAGE (real LLM calls) ===\n');
  const triageStart = Date.now();
  const triage = await api('POST', '/ai/triage', cookie, csrf, {});
  const triageData = triage.data;
  console.log(`Status: ${triage.status} | Total latency: ${triage.latency}ms`);
  console.log(`Processed: ${triageData?.processed}, Successful: ${triageData?.successful}, Failed: ${triageData?.failed}, Skipped: ${triageData?.skipped}`);
  if (triageData?.skippedReason) console.log(`Skipped reason: ${triageData.skippedReason}`);
  console.log('');

  // ========== STEP 2: Check triage results ==========
  console.log('=== STEP 2: TRIAGE RESULTS ===\n');
  // Get recently triaged emails with their AI scores
  const emails = await api('GET', '/emails?page=1&pageSize=15&sort=receivedAt&order=desc', cookie);
  const triaged = (emails.data?.emails || []).filter(e => e.isAutoTriaged);
  console.log(`Triaged emails in view: ${triaged.length}`);

  const byPriority = {};
  const bySentiment = {};
  for (const e of triaged) {
    const p = e.aiPriority || '?';
    byPriority[p] = (byPriority[p] || 0) + 1;
    const s = e.aiSentiment || '?';
    bySentiment[s] = (bySentiment[s] || 0) + 1;
  }
  console.log(`Priority distribution: ${JSON.stringify(byPriority)}`);
  console.log(`Sentiment distribution: ${JSON.stringify(bySentiment)}`);

  // Show individual scores
  console.log('\nSample triage results:');
  for (const e of triaged.slice(0, 8)) {
    const labels = (e.aiLabels || []).join(', ') || 'none';
    console.log(`  P${e.aiPriority || '?'} | ${e.aiSentiment || '?'} | labels:[${labels}] | "${e.subject?.slice(0, 55)}"`);
    if (e.aiPriorityReason) console.log(`    reason: "${e.aiPriorityReason.slice(0, 80)}"`);
  }

  // ========== STEP 3: Analyze a human email ==========
  console.log('\n=== STEP 3: DEEP ANALYSIS on specific email ===\n');
  // Find a non-GitHub email (human sender)
  const humanEmail = triaged.find(e => !/github|vercel|railway|noreply|notification/i.test(e.from || ''));
  const targetEmail = humanEmail || triaged[0];
  if (targetEmail) {
    console.log(`Analyzing: "${targetEmail.subject?.slice(0, 60)}" from ${targetEmail.from?.slice(0, 40)}`);
    const analysis = await api('POST', `/ai/analyze/${targetEmail.id}`, cookie, csrf, {});
    const an = analysis.data?.analysis || analysis.data;
    const anMeta = analysis.data?.meta || an?.meta || {};
    console.log(`LLM latency: ${analysis.latency}ms | source: ${anMeta.source} | model: ${anMeta.model}`);
    if (an) {
      console.log(`Priority: ${an.priority} | Urgency: ${an.urgency} | Sentiment: ${an.sentiment}`);
      console.log(`Intent: ${an.intent} | Confidence: ${an.confidence}`);
      console.log(`Escalation risk: ${an.escalationRisk} | Has deadline: ${an.hasDeadline} | Needs follow-up: ${an.needsFollowUp}`);
      console.log(`Labels: ${JSON.stringify(an.labels)}`);
      console.log(`Topics: ${JSON.stringify(an.keyTopics)}`);
      console.log(`Summary: "${an.summary?.slice(0, 150)}"`);
      if (an.reasoning) console.log(`Reasoning: "${an.reasoning.slice(0, 150)}"`);
    }
  }

  // ========== STEP 4: Follow-up detection on fresh data ==========
  console.log('\n=== STEP 4: FOLLOW-UP DETECTION (fresh, post-triage) ===\n');
  const detect = await api('POST', '/ai/follow-ups/detect', cookie, csrf, {});
  const det = detect.data?.detection || detect.data;
  const detMeta = detect.data?.meta || det?.meta || {};
  console.log(`LLM latency: ${detect.latency}ms | source: ${detMeta.source} | model: ${detMeta.model}`);
  console.log(`Analyzed: ${det?.batchSummary?.totalAnalyzed} | Detected: ${det?.batchSummary?.totalDetected} | High urgency: ${det?.batchSummary?.highUrgencyCount}`);

  const followUps = det?.detectedFollowUps || [];
  if (followUps.length > 0) {
    console.log('\nDetected follow-ups:');
    for (const f of followUps) {
      console.log(`  emailId: ${f.emailId?.slice(0, 15)}...`);
      console.log(`    reason: "${f.reason}"`);
      console.log(`    urgency: ${f.urgency} | confidence: ${f.confidence} | due: ${f.suggestedDueDate}`);
    }
  } else {
    console.log('\n0 follow-ups detected (all emails are triaged → TriageActionService handles them)');
  }

  // ========== STEP 5: Briefing with fresh triage data ==========
  console.log('\n=== STEP 5: BRIEFING REFRESH (with fresh triage scores) ===\n');
  const briefing = await api('POST', '/ai/briefing/refresh', cookie, csrf, {});
  const br = briefing.data?.briefing || briefing.data;
  const brMeta = briefing.data?.meta || br?.meta || {};
  console.log(`LLM latency: ${briefing.latency}ms | source: ${brMeta.source} | model: ${brMeta.model}`);
  if (br) {
    console.log(`Priority emails: ${br.priorityEmails?.length}`);
    for (const p of (br.priorityEmails || []).slice(0, 3)) {
      console.log(`  [${p.urgency}] "${p.subject?.slice(0, 50)}" — ${p.reason?.slice(0, 60)}`);
    }
    console.log(`Follow-ups: ${br.pendingFollowUps?.length}`);
    console.log(`Calendar: ${br.calendarSnapshot?.length}`);
    console.log(`Summary: "${br.executiveSummary?.slice(0, 150)}"`);
    console.log(`Volume: ${JSON.stringify(br.emailVolumeTrends)}`);
    console.log(`Focus blocks: ${br.focusTimeRecommendations?.length}`);
  }

  // ========== SUMMARY ==========
  const totalLatency = Date.now() - triageStart;
  console.log(`\n=== TOTAL: ${totalLatency}ms across all LLM calls ===`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
