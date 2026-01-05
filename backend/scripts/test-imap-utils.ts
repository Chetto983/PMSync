/**
 * Test IMAP Utils Consolidation (Phase 2)
 *
 * Tests:
 * 1. parseImapExternalId - folder:uid parsing
 * 2. createImapExternalId - folder:uid creation
 * 3. parseImapUid - numeric UID extraction
 * 4. getImapFolderFallback - special folder name mapping
 *
 * Run: npx ts-node backend/scripts/test-imap-utils.ts
 */

import {
  parseImapExternalId,
  createImapExternalId,
  parseImapUid,
  getImapFolderFallback,
  IMAP_SPECIAL_FOLDERS,
} from '../src/common/utils/imap-utils';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, passed: true });
    console.log(`  ✅ ${name}`);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: errMsg });
    console.log(`  ❌ ${name}: ${errMsg}`);
  }
}

function assertEquals<T>(actual: T, expected: T, msg?: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(msg || `Expected ${expectedStr}, got ${actualStr}`);
  }
}

function assertThrows(fn: () => void, expectedMsg?: string) {
  try {
    fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    if (expectedMsg && error instanceof Error && !error.message.includes(expectedMsg)) {
      throw new Error(`Expected error containing "${expectedMsg}", got "${error.message}"`);
    }
  }
}

console.log('\n=== IMAP Utils Consolidation Test (Phase 2) ===\n');

// Test 1: parseImapExternalId
console.log('📋 parseImapExternalId tests:');

test('parses folder:uid format', () => {
  const result = parseImapExternalId('INBOX:12345');
  assertEquals(result, { folderPath: 'INBOX', uid: '12345' });
});

test('parses nested folder:uid format', () => {
  const result = parseImapExternalId('Folder/Subfolder:54321');
  assertEquals(result, { folderPath: 'Folder/Subfolder', uid: '54321' });
});

test('handles folder with colon in name', () => {
  const result = parseImapExternalId('Work:Projects:99');
  assertEquals(result, { folderPath: 'Work:Projects', uid: '99' });
});

test('plain UID defaults to INBOX', () => {
  const result = parseImapExternalId('12345');
  assertEquals(result, { folderPath: 'INBOX', uid: '12345' });
});

test('plain UID with fallback folder', () => {
  const result = parseImapExternalId('12345', 'SENT');
  assertEquals(result, { folderPath: 'SENT', uid: '12345' });
});

test('folder:uid ignores fallback', () => {
  const result = parseImapExternalId('TRASH:999', 'SENT');
  assertEquals(result, { folderPath: 'TRASH', uid: '999' });
});

test('null fallback uses INBOX', () => {
  const result = parseImapExternalId('12345', null);
  assertEquals(result, { folderPath: 'INBOX', uid: '12345' });
});

test('throws on empty externalId', () => {
  assertThrows(() => parseImapExternalId(''), 'External ID is required');
});

test('throws on invalid UID', () => {
  assertThrows(() => parseImapExternalId('INBOX:notanumber'), 'Invalid IMAP UID');
});

// Test 2: createImapExternalId
console.log('\n📋 createImapExternalId tests:');

test('creates folder:uid string', () => {
  assertEquals(createImapExternalId('INBOX', 12345), 'INBOX:12345');
});

test('accepts string UID', () => {
  assertEquals(createImapExternalId('SENT', '999'), 'SENT:999');
});

test('handles nested folder', () => {
  assertEquals(createImapExternalId('Work/Projects', 1), 'Work/Projects:1');
});

// Test 3: parseImapUid
console.log('\n📋 parseImapUid tests:');

test('extracts numeric UID from folder:uid', () => {
  assertEquals(parseImapUid('INBOX:12345'), 12345);
});

test('extracts numeric UID from plain UID', () => {
  assertEquals(parseImapUid('999'), 999);
});

test('throws on invalid UID', () => {
  assertThrows(() => parseImapUid('INBOX:abc'), 'Invalid IMAP UID');
});

// Test 4: getImapFolderFallback
console.log('\n📋 getImapFolderFallback tests:');

test('returns INBOX for inbox', () => {
  assertEquals(getImapFolderFallback('INBOX'), 'INBOX');
});

test('returns Sent for SENT', () => {
  assertEquals(getImapFolderFallback('SENT'), 'Sent');
});

test('returns Drafts for DRAFTS', () => {
  assertEquals(getImapFolderFallback('DRAFTS'), 'Drafts');
});

test('returns Trash for TRASH', () => {
  assertEquals(getImapFolderFallback('TRASH'), 'Trash');
});

test('returns Spam for SPAM', () => {
  assertEquals(getImapFolderFallback('SPAM'), 'Spam');
});

test('returns Junk for JUNK', () => {
  assertEquals(getImapFolderFallback('JUNK'), 'Junk');
});

test('returns Archive for ARCHIVE', () => {
  assertEquals(getImapFolderFallback('ARCHIVE'), 'Archive');
});

test('returns All Mail for ALL', () => {
  assertEquals(getImapFolderFallback('ALL'), 'All Mail');
});

test('returns Flagged for FLAGGED', () => {
  assertEquals(getImapFolderFallback('FLAGGED'), 'Flagged');
});

test('returns Important for IMPORTANT', () => {
  assertEquals(getImapFolderFallback('IMPORTANT'), 'Important');
});

test('returns passthrough for unknown type', () => {
  assertEquals(getImapFolderFallback('CustomFolder'), 'CustomFolder');
});

test('handles lowercase input', () => {
  assertEquals(getImapFolderFallback('sent'), 'Sent');
});

// Test 5: IMAP_SPECIAL_FOLDERS constant
console.log('\n📋 IMAP_SPECIAL_FOLDERS constant tests:');

test('has all RFC 6154 folders', () => {
  const rfc6154Folders = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'JUNK', 'ARCHIVE', 'ALL', 'FLAGGED'];
  for (const folder of rfc6154Folders) {
    if (!(folder in IMAP_SPECIAL_FOLDERS)) {
      throw new Error(`Missing RFC 6154 folder: ${folder}`);
    }
  }
});

test('has Microsoft Graph folders', () => {
  const msGraphFolders = ['OUTBOX', 'CLUTTER', 'SCHEDULED'];
  for (const folder of msGraphFolders) {
    if (!(folder in IMAP_SPECIAL_FOLDERS)) {
      throw new Error(`Missing MS Graph folder: ${folder}`);
    }
  }
});

// Summary
console.log('\n' + '='.repeat(50));
const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
console.log(`\n📊 Results: ${passed}/${results.length} tests passed`);

if (failed > 0) {
  console.log('\n❌ FAILED TESTS:');
  for (const result of results.filter((r) => !r.passed)) {
    console.log(`   - ${result.name}: ${result.error}`);
  }
  console.log('\n🚫 Phase 2 test FAILED');
  process.exit(1);
} else {
  console.log('\n✅ Phase 2 test PASSED - IMAP Utils consolidation verified');
  console.log('\n📍 Files consolidated:');
  console.log('   - common/utils/imap-utils.ts (NEW canonical source)');
  console.log('   - email-fetch.service.ts (updated import)');
  console.log('   - attachment-on-demand.service.ts (updated import)');
  console.log('   - sync-back.worker.ts (updated import)');
  console.log('   - email-sync/utils/imap.utils.ts (DELETED)');
  process.exit(0);
}
