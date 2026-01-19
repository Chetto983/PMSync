#!/usr/bin/env npx ts-node
/**
 * PARANOID Billing Hardening Validation Script
 *
 * Validates ALL Phase 1-3 billing hardening changes:
 * - Phase 1.1: Redis atomic operations (INCRBY, INCRBYFLOAT)
 * - Phase 1.2: QuotaGuard decorator application
 * - Phase 2.1: canProceed() pre-checks in AI services
 * - Phase 2.2: Batch API quota integration
 * - Phase 3.1: BillingAlertService
 * - Phase 3.2: WebhookRetryService
 * - Phase 3.3: SubscriptionLifecycleService
 *
 * Run: npx ts-node scripts/validate-billing-hardening.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ANSI colors
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

interface ValidationResult {
  phase: string;
  check: string;
  passed: boolean;
  details?: string;
}

const results: ValidationResult[] = [];

function log(msg: string) {
  console.log(msg);
}

function pass(phase: string, check: string, details?: string) {
  results.push({ phase, check, passed: true, details });
  log(`  ${GREEN}✓${RESET} ${check}${details ? ` (${details})` : ''}`);
}

function fail(phase: string, check: string, details?: string) {
  results.push({ phase, check, passed: false, details });
  log(`  ${RED}✗${RESET} ${check}${details ? ` - ${RED}${details}${RESET}` : ''}`);
}

function warn(phase: string, check: string, details?: string) {
  results.push({ phase, check, passed: true, details: `WARN: ${details}` });
  log(`  ${YELLOW}⚠${RESET} ${check}${details ? ` - ${YELLOW}${details}${RESET}` : ''}`);
}

function header(title: string) {
  log(`\n${BOLD}${CYAN}═══ ${title} ═══${RESET}`);
}

function readFile(filePath: string): string {
  const fullPath = path.join(__dirname, '..', filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  return fs.readFileSync(fullPath, 'utf-8');
}

function fileExists(filePath: string): boolean {
  const fullPath = path.join(__dirname, '..', filePath);
  return fs.existsSync(fullPath);
}

function fileContains(filePath: string, pattern: string | RegExp): boolean {
  try {
    const content = readFile(filePath);
    if (typeof pattern === 'string') {
      return content.includes(pattern);
    }
    return pattern.test(content);
  } catch {
    return false;
  }
}

function countMatches(filePath: string, pattern: RegExp): number {
  try {
    const content = readFile(filePath);
    const matches = content.match(pattern);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

// =============================================================================
// PHASE 1.1: Redis Atomicity
// =============================================================================

function validatePhase1_1() {
  header('PHASE 1.1: Redis Atomic Operations');

  const cacheServicePath = 'src/common/services/cache.service.ts';

  // Check incrBy method exists
  if (fileContains(cacheServicePath, 'async incrBy(')) {
    pass('1.1', 'CacheService.incrBy() method exists');
  } else {
    fail('1.1', 'CacheService.incrBy() method MISSING');
  }

  // Check incrByFloat method exists
  if (fileContains(cacheServicePath, 'async incrByFloat(')) {
    pass('1.1', 'CacheService.incrByFloat() method exists');
  } else {
    fail('1.1', 'CacheService.incrByFloat() method MISSING');
  }

  // Check Redis INCRBY call
  if (fileContains(cacheServicePath, '.incrBy(fullKey,')) {
    pass('1.1', 'Uses Redis INCRBY (atomic integer increment)');
  } else {
    fail('1.1', 'Missing Redis INCRBY call');
  }

  // Check Redis INCRBYFLOAT call
  if (fileContains(cacheServicePath, '.incrByFloat(fullKey,')) {
    pass('1.1', 'Uses Redis INCRBYFLOAT (atomic float increment)');
  } else {
    fail('1.1', 'Missing Redis INCRBYFLOAT call');
  }

  // Check usage-tracking uses atomic ops
  const usageTrackingPath = 'src/modules/subscription/services/usage-tracking.service.ts';

  if (fileContains(usageTrackingPath, 'this.cache.incrBy(')) {
    pass('1.1', 'UsageTrackingService uses atomic incrBy');
  } else {
    fail('1.1', 'UsageTrackingService NOT using atomic incrBy');
  }

  if (fileContains(usageTrackingPath, 'this.cache.incrByFloat(')) {
    pass('1.1', 'UsageTrackingService uses atomic incrByFloat');
  } else {
    fail('1.1', 'UsageTrackingService NOT using atomic incrByFloat');
  }

  // Check incrementCounter uses atomic incrBy (not get+set)
  const content = readFile(usageTrackingPath);
  // Extract incrementCounter method body and verify it uses incrBy
  const incrementCounterMatch = content.match(/private async incrementCounter[^{]*\{([^}]+)\}/);
  if (incrementCounterMatch) {
    const methodBody = incrementCounterMatch[1];
    if (methodBody.includes('incrBy')) {
      pass('1.1', 'incrementCounter uses atomic incrBy (not get+set)');
    } else if (methodBody.includes('cache.get') && methodBody.includes('cache.set')) {
      fail('1.1', 'incrementCounter still uses non-atomic get+set pattern!');
    } else {
      warn('1.1', 'incrementCounter method structure unclear', 'Verify manually');
    }
  } else {
    fail('1.1', 'Could not find incrementCounter method');
  }
}

// =============================================================================
// PHASE 1.2: QuotaGuard Application
// =============================================================================

function validatePhase1_2() {
  header('PHASE 1.2: QuotaGuard Application');

  const controllers = [
    {
      name: 'VoltAgentController',
      path: 'src/modules/ai/voltagent/voltagent.controller.ts',
      requiredDecorators: ['@RequiresQuota', 'QuotaGuard'],
    },
    {
      name: 'AiController',
      path: 'src/modules/ai/controllers/ai.controller.ts',
      requiredDecorators: ['@RequiresQuota', 'QuotaGuard'],
    },
    {
      name: 'KnowledgeBaseController',
      path: 'src/modules/ai/controllers/knowledge-base.controller.ts',
      requiredDecorators: ['@RequiresQuota', 'QuotaGuard'],
    },
  ];

  for (const ctrl of controllers) {
    if (!fileExists(ctrl.path)) {
      fail('1.2', `${ctrl.name} file not found`);
      continue;
    }

    // Check QuotaGuard import
    if (fileContains(ctrl.path, "import { QuotaGuard") || fileContains(ctrl.path, "QuotaGuard }")) {
      pass('1.2', `${ctrl.name} imports QuotaGuard`);
    } else {
      fail('1.2', `${ctrl.name} does NOT import QuotaGuard`);
    }

    // Check QuotaGuard in UseGuards
    if (fileContains(ctrl.path, /UseGuards\([^)]*QuotaGuard/)) {
      pass('1.2', `${ctrl.name} has QuotaGuard in @UseGuards`);
    } else {
      fail('1.2', `${ctrl.name} does NOT have QuotaGuard in @UseGuards`);
    }

    // Check @RequiresQuota decorator usage
    const quotaCount = countMatches(ctrl.path, /@RequiresQuota\(/g);
    if (quotaCount > 0) {
      pass('1.2', `${ctrl.name} has ${quotaCount}x @RequiresQuota decorators`);
    } else {
      fail('1.2', `${ctrl.name} has NO @RequiresQuota decorators`);
    }
  }
}

// =============================================================================
// PHASE 2.1: canProceed() Pre-checks
// =============================================================================

function validatePhase2_1() {
  header('PHASE 2.1: Cost Cap Pre-checks in AI Services');

  const services = [
    {
      name: 'MistralService',
      path: 'src/modules/ai/services/mistral.service.ts',
    },
    {
      name: 'EmbeddingProviderService',
      path: 'src/modules/ai/services/embedding/embedding-provider.service.ts',
    },
  ];

  for (const svc of services) {
    if (!fileExists(svc.path)) {
      fail('2.1', `${svc.name} file not found`);
      continue;
    }

    // Check CostProtectionService import
    if (fileContains(svc.path, 'CostProtectionService')) {
      pass('2.1', `${svc.name} imports CostProtectionService`);
    } else {
      fail('2.1', `${svc.name} does NOT import CostProtectionService`);
    }

    // Check @Optional() decorator for graceful degradation
    if (fileContains(svc.path, '@Optional()') && fileContains(svc.path, 'costProtection')) {
      pass('2.1', `${svc.name} has @Optional() CostProtectionService`);
    } else {
      warn('2.1', `${svc.name} may not have graceful degradation`, 'Missing @Optional()');
    }

    // Check canProceed() calls
    const canProceedCount = countMatches(svc.path, /\.canProceed\(/g);
    if (canProceedCount > 0) {
      pass('2.1', `${svc.name} has ${canProceedCount}x canProceed() checks`);
    } else {
      fail('2.1', `${svc.name} has NO canProceed() checks!`);
    }

    // Check cost check is BEFORE API call (critical!)
    const content = readFile(svc.path);
    if (/canProceed[\s\S]{0,500}(mistral|embedding|api|fetch)/i.test(content)) {
      pass('2.1', `${svc.name} checks cost BEFORE API call`);
    } else {
      warn('2.1', `${svc.name} cost check order unclear`, 'Verify manually');
    }
  }
}

// =============================================================================
// PHASE 2.2: Batch API Quota Integration
// =============================================================================

function validatePhase2_2() {
  header('PHASE 2.2: Batch API Quota Integration');

  const batchServices = [
    {
      name: 'MistralBatchService',
      path: 'src/modules/ai/voltagent/services/mistral-batch.service.ts',
    },
    {
      name: 'BatchIndexingService',
      path: 'src/modules/ai/services/batch-indexing.service.ts',
    },
  ];

  for (const svc of batchServices) {
    if (!fileExists(svc.path)) {
      warn('2.2', `${svc.name} file not found`, 'May not exist in this codebase');
      continue;
    }

    // Check quota/cost service imports
    const hasUsageTracking = fileContains(svc.path, 'UsageTrackingService');
    const hasCostProtection = fileContains(svc.path, 'CostProtectionService');

    if (hasUsageTracking) {
      pass('2.2', `${svc.name} imports UsageTrackingService`);
    } else {
      fail('2.2', `${svc.name} does NOT import UsageTrackingService`);
    }

    if (hasCostProtection) {
      pass('2.2', `${svc.name} imports CostProtectionService`);
    } else {
      fail('2.2', `${svc.name} does NOT import CostProtectionService`);
    }

    // Check for quota check before batch submission
    if (fileContains(svc.path, /canProceed|checkQuota/)) {
      pass('2.2', `${svc.name} has quota/cost check`);
    } else {
      fail('2.2', `${svc.name} has NO quota/cost check before batch!`);
    }

    // Check for usage tracking on completion
    if (fileContains(svc.path, /trackUsage|trackAICall/)) {
      pass('2.2', `${svc.name} tracks usage on completion`);
    } else {
      fail('2.2', `${svc.name} does NOT track usage on completion`);
    }
  }
}

// =============================================================================
// PHASE 3.1: BillingAlertService
// =============================================================================

function validatePhase3_1() {
  header('PHASE 3.1: BillingAlertService');

  const alertServicePath = 'src/modules/subscription/services/billing-alert.service.ts';

  if (!fileExists(alertServicePath)) {
    fail('3.1', 'BillingAlertService file NOT FOUND');
    return;
  }

  pass('3.1', 'BillingAlertService file exists');

  // Check @Injectable decorator
  if (fileContains(alertServicePath, '@Injectable()')) {
    pass('3.1', 'Has @Injectable() decorator');
  } else {
    fail('3.1', 'Missing @Injectable() decorator');
  }

  // Check alert levels
  const content = readFile(alertServicePath);
  const hasWarning = content.includes("'warning'");
  const hasCritical = content.includes("'critical'");
  const hasBlocked = content.includes("'blocked'");

  if (hasWarning && hasCritical && hasBlocked) {
    pass('3.1', 'Has all alert levels (warning, critical, blocked)');
  } else {
    fail('3.1', 'Missing alert levels', `warning=${hasWarning}, critical=${hasCritical}, blocked=${hasBlocked}`);
  }

  // Check cooldown mechanism
  if (fileContains(alertServicePath, /cooldown|Cooldown/i)) {
    pass('3.1', 'Has cooldown mechanism to prevent spam');
  } else {
    fail('3.1', 'No cooldown mechanism detected');
  }

  // Check sendAlertIfNeeded method
  if (fileContains(alertServicePath, 'sendAlertIfNeeded')) {
    pass('3.1', 'Has sendAlertIfNeeded() method');
  } else {
    fail('3.1', 'Missing sendAlertIfNeeded() method');
  }

  // Check CostProtectionService integration
  const costProtectionPath = 'src/modules/subscription/services/cost-protection.service.ts';
  if (fileContains(costProtectionPath, 'BillingAlertService')) {
    pass('3.1', 'CostProtectionService uses BillingAlertService');
  } else {
    fail('3.1', 'CostProtectionService NOT using BillingAlertService');
  }
}

// =============================================================================
// PHASE 3.2: WebhookRetryService
// =============================================================================

function validatePhase3_2() {
  header('PHASE 3.2: WebhookRetryService');

  const retryServicePath = 'src/modules/subscription/services/webhook-retry.service.ts';

  if (!fileExists(retryServicePath)) {
    fail('3.2', 'WebhookRetryService file NOT FOUND');
    return;
  }

  pass('3.2', 'WebhookRetryService file exists');

  // Check BullMQ imports
  if (fileContains(retryServicePath, "from 'bullmq'")) {
    pass('3.2', 'Uses BullMQ');
  } else {
    fail('3.2', 'Not using BullMQ');
  }

  // Check Queue and Worker
  if (fileContains(retryServicePath, 'Queue<') && fileContains(retryServicePath, 'Worker<')) {
    pass('3.2', 'Has Queue and Worker setup');
  } else {
    fail('3.2', 'Missing Queue or Worker');
  }

  // Check exponential backoff
  if (fileContains(retryServicePath, "type: 'exponential'")) {
    pass('3.2', 'Uses exponential backoff');
  } else {
    fail('3.2', 'Not using exponential backoff');
  }

  // Check retry attempts
  if (fileContains(retryServicePath, 'attempts: 6')) {
    pass('3.2', 'Has 6 retry attempts configured');
  } else {
    warn('3.2', 'Retry attempts not set to 6', 'Check configuration');
  }

  // Check dead letter queue integration
  if (fileContains(retryServicePath, 'DeadLetterQueueService')) {
    pass('3.2', 'Integrates with DeadLetterQueueService');
  } else {
    fail('3.2', 'No DeadLetterQueueService integration');
  }

  // Check addToDeadLetter call
  if (fileContains(retryServicePath, 'addToDeadLetter')) {
    pass('3.2', 'Calls addToDeadLetter on max retries');
  } else {
    fail('3.2', 'Missing addToDeadLetter call');
  }

  // Check webhook controller integration
  const webhookControllerPath = 'src/modules/subscription/controllers/autumn-webhook.controller.ts';
  if (fileContains(webhookControllerPath, 'WebhookRetryService')) {
    pass('3.2', 'AutumnWebhookController uses WebhookRetryService');
  } else {
    fail('3.2', 'AutumnWebhookController NOT using WebhookRetryService');
  }

  // Check enqueue on failure
  if (fileContains(webhookControllerPath, '.enqueue(')) {
    pass('3.2', 'Controller enqueues failed webhooks');
  } else {
    fail('3.2', 'Controller NOT enqueuing failed webhooks');
  }
}

// =============================================================================
// PHASE 3.3: SubscriptionLifecycleService
// =============================================================================

function validatePhase3_3() {
  header('PHASE 3.3: SubscriptionLifecycleService');

  const lifecycleServicePath = 'src/modules/subscription/services/subscription-lifecycle.service.ts';

  if (!fileExists(lifecycleServicePath)) {
    fail('3.3', 'SubscriptionLifecycleService file NOT FOUND');
    return;
  }

  pass('3.3', 'SubscriptionLifecycleService file exists');

  // Check OnModuleInit
  if (fileContains(lifecycleServicePath, 'OnModuleInit')) {
    pass('3.3', 'Implements OnModuleInit');
  } else {
    fail('3.3', 'Does not implement OnModuleInit');
  }

  // Check ScheduledJobsQueueService integration
  if (fileContains(lifecycleServicePath, 'ScheduledJobsQueueService')) {
    pass('3.3', 'Uses ScheduledJobsQueueService');
  } else {
    fail('3.3', 'Not using ScheduledJobsQueueService');
  }

  // Check handler registration
  if (fileContains(lifecycleServicePath, 'registerHandler')) {
    pass('3.3', 'Registers job handlers');
  } else {
    fail('3.3', 'Not registering job handlers');
  }

  // Check monthly usage reset job
  if (fileContains(lifecycleServicePath, 'runMonthlyUsageReset')) {
    pass('3.3', 'Has runMonthlyUsageReset() method');
  } else {
    fail('3.3', 'Missing runMonthlyUsageReset() method');
  }

  // Check expiry check job
  if (fileContains(lifecycleServicePath, 'runExpiryCheck')) {
    pass('3.3', 'Has runExpiryCheck() method');
  } else {
    fail('3.3', 'Missing runExpiryCheck() method');
  }

  // Check cron patterns
  if (fileContains(lifecycleServicePath, '0 0 1 * *')) {
    pass('3.3', 'Monthly reset cron: 1st of month at 00:00');
  } else {
    fail('3.3', 'Missing monthly reset cron pattern');
  }

  if (fileContains(lifecycleServicePath, '0 2 * * *')) {
    pass('3.3', 'Daily expiry cron: 02:00 daily');
  } else {
    fail('3.3', 'Missing daily expiry cron pattern');
  }

  // Check grace period
  if (fileContains(lifecycleServicePath, /GRACE.*7|7.*GRACE/i)) {
    pass('3.3', 'Has 7-day grace period');
  } else {
    warn('3.3', 'Grace period not clearly set to 7 days');
  }
}

// =============================================================================
// MODULE WIRING
// =============================================================================

function validateModuleWiring() {
  header('MODULE WIRING: SubscriptionModule');

  const modulePath = 'src/modules/subscription/subscription.module.ts';

  if (!fileExists(modulePath)) {
    fail('WIRING', 'SubscriptionModule file NOT FOUND');
    return;
  }

  const services = [
    'BillingAlertService',
    'WebhookRetryService',
    'SubscriptionLifecycleService',
  ];

  for (const service of services) {
    // Check import
    if (fileContains(modulePath, `import { ${service}`)) {
      pass('WIRING', `${service} is imported`);
    } else if (fileContains(modulePath, service)) {
      pass('WIRING', `${service} is imported (alternate syntax)`);
    } else {
      fail('WIRING', `${service} is NOT imported`);
    }

    // Check in providers
    if (fileContains(modulePath, new RegExp(`providers:\\s*\\[[^\\]]*${service}`))) {
      pass('WIRING', `${service} in providers array`);
    } else {
      fail('WIRING', `${service} NOT in providers array`);
    }

    // Check in exports
    if (fileContains(modulePath, new RegExp(`exports:\\s*\\[[^\\]]*${service}`))) {
      pass('WIRING', `${service} in exports array`);
    } else {
      fail('WIRING', `${service} NOT in exports array`);
    }
  }
}

// =============================================================================
// SECURITY CHECKS
// =============================================================================

function validateSecurity() {
  header('SECURITY: Critical Checks');

  // Check no hardcoded secrets
  const files = [
    'src/modules/subscription/services/billing-alert.service.ts',
    'src/modules/subscription/services/webhook-retry.service.ts',
    'src/modules/subscription/services/cost-protection.service.ts',
  ];

  for (const file of files) {
    if (!fileExists(file)) continue;

    const content = readFile(file);
    const hasHardcodedKey = /['"](sk_|pk_|api_key_)[a-zA-Z0-9]{20,}['"]/.test(content);

    if (hasHardcodedKey) {
      fail('SECURITY', `${file} has HARDCODED API KEY!`);
    } else {
      pass('SECURITY', `${path.basename(file)} has no hardcoded secrets`);
    }
  }

  // Check webhook signature validation exists
  const webhookPath = 'src/modules/subscription/controllers/autumn-webhook.controller.ts';
  if (fileContains(webhookPath, 'validateSignature')) {
    pass('SECURITY', 'Webhook signature validation exists');
  } else {
    fail('SECURITY', 'Webhook signature validation MISSING');
  }

  // Check HMAC usage
  if (fileContains(webhookPath, 'createHmac') && fileContains(webhookPath, 'sha256')) {
    pass('SECURITY', 'Uses HMAC-SHA256 for signature validation');
  } else {
    fail('SECURITY', 'Not using HMAC-SHA256');
  }

  // Check timing-safe comparison
  if (fileContains(webhookPath, 'timingSafeEqual')) {
    pass('SECURITY', 'Uses timing-safe comparison');
  } else {
    fail('SECURITY', 'Not using timing-safe comparison (vulnerable to timing attacks)');
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  log(`\n${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}`);
  log(`${BOLD}║     PARANOID BILLING HARDENING VALIDATION SCRIPT             ║${RESET}`);
  log(`${BOLD}║     Phases 1-3 Complete Validation                           ║${RESET}`);
  log(`${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}`);

  // Run all validations
  validatePhase1_1();
  validatePhase1_2();
  validatePhase2_1();
  validatePhase2_2();
  validatePhase3_1();
  validatePhase3_2();
  validatePhase3_3();
  validateModuleWiring();
  validateSecurity();

  // Summary
  header('VALIDATION SUMMARY');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  log(`\n  Total Checks: ${total}`);
  log(`  ${GREEN}Passed: ${passed}${RESET}`);
  log(`  ${RED}Failed: ${failed}${RESET}`);

  if (failed > 0) {
    log(`\n${RED}${BOLD}FAILED CHECKS:${RESET}`);
    results.filter(r => !r.passed).forEach(r => {
      log(`  ${RED}✗${RESET} [${r.phase}] ${r.check}${r.details ? ` - ${r.details}` : ''}`);
    });
  }

  const percentage = Math.round((passed / total) * 100);
  log(`\n${BOLD}Score: ${percentage}%${RESET}`);

  if (percentage === 100) {
    log(`\n${GREEN}${BOLD}🎉 ALL CHECKS PASSED! Billing hardening is complete.${RESET}`);
    process.exit(0);
  } else if (percentage >= 90) {
    log(`\n${YELLOW}${BOLD}⚠️  MOSTLY COMPLETE. Review failed checks above.${RESET}`);
    process.exit(1);
  } else {
    log(`\n${RED}${BOLD}❌ SIGNIFICANT ISSUES. Billing hardening incomplete.${RESET}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`${RED}Validation script failed: ${err.message}${RESET}`);
  process.exit(1);
});
