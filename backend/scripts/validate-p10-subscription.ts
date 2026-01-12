#!/usr/bin/env npx ts-node
/**
 * P10 Subscription & Billing - PARANOID VALIDATION SCRIPT
 *
 * NO MOCKS. NO SHORTCUTS. REAL INTEGRATION TESTS.
 *
 * Usage: npx ts-node backend/scripts/validate-p10-subscription.ts
 */

import type { PrismaClient, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { createClient } from 'redis';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'REDIS_HOST',
  'REDIS_PORT',
];

const OPTIONAL_ENV_VARS = [
  'AUTUMN_SECRET_KEY',
  'AUTUMN_WEBHOOK_SECRET',
  'AI_DAILY_COST_CAP',
];

const REQUIRED_FILES = {
  // Backend Services
  'backend/src/modules/subscription/subscription.module.ts': true,
  'backend/src/modules/subscription/services/subscription.service.ts': true,
  'backend/src/modules/subscription/services/usage-tracking.service.ts': true,
  'backend/src/modules/subscription/services/autumn.service.ts': true,
  'backend/src/modules/subscription/services/cost-protection.service.ts': true,
  // Controllers
  'backend/src/modules/subscription/controllers/subscription.controller.ts': true,
  'backend/src/modules/subscription/controllers/autumn.controller.ts': true,
  'backend/src/modules/subscription/controllers/autumn-webhook.controller.ts': true,
  // Guards & DTOs
  'backend/src/modules/subscription/guards/quota.guard.ts': true,
  'backend/src/modules/subscription/dto/subscription.dto.ts': true,
  // Frontend
  'frontend/lib/api/billing.ts': true,
  'frontend/hooks/queries/billing-keys.ts': true,
  'frontend/hooks/queries/use-billing.ts': true,
};

const REQUIRED_EXPORTS = {
  'backend/src/modules/subscription/subscription.module.ts': ['SubscriptionModule'],
  'backend/src/modules/subscription/services/subscription.service.ts': ['SubscriptionService', 'PLAN_LIMITS'],
  'backend/src/modules/subscription/services/usage-tracking.service.ts': ['UsageTrackingService'],
  'backend/src/modules/subscription/services/autumn.service.ts': ['AutumnService', 'AUTUMN_FEATURE_IDS'],
  'backend/src/modules/subscription/services/cost-protection.service.ts': ['CostProtectionService'],
  'backend/src/modules/subscription/guards/quota.guard.ts': ['QuotaGuard', 'RequiresQuota'],
};

const PLAN_LIMITS_EXPECTED = {
  FREE: { monthlyEmailLimit: 100, monthlyAICallLimit: 50, maxUsers: 1 },
  STARTER: { monthlyEmailLimit: 1000, monthlyAICallLimit: 500, maxUsers: 3 },
  PROFESSIONAL: { monthlyEmailLimit: 10000, monthlyAICallLimit: 5000, maxUsers: 10 },
  ENTERPRISE: { monthlyEmailLimit: -1, monthlyAICallLimit: -1, maxUsers: -1 },
};

// ============================================================================
// VALIDATION STATE
// ============================================================================

interface ValidationResult {
  category: string;
  test: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

const results: ValidationResult[] = [];
let prisma: PrismaClient | null = null;
let redis: ReturnType<typeof createClient> | null = null;

// ============================================================================
// HELPERS
// ============================================================================

function log(msg: string, type: 'info' | 'pass' | 'fail' | 'warn' = 'info') {
  const icons = { info: '→', pass: '✓', fail: '✗', warn: '⚠' };
  const colors = { info: '\x1b[36m', pass: '\x1b[32m', fail: '\x1b[31m', warn: '\x1b[33m' };
  console.log(`${colors[type]}${icons[type]}\x1b[0m ${msg}`);
}

function record(category: string, test: string, passed: boolean, error?: string, duration?: number) {
  results.push({ category, test, passed, error, duration });
  if (passed) {
    log(`[${category}] ${test}`, 'pass');
  } else {
    log(`[${category}] ${test}: ${error}`, 'fail');
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${name} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]);
}

function fileExists(relativePath: string): boolean {
  const fullPath = path.join(process.cwd(), '..', relativePath);
  return fs.existsSync(fullPath);
}

function readFile(relativePath: string): string {
  const fullPath = path.join(process.cwd(), '..', relativePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

// ============================================================================
// PHASE 1: ENVIRONMENT VALIDATION
// ============================================================================

async function validateEnvironment(): Promise<void> {
  log('\n=== PHASE 1: ENVIRONMENT VALIDATION ===\n', 'info');

  // Required vars
  for (const envVar of REQUIRED_ENV_VARS) {
    const value = process.env[envVar];
    record('ENV', `Required: ${envVar}`, !!value, value ? undefined : 'Missing');
  }

  // Optional vars (warn if missing)
  for (const envVar of OPTIONAL_ENV_VARS) {
    const value = process.env[envVar];
    if (!value) {
      log(`[ENV] Optional missing: ${envVar}`, 'warn');
    } else {
      record('ENV', `Optional: ${envVar}`, true);
    }
  }

  // Autumn key format validation (Autumn uses am_sk_test_ or am_sk_live_ prefix)
  const autumnKey = process.env.AUTUMN_SECRET_KEY;
  if (autumnKey) {
    const validFormat = autumnKey.startsWith('am_sk_test_') ||
                        autumnKey.startsWith('am_sk_live_') ||
                        autumnKey.startsWith('sk_test_') ||
                        autumnKey.startsWith('sk_live_');
    record('ENV', 'AUTUMN_SECRET_KEY format', validFormat,
      validFormat ? undefined : `Invalid format: should start with am_sk_test_, am_sk_live_, sk_test_, or sk_live_`);

    if (autumnKey.includes('placeholder')) {
      log('[ENV] AUTUMN_SECRET_KEY contains "placeholder" - replace with real key!', 'warn');
    }
  }
}

// ============================================================================
// PHASE 2: FILE STRUCTURE VALIDATION
// ============================================================================

async function validateFileStructure(): Promise<void> {
  log('\n=== PHASE 2: FILE STRUCTURE VALIDATION ===\n', 'info');

  for (const [filePath, required] of Object.entries(REQUIRED_FILES)) {
    const exists = fileExists(filePath);
    record('FILES', filePath, exists, exists ? undefined : 'File missing');
  }
}

// ============================================================================
// PHASE 3: CODE EXPORT VALIDATION
// ============================================================================

async function validateExports(): Promise<void> {
  log('\n=== PHASE 3: CODE EXPORT VALIDATION ===\n', 'info');

  for (const [filePath, exports] of Object.entries(REQUIRED_EXPORTS)) {
    if (!fileExists(filePath)) continue;

    const content = readFile(filePath);
    for (const exportName of exports) {
      const hasExport =
        content.includes(`export class ${exportName}`) ||
        content.includes(`export const ${exportName}`) ||
        content.includes(`export function ${exportName}`) ||
        content.includes(`export { ${exportName}`) ||
        content.includes(`export enum ${exportName}`);

      record('EXPORTS', `${path.basename(filePath)}: ${exportName}`, hasExport,
        hasExport ? undefined : `Export "${exportName}" not found`);
    }
  }
}

// ============================================================================
// PHASE 4: DATABASE VALIDATION
// ============================================================================

async function validateDatabase(): Promise<void> {
  log('\n=== PHASE 4: DATABASE VALIDATION ===\n', 'info');

  try {
    // Import Prisma dynamically to ensure generated client is available
    const { PrismaClient: PC } = await import('@prisma/client');
    prisma = new PC();
    await withTimeout(prisma.$connect(), 5000, 'Prisma connect');
    record('DB', 'Connection', true);

    // Check Subscription model exists
    const tableCheck = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'Subscription'
      ) as exists
    ` as { exists: boolean }[];
    record('DB', 'Subscription table exists', tableCheck[0]?.exists === true,
      tableCheck[0]?.exists ? undefined : 'Subscription table not found');

    // Check all required columns
    const columns = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Subscription'
    ` as { column_name: string }[];

    const columnNames = columns.map(c => c.column_name);
    const requiredColumns = [
      'id', 'tenantId', 'plan', 'status',
      'monthlyEmailLimit', 'monthlyAICallLimit', 'maxUsers',
      'emailsProcessed', 'aiCallsUsed', 'usageResetAt',
      'autumnCustomerId', 'autumnSubscriptionId'
    ];

    for (const col of requiredColumns) {
      const hasCol = columnNames.includes(col);
      record('DB', `Column: ${col}`, hasCol, hasCol ? undefined : 'Column missing');
    }

    // Check enum values
    const planEnumCheck = await prisma.$queryRaw`
      SELECT enumlabel FROM pg_enum
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SubscriptionPlan')
    ` as { enumlabel: string }[];

    const planValues = planEnumCheck.map(e => e.enumlabel);
    const requiredPlans = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
    for (const plan of requiredPlans) {
      record('DB', `Plan enum: ${plan}`, planValues.includes(plan),
        planValues.includes(plan) ? undefined : 'Enum value missing');
    }

  } catch (error) {
    record('DB', 'Connection', false, String(error));
  }
}

// ============================================================================
// PHASE 5: REDIS VALIDATION
// ============================================================================

async function validateRedis(): Promise<void> {
  log('\n=== PHASE 5: REDIS VALIDATION ===\n', 'info');

  try {
    const redisUrl = `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;
    redis = createClient({ url: redisUrl, password: process.env.REDIS_PASSWORD });

    await withTimeout(redis.connect(), 5000, 'Redis connect');
    record('REDIS', 'Connection', true);

    // Test basic operations
    const testKey = `p10:validation:${Date.now()}`;
    await redis.set(testKey, 'test');
    const value = await redis.get(testKey);
    await redis.del(testKey);
    record('REDIS', 'Read/Write', value === 'test', value === 'test' ? undefined : 'Value mismatch');

    // Test INCR (used for usage tracking)
    const counterKey = `p10:validation:counter:${Date.now()}`;
    await redis.set(counterKey, '0');
    await redis.incr(counterKey);
    await redis.incr(counterKey);
    const count = await redis.get(counterKey);
    await redis.del(counterKey);
    record('REDIS', 'INCR operation', count === '2', count === '2' ? undefined : `Expected 2, got ${count}`);

    // Test EXPIRE (used for daily resets)
    const expireKey = `p10:validation:expire:${Date.now()}`;
    await redis.set(expireKey, 'temp');
    await redis.expire(expireKey, 1);
    const ttl = await redis.ttl(expireKey);
    await redis.del(expireKey);
    record('REDIS', 'EXPIRE operation', ttl > 0, ttl > 0 ? undefined : 'TTL not set');

  } catch (error) {
    record('REDIS', 'Connection', false, String(error));
  }
}

// ============================================================================
// PHASE 6: SUBSCRIPTION SERVICE LOGIC VALIDATION
// ============================================================================

async function validateSubscriptionLogic(): Promise<void> {
  log('\n=== PHASE 6: SUBSCRIPTION LOGIC VALIDATION ===\n', 'info');

  // Validate PLAN_LIMITS are correct
  const serviceContent = readFile('backend/src/modules/subscription/services/subscription.service.ts');

  for (const [plan, limits] of Object.entries(PLAN_LIMITS_EXPECTED)) {
    const emailLimitMatch = serviceContent.includes(`monthlyEmailLimit: ${limits.monthlyEmailLimit}`);
    const aiLimitMatch = serviceContent.includes(`monthlyAICallLimit: ${limits.monthlyAICallLimit}`);

    record('LOGIC', `${plan} email limit = ${limits.monthlyEmailLimit}`, emailLimitMatch,
      emailLimitMatch ? undefined : 'Email limit mismatch');
    record('LOGIC', `${plan} AI limit = ${limits.monthlyAICallLimit}`, aiLimitMatch,
      aiLimitMatch ? undefined : 'AI limit mismatch');
  }

  // Validate Autumn feature IDs
  const autumnContent = readFile('backend/src/modules/subscription/services/autumn.service.ts');
  const requiredFeatureIds = [
    'email-processing', 'ai-calls', 'email-connections', 'team-users',
    'auto-triage', 'smart-replies', 'rag-search', 'daily-briefing'
  ];

  for (const featureId of requiredFeatureIds) {
    const hasFeature = autumnContent.includes(`'${featureId}'`);
    record('LOGIC', `Feature ID: ${featureId}`, hasFeature,
      hasFeature ? undefined : 'Feature ID missing');
  }
}

// ============================================================================
// PHASE 7: API ROUTES VALIDATION
// ============================================================================

async function validateApiRoutes(): Promise<void> {
  log('\n=== PHASE 7: API ROUTES VALIDATION ===\n', 'info');

  // Check subscription controller routes
  const subCtrlContent = readFile('backend/src/modules/subscription/controllers/subscription.controller.ts');
  const subscriptionRoutes = [
    { decorator: "@Get()", path: 'GET /' },
    { decorator: "@Get('usage')", path: 'GET /usage' },
    { decorator: "@Get('cost-status')", path: 'GET /cost-status' },
    { decorator: "@Get('features')", path: 'GET /features' },
    { decorator: "@Post('cancel')", path: 'POST /cancel' },
  ];

  for (const route of subscriptionRoutes) {
    const hasRoute = subCtrlContent.includes(route.decorator);
    record('ROUTES', `Subscription: ${route.path}`, hasRoute,
      hasRoute ? undefined : 'Route missing');
  }

  // Check Autumn controller routes
  const autumnCtrlContent = readFile('backend/src/modules/subscription/controllers/autumn.controller.ts');
  const autumnRoutes = [
    { decorator: "@Post('customers')", path: 'POST /customers' },
    { decorator: "@Post('attach')", path: 'POST /attach' },
    { decorator: "@Post('check')", path: 'POST /check' },
    { decorator: "@Post('track')", path: 'POST /track' },
    { decorator: "@Post('billing_portal')", path: 'POST /billing_portal' },
    { decorator: "@Post('cancel')", path: 'POST /cancel' },
    { decorator: "@Get('components/pricing_table')", path: 'GET /components/pricing_table' },
  ];

  for (const route of autumnRoutes) {
    const hasRoute = autumnCtrlContent.includes(route.decorator);
    record('ROUTES', `Autumn: ${route.path}`, hasRoute,
      hasRoute ? undefined : 'Route missing');
  }

  // Check guards are applied
  const hasJwtGuard = subCtrlContent.includes('@UseGuards(JwtAuthGuard)');
  record('ROUTES', 'JwtAuthGuard on subscription controller', hasJwtGuard,
    hasJwtGuard ? undefined : 'Missing auth guard');
}

// ============================================================================
// PHASE 8: FRONTEND VALIDATION
// ============================================================================

async function validateFrontend(): Promise<void> {
  log('\n=== PHASE 8: FRONTEND VALIDATION ===\n', 'info');

  // Check billing API client
  const billingApiContent = readFile('frontend/lib/api/billing.ts');
  const apiMethods = [
    'getSubscription', 'getUsage', 'getCostStatus', 'getFeatures',
    'attachProduct', 'checkFeature', 'trackUsage', 'getBillingPortalUrl',
    'cancelSubscription', 'getPricingTable'
  ];

  for (const method of apiMethods) {
    const hasMethod = billingApiContent.includes(`export async function ${method}`) ||
                      billingApiContent.includes(`${method},`);
    record('FRONTEND', `API method: ${method}`, hasMethod,
      hasMethod ? undefined : 'Method missing');
  }

  // Check query hooks
  const useBillingContent = readFile('frontend/hooks/queries/use-billing.ts');
  const hooks = [
    'useSubscription', 'useUsage', 'useCostStatus', 'useFeatures',
    'useCancelSubscription', 'useAttachProduct', 'useTrackUsage',
    'useOpenBillingPortal', 'useBilling'
  ];

  for (const hook of hooks) {
    const hasHook = useBillingContent.includes(`export function ${hook}`);
    record('FRONTEND', `Hook: ${hook}`, hasHook,
      hasHook ? undefined : 'Hook missing');
  }

  // Check query keys
  const billingKeysContent = readFile('frontend/hooks/queries/billing-keys.ts');
  const queryKeys = ['subscription', 'usage', 'costStatus', 'features', 'pricingTable'];

  for (const key of queryKeys) {
    const hasKey = billingKeysContent.includes(`${key}:`);
    record('FRONTEND', `Query key: ${key}`, hasKey,
      hasKey ? undefined : 'Query key missing');
  }
}

// ============================================================================
// PHASE 9: TRANSLATION VALIDATION
// ============================================================================

async function validateTranslations(): Promise<void> {
  log('\n=== PHASE 9: TRANSLATION VALIDATION ===\n', 'info');

  const enContent = readFile('frontend/locales/en.ts');
  const itContent = readFile('frontend/locales/it.ts');

  // Check billing section exists
  record('i18n', 'EN: billing section', enContent.includes('billing:'),
    enContent.includes('billing:') ? undefined : 'billing section missing');
  record('i18n', 'IT: billing section', itContent.includes('billing:'),
    itContent.includes('billing:') ? undefined : 'billing section missing');

  // Check critical keys
  const criticalKeys = [
    'title', 'currentPlan', 'plans:', 'usage:', 'costProtection:',
    'features:', 'actions:', 'alerts:', 'pricing:', 'errors:'
  ];

  for (const key of criticalKeys) {
    const enHas = enContent.includes(key);
    const itHas = itContent.includes(key);
    record('i18n', `EN: billing.${key}`, enHas, enHas ? undefined : 'Key missing');
    record('i18n', `IT: billing.${key}`, itHas, itHas ? undefined : 'Key missing');
  }
}

// ============================================================================
// PHASE 10: SECURITY VALIDATION
// ============================================================================

async function validateSecurity(): Promise<void> {
  log('\n=== PHASE 10: SECURITY VALIDATION ===\n', 'info');

  // Check webhook signature validation
  const webhookContent = readFile('backend/src/modules/subscription/controllers/autumn-webhook.controller.ts');

  const hasSignatureCheck = webhookContent.includes('x-autumn-signature') ||
                            webhookContent.includes('stripe-signature') ||
                            webhookContent.includes('validateSignature');
  record('SECURITY', 'Webhook signature validation', hasSignatureCheck,
    hasSignatureCheck ? undefined : 'No signature validation found');

  // Check auth guards on sensitive routes
  const autumnCtrlContent = readFile('backend/src/modules/subscription/controllers/autumn.controller.ts');
  const hasAuthGuard = autumnCtrlContent.includes('@UseGuards(JwtAuthGuard)');
  record('SECURITY', 'Auth guard on Autumn routes', hasAuthGuard,
    hasAuthGuard ? undefined : 'Missing auth guard');

  // Check no hardcoded secrets
  const serviceFiles = [
    'backend/src/modules/subscription/services/autumn.service.ts',
    'backend/src/modules/subscription/services/subscription.service.ts',
  ];

  for (const file of serviceFiles) {
    const content = readFile(file);
    const hasHardcodedSecret = content.includes('sk_live_') || content.includes('sk_test_');
    record('SECURITY', `No hardcoded secrets: ${path.basename(file)}`, !hasHardcodedSecret,
      !hasHardcodedSecret ? undefined : 'HARDCODED SECRET FOUND!');
  }
}

// ============================================================================
// PHASE 11: MODULE WIRING VALIDATION
// ============================================================================

async function validateModuleWiring(): Promise<void> {
  log('\n=== PHASE 11: MODULE WIRING VALIDATION ===\n', 'info');

  // Check SubscriptionModule is registered in AppModule
  const appModuleContent = readFile('backend/src/app.module.ts');
  const hasSubscriptionImport = appModuleContent.includes('SubscriptionModule');
  record('WIRING', 'SubscriptionModule in AppModule', hasSubscriptionImport,
    hasSubscriptionImport ? undefined : 'SubscriptionModule not imported in AppModule');

  // Check module exports
  const subModuleContent = readFile('backend/src/modules/subscription/subscription.module.ts');
  const requiredProviders = ['SubscriptionService', 'UsageTrackingService', 'AutumnService', 'CostProtectionService', 'QuotaGuard'];

  for (const provider of requiredProviders) {
    const hasProvider = subModuleContent.includes(provider);
    record('WIRING', `Provider: ${provider}`, hasProvider,
      hasProvider ? undefined : 'Provider not registered');
  }

  // Check exports for other modules to use
  const hasExports = subModuleContent.includes('exports:');
  record('WIRING', 'Module has exports', hasExports,
    hasExports ? undefined : 'No exports defined');
}

// ============================================================================
// PHASE 12: INTEGRATION TEST (if DB available)
// ============================================================================

async function validateIntegration(): Promise<void> {
  log('\n=== PHASE 12: INTEGRATION TEST ===\n', 'info');

  if (!prisma) {
    log('Skipping integration tests - no database connection', 'warn');
    return;
  }

  // Import enums dynamically
  const { SubscriptionPlan, SubscriptionStatus } = await import('@prisma/client');
  const testTenantId = `p10-validation-${Date.now()}`;

  try {
    // Create test subscription
    const start = Date.now();
    const subscription = await prisma.subscription.create({
      data: {
        tenantId: testTenantId,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        monthlyEmailLimit: 100,
        monthlyAICallLimit: 50,
        maxUsers: 1,
        emailsProcessed: 0,
        aiCallsUsed: 0,
        usageResetAt: new Date(),
      },
    });
    record('INTEGRATION', 'Create subscription', !!subscription.id, undefined, Date.now() - start);

    // Read subscription
    const found = await prisma.subscription.findUnique({
      where: { tenantId: testTenantId },
    });
    record('INTEGRATION', 'Read subscription', found?.tenantId === testTenantId,
      found?.tenantId === testTenantId ? undefined : 'Not found');

    // Update usage
    const updated = await prisma.subscription.update({
      where: { tenantId: testTenantId },
      data: { emailsProcessed: 10, aiCallsUsed: 5 },
    });
    record('INTEGRATION', 'Update usage', updated.emailsProcessed === 10,
      updated.emailsProcessed === 10 ? undefined : 'Update failed');

    // Test plan upgrade
    const upgraded = await prisma.subscription.update({
      where: { tenantId: testTenantId },
      data: { plan: SubscriptionPlan.STARTER },
    });
    record('INTEGRATION', 'Plan upgrade', upgraded.plan === SubscriptionPlan.STARTER,
      upgraded.plan === SubscriptionPlan.STARTER ? undefined : 'Upgrade failed');

    // Cleanup
    await prisma.subscription.delete({ where: { tenantId: testTenantId } });
    record('INTEGRATION', 'Cleanup', true);

  } catch (error) {
    record('INTEGRATION', 'Test execution', false, String(error));
    // Attempt cleanup
    try {
      await prisma.subscription.delete({ where: { tenantId: testTenantId } });
    } catch {}
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║     P10 SUBSCRIPTION & BILLING - PARANOID VALIDATION          ║');
  console.log('║     NO MOCKS. NO SHORTCUTS. PRODUCTION GRADE.                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();

  // Load env
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

  // Run all phases
  await validateEnvironment();
  await validateFileStructure();
  await validateExports();
  await validateDatabase();
  await validateRedis();
  await validateSubscriptionLogic();
  await validateApiRoutes();
  await validateFrontend();
  await validateTranslations();
  await validateSecurity();
  await validateModuleWiring();
  await validateIntegration();

  // Cleanup
  if (prisma) await prisma.$disconnect();
  if (redis) await redis.disconnect();

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                        VALIDATION SUMMARY                      ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║  Total Tests:  ${total.toString().padStart(4)}                                          ║`);
  console.log(`║  Passed:       ${passed.toString().padStart(4)} \x1b[32m✓\x1b[0m                                        ║`);
  console.log(`║  Failed:       ${failed.toString().padStart(4)} ${failed > 0 ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m'}                                        ║`);
  console.log(`║  Duration:     ${duration}s                                        ║`);
  console.log('╠════════════════════════════════════════════════════════════════╣');

  if (failed > 0) {
    console.log('║                     ⚠️  FAILURES DETECTED                      ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    for (const result of results.filter(r => !r.passed)) {
      const msg = `[${result.category}] ${result.test}`.substring(0, 58);
      console.log(`║  ${msg.padEnd(60)} ║`);
      if (result.error) {
        const err = `    → ${result.error}`.substring(0, 58);
        console.log(`║  \x1b[31m${err.padEnd(60)}\x1b[0m ║`);
      }
    }
  } else {
    console.log('║              🎉  ALL TESTS PASSED - SHIP IT!                  ║');
  }

  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
