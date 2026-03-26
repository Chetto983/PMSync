/**
 * Email Read Validation Orchestrator
 *
 * Usage:
 *   node scripts/validate-email-read.mjs --provider=gmail --quick
 *   node scripts/validate-email-read.mjs --provider=outlook
 *   node scripts/validate-email-read.mjs --provider=imap
 *   node scripts/validate-email-read.mjs                          # all providers
 *
 * Flags:
 *   --provider=gmail|outlook|microsoft|imap|all  (default: all)
 *   --quick    Skip combined compound filter test
 *
 * Tests: READ-01 (folder filter), READ-02 (compound filters), READ-03 (pagination),
 *        READ-04 (thread view), READ-05 (single email GET)
 *
 * Requires Edge running with --remote-debugging-port=9222 and logged into PMSync.
 */
import { connectCDP, getAuthCookies, getCsrfToken, report } from './lib/validation-helpers.mjs';
import { validateEmailRead } from './lib/validate-email-read.mjs';

const args = process.argv.slice(2);
const providerFlag = args.find(a => a.startsWith('--provider='))?.split('=')[1] || 'all';
const quickMode = args.includes('--quick');

async function main() {
  console.log('=== Email Read Validation ===');
  console.log(`Provider: ${providerFlag} | Quick mode: ${quickMode}\n`);

  const { browser, context } = await connectCDP();
  const cookieHeader = await getAuthCookies(context);
  const { csrfToken, cookieHeader: finalCookies } = await getCsrfToken(context, cookieHeader);

  const results = await validateEmailRead(context, finalCookies, csrfToken, {
    provider: providerFlag,
    quick: quickMode,
  });

  const exitCode = report('Email Read Validation', results);
  await browser.close();
  process.exit(exitCode);
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
