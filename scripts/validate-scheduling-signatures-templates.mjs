/**
 * Scheduling, Signatures & Templates Validation Orchestrator
 *
 * Runs validation checks for:
 *   --check=schedule-send    INFRA-06: Schedule email for later delivery
 *   --check=schedule-cancel  INFRA-07: Cancel a scheduled email
 *   --check=signatures       INFRA-08: Signature CRUD + default
 *   --check=templates        INFRA-09: Template CRUD + duplicate + default
 *   --check=signature-send   INFRA-10: Signature included in sent email
 *   --check=all              All of the above (default)
 *
 * Usage: node scripts/validate-scheduling-signatures-templates.mjs [--check=all]
 *
 * Requires Edge running with --remote-debugging-port=9222 and logged into PMSync.
 */
import { connectCDP, getAuthCookies, getCsrfToken, report } from './lib/validation-helpers.mjs';
import { validateScheduling } from './lib/validate-scheduling.mjs';
import { validateSignatures } from './lib/validate-signatures.mjs';
import { validateTemplates } from './lib/validate-templates.mjs';

const args = process.argv.slice(2);
const checkFlag = args.find(a => a.startsWith('--check='))?.split('=')[1] || 'all';

async function main() {
  console.log('=== Scheduling, Signatures & Templates Validation ===');
  console.log(`Check: ${checkFlag}\n`);

  const { browser, context } = await connectCDP();
  const cookieHeader = await getAuthCookies(context);
  const { csrfToken, cookieHeader: finalCookies } = await getCsrfToken(context, cookieHeader);

  let results = [];

  // INFRA-06, INFRA-07: Scheduling
  if (checkFlag === 'all' || checkFlag === 'schedule-send' || checkFlag === 'schedule-cancel') {
    const scheduleResults = await validateScheduling(context, finalCookies, csrfToken, checkFlag);
    results.push(...scheduleResults);
  }

  // INFRA-08, INFRA-10: Signatures
  if (checkFlag === 'all' || checkFlag === 'signatures' || checkFlag === 'signature-send') {
    const sigResults = await validateSignatures(context, finalCookies, csrfToken, checkFlag);
    results.push(...sigResults);
  }

  // INFRA-09: Templates
  if (checkFlag === 'all' || checkFlag === 'templates') {
    const templateResults = await validateTemplates(context, finalCookies, csrfToken);
    results.push(...templateResults);
  }

  const exitCode = report('Scheduling, Signatures & Templates', results);
  await browser.close();
  process.exit(exitCode);
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
