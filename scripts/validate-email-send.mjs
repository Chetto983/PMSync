/**
 * Email Send/Reply/Forward Validation Orchestrator
 *
 * Usage:
 *   node scripts/validate-email-send.mjs --provider=gmail
 *   node scripts/validate-email-send.mjs --provider=outlook
 *   node scripts/validate-email-send.mjs --provider=imap
 *   node scripts/validate-email-send.mjs                  # all providers
 *
 * Tests: WRITE-01 (Gmail send), WRITE-02 (Outlook send), WRITE-03 (IMAP send),
 *        WRITE-04 (reply threading), WRITE-05 (forward with attachments)
 *
 * Requires Edge running with --remote-debugging-port=9222 and logged into PMSync.
 */
import { connectCDP, getAuthCookies, getCsrfToken, report } from './lib/validation-helpers.mjs';
import { validateEmailSend } from './lib/validate-email-send.mjs';

const args = process.argv.slice(2);
const providerFlag = args.find(a => a.startsWith('--provider='))?.split('=')[1] || 'all';

async function main() {
  console.log('=== Email Send/Reply/Forward Validation ===');
  console.log(`Provider: ${providerFlag}\n`);

  const { browser, context } = await connectCDP();
  const cookieHeader = await getAuthCookies(context);
  const { csrfToken, cookieHeader: finalCookies } = await getCsrfToken(context, cookieHeader);

  const results = await validateEmailSend(context, finalCookies, csrfToken, {
    provider: providerFlag,
  });

  const exitCode = report('Email Send/Reply/Forward Validation', results);
  await browser.close();
  process.exit(exitCode);
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
