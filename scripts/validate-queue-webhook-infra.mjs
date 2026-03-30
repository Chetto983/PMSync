/**
 * Queue & Webhook Infrastructure Validation Orchestrator
 *
 * Runs validation checks for:
 *   --check=queues         INFRA-01: BullMQ queue health
 *   --check=pause-resume   INFRA-02: Queue pause/resume
 *   --check=gmail          INFRA-03: Gmail Pub/Sub subscription
 *   --check=microsoft      INFRA-04: Microsoft Graph subscription
 *   --check=webhook-health INFRA-05: Webhook health endpoint
 *   --check=all            All of the above (default)
 *
 * Usage: node scripts/validate-queue-webhook-infra.mjs [--check=all]
 *
 * Requires Edge running with --remote-debugging-port=9222 and logged into PMSync.
 */
import { connectCDP, getAuthCookies, getCsrfToken, report } from './lib/validation-helpers.mjs';
import { validateQueueHealth } from './lib/validate-queue-health.mjs';
import { validateWebhookLifecycle } from './lib/validate-webhook-lifecycle.mjs';

const args = process.argv.slice(2);
const checkFlag = args.find(a => a.startsWith('--check='))?.split('=')[1] || 'all';

async function main() {
  console.log('=== Queue & Webhook Infrastructure Validation ===');
  console.log(`Check: ${checkFlag}\n`);

  const { browser, context } = await connectCDP();
  const cookieHeader = await getAuthCookies(context);
  const { csrfToken, cookieHeader: finalCookies } = await getCsrfToken(context, cookieHeader);

  let results = [];

  // INFRA-01, INFRA-02: Queue health and pause/resume
  if (checkFlag === 'all' || checkFlag === 'queues' || checkFlag === 'pause-resume') {
    const queueResults = await validateQueueHealth(context, finalCookies, csrfToken);
    results.push(...queueResults);
  }

  // INFRA-03, INFRA-04, INFRA-05: Webhook subscription lifecycle
  if (checkFlag === 'all' || checkFlag === 'gmail' || checkFlag === 'microsoft' || checkFlag === 'webhook-health') {
    const webhookResults = await validateWebhookLifecycle(context, finalCookies, csrfToken);
    results.push(...webhookResults);
  }

  const exitCode = report('Queue & Webhook Infrastructure', results);
  await browser.close();
  process.exit(exitCode);
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
