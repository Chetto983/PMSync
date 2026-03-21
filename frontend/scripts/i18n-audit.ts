/**
 * i18n Key Parity Audit Script
 *
 * Compares en.ts and it.ts translation key trees to find missing keys.
 * Run: npx tsx frontend/scripts/i18n-audit.ts
 */

import { en } from '../locales/en';
import { it } from '../locales/it';

function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...collectKeys(value as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

const enKeys = new Set(collectKeys(en as unknown as Record<string, unknown>));
const itKeys = new Set(collectKeys(it as unknown as Record<string, unknown>));

const missingInIt = [...enKeys].filter(k => !itKeys.has(k)).sort();
const missingInEn = [...itKeys].filter(k => !enKeys.has(k)).sort();

if (missingInIt.length > 0) {
  console.log(`\nMissing in it.ts (${missingInIt.length} keys):`);
  missingInIt.forEach(k => console.log(`  - ${k}`));
}
if (missingInEn.length > 0) {
  console.log(`\nMissing in en.ts (${missingInEn.length} keys):`);
  missingInEn.forEach(k => console.log(`  - ${k}`));
}
if (missingInIt.length === 0 && missingInEn.length === 0) {
  console.log('i18n key parity: OK (0 missing keys)');
}

const total = missingInIt.length + missingInEn.length;
console.log(`\nTotal differences: ${total}`);
process.exit(total > 0 ? 1 : 0);
