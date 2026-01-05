/**
 * Robust Validation Script for Critical Fixes
 *
 * Validates that all critical fixes are properly implemented:
 * - CRIT-1: email.service.ts throws on failure (no mock success)
 * - CRIT-2: imap.driver.ts has stream timeout
 * - CRIT-5: imap.driver.ts has pool corruption logging
 * - CRIT-6: emails.service.ts uses transactions for bulk ops
 * - CRIT-7: attachment-on-demand.service.ts has size limit
 *
 * Run with: npx ts-node scripts/validate-fixes.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface ValidationResult {
  name: string;
  file: string;
  passed: boolean;
  details: string;
}

const results: ValidationResult[] = [];

function checkFileContains(
  filePath: string,
  patterns: { pattern: RegExp | string; description: string; shouldExist: boolean }[]
): ValidationResult[] {
  const fullPath = path.resolve(__dirname, '..', filePath);

  if (!fs.existsSync(fullPath)) {
    return [{
      name: 'File Exists',
      file: filePath,
      passed: false,
      details: `File not found: ${fullPath}`
    }];
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const results: ValidationResult[] = [];

  for (const { pattern, description, shouldExist } of patterns) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'g') : pattern;
    const matches = content.match(regex);
    const found = matches !== null && matches.length > 0;

    results.push({
      name: description,
      file: filePath,
      passed: shouldExist ? found : !found,
      details: found
        ? `Found ${matches.length} match(es)`
        : 'Pattern not found'
    });
  }

  return results;
}

console.log('\n🔍 CRITICAL FIXES VALIDATION\n');
console.log('=' .repeat(60));

// CRIT-1: email.service.ts - Must throw on failure, NOT return mock success
console.log('\n📧 CRIT-1: email.service.ts - Silent failure fix');
results.push(...checkFileContains('src/modules/email/services/email.service.ts', [
  {
    pattern: /throw new Error\(`Email delivery failed/,
    description: 'Throws error on email failure',
    shouldExist: true
  },
  {
    pattern: /messageId:\s*['"]dev-mock-/,
    description: 'Mock success response REMOVED',
    shouldExist: false
  },
  {
    pattern: /CRIT-1 FIX/,
    description: 'Fix comment present',
    shouldExist: true
  }
]));

// CRIT-2: imap.driver.ts - Must have stream timeout
console.log('📎 CRIT-2: imap.driver.ts - Stream lifecycle fix');
results.push(...checkFileContains('src/modules/email-sync/drivers/imap/imap.driver.ts', [
  {
    pattern: /STREAM_TIMEOUT_MS\s*=\s*\d+/,
    description: 'Stream timeout constant defined',
    shouldExist: true
  },
  {
    pattern: /not consumed within.*forcing cleanup/i,
    description: 'Timeout callback warns about unconsumed stream',
    shouldExist: true
  },
  {
    pattern: /stream\.destroy\(/,
    description: 'Stream destroyed on timeout',
    shouldExist: true
  },
  {
    pattern: /CRIT-2 FIX/,
    description: 'Fix comment present',
    shouldExist: true
  }
]));

// CRIT-5: imap.driver.ts - Pool corruption logging
console.log('🔒 CRIT-5: imap.driver.ts - Pool semaphore fix');
results.push(...checkFileContains('src/modules/email-sync/drivers/imap/imap.driver.ts', [
  {
    pattern: /POOL_CORRUPTION/,
    description: 'Pool corruption error logging',
    shouldExist: true
  },
  {
    pattern: /pool state corrupted/,
    description: 'Descriptive error message',
    shouldExist: true
  },
  {
    pattern: /CRIT-5 FIX/,
    description: 'Fix comment present',
    shouldExist: true
  }
]));

// CRIT-6: emails.service.ts - Must use transactions for bulk ops
console.log('💾 CRIT-6: emails.service.ts - Transaction fix');
results.push(...checkFileContains('src/modules/email/services/emails.service.ts', [
  {
    pattern: /\$transaction\s*\(\s*async/,
    description: 'Uses $transaction for bulk operations',
    shouldExist: true
  },
  {
    pattern: /bulkDelete.*\$transaction|CRITICAL FIX.*transaction/i,
    description: 'bulkDelete has transaction comment/usage',
    shouldExist: true
  }
]));

// CRIT-7: attachment-on-demand.service.ts - Size limit check
console.log('📁 CRIT-7: attachment-on-demand.service.ts - Size limit fix');
results.push(...checkFileContains('src/modules/email/services/attachment-on-demand.service.ts', [
  {
    pattern: /MAX_ATTACHMENT_SIZE\s*=\s*\d+/,
    description: 'MAX_ATTACHMENT_SIZE constant defined',
    shouldExist: true
  },
  {
    pattern: /attachment\.size.*MAX_ATTACHMENT_SIZE/,
    description: 'Size check before download',
    shouldExist: true
  },
  {
    pattern: /exceeds maximum size limit/,
    description: 'Descriptive error message for oversized attachments',
    shouldExist: true
  },
  {
    pattern: /CRIT-7 FIX/,
    description: 'Fix comment present',
    shouldExist: true
  }
]));

// Memory leak fixes in drivers
console.log('🧠 Memory Leak Fixes - All drivers');
results.push(...checkFileContains('src/modules/email-sync/drivers/google/google.driver.ts', [
  {
    pattern: /MAX_ATTACHMENT_SIZE/,
    description: 'Gmail: Attachment size limit',
    shouldExist: true
  },
  {
    pattern: /withRetry/,
    description: 'Gmail: Rate limit retry handler',
    shouldExist: true
  }
]));

results.push(...checkFileContains('src/modules/email-sync/drivers/microsoft/microsoft.driver.ts', [
  {
    pattern: /MAX_ATTACHMENT_SIZE/,
    description: 'Microsoft: Attachment size limit',
    shouldExist: true
  },
  {
    pattern: /ImmutableId/,
    description: 'Microsoft: ImmutableId header',
    shouldExist: true
  },
  {
    pattern: /withRetry/,
    description: 'Microsoft: Rate limit retry handler',
    shouldExist: true
  }
]));

// Print results
console.log('\n' + '=' .repeat(60));
console.log('\n📊 VALIDATION RESULTS\n');

const passed = results.filter(r => r.passed);
const failed = results.filter(r => !r.passed);

for (const result of results) {
  const icon = result.passed ? '✅' : '❌';
  console.log(`${icon} ${result.name}`);
  console.log(`   File: ${result.file}`);
  console.log(`   ${result.details}\n`);
}

console.log('=' .repeat(60));
console.log(`\n📈 SUMMARY: ${passed.length}/${results.length} checks passed\n`);

if (failed.length > 0) {
  console.log('❌ FAILED CHECKS:');
  for (const f of failed) {
    console.log(`   - ${f.name} (${f.file})`);
  }
  console.log('');
  process.exit(1);
} else {
  console.log('✅ ALL CRITICAL FIXES VALIDATED SUCCESSFULLY!\n');
  process.exit(0);
}
