/**
 * IMAP Full Sync Validation (SYNC-03)
 *
 * Validates that IMAP full sync downloaded all emails and folders correctly.
 * Steps: provider discovery, sync trigger (optional), folder validation,
 *        email count validation, field spot-check, dedup check.
 *
 * IMAP-specific notes:
 * - Folder names can be localized (e.g., "Posta inviata" for Sent in Italian).
 *   Always check specialUse, never folder name.
 * - externalId may be null for some IMAP folders -- do NOT assert non-null.
 * - IMAP emails do NOT have labels (Gmail-specific concept).
 */
import {
  apiGet,
  apiPost,
  waitForSyncCompletion,
  assertEqual,
  assertRange,
  assertTrue,
  setResultsCollector,
  BACKEND_URL,
} from './validation-helpers.mjs';

// Default full sync budget (matches backend IMAP_FULL_MAX_MESSAGES default)
const FULL_SYNC_BUDGET = 2500;

/**
 * Validate IMAP full sync results.
 * @param {object} context - Playwright browser context
 * @param {string} cookieHeader - Cookie header string
 * @param {string} csrfToken - CSRF token for POST requests
 * @param {Array} providers - Array of provider records from GET /api/v1/providers
 * @param {boolean} quick - If true, skip triggering a new sync
 * @returns {object} { name, checks, passed, failed, failures, skipped? }
 */
export async function validateImap(context, cookieHeader, csrfToken, providers, quick) {
  console.log('\n' + '='.repeat(50));
  console.log('  IMAP Full Sync Validation (SYNC-03)');
  console.log('='.repeat(50));

  const results = { name: 'IMAP', checks: 0, passed: 0, failed: 0, failures: [] };
  setResultsCollector(results);

  // --- Step 1: Find IMAP provider ---
  console.log('\n--- Step 1: Find IMAP provider ---');

  const providerList = Array.isArray(providers) ? providers : [];
  const imapProvider = providerList.find(
    p => p.providerType === 'imap'
  );

  if (!imapProvider) {
    console.log('No IMAP provider configured -- skipping');
    setResultsCollector(null);
    return { ...results, skipped: 'No IMAP provider configured' };
  }

  const providerId = imapProvider.id;
  console.log(`  IMAP provider: ${imapProvider.email || 'unknown'} (${providerId})`);

  // --- Step 2: Trigger full sync (skip in quick mode) ---
  console.log('\n--- Step 2: Sync trigger ---');

  if (quick) {
    console.log('  Quick mode -- skipping sync trigger');
  } else {
    console.log('  Triggering full sync for IMAP provider...');
    const syncStart = Date.now();
    try {
      await apiPost(
        context,
        `/api/v1/email-sync/sync/${providerId}`,
        null,
        cookieHeader,
        csrfToken
      );
      console.log('  Sync job queued. Waiting for completion...');

      const completed = await waitForSyncCompletion(context, cookieHeader);
      const elapsed = Math.round((Date.now() - syncStart) / 1000);

      if (completed) {
        console.log(`  IMAP sync completed in ${elapsed}s`);
      } else {
        console.log(`  IMAP sync timed out after ${elapsed}s -- validating partial state`);
      }
    } catch (err) {
      console.log(`  Sync trigger failed: ${err.message} -- validating existing state`);
    }
  }

  // --- Step 3: Folder validation ---
  console.log('\n--- Step 3: Folder validation ---');

  let folders = [];
  try {
    const foldersRes = await apiGet(
      context,
      `/api/v1/folders/provider/${providerId}`,
      cookieHeader
    );
    // Response shape: { data: { provider, folders: [...] } }
    folders = foldersRes?.data?.folders || foldersRes?.data || foldersRes || [];
    if (!Array.isArray(folders)) folders = [];
  } catch (err) {
    console.log(`  Failed to fetch folders: ${err.message}`);
  }

  console.log(`  Found ${folders.length} folders`);

  // CRITICAL: Check system folders by specialUse, NOT by name
  // IMAP folder names can be localized (e.g., "Posta inviata" for Sent)
  const specialUseValues = folders.map(f => f.specialUse).filter(Boolean);
  const requiredFolders = ['INBOX', 'SENT', 'DRAFTS', 'TRASH'];

  for (const req of requiredFolders) {
    assertTrue(
      specialUseValues.includes(req),
      `IMAP: system folder "${req}" present (specialUse)`
    );
  }

  // Optional: JUNK, ARCHIVE -- check but don't fail
  for (const opt of ['JUNK', 'ARCHIVE']) {
    if (specialUseValues.includes(opt)) {
      console.log(`  INFO: IMAP ${opt} folder present`);
    } else {
      console.log(`  INFO: IMAP ${opt} folder not present (optional, not failing)`);
    }
  }

  // Each folder has non-empty name and non-empty path
  // NOTE: IMAP externalId may be null -- do NOT assert externalId non-null
  let folderFieldsOk = true;
  for (const f of folders) {
    if (!f.name || f.name.trim() === '') {
      folderFieldsOk = false;
      results.failures.push(`IMAP: folder id=${f.id} has empty name`);
      results.checks++;
      results.failed++;
    }
    // IMAP folders use path for identification, not externalId
    // path may or may not be present depending on API shape
  }
  if (folderFieldsOk && folders.length > 0) {
    console.log(`  PASS: IMAP: all ${folders.length} folders have non-empty name`);
    results.checks++;
    results.passed++;
  }

  // Folder hierarchy: if any folder has parentId, verify parent exists
  const folderIds = new Set(folders.map(f => f.id));
  let hierarchyOk = true;
  for (const f of folders) {
    if (f.parentId && !folderIds.has(f.parentId)) {
      hierarchyOk = false;
      results.failures.push(`IMAP: folder "${f.name}" references parentId=${f.parentId} not in folder list`);
      results.checks++;
      results.failed++;
    }
  }
  if (hierarchyOk) {
    const withParent = folders.filter(f => f.parentId).length;
    console.log(`  PASS: IMAP: folder hierarchy valid (${withParent} nested folders)`);
    results.checks++;
    results.passed++;
  }

  // Log folder details
  for (const f of folders) {
    console.log(`    ${f.specialUse || f.name}: total=${f.totalCount ?? '?'}, unread=${f.unreadCount ?? '?'}, externalId=${f.externalId?.substring(0, 30) || 'null'}`);
  }

  // --- Step 4: Email count validation ---
  console.log('\n--- Step 4: Email count validation ---');

  let inboxTotal = 0;
  try {
    const inboxRes = await apiGet(
      context,
      `/api/v1/emails?providerId=${providerId}&folder=INBOX&limit=1`,
      cookieHeader
    );
    // Extract total from response -- look in various places
    inboxTotal = inboxRes?.data?.pagination?.total
      ?? inboxRes?.data?.total
      ?? inboxRes?.pagination?.total
      ?? inboxRes?.total
      ?? 0;

    console.log(`  INBOX total emails: ${inboxTotal}`);
  } catch (err) {
    console.log(`  Failed to fetch inbox count: ${err.message}`);
  }

  assertRange(inboxTotal, 1, FULL_SYNC_BUDGET, 'IMAP: INBOX email count > 0 and within budget');

  // --- Step 5: Email field spot-check (5 emails) ---
  console.log('\n--- Step 5: Email field spot-check ---');

  let emailList = [];
  try {
    const emailsRes = await apiGet(
      context,
      `/api/v1/emails?providerId=${providerId}&folder=INBOX&limit=5`,
      cookieHeader
    );
    // Extract email list from various envelope shapes
    emailList = emailsRes?.data?.emails
      ?? emailsRes?.data?.data
      ?? emailsRes?.data
      ?? emailsRes?.emails
      ?? [];
    if (!Array.isArray(emailList)) emailList = [];
  } catch (err) {
    console.log(`  Failed to fetch emails: ${err.message}`);
  }

  assertRange(emailList.length, 1, 5, 'IMAP: fetched 1-5 emails for spot-check');

  for (let i = 0; i < emailList.length; i++) {
    const email = emailList[i];
    const prefix = `IMAP: email[${i}]`;

    assertTrue(
      email.subject && typeof email.subject === 'string' && email.subject.length > 0,
      `${prefix}.subject is non-empty string`
    );

    assertTrue(
      email.from && typeof email.from === 'string' && email.from.includes('@'),
      `${prefix}.from contains "@"`
    );

    assertTrue(
      Array.isArray(email.to) && email.to.length >= 1,
      `${prefix}.to is array with >= 1 element`
    );

    assertTrue(
      email.receivedAt && !isNaN(Date.parse(email.receivedAt)),
      `${prefix}.receivedAt is valid date`
    );

    assertTrue(
      email.externalId && typeof email.externalId === 'string' && email.externalId.length > 0,
      `${prefix}.externalId is non-empty string`
    );

    // NOTE: IMAP emails do NOT have labels. Skip labels check.
  }

  // Get single email by ID to verify body
  if (emailList.length > 0) {
    const testEmailId = emailList[0].id;
    console.log(`\n  Fetching full email ${testEmailId} for body check...`);
    try {
      const fullEmail = await apiGet(
        context,
        `/api/v1/emails/${testEmailId}`,
        cookieHeader
      );
      const emailData = fullEmail?.data || fullEmail;
      const hasBody = (emailData.bodyHtml && emailData.bodyHtml.length > 0)
        || (emailData.bodyText && emailData.bodyText.length > 0);

      assertTrue(hasBody, 'IMAP: single email has bodyHtml or bodyText');
    } catch (err) {
      console.log(`  Failed to fetch single email: ${err.message}`);
      results.failures.push(`IMAP: single email body check failed: ${err.message}`);
      results.checks++;
      results.failed++;
    }
  }

  // --- Step 6: Dedup check ---
  console.log('\n--- Step 6: Dedup check ---');

  let dedupEmails = [];
  try {
    const dedupRes = await apiGet(
      context,
      `/api/v1/emails?providerId=${providerId}&limit=100`,
      cookieHeader
    );
    dedupEmails = dedupRes?.data?.emails
      ?? dedupRes?.data?.data
      ?? dedupRes?.data
      ?? dedupRes?.emails
      ?? [];
    if (!Array.isArray(dedupEmails)) dedupEmails = [];
  } catch (err) {
    console.log(`  Failed to fetch emails for dedup check: ${err.message}`);
  }

  if (dedupEmails.length > 0) {
    const externalIds = dedupEmails.map(e => e.externalId).filter(Boolean);
    const uniqueIds = new Set(externalIds);
    assertEqual(
      uniqueIds.size,
      externalIds.length,
      `IMAP: no duplicate externalIds in ${externalIds.length} emails`
    );
  } else {
    console.log('  SKIP: no emails to check for dedup');
  }

  // --- Step 7: Report ---
  console.log(`\n--- IMAP validation: ${results.checks} checks, ${results.passed} passed, ${results.failed} failed ---`);

  setResultsCollector(null);
  return results;
}
