/**
 * Sync-Back Operations Validation (SYNC-09, SYNC-10, SYNC-11)
 *
 * Validates that local state changes via the API succeed and round-trip correctly:
 *   SYNC-09: mark-read/unread
 *   SYNC-10: star/unstar
 *   SYNC-11: move-to-folder
 *
 * NOTE: These tests verify the LOCAL state roundtrip. Provider-side sync-back
 * is fire-and-forget; remote verification is deferred to Plan 02 checkpoint.
 */
import {
  apiGet,
  apiPatch,
  assertEqual,
  assertTrue,
  setResultsCollector,
} from './validation-helpers.mjs';

/**
 * Get list of configured providers.
 * @returns {Array} provider records
 */
async function getProviders(context, cookieHeader) {
  const res = await apiGet(context, '/api/v1/providers', cookieHeader);
  const providers = Array.isArray(res) ? res
    : Array.isArray(res?.data) ? res.data
    : [];
  return providers;
}

/**
 * Find a test email with a valid externalId for the given provider.
 * @returns {object|null} email record or null
 */
async function findTestEmail(context, cookieHeader, providerId) {
  const res = await apiGet(
    context,
    `/api/v1/emails?providerId=${providerId}&limit=5`,
    cookieHeader,
  );
  const emails = res?.data?.emails ?? res?.data?.data ?? res?.data ?? res?.emails ?? [];
  if (!Array.isArray(emails)) return null;
  return emails.find(e => e.externalId && e.externalId.trim() !== '') || null;
}

/**
 * Find a test email in a specific folder for the given provider.
 * @returns {object|null} email record or null
 */
async function findTestEmailInFolder(context, cookieHeader, providerId, folder) {
  const res = await apiGet(
    context,
    `/api/v1/emails?providerId=${providerId}&folder=${encodeURIComponent(folder)}&limit=5`,
    cookieHeader,
  );
  const emails = res?.data?.emails ?? res?.data?.data ?? res?.data ?? res?.emails ?? [];
  if (!Array.isArray(emails)) return null;
  return emails.find(e => e.externalId && e.externalId.trim() !== '') || null;
}

/**
 * Get a single email by ID.
 * @returns {object} email record (unwrapped from envelope)
 */
async function getEmail(context, cookieHeader, emailId) {
  const res = await apiGet(context, `/api/v1/emails/${emailId}`, cookieHeader);
  return res?.data || res;
}

/**
 * Determine provider type string for display.
 */
function providerTypeLabel(provider) {
  const pt = (provider.providerType || '').toLowerCase();
  if (pt === 'google' || pt === 'gmail') return 'Gmail';
  if (pt === 'microsoft' || pt === 'outlook') return 'Outlook';
  if (pt === 'imap' || pt === 'generic') return 'IMAP';
  return pt;
}

/**
 * Filter providers by type flag.
 */
function filterProviders(providers, providerFilter) {
  if (!providerFilter || providerFilter === 'all') return providers;

  return providers.filter(p => {
    const pt = (p.providerType || '').toLowerCase();
    switch (providerFilter) {
      case 'gmail':
        return pt === 'google' || pt === 'gmail';
      case 'microsoft':
      case 'outlook':
        return pt === 'microsoft' || pt === 'outlook';
      case 'imap':
        return pt === 'imap' || pt === 'generic';
      default:
        return true;
    }
  });
}

// --- SYNC-09: Mark read/unread roundtrip ---

async function testMarkRead(context, cookieHeader, csrfToken, provider, results) {
  const label = providerTypeLabel(provider);
  console.log(`\n--- SYNC-09: mark-read/unread on ${label} ---`);

  const email = await findTestEmail(context, cookieHeader, provider.id);
  if (!email) {
    console.log(`  SKIP: No test email found for ${label}`);
    return;
  }

  console.log(`  Test email: ${email.id} (subject: ${(email.subject || '').substring(0, 40)})`);
  const originalIsRead = !!email.isRead;

  // Toggle read state
  await apiPatch(
    context,
    `/api/v1/emails/${email.id}`,
    { isRead: !originalIsRead },
    cookieHeader,
    csrfToken,
  );

  // Verify toggled
  const toggled = await getEmail(context, cookieHeader, email.id);
  assertEqual(
    toggled.isRead,
    !originalIsRead,
    `SYNC-09: ${label} isRead toggled to ${!originalIsRead}`,
  );

  // Restore original
  await apiPatch(
    context,
    `/api/v1/emails/${email.id}`,
    { isRead: originalIsRead },
    cookieHeader,
    csrfToken,
  );

  // Verify restored
  const restored = await getEmail(context, cookieHeader, email.id);
  assertEqual(
    restored.isRead,
    originalIsRead,
    `SYNC-09: ${label} isRead restored to ${originalIsRead}`,
  );
}

// --- SYNC-10: Star/unstar roundtrip ---

async function testStar(context, cookieHeader, csrfToken, provider, results) {
  const label = providerTypeLabel(provider);
  console.log(`\n--- SYNC-10: star/unstar on ${label} ---`);

  const email = await findTestEmail(context, cookieHeader, provider.id);
  if (!email) {
    console.log(`  SKIP: No test email found for ${label}`);
    return;
  }

  console.log(`  Test email: ${email.id} (subject: ${(email.subject || '').substring(0, 40)})`);
  const originalIsStarred = !!email.isStarred;

  // Toggle starred state
  await apiPatch(
    context,
    `/api/v1/emails/${email.id}`,
    { isStarred: !originalIsStarred },
    cookieHeader,
    csrfToken,
  );

  // Verify toggled
  const toggled = await getEmail(context, cookieHeader, email.id);
  assertEqual(
    toggled.isStarred,
    !originalIsStarred,
    `SYNC-10: ${label} isStarred toggled to ${!originalIsStarred}`,
  );

  // Restore original
  await apiPatch(
    context,
    `/api/v1/emails/${email.id}`,
    { isStarred: originalIsStarred },
    cookieHeader,
    csrfToken,
  );

  // Verify restored
  const restored = await getEmail(context, cookieHeader, email.id);
  assertEqual(
    restored.isStarred,
    originalIsStarred,
    `SYNC-10: ${label} isStarred restored to ${originalIsStarred}`,
  );
}

// --- SYNC-11: Move to folder roundtrip ---

async function testMoveToFolder(context, cookieHeader, csrfToken, provider, results) {
  const label = providerTypeLabel(provider);
  console.log(`\n--- SYNC-11: move-to-folder on ${label} ---`);

  // Find an email in INBOX
  const email = await findTestEmailInFolder(context, cookieHeader, provider.id, 'INBOX');
  if (!email) {
    console.log(`  SKIP: No test email in INBOX for ${label}`);
    return;
  }

  console.log(`  Test email: ${email.id} (folder: ${email.folder}, subject: ${(email.subject || '').substring(0, 40)})`);

  // Find a non-INBOX folder to move to
  let targetFolder = null;
  try {
    const foldersRes = await apiGet(
      context,
      `/api/v1/folders/provider/${provider.id}`,
      cookieHeader,
    );
    const folders = foldersRes?.data?.folders || foldersRes?.data || foldersRes || [];
    if (Array.isArray(folders)) {
      // Prefer ARCHIVE/ALL, then TRASH, then any non-INBOX system folder
      const preferred = ['ARCHIVE', 'ALL'];
      for (const pref of preferred) {
        const match = folders.find(f =>
          (f.specialUse || '').toUpperCase() === pref ||
          (f.name || '').toUpperCase() === pref
        );
        if (match) {
          targetFolder = match.externalId || match.name || match.path;
          break;
        }
      }
      if (!targetFolder) {
        // Fall back to any folder that is not INBOX
        const nonInbox = folders.find(f =>
          (f.specialUse || '').toUpperCase() !== 'INBOX' &&
          (f.name || '').toUpperCase() !== 'INBOX' &&
          f.externalId
        );
        if (nonInbox) {
          targetFolder = nonInbox.externalId || nonInbox.name || nonInbox.path;
        }
      }
    }
  } catch (err) {
    console.log(`  Failed to fetch folders: ${err.message}`);
  }

  if (!targetFolder) {
    console.log(`  SKIP: No non-INBOX folder found for ${label}`);
    return;
  }

  console.log(`  Moving to: ${targetFolder}`);

  // Move to target folder
  await apiPatch(
    context,
    `/api/v1/emails/${email.id}`,
    { folder: targetFolder },
    cookieHeader,
    csrfToken,
  );

  // Verify moved
  const moved = await getEmail(context, cookieHeader, email.id);
  assertEqual(
    moved.folder,
    targetFolder,
    `SYNC-11: ${label} folder changed to ${targetFolder}`,
  );

  // Move back to INBOX
  await apiPatch(
    context,
    `/api/v1/emails/${email.id}`,
    { folder: 'INBOX' },
    cookieHeader,
    csrfToken,
  );

  // Verify restored
  const restored = await getEmail(context, cookieHeader, email.id);
  assertEqual(
    restored.folder,
    'INBOX',
    `SYNC-11: ${label} folder restored to INBOX`,
  );
}

/**
 * Run sync-back validation for all matching providers.
 *
 * @param {object} context - Playwright browser context
 * @param {string} cookieHeader - Cookie header string
 * @param {string} csrfToken - CSRF token for mutating requests
 * @param {object} options - { provider?: string, quick?: boolean }
 * @returns {Array} array of result objects for report()
 */
export async function validateSyncBack(context, cookieHeader, csrfToken, options = {}) {
  const { provider: providerFilter, quick } = options;

  console.log('\n' + '='.repeat(50));
  console.log('  Sync-Back Operations Validation');
  console.log('='.repeat(50));

  const allProviders = await getProviders(context, cookieHeader);
  const providers = filterProviders(allProviders, providerFilter);

  console.log(`\nDiscovered ${allProviders.length} providers, testing ${providers.length}:`);
  for (const p of providers) {
    console.log(`  - ${p.providerType}: ${p.email || 'unknown'} (${p.id})`);
  }

  if (providers.length === 0) {
    return [{ name: 'SyncBack', checks: 0, passed: 0, failed: 0, failures: [], skipped: 'No matching providers found' }];
  }

  const allResults = [];

  for (const prov of providers) {
    const label = providerTypeLabel(prov);
    const results = { name: `SyncBack-${label}`, checks: 0, passed: 0, failed: 0, failures: [] };
    setResultsCollector(results);

    try {
      await testMarkRead(context, cookieHeader, csrfToken, prov, results);
    } catch (err) {
      console.log(`  ERROR in SYNC-09 for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`SYNC-09 ${label}: ${err.message}`);
    }

    try {
      await testStar(context, cookieHeader, csrfToken, prov, results);
    } catch (err) {
      console.log(`  ERROR in SYNC-10 for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`SYNC-10 ${label}: ${err.message}`);
    }

    try {
      await testMoveToFolder(context, cookieHeader, csrfToken, prov, results);
    } catch (err) {
      console.log(`  ERROR in SYNC-11 for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`SYNC-11 ${label}: ${err.message}`);
    }

    setResultsCollector(null);
    allResults.push(results);
  }

  return allResults;
}
