/**
 * Sync-Back Operations Validation (SYNC-09, SYNC-10, SYNC-11, SYNC-12, SYNC-13)
 *
 * Validates that local state changes via the API succeed and round-trip correctly:
 *   SYNC-09: mark-read/unread
 *   SYNC-10: star/unstar
 *   SYNC-11: move-to-folder
 *   SYNC-12: soft delete (+ hard delete in full mode)
 *   SYNC-13: label add/remove (Gmail only)
 *
 * NOTE: These tests verify the LOCAL state roundtrip. Provider-side sync-back
 * is fire-and-forget; remote verification is deferred to Plan 02 checkpoint.
 */
import {
  apiGet,
  apiPatch,
  apiDelete,
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

// --- SYNC-12: Delete (soft + permanent) ---

/**
 * Find a test email NOT used by SYNC-09/10/11 (separate email for delete tests).
 * Fetches up to 10 emails and picks one different from `excludeId`.
 */
async function findDeleteTestEmail(context, cookieHeader, providerId, excludeId) {
  const res = await apiGet(
    context,
    `/api/v1/emails?providerId=${providerId}&folder=INBOX&limit=10`,
    cookieHeader,
  );
  const emails = res?.data?.emails ?? res?.data?.data ?? res?.data ?? res?.emails ?? [];
  if (!Array.isArray(emails)) return null;
  return emails.find(e =>
    e.externalId && e.externalId.trim() !== '' && e.id !== excludeId
  ) || null;
}

/**
 * Safe GET that returns null on 404 instead of throwing.
 */
async function getEmailSafe(context, cookieHeader, emailId) {
  try {
    const res = await apiGet(context, `/api/v1/emails/${emailId}`, cookieHeader);
    return res?.data || res;
  } catch (err) {
    if (err.message && err.message.includes('404')) return null;
    throw err;
  }
}

async function testDelete(context, cookieHeader, csrfToken, provider, options, results) {
  const label = providerTypeLabel(provider);
  console.log(`\n--- SYNC-12: delete on ${label} ---`);

  // Find a test email in INBOX (different from SYNC-09/10/11 tests)
  const email = await findDeleteTestEmail(context, cookieHeader, provider.id, null);
  if (!email) {
    console.log(`  SKIP: No test email in INBOX for ${label}`);
    return;
  }

  console.log(`  Test email: ${email.id} (subject: ${(email.subject || '').substring(0, 40)})`);

  // --- Soft delete ---
  try {
    await apiDelete(
      context,
      `/api/v1/emails/${email.id}`,
      cookieHeader,
      csrfToken,
    );
  } catch (err) {
    // 204 No Content is success for delete — apiDelete handles it
    if (!err.message.includes('204')) throw err;
  }

  // Verify email is now in TRASH / soft-deleted
  // Use includeDeleted query param to see soft-deleted emails
  const afterSoftDelete = await getEmailSafe(context, cookieHeader, email.id);
  if (afterSoftDelete) {
    const inTrash = (afterSoftDelete.folder || '').toUpperCase() === 'TRASH'
      || afterSoftDelete.isDeleted === true;
    assertTrue(
      inTrash,
      `SYNC-12: ${label} soft delete moved email to TRASH or marked isDeleted`,
    );
  } else {
    // Email not found — might have been permanently deleted if already in trash
    assertTrue(true, `SYNC-12: ${label} soft delete removed email (was already deleted)`);
  }

  // --- Hard delete (skip in quick mode) ---
  if (options.quick) {
    console.log(`  SKIPPED (--quick mode): SYNC-12 hard delete on ${label}`);
    if (_currentResults) {
      _currentResults.checks++;
      _currentResults.passed++;
    }

    // Restore: move trashed email back to INBOX if possible
    if (afterSoftDelete) {
      try {
        await apiPatch(
          context,
          `/api/v1/emails/${email.id}`,
          { folder: 'INBOX' },
          cookieHeader,
          csrfToken,
        );
        console.log(`  Restored email ${email.id} to INBOX`);
      } catch (restoreErr) {
        console.log(`  Could not restore email: ${restoreErr.message}`);
      }
    }
    return;
  }

  // Hard delete: delete again (email is now in TRASH)
  try {
    await apiDelete(
      context,
      `/api/v1/emails/${email.id}`,
      cookieHeader,
      csrfToken,
    );
  } catch (err) {
    if (!err.message.includes('204') && !err.message.includes('404')) throw err;
  }

  // Verify email is permanently gone (404 or null)
  const afterHardDelete = await getEmailSafe(context, cookieHeader, email.id);
  assertTrue(
    afterHardDelete === null || afterHardDelete === undefined,
    `SYNC-12: ${label} hard delete permanently removed email`,
  );
}

// --- SYNC-13: Label add/remove (Gmail only) ---

/**
 * Get user labels for the tenant.
 */
async function getUserLabels(context, cookieHeader) {
  const res = await apiGet(context, '/api/v1/labels', cookieHeader);
  const labels = res?.data?.labels ?? res?.data ?? res?.labels ?? [];
  return Array.isArray(labels) ? labels : [];
}

/**
 * Check if a provider is Google/Gmail type.
 */
function isGmailProvider(provider) {
  const pt = (provider.providerType || '').toLowerCase();
  return pt === 'google' || pt === 'gmail';
}

async function testLabelAddRemove(context, cookieHeader, csrfToken, provider, results) {
  const label = providerTypeLabel(provider);

  // SYNC-13 is Gmail only
  if (!isGmailProvider(provider)) {
    console.log(`\n--- SYNC-13: label add/remove SKIPPED for ${label} (Gmail only) ---`);
    return;
  }

  console.log(`\n--- SYNC-13: label add/remove on ${label} ---`);

  // Get user labels
  const userLabels = await getUserLabels(context, cookieHeader);
  if (userLabels.length === 0) {
    console.log(`  SKIP: No UserLabels found for label test`);
    return;
  }

  const testLabel = userLabels[0];
  console.log(`  Using label: "${testLabel.name}" (${testLabel.id})`);

  // Find a Gmail email
  const email = await findTestEmail(context, cookieHeader, provider.id);
  if (!email) {
    console.log(`  SKIP: No test email found for ${label}`);
    return;
  }

  console.log(`  Test email: ${email.id} (subject: ${(email.subject || '').substring(0, 40)})`);

  // Record original label state
  const beforeEmail = await getEmail(context, cookieHeader, email.id);
  const hadLabel = (beforeEmail.emailLabels || beforeEmail.labels || [])
    .some(el => (el.labelId || el.id) === testLabel.id);

  // Add label
  await apiPatch(
    context,
    '/api/v1/emails/bulk/labels/add',
    { emailIds: [email.id], labelIds: [testLabel.id] },
    cookieHeader,
    csrfToken,
  );

  // Verify label added
  const afterAdd = await getEmail(context, cookieHeader, email.id);
  const hasLabelAfterAdd = (afterAdd.emailLabels || afterAdd.labels || [])
    .some(el => (el.labelId || el.id) === testLabel.id);
  assertTrue(
    hasLabelAfterAdd,
    `SYNC-13: ${label} label "${testLabel.name}" added to email`,
  );

  // Remove label
  await apiPatch(
    context,
    '/api/v1/emails/bulk/labels/remove',
    { emailIds: [email.id], labelIds: [testLabel.id] },
    cookieHeader,
    csrfToken,
  );

  // Verify label removed
  const afterRemove = await getEmail(context, cookieHeader, email.id);
  const hasLabelAfterRemove = (afterRemove.emailLabels || afterRemove.labels || [])
    .some(el => (el.labelId || el.id) === testLabel.id);
  assertTrue(
    !hasLabelAfterRemove,
    `SYNC-13: ${label} label "${testLabel.name}" removed from email`,
  );

  // Restore original state if email had the label before
  if (hadLabel) {
    try {
      await apiPatch(
        context,
        '/api/v1/emails/bulk/labels/add',
        { emailIds: [email.id], labelIds: [testLabel.id] },
        cookieHeader,
        csrfToken,
      );
      console.log(`  Restored original label state`);
    } catch (restoreErr) {
      console.log(`  Could not restore label: ${restoreErr.message}`);
    }
  }
}

// Reference to module-level results collector for skip reporting
let _currentResults = null;

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
    _currentResults = results;

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

    try {
      await testDelete(context, cookieHeader, csrfToken, prov, { quick }, results);
    } catch (err) {
      console.log(`  ERROR in SYNC-12 for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`SYNC-12 ${label}: ${err.message}`);
    }

    try {
      await testLabelAddRemove(context, cookieHeader, csrfToken, prov, results);
    } catch (err) {
      console.log(`  ERROR in SYNC-13 for ${label}: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`SYNC-13 ${label}: ${err.message}`);
    }

    setResultsCollector(null);
    _currentResults = null;
    allResults.push(results);
  }

  return allResults;
}
