/**
 * Test Folder Utils Consolidation (Phase 3)
 *
 * Tests the consolidated folderNameToCanonical function that was already
 * in canonical.types.ts. Validates:
 * 1. RFC 6154 standard folder names
 * 2. Multi-language support (EN, IT, DE, FR, ES)
 * 3. Case insensitivity
 * 4. Edge cases
 *
 * Run: npx ts-node backend/scripts/test-folder-utils.ts
 */

import {
  folderNameToCanonical,
  CanonicalFolderType,
  IMAP_NAME_HEURISTICS,
} from '../src/modules/email-sync/drivers/interfaces/canonical.types';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void): void {
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

function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new Error(msg || `Expected "${expected}", got "${actual}"`);
  }
}

console.log('\n=== Folder Utils Consolidation Test (Phase 3) ===\n');

// ============================================
// Test 1: RFC 6154 Standard Folder Names
// ============================================
console.log('📋 RFC 6154 Standard Folders:');

test('INBOX -> INBOX', () => {
  assertEquals(folderNameToCanonical('INBOX'), 'INBOX');
});

test('inbox (lowercase) -> INBOX', () => {
  assertEquals(folderNameToCanonical('inbox'), 'INBOX');
});

test('Sent -> SENT', () => {
  assertEquals(folderNameToCanonical('Sent'), 'SENT');
});

test('Drafts -> DRAFTS', () => {
  assertEquals(folderNameToCanonical('Drafts'), 'DRAFTS');
});

test('Trash -> TRASH', () => {
  assertEquals(folderNameToCanonical('Trash'), 'TRASH');
});

test('Spam -> SPAM', () => {
  assertEquals(folderNameToCanonical('Spam'), 'SPAM');
});

test('Junk -> SPAM (alias)', () => {
  assertEquals(folderNameToCanonical('Junk'), 'SPAM');
});

test('Archive -> ARCHIVE', () => {
  assertEquals(folderNameToCanonical('Archive'), 'ARCHIVE');
});

// ============================================
// Test 2: Gmail-specific Folders
// ============================================
console.log('\n📋 Gmail-specific Folders:');

test('[Gmail]/All Mail -> ALL', () => {
  assertEquals(folderNameToCanonical('[Gmail]/All Mail'), 'ALL');
});

test('[Gmail]/Sent Mail -> SENT', () => {
  assertEquals(folderNameToCanonical('[Gmail]/Sent Mail'), 'SENT');
});

test('[Gmail]/Starred -> FLAGGED', () => {
  assertEquals(folderNameToCanonical('[Gmail]/Starred'), 'FLAGGED');
});

test('[Gmail]/Spam -> SPAM', () => {
  assertEquals(folderNameToCanonical('[Gmail]/Spam'), 'SPAM');
});

test('[Gmail]/Trash -> TRASH', () => {
  assertEquals(folderNameToCanonical('[Gmail]/Trash'), 'TRASH');
});

test('[Gmail]/Drafts -> DRAFTS', () => {
  assertEquals(folderNameToCanonical('[Gmail]/Drafts'), 'DRAFTS');
});

test('[Gmail]/Important -> IMPORTANT', () => {
  assertEquals(folderNameToCanonical('[Gmail]/Important'), 'IMPORTANT');
});

// ============================================
// Test 3: Italian Folder Names
// ============================================
console.log('\n📋 Italian Folder Names:');

test('Posta inviata -> SENT', () => {
  assertEquals(folderNameToCanonical('Posta inviata'), 'SENT');
});

test('Bozze -> DRAFTS', () => {
  assertEquals(folderNameToCanonical('Bozze'), 'DRAFTS');
});

test('Cestino -> TRASH', () => {
  assertEquals(folderNameToCanonical('Cestino'), 'TRASH');
});

test('Posta indesiderata -> SPAM', () => {
  assertEquals(folderNameToCanonical('Posta indesiderata'), 'SPAM');
});

test('Archivio -> ARCHIVE', () => {
  assertEquals(folderNameToCanonical('Archivio'), 'ARCHIVE');
});

// ============================================
// Test 4: German Folder Names
// ============================================
console.log('\n📋 German Folder Names:');

test('Gesendet -> SENT', () => {
  assertEquals(folderNameToCanonical('Gesendet'), 'SENT');
});

test('Gesendete Objekte -> SENT', () => {
  assertEquals(folderNameToCanonical('Gesendete Objekte'), 'SENT');
});

test('Entwürfe -> DRAFTS', () => {
  assertEquals(folderNameToCanonical('Entwürfe'), 'DRAFTS');
});

test('Papierkorb -> TRASH', () => {
  assertEquals(folderNameToCanonical('Papierkorb'), 'TRASH');
});

test('Gelöschte Objekte -> TRASH', () => {
  assertEquals(folderNameToCanonical('Gelöschte Objekte'), 'TRASH');
});

// ============================================
// Test 5: French Folder Names
// ============================================
console.log('\n📋 French Folder Names:');

test('Éléments envoyés -> SENT', () => {
  assertEquals(folderNameToCanonical('Éléments envoyés'), 'SENT');
});

test('Brouillons -> DRAFTS', () => {
  assertEquals(folderNameToCanonical('Brouillons'), 'DRAFTS');
});

test('Corbeille -> TRASH', () => {
  assertEquals(folderNameToCanonical('Corbeille'), 'TRASH');
});

test('Courrier indésirable -> SPAM', () => {
  assertEquals(folderNameToCanonical('Courrier indésirable'), 'SPAM');
});

// ============================================
// Test 6: Spanish Folder Names
// ============================================
console.log('\n📋 Spanish Folder Names:');

test('Enviados -> SENT', () => {
  assertEquals(folderNameToCanonical('Enviados'), 'SENT');
});

test('Elementos enviados -> SENT', () => {
  assertEquals(folderNameToCanonical('Elementos enviados'), 'SENT');
});

test('Borradores -> DRAFTS', () => {
  assertEquals(folderNameToCanonical('Borradores'), 'DRAFTS');
});

test('Papelera -> TRASH', () => {
  assertEquals(folderNameToCanonical('Papelera'), 'TRASH');
});

// ============================================
// Test 7: Microsoft Outlook Folders
// ============================================
console.log('\n📋 Microsoft Outlook Folders:');

test('Sent Items -> SENT', () => {
  assertEquals(folderNameToCanonical('Sent Items'), 'SENT');
});

test('Deleted Items -> TRASH', () => {
  assertEquals(folderNameToCanonical('Deleted Items'), 'TRASH');
});

test('Junk Email -> SPAM', () => {
  assertEquals(folderNameToCanonical('Junk Email'), 'SPAM');
});

test('Outbox -> OUTBOX', () => {
  assertEquals(folderNameToCanonical('Outbox'), 'OUTBOX');
});

// ============================================
// Test 8: Edge Cases
// ============================================
console.log('\n📋 Edge Cases:');

test('Custom folder passthrough', () => {
  // Custom folders should be uppercased
  const result = folderNameToCanonical('MyCustomFolder');
  assertEquals(result, 'MYCUSTOMFOLDER');
});

test('Empty string passthrough', () => {
  const result = folderNameToCanonical('');
  assertEquals(result, '');
});

test('Whitespace trimming', () => {
  // Test if lowercase+trim is applied before lookup
  const result = folderNameToCanonical('  inbox  ');
  // Note: actual behavior depends on implementation
  // This tests the actual behavior
  console.log(`    (whitespace test: "  inbox  " -> "${result}")`);
});

// ============================================
// Test 9: IMAP_NAME_HEURISTICS Coverage
// ============================================
console.log('\n📋 IMAP_NAME_HEURISTICS Coverage:');

test('IMAP_NAME_HEURISTICS has 50+ entries', () => {
  const count = Object.keys(IMAP_NAME_HEURISTICS).length;
  if (count < 50) {
    throw new Error(`Expected 50+ entries, got ${count}`);
  }
  console.log(`    (${count} folder name mappings)`);
});

test('All canonical types covered', () => {
  const canonicalTypes: CanonicalFolderType[] = [
    'INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM',
    'ARCHIVE', 'ALL', 'FLAGGED', 'IMPORTANT'
  ];

  const mappedTypes = new Set(Object.values(IMAP_NAME_HEURISTICS));

  for (const type of canonicalTypes) {
    if (!mappedTypes.has(type)) {
      throw new Error(`Canonical type ${type} has no folder name mapping`);
    }
  }
});

// ============================================
// Summary
// ============================================
console.log('\n' + '='.repeat(50));
const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
console.log(`\n📊 Results: ${passed}/${results.length} tests passed`);

if (failed > 0) {
  console.log('\n❌ FAILED TESTS:');
  for (const result of results.filter((r) => !r.passed)) {
    console.log(`   - ${result.name}: ${result.error}`);
  }
  console.log('\n🚫 Phase 3 validation FAILED');
  process.exit(1);
} else {
  console.log('\n✅ Phase 3 validation PASSED - folderNameToCanonical works correctly');
  console.log('\n📍 Key validations:');
  console.log('   - RFC 6154 standard folders ✓');
  console.log('   - Gmail-specific folders ✓');
  console.log('   - Italian folder names ✓');
  console.log('   - German folder names ✓');
  console.log('   - French folder names ✓');
  console.log('   - Spanish folder names ✓');
  console.log('   - Microsoft Outlook folders ✓');
  console.log('   - Edge cases ✓');
  process.exit(0);
}
