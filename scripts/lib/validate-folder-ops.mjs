/**
 * Folder Operations Validation (FOLD-01..05)
 *
 * Validates folder CRUD, sync, and system folder protection against live
 * provider data via the REST API.
 *
 *   FOLD-01: Create folder on provider
 *   FOLD-02: Rename folder on provider
 *   FOLD-03: Delete folder from provider
 *   FOLD-04: Sync folders from provider
 *   FOLD-05: System folder protection (reject delete/rename)
 */
import {
  apiGet,
  apiPost,
  apiPatch,
  apiDelete,
  assertTrue,
  setResultsCollector,
  BACKEND_URL,
} from './validation-helpers.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * Determine provider type string for display.
 */
function providerTypeLabel(provider) {
  const type = provider.providerType || provider.type || '';
  if (type === 'google') return 'Gmail';
  if (type === 'microsoft') return 'Outlook';
  if (type === 'imap') return 'IMAP';
  return type;
}

/**
 * Check if provider matches the CLI filter.
 */
function matchesProviderFilter(provider, filter) {
  if (filter === 'all') return true;
  const type = provider.providerType || provider.type || '';
  if (filter === 'gmail') return type === 'google';
  if (filter === 'outlook' || filter === 'microsoft') return type === 'microsoft';
  if (filter === 'imap') return type === 'imap';
  return false;
}

/**
 * Get folders for a specific provider.
 * @returns {Array} folder records
 */
async function getFolders(context, cookieHeader, providerId) {
  const res = await apiGet(context, `/api/v1/folders/provider/${providerId}`, cookieHeader);
  const folders = Array.isArray(res) ? res
    : Array.isArray(res?.data) ? res.data
    : [];
  return folders;
}

/**
 * Simple delay for BullMQ queue processing.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// FOLD-01: Create folder
// ---------------------------------------------------------------------------

async function validateCreateFolder(context, cookieHeader, csrfToken, provider) {
  const label = providerTypeLabel(provider);
  const timestamp = Date.now();
  const folderName = `Test-Fold-${timestamp}`;

  console.log(`\n  --- FOLD-01: Create folder (${label}) ---`);
  console.log(`  Creating folder "${folderName}"...`);

  let createRes;
  try {
    createRes = await apiPost(
      context,
      '/api/v1/folders',
      { name: folderName, providerId: provider.id },
      cookieHeader,
      csrfToken,
    );
  } catch (err) {
    console.log(`  ERROR: Create folder failed: ${err.message}`);
    assertTrue(false, `${label} FOLD-01: Create folder returns success`);
    return null;
  }

  const created = createRes?.data ?? createRes;
  const status = createRes?.status ?? (created?.id ? 200 : 0);
  assertTrue(
    !!created?.id || status === 200 || status === 201,
    `${label} FOLD-01: Create folder returns success`,
  );

  // Wait for BullMQ queue processing
  await sleep(3000);

  // Verify folder appears in list
  const folders = await getFolders(context, cookieHeader, provider.id);
  const found = folders.some(f =>
    (f.name || '').includes(`Test-Fold-${timestamp}`) ||
    (f.path || '').includes(`Test-Fold-${timestamp}`),
  );
  assertTrue(found, `${label} FOLD-01: Created folder appears in list`);

  // Return folder ID for subsequent tests
  const folderId = created?.id
    || folders.find(f => (f.name || '').includes(`Test-Fold-${timestamp}`))?.id;

  console.log(`  Created folder ID: ${folderId || 'not found'}`);
  return { folderId, timestamp };
}

// ---------------------------------------------------------------------------
// FOLD-02: Rename folder
// ---------------------------------------------------------------------------

async function validateRenameFolder(context, cookieHeader, csrfToken, provider, folderId, timestamp) {
  const label = providerTypeLabel(provider);
  const newName = `Renamed-${timestamp}`;

  console.log(`\n  --- FOLD-02: Rename folder (${label}) ---`);
  console.log(`  Renaming folder ${folderId} to "${newName}"...`);

  let renameRes;
  try {
    renameRes = await apiPatch(
      context,
      `/api/v1/folders/${folderId}`,
      { newName },
      cookieHeader,
      csrfToken,
    );
  } catch (err) {
    console.log(`  ERROR: Rename folder failed: ${err.message}`);
    assertTrue(false, `${label} FOLD-02: Rename returns success`);
    return;
  }

  const status = renameRes?.status ?? 200;
  assertTrue(
    status === 200 || !!renameRes,
    `${label} FOLD-02: Rename returns success`,
  );

  // Wait for queue processing
  await sleep(3000);

  // Verify renamed folder in list
  const folders = await getFolders(context, cookieHeader, provider.id);
  const found = folders.some(f =>
    (f.name || '').includes(`Renamed-${timestamp}`) ||
    (f.path || '').includes(`Renamed-${timestamp}`),
  );
  assertTrue(found, `${label} FOLD-02: Renamed folder name updated in list`);
}

// ---------------------------------------------------------------------------
// FOLD-03: Delete folder
// ---------------------------------------------------------------------------

async function validateDeleteFolder(context, cookieHeader, csrfToken, provider, folderId) {
  const label = providerTypeLabel(provider);

  console.log(`\n  --- FOLD-03: Delete folder (${label}) ---`);
  console.log(`  Deleting folder ${folderId}...`);

  let deleteRes;
  try {
    deleteRes = await apiDelete(
      context,
      `/api/v1/folders/${folderId}`,
      cookieHeader,
      csrfToken,
    );
  } catch (err) {
    console.log(`  ERROR: Delete folder failed: ${err.message}`);
    assertTrue(false, `${label} FOLD-03: Delete returns success`);
    return;
  }

  const status = deleteRes?.status ?? 200;
  assertTrue(
    status === 200 || !!deleteRes,
    `${label} FOLD-03: Delete returns success`,
  );

  // Wait for queue processing
  await sleep(3000);

  // Verify folder is gone
  const folders = await getFolders(context, cookieHeader, provider.id);
  const stillExists = folders.some(f => f.id === folderId);
  assertTrue(!stillExists, `${label} FOLD-03: Deleted folder gone from list`);
}

// ---------------------------------------------------------------------------
// FOLD-04: Sync from provider
// ---------------------------------------------------------------------------

async function validateSyncFromProvider(context, cookieHeader, csrfToken, provider) {
  const label = providerTypeLabel(provider);

  console.log(`\n  --- FOLD-04: Sync from provider (${label}) ---`);
  console.log(`  Triggering folder sync for provider ${provider.id}...`);

  let syncRes;
  try {
    syncRes = await apiPost(
      context,
      `/api/v1/folders/sync/${provider.id}`,
      {},
      cookieHeader,
      csrfToken,
    );
  } catch (err) {
    console.log(`  ERROR: Sync failed: ${err.message}`);
    assertTrue(false, `${label} FOLD-04: Sync returns success`);
    return;
  }

  const status = syncRes?.status ?? 200;
  assertTrue(
    status === 200 || status === 201 || !!syncRes,
    `${label} FOLD-04: Sync returns success`,
  );

  // Verify folders exist after sync
  const folders = await getFolders(context, cookieHeader, provider.id);
  assertTrue(folders.length > 0, `${label} FOLD-04: Folders exist after sync`);
  console.log(`  Synced ${folders.length} folders`);
}

// ---------------------------------------------------------------------------
// FOLD-05: System folder protection
// ---------------------------------------------------------------------------

async function validateSystemFolderProtection(context, cookieHeader, csrfToken, provider) {
  const label = providerTypeLabel(provider);

  console.log(`\n  --- FOLD-05: System folder protection (${label}) ---`);

  const folders = await getFolders(context, cookieHeader, provider.id);

  // Find a system folder by specialUse or well-known name
  const systemNames = ['INBOX', 'SENT', 'TRASH', 'DRAFTS', 'SPAM', 'JUNK'];
  const systemFolder = folders.find(f =>
    (f.specialUse && systemNames.includes(f.specialUse.toUpperCase())) ||
    systemNames.includes((f.name || '').toUpperCase()),
  );

  if (!systemFolder) {
    console.log(`  ERROR: No system folder found among ${folders.length} folders`);
    assertTrue(false, 'FOLD-05: System folder found for testing');
    return;
  }

  console.log(`  Found system folder: "${systemFolder.name}" (specialUse: ${systemFolder.specialUse || 'none'}, id: ${systemFolder.id})`);

  // Helper to check if an error/response indicates a 400/403 block
  function isBlockedResponse(errOrRes) {
    const s = errOrRes?.status ?? errOrRes?.statusCode ?? 0;
    const m = errOrRes?.message || '';
    return s === 400 || s === 403 || m.includes('400') || m.includes('403')
      || m.includes('system') || m.includes('cannot') || m.includes('Bad Request');
  }

  // Test 1: Delete system folder should be blocked
  console.log(`  Step 1: Attempting to delete system folder...`);
  try {
    const delRes = await apiDelete(context, `/api/v1/folders/${systemFolder.id}`, cookieHeader, csrfToken);
    assertTrue(isBlockedResponse(delRes), 'FOLD-05: Delete system folder blocked');
  } catch (err) {
    const blocked = isBlockedResponse(err);
    assertTrue(blocked, 'FOLD-05: Delete system folder blocked');
    console.log(`  ${blocked ? 'Correctly blocked' : 'Unexpected error'}: ${(err.message || '').substring(0, 100)}`);
  }

  // Test 2: Rename system folder should be blocked
  console.log(`  Step 2: Attempting to rename system folder...`);
  try {
    const renameRes = await apiPatch(context, `/api/v1/folders/${systemFolder.id}`, { newName: 'hacked' }, cookieHeader, csrfToken);
    assertTrue(isBlockedResponse(renameRes), 'FOLD-05: Rename system folder blocked');
  } catch (err) {
    const blocked = isBlockedResponse(err);
    assertTrue(blocked, 'FOLD-05: Rename system folder blocked');
    console.log(`  ${blocked ? 'Correctly blocked' : 'Unexpected error'}: ${(err.message || '').substring(0, 100)}`);
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function validateFolderOps(context, cookieHeader, csrfToken, opts = {}) {
  const allResults = [];

  const providers = await getProviders(context, cookieHeader);
  const filtered = providers.filter(p => matchesProviderFilter(p, opts.provider || 'all'));

  if (filtered.length === 0) {
    console.log('No matching providers found!');
    return allResults;
  }

  // Per-provider FOLD-01..04 tests
  for (const provider of filtered) {
    const label = providerTypeLabel(provider);
    const results = { name: `FolderOps-${label}`, checks: 0, passed: 0, failed: 0, failures: [] };
    setResultsCollector(results);

    console.log(`\n=== Provider: ${label} (${provider.email}) ===`);

    try {
      // FOLD-01: Create folder
      const created = await validateCreateFolder(context, cookieHeader, csrfToken, provider);

      if (created?.folderId) {
        // FOLD-02: Rename folder (requires created folder)
        await validateRenameFolder(
          context, cookieHeader, csrfToken, provider,
          created.folderId, created.timestamp,
        );

        // FOLD-03: Delete folder (deletes the renamed folder)
        await validateDeleteFolder(context, cookieHeader, csrfToken, provider, created.folderId);
      } else {
        console.log(`  SKIP: FOLD-02/03 skipped -- no folder ID from FOLD-01`);
        assertTrue(false, `${label} FOLD-02: Rename skipped (no folder from create)`);
        assertTrue(false, `${label} FOLD-03: Delete skipped (no folder from create)`);
      }

      // FOLD-04: Sync from provider
      await validateSyncFromProvider(context, cookieHeader, csrfToken, provider);
    } catch (err) {
      console.log(`  ERROR: Provider ${label} tests failed: ${err.message}`);
      results.checks++;
      results.failed++;
      results.failures.push(`${label}: ${err.message}`);
    }

    setResultsCollector(null);
    allResults.push(results);
  }

  // FOLD-05: System folder protection (once, using first available provider)
  const firstProvider = filtered[0];
  const fold05Results = { name: 'FolderOps-SystemProtection', checks: 0, passed: 0, failed: 0, failures: [] };
  setResultsCollector(fold05Results);

  try {
    await validateSystemFolderProtection(context, cookieHeader, csrfToken, firstProvider);
  } catch (err) {
    console.log(`  ERROR: System folder protection test failed: ${err.message}`);
    fold05Results.checks++;
    fold05Results.failed++;
    fold05Results.failures.push(`FOLD-05: ${err.message}`);
  }

  setResultsCollector(null);
  allResults.push(fold05Results);

  return allResults;
}
