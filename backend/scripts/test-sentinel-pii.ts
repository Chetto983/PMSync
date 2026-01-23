/**
 * Test script for Sentinel-powered PII detection.
 *
 * Verifies:
 * 1. Detection works for all PII types
 * 2. Hash-based redaction produces unique placeholders
 * 3. Resolution works correctly
 */
import { PiiDetectionService } from '../src/modules/ai/guards/pii-detection-sentinel.service';

const service = new PiiDetectionService();

console.log('=== SENTINEL PII DETECTION TEST ===\n');

// Test 1: Multiple emails (must be unique)
const testMultiEmail = 'Contact john@example.com or jane@company.org for details.';
console.log('Test 1: Multiple emails');
console.log('Input:', testMultiEmail);
const result1 = service.detect(testMultiEmail);
console.log('Redacted:', result1.redactedText);
console.log('Matches:', result1.details.map((d) => `${d.value} → ${d.redactedValue}`));
console.log('Unique placeholders:', new Set(result1.details.map((d) => d.redactedValue)).size === result1.details.length ? 'YES ✓' : 'NO ✗');
console.log();

// Test 2: Mixed PII types
const testMixed = 'Call me at 555-123-4567 or email test@domain.com. Card: 4111-1111-1111-1111.';
console.log('Test 2: Mixed PII types');
console.log('Input:', testMixed);
const result2 = service.detect(testMixed);
console.log('Redacted:', result2.redactedText);
console.log('Types detected:', result2.detectedTypes.join(', '));
console.log('Count:', result2.piiCount);
console.log();

// Test 3: Resolution test
console.log('Test 3: Resolution');
const resolved = service.resolveFromMatches(result1.redactedText, result1.details);
console.log('Resolved back:', resolved);
console.log('Match original:', resolved === testMultiEmail ? 'YES ✓' : 'NO ✗');
console.log();

// Test 4: Quick check
console.log('Test 4: Quick hasPII check');
console.log('Has PII in "Hello world":', service.containsPii('Hello world') ? 'YES' : 'NO ✓');
console.log('Has PII in "email@test.com":', service.containsPii('email@test.com') ? 'YES ✓' : 'NO');
console.log();

// Test 5: Supported types
console.log('Test 5: Supported PII types');
console.log('Types:', service.getSupportedTypes().join(', '));
console.log();

console.log('=== ALL TESTS COMPLETE ===');
