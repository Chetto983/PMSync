/**
 * Attachments & Search Validation Orchestrator
 *
 * Usage:
 *   node scripts/validate-attachments-search.mjs --provider=gmail --quick
 *   node scripts/validate-attachments-search.mjs --provider=outlook
 *   node scripts/validate-attachments-search.mjs --provider=imap
 *   node scripts/validate-attachments-search.mjs                          # all providers
 *
 * Flags:
 *   --provider=gmail|outlook|microsoft|imap|all  (default: all)
 *   --quick    Skip extended tests
 *
 * Tests: READ-06 (attachment download), READ-07 (on-demand fetch),
 *        READ-08 (folder stats), READ-09 (full-text search)
 *
 * Requires Edge running with --remote-debugging-port=9222 and logged into PMSync.
 */
import { connectCDP, getAuthCookies, getCsrfToken, report } from './lib/validation-helpers.mjs';
import { validateAttachmentsSearch } from './lib/validate-attachments-search.mjs';

const args = process.argv.slice(2);
const providerFlag = args.find(a => a.startsWith('--provider='))?.split('=')[1] || 'all';
const quickMode = args.includes('--quick');

async function main() {
  console.log('=== Attachments & Search Validation ===');
  console.log(`Provider: ${providerFlag} | Quick mode: ${quickMode}\n`);

  const { browser, context } = await connectCDP();
  const cookieHeader = await getAuthCookies(context);
  const { csrfToken, cookieHeader: finalCookies } = await getCsrfToken(context, cookieHeader);

  const results = await validateAttachmentsSearch(context, finalCookies, csrfToken, {
    provider: providerFlag,
    quick: quickMode,
  });

  const exitCode = report('Attachments & Search Validation', results);
  await browser.close();
  process.exit(exitCode);
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
