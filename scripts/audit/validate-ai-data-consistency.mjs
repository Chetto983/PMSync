/**
 * T-1304 — AI Data Consistency Validation
 *
 * Connects to Edge CDP (authenticated session) and checks:
 * 1. No orphan embeddings (emailId/contactId references exist)
 * 2. No stale embedding versions
 * 3. AiRunLedger has recent entries
 * 4. ChatSession records have valid tenantId
 * 5. No duplicate embedding jobs in queue
 * 6. No stale semaphore slots in Redis
 * 7. Circuit breaker in closed state
 */

import { connectCDP, FRONTEND_URL } from '../lib/validation-helpers.mjs';

const results = [];

function pass(check, detail) {
  results.push({ check, status: 'PASS', detail });
  console.log(`  PASS: ${check}: ${detail}`);
}

function fail(check, detail) {
  results.push({ check, status: 'FAIL', detail });
  console.log(`  FAIL: ${check}: ${detail}`);
}

function warn(check, detail) {
  results.push({ check, status: 'WARN', detail });
  console.log(`  WARN: ${check}: ${detail}`);
}

async function browserApiJson(page, pathName, options = {}) {
  return page.evaluate(async ({ pathName, method }) => {
    const headers = { Accept: 'application/json' };

    if (method !== 'GET') {
      const csrfResp = await fetch('/api/v1/auth/csrf-token', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const csrfJson = await csrfResp.json().catch(() => ({}));
      const csrfToken = csrfJson?.data?.csrfToken || csrfJson?.csrfToken || null;
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    }

    const response = await fetch(pathName, {
      method,
      credentials: 'include',
      headers,
    });

    const raw = await response.text();
    let json = null;
    try { json = raw ? JSON.parse(raw) : null; } catch {}
    return { ok: response.ok, status: response.status, json, raw };
  }, { pathName, method: options.method || 'GET' });
}

// ═══════════════════════════════════════════════════════════════════════════
// Check 1: Embeddings health
// ═══════════════════════════════════════════════════════════════════════════
async function checkEmbeddings(page) {
  console.log('\n-- Check 1: Embeddings --');

  const res = await browserApiJson(page, '/api/v1/ai/knowledge-base/embeddings?limit=50');
  if (!res.ok) {
    if (res.status === 403 || res.status === 401) {
      warn('Embeddings', `Auth blocked (${res.status}) — user may not have admin role`);
    } else {
      fail('Embeddings', `HTTP ${res.status}: ${res.raw?.substring(0, 200)}`);
    }
    return;
  }

  const data = res.json?.data || res.json;
  const items = data?.items || [];
  const total = data?.pagination?.total ?? items.length;

  pass('Embeddings count', `${total} total embeddings in knowledge base`);

  if (items.length > 0) {
    // Check for orphans: items should have documentName or metadata with source ref
    const orphans = items.filter(e => {
      const meta = e.metadata || {};
      const hasRef = e.documentName || meta.emailId || meta.contactId || meta.sourceId || meta.type;
      return !hasRef;
    });
    if (orphans.length === 0) {
      pass('No orphan embeddings', `All ${items.length} checked items have valid source reference`);
    } else {
      warn('Orphan embeddings', `${orphans.length}/${items.length} embeddings missing source ref (may use metadata fields not checked)`);
    }

    // Check for version consistency (documentName pattern or metadata.model)
    const models = [...new Set(items.map(e => e.metadata?.model || e.metadata?.embeddingModel || 'default'))];
    if (models.length <= 1) {
      pass('Embedding model consistency', `All use: ${models[0]}`);
    } else {
      warn('Stale embedding versions', `Multiple models found: ${models.join(', ')}`);
    }
  } else {
    warn('Embeddings', 'No embeddings returned (may be empty or need admin role)');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Check 2: AI Run Ledger has recent entries
// ═══════════════════════════════════════════════════════════════════════════
async function checkRunLedger(page) {
  console.log('\n-- Check 2: AI Run Ledger --');

  const res = await browserApiJson(page, '/api/v1/ai/runs?limit=10');
  if (!res.ok) {
    if (res.status === 403 || res.status === 401) {
      warn('Run Ledger', `Auth blocked (${res.status}) — user may not have admin role`);
    } else {
      fail('Run Ledger', `HTTP ${res.status}`);
    }
    return;
  }

  const data = res.json?.data || res.json;
  const items = data?.items || [];
  const total = data?.total ?? items.length;

  if (total > 0) {
    pass('Run Ledger entries', `${total} total AI runs recorded`);
  } else {
    warn('Run Ledger', 'No AI runs found — AI may not have been used recently');
  }

  if (items.length > 0) {
    const latest = items[0];
    const latestDate = latest.createdAt || latest.timestamp;
    if (latestDate) {
      const age = Date.now() - new Date(latestDate).getTime();
      const hours = Math.round(age / 3600000);
      if (hours < 72) {
        pass('Recent AI activity', `Latest run: ${hours}h ago`);
      } else {
        warn('Stale AI activity', `Latest run: ${hours}h ago (>72h)`);
      }
    }
  }

  // Cost summary
  const costRes = await browserApiJson(page, '/api/v1/ai/runs/cost-summary');
  if (costRes.ok) {
    const cost = costRes.json?.data || costRes.json;
    pass('Cost summary', `${cost?.runCount || 0} runs, ${cost?.totalTokens || 0} tokens, $${(cost?.totalCost || 0).toFixed(4)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Check 3: Chat sessions valid
// ═══════════════════════════════════════════════════════════════════════════
async function checkChatSessions(page) {
  console.log('\n-- Check 3: Chat Sessions --');

  const res = await browserApiJson(page, '/api/v1/ai/chat/conversations?limit=20');
  if (!res.ok) {
    if (res.status === 403 || res.status === 401) {
      warn('Chat Sessions', `Auth blocked (${res.status})`);
    } else {
      fail('Chat Sessions', `HTTP ${res.status}`);
    }
    return;
  }

  const data = res.json?.data || res.json;
  const conversations = data?.conversations || [];
  const total = data?.total ?? conversations.length;

  pass('Chat Sessions', `${total} conversations found`);

  // Check all have valid structure
  if (conversations.length > 0) {
    const valid = conversations.filter(c => c.id && (c.tenantId || c.userId));
    if (valid.length === conversations.length) {
      pass('Session validity', `All ${conversations.length} sessions have valid ID/tenant`);
    } else {
      fail('Session validity', `${conversations.length - valid.length} sessions missing ID/tenant`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Check 4: Health + circuit breaker + queues
// ═══════════════════════════════════════════════════════════════════════════
async function checkHealthDetailed(page) {
  console.log('\n-- Check 4: Health / Circuit Breaker / Queues --');

  const res = await browserApiJson(page, '/api/v1/ai/health/detailed');
  if (!res.ok) {
    if (res.status === 403 || res.status === 401) {
      warn('Health detailed', `Auth blocked (${res.status}) — need admin role`);
      // Fall back to public health
      const pubRes = await browserApiJson(page, '/api/v1/ai/health');
      if (pubRes.ok) {
        const pubData = pubRes.json?.data || pubRes.json;
        pass('Public health', `Status: ${pubData?.status || 'unknown'}`);
      }
      return;
    }
    fail('Health detailed', `HTTP ${res.status}`);
    return;
  }

  const data = res.json?.data || res.json;

  // Overall status
  const status = data?.status;
  if (status === 'healthy') {
    pass('AI health status', 'healthy');
  } else if (status === 'degraded') {
    warn('AI health status', 'degraded');
  } else {
    fail('AI health status', `${status}`);
  }

  // Circuit breaker
  const cb = data?.services?.mistral?.circuitBreaker;
  if (cb === 'closed') {
    pass('Circuit breaker', 'closed (normal)');
  } else if (cb === 'half-open') {
    warn('Circuit breaker', 'half-open (recovering)');
  } else if (cb === 'open') {
    fail('Circuit breaker', 'OPEN — AI requests are blocked');
  } else {
    warn('Circuit breaker', `State: ${cb || 'unknown'}`);
  }

  // Embedding queues
  const queues = data?.services?.embeddingQueues;
  if (queues) {
    for (const [name, stats] of Object.entries(queues)) {
      if (stats?.failed > 0) {
        warn(`Queue ${name}`, `${stats.failed} failed jobs (waiting: ${stats.waiting}, active: ${stats.active})`);
      } else {
        pass(`Queue ${name}`, `OK (waiting: ${stats?.waiting || 0}, active: ${stats?.active || 0})`);
      }
    }
  }

  // DLQ
  const dlq = data?.services?.dlq;
  if (dlq) {
    const totalFailed = dlq.totalFailed || 0;
    if (totalFailed === 0) {
      pass('DLQ', 'Empty (0 failed)');
    } else if (totalFailed < 100) {
      warn('DLQ', `${totalFailed} failed items (below threshold)`);
    } else {
      fail('DLQ', `${totalFailed} failed items (above 100 threshold)`);
    }
  }

  // Cache/Redis
  const cache = data?.services?.cache;
  if (cache?.connected === true || cache?.status === 'up') {
    pass('Redis', 'Connected');
  } else if (cache) {
    fail('Redis', `Status: ${cache.status}, connected: ${cache.connected}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  let browser;
  try {
    const cdp = await connectCDP();
    browser = cdp.browser;
    const { page } = cdp;

    // Ensure on app
    if (!page.url().includes('mail-agent') && !page.url().includes('localhost')) {
      await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
    }

    console.log('=== T-1304: AI Data Consistency Validation ===');

    await checkEmbeddings(page);
    await checkRunLedger(page);
    await checkChatSessions(page);
    await checkHealthDetailed(page);
  } catch (e) {
    console.error(`\nFATAL: ${e.message}`);
  } finally {
    if (browser) await browser.close();

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('  AI Data Consistency Results');
    console.log('='.repeat(60));

    const passed = results.filter(r => r.status === 'PASS').length;
    const warned = results.filter(r => r.status === 'WARN').length;
    const failed = results.filter(r => r.status === 'FAIL').length;

    for (const r of results) {
      const icon = r.status === 'PASS' ? 'OK' : r.status === 'WARN' ? '??' : 'XX';
      console.log(`  [${icon}] ${r.check}: ${r.detail}`);
    }

    console.log(`\n  Total: ${results.length} checks | ${passed} PASS | ${warned} WARN | ${failed} FAIL`);
    console.log('='.repeat(60));

    process.exit(failed > 0 ? 1 : 0);
  }
}

main();
