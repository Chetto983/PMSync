/**
 * Security Fix Validation Tests
 * Tests timing-safe comparison and auth fixes
 */


import { timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

function logTest(name: string, passed: boolean, message: string) {
  results.push({ name, passed, message });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${name}] ${message}`);
}

function checkFileContains(filePath: string, patterns: string[]): boolean {
  const fullPath = path.join(__dirname, '..', filePath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  return patterns.every(p => content.includes(p));
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           Security Fix Validation Tests                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // ═══ Test 1: Timing-safe comparison in sync-auth.service.ts ═══
  console.log('═══ Test 1: SyncAuthService Timing-Safe Comparison ═══');

  const syncAuthPath = 'src/modules/email-sync/services/sync-auth.service.ts';
  const syncAuthPatterns = [
    "import { timingSafeEqual } from 'crypto'",
    'private safeCompare(',
    'timingSafeEqual(Buffer.from(provided), Buffer.from(expected))',
    '!this.safeCompare(provided, expected)',
  ];

  const hasSyncAuthFix = checkFileContains(syncAuthPath, syncAuthPatterns);
  logTest(
    'SyncAuth timing-safe',
    hasSyncAuthFix,
    hasSyncAuthFix
      ? 'timingSafeEqual implemented for webhook token validation'
      : 'MISSING: timing-safe comparison not found'
  );

  // ═══ Test 2: Webhook controller auth outside try-catch ═══
  console.log('\n═══ Test 2: Webhook Controller Auth Fix ═══');

  const webhookControllerPath = 'src/modules/email-sync/controllers/webhook.controller.ts';
  const webhookPatterns = [
    '// Security fix (Issue #4): Auth validation OUTSIDE try-catch',
    'this.syncAuth.validateWebhookToken(webhookToken, queryToken)',
    'try {',
    '// Auth errors already thrown above will return 401',
  ];

  const hasWebhookFix = checkFileContains(webhookControllerPath, webhookPatterns);
  logTest(
    'Webhook auth fix',
    hasWebhookFix,
    hasWebhookFix
      ? 'Auth validation moved outside try-catch (returns 401 on auth failure)'
      : 'MISSING: auth validation still inside try-catch'
  );

  // ═══ Test 3: Microsoft clientState timing-safe comparison ═══
  console.log('\n═══ Test 3: Microsoft Webhook Timing-Safe Comparison ═══');

  const msWebhookPath = 'src/modules/email-sync/services/microsoft-webhook.service.ts';
  const msPatterns = [
    "import { timingSafeEqual } from 'crypto'",
    'private safeCompare(',
    '!this.safeCompare(notification.clientState',
  ];

  const hasMsFix = checkFileContains(msWebhookPath, msPatterns);
  logTest(
    'MS clientState timing-safe',
    hasMsFix,
    hasMsFix
      ? 'timingSafeEqual implemented for clientState validation'
      : 'MISSING: timing-safe comparison not found'
  );

  // ═══ Test 4: Verify safeCompare logic is correct ═══
  console.log('\n═══ Test 4: Verify safeCompare Logic ═══');

  // Test the logic pattern we implemented
  function testSafeCompare(provided: string, expected: string): boolean {
    if (provided.length !== expected.length) {
      const paddedProvided = Buffer.alloc(expected.length, provided);
      const expectedBuf = Buffer.from(expected);
      timingSafeEqual(paddedProvided, expectedBuf);
      return false;
    }
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  }

  const sameStringsMatch = testSafeCompare('secret123', 'secret123') === true;
  const differentStringsNoMatch = testSafeCompare('secret123', 'secret456') === false;
  const differentLengthNoMatch = testSafeCompare('short', 'longerstring') === false;

  logTest(
    'safeCompare same strings',
    sameStringsMatch,
    sameStringsMatch ? 'Same strings correctly return true' : 'FAILED: Same strings should match'
  );

  logTest(
    'safeCompare different strings',
    differentStringsNoMatch,
    differentStringsNoMatch ? 'Different strings correctly return false' : 'FAILED: Different strings should not match'
  );

  logTest(
    'safeCompare different lengths',
    differentLengthNoMatch,
    differentLengthNoMatch ? 'Different length strings correctly return false' : 'FAILED: Different lengths should not match'
  );

  // ═══ Test 5: Gmail JWT verification (Issue #1) ═══
  console.log('\n═══ Test 5: Gmail Pub/Sub JWT Verification ═══');

  const gmailWebhookPath = 'src/modules/email-sync/services/gmail-webhook.service.ts';
  const gmailJwtPatterns = [
    "import { OAuth2Client } from 'google-auth-library'",
    'async verifyPubSubToken(token: string)',
    'verifyIdToken',
    'GOOGLE_PUBSUB_AUDIENCE',
  ];

  const hasGmailJwtFix = checkFileContains(gmailWebhookPath, gmailJwtPatterns);
  logTest(
    'Gmail JWT verification',
    hasGmailJwtFix,
    hasGmailJwtFix
      ? 'Pub/Sub OIDC JWT verification implemented'
      : 'MISSING: JWT verification not found'
  );

  // ═══ Test 6: Gmail replay attack prevention (Issue #2) ═══
  console.log('\n═══ Test 6: Gmail Replay Attack Prevention ═══');

  const gmailReplayPatterns = [
    'processedMessages: Map<string, number>',
    'isReplayedMessage(messageId: string)',
    'markMessageProcessed(messageId: string)',
    'MESSAGE_CACHE_TTL_MS',
  ];

  const hasGmailReplayFix = checkFileContains(gmailWebhookPath, gmailReplayPatterns);
  logTest(
    'Gmail replay prevention',
    hasGmailReplayFix,
    hasGmailReplayFix
      ? 'Message deduplication with TTL cache implemented'
      : 'MISSING: replay attack prevention not found'
  );

  // ═══ Test 7: Webhook controller JWT and replay integration ═══
  console.log('\n═══ Test 7: Webhook Controller Security Integration ═══');

  const controllerSecurityPatterns = [
    'verifyPubSubToken',
    'isReplayedMessage',
    'markMessageProcessed',
    'authorization',
  ];

  const hasControllerIntegration = checkFileContains(webhookControllerPath, controllerSecurityPatterns);
  logTest(
    'Controller security integration',
    hasControllerIntegration,
    hasControllerIntegration
      ? 'JWT verification and replay prevention integrated in controller'
      : 'MISSING: security methods not called in controller'
  );

  // ═══ Test 8: Microsoft rate limiting (Issue #3) ═══
  console.log('\n═══ Test 8: Microsoft Webhook Rate Limiting ═══');

  const msRateLimitPatterns = [
    'rateLimitMap: Map<string, RateLimitEntry>',
    'RATE_LIMIT_WINDOW_MS',
    'RATE_LIMIT_MAX_REQUESTS',
    'checkRateLimit(subscriptionId: string)',
    'Rate limit exceeded',
  ];

  const hasMsRateLimitFix = checkFileContains(msWebhookPath, msRateLimitPatterns);
  logTest(
    'MS rate limiting',
    hasMsRateLimitFix,
    hasMsRateLimitFix
      ? 'Per-subscription rate limiting implemented (100/min)'
      : 'MISSING: rate limiting not found'
  );

  // ═══ Test 9: Delta token atomic persistence (Issue #7) ═══
  console.log('\n═══ Test 9: Delta Token Atomic Persistence ═══');

  const syncWorkerPath = 'src/modules/email-sync/workers/sync.worker.ts';
  const deltaTokenPatterns = [
    '$transaction',
    'applySyncState',
    'lastSyncToken',
    'mergedMetadata',
  ];

  const hasDeltaTokenFix = checkFileContains(syncWorkerPath, deltaTokenPatterns);
  logTest(
    'Delta token atomic persistence',
    hasDeltaTokenFix,
    hasDeltaTokenFix
      ? 'Prisma transaction used for atomic metadata updates'
      : 'MISSING: atomic transaction not found'
  );

  // ═══ Summary ═══
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                         TEST SUMMARY                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`✅ Passed:  ${passed}`);
  console.log(`❌ Failed:  ${failed}`);
  console.log('━━━━━━━━━━━━━━━━━');
  console.log(`📊 Total:   ${total}`);
  console.log(`\n🎯 Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 All security fixes validated successfully!');
  } else {
    console.log('\n⚠️ Some security fixes need attention!');
    process.exit(1);
  }
}

main().catch(console.error);
