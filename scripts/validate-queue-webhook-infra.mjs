/**
 * Queue & Webhook Infrastructure Validation Orchestrator
 *
 * Usage:
 *   node scripts/validate-queue-webhook-infra.mjs --check=queues
 *   node scripts/validate-queue-webhook-infra.mjs --check=pause-resume
 *   node scripts/validate-queue-webhook-infra.mjs --check=all
 *   node scripts/validate-queue-webhook-infra.mjs                  # defaults to all
 *
 * Tests: INFRA-01 (Queue health), INFRA-02 (Pause/resume infrastructure)
 * Webhook checks (INFRA-03+) will be wired by Plan 02.
 *
 * Requires Edge running with --remote-debugging-port=9222 and logged into PMSync.
 */
import { connectCDP, getAuthCookies, getCsrfToken, report } from './lib/validation-helpers.mjs';
import { validateQueueHealth } from './lib/validate-queue-health.mjs';
// Webhook import will be added by Plan 02

const args = process.argv.slice(2);
const checkFlag = args.find(a => a.startsWith('--check='))?.split('=')[1] || 'all';

async function main() {
  console.log('=== Queue & Webhook Infrastructure Validation ===');
  console.log(`Check: ${checkFlag}\n`);

  const { browser, context } = await connectCDP();
  const cookieHeader = await getAuthCookies(context);
  const { csrfToken, cookieHeader: finalCookies } = await getCsrfToken(context, cookieHeader);

  let results = [];

  if (checkFlag === 'all' || checkFlag === 'queues' || checkFlag === 'pause-resume') {
    const queueResults = await validateQueueHealth(context, finalCookies, csrfToken);
    results.push(...queueResults);
  }

  // Webhook checks will be wired by Plan 02

  const exitCode = report('Queue & Webhook Infrastructure', results);
  await browser.close();
  process.exit(exitCode);
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
