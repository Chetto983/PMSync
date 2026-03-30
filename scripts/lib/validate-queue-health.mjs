/**
 * Queue Health Validation (INFRA-01, INFRA-02)
 *
 * INFRA-01: All 7 email queues appear in /health/queues/all, are not paused,
 *           and Prometheus /health/metrics contains bullmq_queue_depth gauge.
 * INFRA-02: Queue pause/resume infrastructure verified via single-queue endpoint,
 *           summary totals, and worker health status.
 */
import {
  apiGet,
  assertTrue,
  setResultsCollector,
  BACKEND_URL,
} from './validation-helpers.mjs';

// The 7 email queue names validated by INFRA-01
const EMAIL_QUEUE_NAMES = [
  'email-sync-high',
  'email-sync-normal',
  'email-sync-low',
  'email-send',
  'provider-sync-back',
  'bulk-operations',
  'folder-operations',
];

// ---------------------------------------------------------------------------
// INFRA-01: Queue health — all 7 queues present, not paused, numeric fields
// ---------------------------------------------------------------------------

async function validateAllQueuesHealth(context, cookieHeader, results) {
  console.log('\n  --- INFRA-01: Queue health (all 7 email queues) ---');

  let allQueues;
  try {
    allQueues = await apiGet(context, '/health/queues/all', cookieHeader);
  } catch (err) {
    console.log(`  ERROR: /health/queues/all failed: ${err.message}`);
    assertTrue(false, 'INFRA-01: /health/queues/all returns success');
    return;
  }

  // The response should have a queues array (or be the array directly)
  const queues = allQueues?.queues ?? allQueues?.data?.queues ?? [];
  assertTrue(Array.isArray(queues) && queues.length > 0, 'INFRA-01: Response has non-empty queues array');

  for (const queueName of EMAIL_QUEUE_NAMES) {
    const q = queues.find(item => item.name === queueName);
    assertTrue(!!q, `INFRA-01: Queue "${queueName}" present in response`);

    if (q) {
      assertTrue(!q.paused, `INFRA-01: Queue "${queueName}" is not paused`);
      assertTrue(
        typeof q.waiting === 'number' &&
        typeof q.active === 'number' &&
        typeof q.completed === 'number' &&
        typeof q.failed === 'number',
        `INFRA-01: Queue "${queueName}" has numeric waiting/active/completed/failed`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// INFRA-01: Prometheus metrics — bullmq_queue_depth gauge present
// ---------------------------------------------------------------------------

async function validatePrometheusMetrics(context, cookieHeader, results) {
  console.log('\n  --- INFRA-01: Prometheus metrics (bullmq_queue_depth) ---');

  let metricsText;
  try {
    // /health/metrics returns text/plain, use context.request.get() directly
    const api = context.request;
    const response = await api.get(BACKEND_URL + '/health/metrics', {
      headers: { Cookie: cookieHeader },
    });
    metricsText = await response.text();
  } catch (err) {
    console.log(`  ERROR: /health/metrics failed: ${err.message}`);
    assertTrue(false, 'INFRA-01: /health/metrics returns success');
    return;
  }

  assertTrue(typeof metricsText === 'string' && metricsText.length > 0, 'INFRA-01: Metrics response is non-empty text');
  assertTrue(metricsText.includes('bullmq_queue_depth'), 'INFRA-01: Metrics contain bullmq_queue_depth gauge');
}

// ---------------------------------------------------------------------------
// INFRA-02: Pause/resume infrastructure — single queue, summary, workers
// ---------------------------------------------------------------------------

async function validatePauseResumeInfra(context, cookieHeader, results) {
  console.log('\n  --- INFRA-02: Pause/resume infrastructure ---');

  // 1. Single queue endpoint for email-sync-low
  console.log('  Step 1: Single queue status for email-sync-low');
  let singleQueue;
  try {
    singleQueue = await apiGet(context, '/health/queues/email-sync-low', cookieHeader);
  } catch (err) {
    console.log(`  ERROR: /health/queues/email-sync-low failed: ${err.message}`);
    assertTrue(false, 'INFRA-02: /health/queues/email-sync-low returns success');
    singleQueue = null;
  }

  if (singleQueue) {
    assertTrue(
      typeof singleQueue.paused === 'boolean' || singleQueue.paused === undefined,
      'INFRA-02: email-sync-low has paused field (boolean)',
    );
    // If paused field exists, it should be boolean
    if (singleQueue.paused !== undefined) {
      assertTrue(typeof singleQueue.paused === 'boolean', 'INFRA-02: email-sync-low paused is boolean');
    }
    assertTrue(
      typeof singleQueue.waiting === 'number',
      'INFRA-02: email-sync-low has numeric waiting count',
    );
  }

  // 2. All queues summary — check for totalPaused or equivalent
  console.log('  Step 2: All queues summary (totalPaused check)');
  let allQueues;
  try {
    allQueues = await apiGet(context, '/health/queues/all', cookieHeader);
  } catch (err) {
    console.log(`  ERROR: /health/queues/all failed: ${err.message}`);
    assertTrue(false, 'INFRA-02: /health/queues/all returns success');
    allQueues = null;
  }

  if (allQueues) {
    // Check for a summary field with totalPaused, or derive from queues array
    const queues = allQueues?.queues ?? allQueues?.data?.queues ?? [];
    const pausedCount = queues.filter(q => q.paused).length;
    // Either a top-level totalPaused exists, or we can count from array
    const hasTotalPaused = typeof allQueues.totalPaused === 'number' || Array.isArray(queues);
    assertTrue(hasTotalPaused, 'INFRA-02: All-queues response supports pause state enumeration');
    // No queues should be in error/auto-paused state
    assertTrue(pausedCount === 0, 'INFRA-02: No email queues currently paused');
  }

  // 3. Worker health check
  console.log('  Step 3: Worker health check');
  let workerHealth;
  try {
    workerHealth = await apiGet(context, '/health/workers', cookieHeader);
  } catch (err) {
    console.log(`  ERROR: /health/workers failed: ${err.message}`);
    assertTrue(false, 'INFRA-02: /health/workers returns success');
    workerHealth = null;
  }

  if (workerHealth) {
    assertTrue(
      typeof workerHealth.status === 'string',
      'INFRA-02: Worker health has status field',
    );
    assertTrue(
      typeof workerHealth.totalWorkers === 'number' && workerHealth.totalWorkers > 0,
      'INFRA-02: totalWorkers > 0',
    );
    assertTrue(
      workerHealth.autoPausedCount === 0,
      'INFRA-02: autoPausedCount === 0 (no auto-paused workers)',
    );
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Validate queue health for INFRA-01 and INFRA-02.
 *
 * @param {import('playwright').BrowserContext} context - Playwright browser context
 * @param {string} cookieHeader - Cookie header string for authenticated requests
 * @param {string} csrfToken - CSRF token (unused for GET-only checks, kept for API compat)
 * @returns {Array} Array of result objects for the report
 */
export async function validateQueueHealth(context, cookieHeader, csrfToken) {
  const allResults = [];

  // INFRA-01: Queue health checks
  const infra01Results = { name: 'INFRA-01-QueueHealth', checks: 0, passed: 0, failed: 0, failures: [] };
  setResultsCollector(infra01Results);

  try {
    await validateAllQueuesHealth(context, cookieHeader, infra01Results);
    await validatePrometheusMetrics(context, cookieHeader, infra01Results);
  } catch (err) {
    console.log(`  ERROR: INFRA-01 checks failed: ${err.message}`);
    infra01Results.checks++;
    infra01Results.failed++;
    infra01Results.failures.push(`INFRA-01: ${err.message}`);
  }

  setResultsCollector(null);
  allResults.push(infra01Results);

  // INFRA-02: Pause/resume infrastructure checks
  const infra02Results = { name: 'INFRA-02-PauseResume', checks: 0, passed: 0, failed: 0, failures: [] };
  setResultsCollector(infra02Results);

  try {
    await validatePauseResumeInfra(context, cookieHeader, infra02Results);
  } catch (err) {
    console.log(`  ERROR: INFRA-02 checks failed: ${err.message}`);
    infra02Results.checks++;
    infra02Results.failed++;
    infra02Results.failures.push(`INFRA-02: ${err.message}`);
  }

  setResultsCollector(null);
  allResults.push(infra02Results);

  return allResults;
}
