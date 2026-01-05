/**
 * Test Error Utils Consolidation (Phase 4)
 *
 * Tests the consolidated error classification functions:
 * - isRateLimitError
 * - isNotFoundError
 * - isServerError
 * - isClientError
 *
 * Run: npx ts-node backend/scripts/test-error-utils.ts
 */

import {
  isRateLimitError,
  isNotFoundError,
  isServerError,
  isClientError,
  getErrorMessage,
  getErrorDetails,
} from '../src/common/utils/error.utils';

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

function assertTrue(value: boolean, msg?: string): void {
  if (!value) {
    throw new Error(msg || `Expected true, got false`);
  }
}

function assertFalse(value: boolean, msg?: string): void {
  if (value) {
    throw new Error(msg || `Expected false, got true`);
  }
}

function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new Error(msg || `Expected "${expected}", got "${actual}"`);
  }
}

console.log('\n=== Error Utils Consolidation Test (Phase 4) ===\n');

// ============================================
// Test 1: isRateLimitError
// ============================================
console.log('📋 isRateLimitError tests:');

test('detects status 429 on error.status', () => {
  const error = { status: 429, message: 'Too many requests' };
  assertTrue(isRateLimitError(error));
});

test('detects status 429 on error.statusCode', () => {
  const error = { statusCode: 429 };
  assertTrue(isRateLimitError(error));
});

test('detects status 429 on error.response.status', () => {
  const error = { response: { status: 429 } };
  assertTrue(isRateLimitError(error));
});

test('detects status 429 on error.response.statusCode', () => {
  const error = { response: { statusCode: 429 } };
  assertTrue(isRateLimitError(error));
});

test('detects "rate limit" in error message', () => {
  const error = new Error('Rate limit exceeded');
  assertTrue(isRateLimitError(error));
});

test('detects "429" in error message', () => {
  const error = new Error('Error 429: Too many requests');
  assertTrue(isRateLimitError(error));
});

test('detects "too many requests" in error message', () => {
  const error = new Error('too many requests, please slow down');
  assertTrue(isRateLimitError(error));
});

test('detects rate_limit_exceeded code', () => {
  const error = { code: 'rate_limit_exceeded' };
  assertTrue(isRateLimitError(error));
});

test('returns false for null', () => {
  assertFalse(isRateLimitError(null));
});

test('returns false for status 200', () => {
  assertFalse(isRateLimitError({ status: 200 }));
});

test('returns false for unrelated error', () => {
  assertFalse(isRateLimitError(new Error('Connection refused')));
});

// ============================================
// Test 2: isNotFoundError
// ============================================
console.log('\n📋 isNotFoundError tests:');

test('detects status 404', () => {
  assertTrue(isNotFoundError({ status: 404 }));
});

test('detects status 410 (Gone)', () => {
  assertTrue(isNotFoundError({ status: 410 }));
});

test('detects 404 on response.status', () => {
  assertTrue(isNotFoundError({ response: { status: 404 } }));
});

test('detects "not found" in message', () => {
  assertTrue(isNotFoundError(new Error('Resource not found')));
});

test('detects "404" in message', () => {
  assertTrue(isNotFoundError(new Error('Error 404')));
});

test('detects "does not exist" in message', () => {
  assertTrue(isNotFoundError(new Error('User does not exist')));
});

test('detects "deleted" in message', () => {
  assertTrue(isNotFoundError(new Error('Message was deleted')));
});

test('returns false for null', () => {
  assertFalse(isNotFoundError(null));
});

test('returns false for status 500', () => {
  assertFalse(isNotFoundError({ status: 500 }));
});

// ============================================
// Test 3: isServerError
// ============================================
console.log('\n📋 isServerError tests:');

test('detects status 500', () => {
  assertTrue(isServerError({ status: 500 }));
});

test('detects status 502', () => {
  assertTrue(isServerError({ status: 502 }));
});

test('detects status 503', () => {
  assertTrue(isServerError({ status: 503 }));
});

test('detects status 504', () => {
  assertTrue(isServerError({ status: 504 }));
});

test('detects status 599', () => {
  assertTrue(isServerError({ status: 599 }));
});

test('returns false for status 400', () => {
  assertFalse(isServerError({ status: 400 }));
});

test('returns false for status 404', () => {
  assertFalse(isServerError({ status: 404 }));
});

test('returns false for status 429', () => {
  assertFalse(isServerError({ status: 429 }));
});

// ============================================
// Test 4: isClientError
// ============================================
console.log('\n📋 isClientError tests:');

test('detects status 400', () => {
  assertTrue(isClientError({ status: 400 }));
});

test('detects status 401', () => {
  assertTrue(isClientError({ status: 401 }));
});

test('detects status 403', () => {
  assertTrue(isClientError({ status: 403 }));
});

test('detects status 404', () => {
  assertTrue(isClientError({ status: 404 }));
});

test('detects status 429', () => {
  assertTrue(isClientError({ status: 429 }));
});

test('returns false for status 500', () => {
  assertFalse(isClientError({ status: 500 }));
});

test('returns false for status 200', () => {
  assertFalse(isClientError({ status: 200 }));
});

// ============================================
// Test 5: getErrorMessage
// ============================================
console.log('\n📋 getErrorMessage tests:');

test('extracts message from Error', () => {
  assertEquals(getErrorMessage(new Error('Test error')), 'Test error');
});

test('returns string as-is', () => {
  assertEquals(getErrorMessage('String error'), 'String error');
});

test('converts number to string', () => {
  assertEquals(getErrorMessage(123), '123');
});

test('converts null to string', () => {
  assertEquals(getErrorMessage(null), 'null');
});

// ============================================
// Test 6: getErrorDetails
// ============================================
console.log('\n📋 getErrorDetails tests:');

test('extracts message and stack from Error', () => {
  const error = new Error('Test');
  const details = getErrorDetails(error);
  assertEquals(details.message, 'Test');
  assertTrue(details.stack !== undefined, 'stack should be defined');
});

test('extracts message from non-Error', () => {
  const details = getErrorDetails('Simple string');
  assertEquals(details.message, 'Simple string');
  assertEquals(details.stack, undefined);
});

// ============================================
// Test 7: Real-world Axios/Fetch error patterns
// ============================================
console.log('\n📋 Real-world error patterns:');

test('Axios 429 error pattern', () => {
  const axiosError = {
    message: 'Request failed with status code 429',
    response: {
      status: 429,
      data: { error: 'Rate limit exceeded' },
    },
  };
  assertTrue(isRateLimitError(axiosError));
});

test('Axios 404 error pattern', () => {
  const axiosError = {
    message: 'Request failed with status code 404',
    response: {
      status: 404,
      data: { error: 'Not found' },
    },
  };
  assertTrue(isNotFoundError(axiosError));
});

test('Axios 500 error pattern', () => {
  const axiosError = {
    message: 'Request failed with status code 500',
    response: {
      status: 500,
      data: { error: 'Internal server error' },
    },
  };
  assertTrue(isServerError(axiosError));
});

test('Google API rate limit pattern', () => {
  const googleError = {
    code: 429,
    message: 'User-rate limit exceeded',
    errors: [{ reason: 'userRateLimitExceeded' }],
  };
  // Note: code is not status, but message contains rate limit
  assertTrue(isRateLimitError(googleError));
});

test('Microsoft Graph 429 pattern', () => {
  const msGraphError = {
    statusCode: 429,
    code: 'TooManyRequests',
    message: 'Too many requests',
  };
  assertTrue(isRateLimitError(msGraphError));
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
  console.log('\n🚫 Phase 4 validation FAILED');
  process.exit(1);
} else {
  console.log('\n✅ Phase 4 validation PASSED - Error utils work correctly');
  console.log('\n📍 Key validations:');
  console.log('   - isRateLimitError detects 429 + message patterns ✓');
  console.log('   - isNotFoundError detects 404/410 + message patterns ✓');
  console.log('   - isServerError detects 5xx status codes ✓');
  console.log('   - isClientError detects 4xx status codes ✓');
  console.log('   - Real-world Axios/Google/MS Graph patterns ✓');
  process.exit(0);
}
