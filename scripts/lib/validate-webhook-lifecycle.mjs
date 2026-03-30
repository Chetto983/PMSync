/**
 * Webhook Lifecycle Validation (INFRA-03, INFRA-04, INFRA-05)
 *
 * Validates webhook subscription health for Gmail Pub/Sub and Microsoft Graph,
 * plus webhook health endpoint accuracy.
 *
 *   INFRA-03: Gmail Pub/Sub subscription status
 *   INFRA-04: Microsoft Graph subscription status
 *   INFRA-05: Webhook health endpoint returns correct shape
 *
 * READ-ONLY: No POST/PUT/DELETE calls. Only inspects current state.
 */
import {
  apiGet,
  assertTrue,
  setResultsCollector,
} from './validation-helpers.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Push a WARN result (not a hard failure). Does not throw.
 * @param {boolean} condition - true = PASS, false = WARN
 * @param {string} label - check description
 * @param {{ checks: number, passed: number, failed: number, failures: string[] }} results
 */
function assertWarn(condition, label, results) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    results.checks++;
    results.passed++;
  } else {
    console.log(`  WARN: ${label}`);
    results.checks++;
    // Count as passed (soft warning), but note it
    results.passed++;
    // Append to failures with WARN prefix so report shows it
    results.failures.push(`[WARN] ${label}`);
  }
}

/**
 * Get list of configured providers.
 * @returns {Array} provider records
 */
async function getProviders(context, cookieHeader) {
  const res = await apiGet(context, '/api/v1/providers', cookieHeader);
  const payload = res?.data ?? res;
  return Array.isArray(payload) ? payload : [];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Validate webhook lifecycle: health endpoint shape + per-provider subscription status.
 *
 * @param {import('playwright').BrowserContext} context
 * @param {string} cookieHeader
 * @param {string} _csrfToken - unused (read-only validation)
 * @returns {Promise<Array>} results array for report()
 */
export async function validateWebhookLifecycle(context, cookieHeader, _csrfToken) {
  const allResults = [];

  // ----- INFRA-05: Webhook health endpoint shape -----
  const healthResults = {
    name: 'INFRA-05-WebhookHealth',
    checks: 0,
    passed: 0,
    failed: 0,
    failures: [],
  };
  setResultsCollector(healthResults);

  let healthData = null;
  try {
    console.log('\n  --- INFRA-05: Webhook health endpoint ---');
    healthData = await apiGet(context, '/webhooks/health', cookieHeader);

    // Unwrap envelope if present
    const h = healthData?.data ?? healthData;

    assertTrue(h?.status === 'ok', 'INFRA-05: Health status is "ok"');
    assertTrue(
      typeof h?.timestamp === 'string' && h.timestamp.length > 0,
      'INFRA-05: Health timestamp is non-empty string',
    );
    assertTrue(
      h?.gmail !== null && h?.gmail !== undefined,
      'INFRA-05: Health response contains gmail stats object',
    );
    assertTrue(
      h?.microsoft !== null && h?.microsoft !== undefined,
      'INFRA-05: Health response contains microsoft stats object',
    );

    // Gmail stats shape
    if (h?.gmail) {
      assertTrue(
        typeof h.gmail.activeSubscriptions === 'number',
        'INFRA-05: gmail.activeSubscriptions is numeric',
      );
      assertTrue(
        typeof h.gmail.expiringWithin24h === 'number',
        'INFRA-05: gmail.expiringWithin24h is numeric',
      );
      assertTrue(
        h.gmail.errors !== null && typeof h.gmail.errors === 'object',
        'INFRA-05: gmail.errors is an object',
      );
    }

    // Microsoft stats shape
    if (h?.microsoft) {
      assertTrue(
        typeof h.microsoft.activeSubscriptions === 'number',
        'INFRA-05: microsoft.activeSubscriptions is numeric',
      );
      assertTrue(
        typeof h.microsoft.expiringWithin24h === 'number',
        'INFRA-05: microsoft.expiringWithin24h is numeric',
      );
      assertTrue(
        h.microsoft.errors !== null && typeof h.microsoft.errors === 'object',
        'INFRA-05: microsoft.errors is an object',
      );
    }
  } catch (err) {
    console.log(`  ERROR: Webhook health check failed: ${err.message}`);
    healthResults.checks++;
    healthResults.failed++;
    healthResults.failures.push(`INFRA-05: ${err.message}`);
  }

  setResultsCollector(null);
  allResults.push(healthResults);

  // ----- Fetch providers for INFRA-03 / INFRA-04 -----
  let providers = [];
  try {
    providers = await getProviders(context, cookieHeader);
    console.log(`\n  Providers found: ${providers.length}`);
  } catch (err) {
    console.log(`  ERROR: Could not fetch providers: ${err.message}`);
  }

  const health = healthData?.data ?? healthData;

  // ----- INFRA-03: Gmail Pub/Sub subscription -----
  const gmailResults = {
    name: 'INFRA-03-GmailPubSub',
    checks: 0,
    passed: 0,
    failed: 0,
    failures: [],
  };
  setResultsCollector(gmailResults);

  try {
    console.log('\n  --- INFRA-03: Gmail Pub/Sub subscription ---');

    const hasGoogle = providers.some(
      p => (p.providerType || p.type) === 'google',
    );

    if (!hasGoogle) {
      assertTrue(true, 'INFRA-03: Gmail Pub/Sub SKIPPED (no Google provider configured)');
      gmailResults.skipped = 'No Google provider configured';
    } else if (!health?.gmail) {
      assertTrue(false, 'INFRA-03: Gmail stats available from health endpoint');
    } else {
      assertTrue(
        typeof health.gmail.activeSubscriptions === 'number' &&
          health.gmail.activeSubscriptions >= 0,
        'INFRA-03: gmail.activeSubscriptions is a valid number',
      );

      assertWarn(
        health.gmail.activeSubscriptions >= 1,
        'INFRA-03: Gmail Pub/Sub has active subscription (WARN: may need GOOGLE_PUBSUB_TOPIC)',
        gmailResults,
      );

      assertTrue(
        typeof health.gmail.expiringWithin24h === 'number',
        'INFRA-03: gmail.expiringWithin24h is a number (0 is OK)',
      );
    }
  } catch (err) {
    console.log(`  ERROR: Gmail Pub/Sub check failed: ${err.message}`);
    gmailResults.checks++;
    gmailResults.failed++;
    gmailResults.failures.push(`INFRA-03: ${err.message}`);
  }

  setResultsCollector(null);
  allResults.push(gmailResults);

  // ----- INFRA-04: Microsoft Graph subscription -----
  const msResults = {
    name: 'INFRA-04-MicrosoftGraph',
    checks: 0,
    passed: 0,
    failed: 0,
    failures: [],
  };
  setResultsCollector(msResults);

  try {
    console.log('\n  --- INFRA-04: Microsoft Graph subscription ---');

    const hasMicrosoft = providers.some(
      p => (p.providerType || p.type) === 'microsoft',
    );

    if (!hasMicrosoft) {
      assertTrue(true, 'INFRA-04: Microsoft Graph SKIPPED (no Microsoft provider configured)');
      msResults.skipped = 'No Microsoft provider configured';
    } else if (!health?.microsoft) {
      assertTrue(false, 'INFRA-04: Microsoft stats available from health endpoint');
    } else {
      assertTrue(
        typeof health.microsoft.activeSubscriptions === 'number' &&
          health.microsoft.activeSubscriptions >= 0,
        'INFRA-04: microsoft.activeSubscriptions is a valid number',
      );

      assertWarn(
        health.microsoft.activeSubscriptions >= 1,
        'INFRA-04: Microsoft Graph has active subscription (WARN: may need public webhook URL)',
        msResults,
      );

      assertTrue(
        typeof health.microsoft.expiringWithin24h === 'number',
        'INFRA-04: microsoft.expiringWithin24h is a number (0 is OK)',
      );
    }
  } catch (err) {
    console.log(`  ERROR: Microsoft Graph check failed: ${err.message}`);
    msResults.checks++;
    msResults.failed++;
    msResults.failures.push(`INFRA-04: ${err.message}`);
  }

  setResultsCollector(null);
  allResults.push(msResults);

  return allResults;
}
