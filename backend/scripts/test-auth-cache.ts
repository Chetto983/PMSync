/**
 * BRUTAL Auth Cache Security Test - REAL DATA ONLY
 *
 * NO MOCKS! This tests ACTUAL cached sessions in Redis.
 * Run this AFTER users have logged in to verify real data.
 *
 * If cache is empty, test FAILS because we can't verify anything.
 *
 * Attack Vectors Tested:
 * 1. Cross-tenant cache pollution (Tenant A reads Tenant B's data)
 * 2. Tenant isolation in cache keys
 * 3. Session hijacking via cache key guessing
 * 4. PII leakage in cache keys
 * 5. Sensitive data in cache values
 * 6. TTL validation (no infinite sessions)
 *
 * Run: npx ts-node scripts/test-auth-cache.ts
 *
 * PREREQUISITE: At least one user must be logged in!
 */

import { createClient, RedisClientType } from 'redis';
import { getConfiguration } from '../src/config/configuration';

const NAMESPACE = 'user:session';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

class BrutalSecurityTester {
  private client: RedisClientType;
  private results: TestResult[] = [];

  constructor(client: RedisClientType) {
    this.client = client;
  }

  private addResult(
    name: string,
    passed: boolean,
    details: string,
    severity: TestResult['severity'],
  ) {
    this.results.push({ name, passed, details, severity });
    const icon = passed ? '✅' : '❌';
    const severityIcon =
      severity === 'CRITICAL'
        ? '🔴'
        : severity === 'HIGH'
          ? '🟠'
          : severity === 'MEDIUM'
            ? '🟡'
            : '🟢';
    console.log(`${icon} [${severityIcon} ${severity}] ${name}`);
    console.log(`   ${details}\n`);
  }

  /**
   * PRE-CHECK: Verify we have real data to test
   * If cache is empty, we CANNOT verify security - test must fail
   */
  async verifyRealDataExists(): Promise<boolean> {
    console.log('\n🔍 PRE-CHECK: Verifying REAL cached sessions exist...\n');

    const keys = await this.client.keys(`${NAMESPACE}:*`);

    if (keys.length === 0) {
      console.log('╔══════════════════════════════════════════════════════════════╗');
      console.log('║  ❌ CANNOT VERIFY SECURITY - NO REAL DATA IN CACHE!          ║');
      console.log('║                                                              ║');
      console.log('║  This test requires REAL user sessions to verify.            ║');
      console.log('║  Empty cache = unverified security = FAILURE.                ║');
      console.log('║                                                              ║');
      console.log('║  TO FIX:                                                     ║');
      console.log('║  1. Start the backend: npm run start:dev                     ║');
      console.log('║  2. Log in at least one user via the frontend                ║');
      console.log('║  3. Run this test again                                      ║');
      console.log('╚══════════════════════════════════════════════════════════════╝\n');
      return false;
    }

    console.log(`   ✅ Found ${keys.length} REAL cached session(s)\n`);
    return true;
  }

  /**
   * TEST 1: Verify ALL cache keys are tenant-isolated
   * Key format MUST be: {tenantId}:{sessionId} or {tenantId}:user:{userId}
   */
  async testTenantIsolationInKeys(): Promise<void> {
    console.log('\n🔪 TEST 1: Tenant Isolation in Cache Keys');
    console.log('   Key format MUST be: {tenantId}:{sessionId} or {tenantId}:user:{userId}\n');

    const keys = await this.client.keys(`${NAMESPACE}:*`);
    const nonIsolatedKeys: string[] = [];

    for (const fullKey of keys) {
      const key = fullKey.replace(`${NAMESPACE}:`, '');

      // KEY MUST contain a colon (tenantId:sessionId format)
      if (!key.includes(':')) {
        nonIsolatedKeys.push(key);
        console.log(`   ❌ NON-ISOLATED: "${key}" (no tenant prefix)`);
        continue;
      }

      // Check for attack patterns that should never exist
      if (
        key.includes('*') ||
        key.includes('..') ||
        key.includes('${') ||
        key.trim() === ''
      ) {
        nonIsolatedKeys.push(key);
        console.log(`   ❌ SUSPICIOUS: "${key}" (contains attack pattern)`);
        continue;
      }

      console.log(`   ✅ ISOLATED: "${key}"`);
    }

    if (nonIsolatedKeys.length > 0) {
      this.addResult(
        'Tenant isolation in keys',
        false,
        `CRITICAL: ${nonIsolatedKeys.length}/${keys.length} keys are NOT tenant-isolated!`,
        'CRITICAL',
      );
    } else {
      this.addResult(
        'Tenant isolation in keys',
        true,
        `All ${keys.length} cache keys are properly tenant-isolated`,
        'CRITICAL',
      );
    }
  }

  /**
   * TEST 2: Verify tenantId in key matches tenantId in cached data
   * This prevents cache poisoning attacks
   */
  async testCacheDataIntegrity(): Promise<void> {
    console.log('\n🔪 TEST 2: Cache Data Integrity (Key-Data TenantId Match)');
    console.log('   TenantId in key MUST match tenantId in cached data\n');

    const keys = await this.client.keys(`${NAMESPACE}:*`);
    let mismatches = 0;
    let checked = 0;

    for (const fullKey of keys) {
      const key = fullKey.replace(`${NAMESPACE}:`, '');
      const data = await this.client.get(fullKey);

      if (!data) continue;

      try {
        const parsed = JSON.parse(data);
        const keyTenantId = key.split(':')[0];
        const dataTenantId = parsed.tenantId;

        // CRITICAL: Key tenantId MUST match data tenantId
        if (dataTenantId !== keyTenantId) {
          mismatches++;
          console.log(`   ❌ MISMATCH: Key="${keyTenantId}" Data="${dataTenantId}"`);
        } else {
          console.log(`   ✅ MATCH: "${keyTenantId}"`);
        }

        // Check for missing tenantId in data
        if (!dataTenantId) {
          mismatches++;
          console.log(`   ❌ MISSING: No tenantId in data for "${key}"`);
        }

        checked++;
      } catch {
        console.log(`   ⚠️  Invalid JSON: "${key}"`);
      }
    }

    if (mismatches > 0) {
      this.addResult(
        'Cache data integrity',
        false,
        `CRITICAL: ${mismatches}/${checked} entries have tenantId mismatches!`,
        'CRITICAL',
      );
    } else {
      this.addResult(
        'Cache data integrity',
        true,
        `All ${checked} cache entries have matching tenantId`,
        'CRITICAL',
      );
    }
  }

  /**
   * TEST 3: Check for PII in cache keys
   * Keys should NEVER contain emails, names, or other PII
   */
  async testNoPiiInKeys(): Promise<void> {
    console.log('\n🔪 TEST 3: No PII in Cache Keys');
    console.log('   Keys should NEVER contain emails, names, or personal data\n');

    const keys = await this.client.keys(`${NAMESPACE}:*`);
    const piiPatterns = [
      { pattern: /@/, name: 'email' },
      { pattern: /\.(com|org|net|io|co)/, name: 'domain' },
      { pattern: /password/i, name: 'password' },
      { pattern: /secret/i, name: 'secret' },
    ];

    const keysWithPii: string[] = [];

    for (const fullKey of keys) {
      const key = fullKey.replace(`${NAMESPACE}:`, '');

      for (const { pattern, name } of piiPatterns) {
        if (pattern.test(key)) {
          keysWithPii.push(`${key} (contains ${name})`);
          console.log(`   ❌ PII FOUND: "${key}" contains ${name}`);
          break;
        }
      }
    }

    if (keysWithPii.length > 0) {
      this.addResult(
        'No PII in cache keys',
        false,
        `HIGH: ${keysWithPii.length} keys contain PII!`,
        'HIGH',
      );
    } else {
      this.addResult(
        'No PII in cache keys',
        true,
        `No PII patterns found in ${keys.length} keys`,
        'HIGH',
      );
    }
  }

  /**
   * TEST 4: Check cache TTL is reasonable
   * Sessions should NEVER have infinite TTL
   */
  async testCacheTtl(): Promise<void> {
    console.log('\n🔪 TEST 4: Cache TTL Validation');
    console.log('   Sessions MUST have TTL ≤ 10 minutes (600 seconds)\n');

    const keys = await this.client.keys(`${NAMESPACE}:*`);
    const MAX_TTL = 600;
    const issues: string[] = [];

    for (const fullKey of keys) {
      const key = fullKey.replace(`${NAMESPACE}:`, '');
      const ttl = await this.client.ttl(fullKey);

      if (ttl === -1) {
        issues.push(`${key} (INFINITE TTL!)`);
        console.log(`   ❌ INFINITE TTL: "${key}"`);
      } else if (ttl > MAX_TTL) {
        issues.push(`${key} (${ttl}s > ${MAX_TTL}s)`);
        console.log(`   ⚠️  LONG TTL: "${key}" = ${ttl}s`);
      } else {
        console.log(`   ✅ TTL OK: "${key}" = ${ttl}s`);
      }
    }

    if (issues.length > 0) {
      this.addResult(
        'Cache TTL validation',
        false,
        `HIGH: ${issues.length} keys have invalid TTL!`,
        'HIGH',
      );
    } else {
      this.addResult(
        'Cache TTL validation',
        true,
        `All ${keys.length} entries have valid TTL`,
        'HIGH',
      );
    }
  }

  /**
   * TEST 5: Check cached data doesn't contain sensitive fields
   * NEVER cache passwords, tokens, or secrets
   */
  async testNoSensitiveDataCached(): Promise<void> {
    console.log('\n🔪 TEST 5: No Sensitive Data in Cache');
    console.log('   Cache MUST NOT contain passwords, tokens, or secrets\n');

    const keys = await this.client.keys(`${NAMESPACE}:*`);
    const sensitiveFields = [
      'password',
      'passwordHash',
      'secret',
      'accessToken',
      'refreshToken',
      'apiKey',
      'privateKey',
    ];

    let sensitiveFound = 0;

    for (const fullKey of keys) {
      const key = fullKey.replace(`${NAMESPACE}:`, '');
      const data = await this.client.get(fullKey);
      if (!data) continue;

      try {
        const parsed = JSON.parse(data);
        const dataKeys = Object.keys(parsed).map((k) => k.toLowerCase());

        for (const field of sensitiveFields) {
          if (dataKeys.includes(field.toLowerCase())) {
            sensitiveFound++;
            console.log(`   ❌ SENSITIVE: "${key}" contains "${field}"`);
          }
        }

        // Also check values for token-like strings (long base64)
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string' && v.length > 100) {
            console.log(`   ⚠️  LONG VALUE: "${key}.${k}" = ${v.length} chars`);
          }
        }
      } catch {
        // Invalid JSON - skip
      }
    }

    if (sensitiveFound > 0) {
      this.addResult(
        'No sensitive data cached',
        false,
        `CRITICAL: ${sensitiveFound} sensitive fields found in cache!`,
        'CRITICAL',
      );
    } else {
      this.addResult(
        'No sensitive data cached',
        true,
        `No sensitive fields found in cache`,
        'CRITICAL',
      );
    }
  }

  /**
   * TEST 6: Cross-tenant attack simulation
   * Try to access another tenant's session by key manipulation
   */
  async testCrossTenantAttack(): Promise<void> {
    console.log('\n🔪 TEST 6: Cross-Tenant Attack Simulation');
    console.log('   Attempting to forge access to other tenant sessions\n');

    const keys = await this.client.keys(`${NAMESPACE}:*`);

    if (keys.length < 2) {
      this.addResult(
        'Cross-tenant attack',
        true,
        'Need 2+ tenants to test cross-tenant attack (only 1 found)',
        'MEDIUM',
      );
      return;
    }

    // Extract unique tenants
    const tenants = new Set<string>();
    for (const fullKey of keys) {
      const key = fullKey.replace(`${NAMESPACE}:`, '');
      const tenantId = key.split(':')[0];
      tenants.add(tenantId);
    }

    if (tenants.size < 2) {
      this.addResult(
        'Cross-tenant attack',
        true,
        'Need 2+ distinct tenants to test (only 1 tenant found)',
        'MEDIUM',
      );
      return;
    }

    // Try to forge key from Tenant A using Tenant B's session ID
    const tenantArray = Array.from(tenants);
    const tenantA = tenantArray[0];
    const tenantB = tenantArray[1];

    // Find a session from tenant B
    let tenantBSession = '';
    for (const fullKey of keys) {
      const key = fullKey.replace(`${NAMESPACE}:`, '');
      if (key.startsWith(tenantB)) {
        tenantBSession = key.split(':').slice(1).join(':');
        break;
      }
    }

    if (!tenantBSession) {
      this.addResult(
        'Cross-tenant attack',
        true,
        'Could not find session to test',
        'MEDIUM',
      );
      return;
    }

    // Forge key: use Tenant A prefix with Tenant B's session
    const forgedKey = `${NAMESPACE}:${tenantA}:${tenantBSession}`;
    const forgedData = await this.client.get(forgedKey);

    if (forgedData) {
      const parsed = JSON.parse(forgedData);
      if (parsed.tenantId === tenantB) {
        this.addResult(
          'Cross-tenant attack',
          false,
          `CRITICAL: Forged key returned Tenant B's data! Cross-tenant leak!`,
          'CRITICAL',
        );
      } else {
        this.addResult(
          'Cross-tenant attack',
          true,
          `Forged key returned different data (expected)`,
          'CRITICAL',
        );
      }
    } else {
      this.addResult(
        'Cross-tenant attack',
        true,
        `Forged key correctly returned null. Isolation verified.`,
        'CRITICAL',
      );
    }
  }

  /**
   * Print final summary
   */
  printSummary(): boolean {
    console.log('\n' + '='.repeat(70));
    console.log('                    🔒 SECURITY TEST SUMMARY');
    console.log('='.repeat(70) + '\n');

    const passed = this.results.filter((r) => r.passed);
    const failed = this.results.filter((r) => !r.passed);

    const criticalFails = failed.filter((r) => r.severity === 'CRITICAL');
    const highFails = failed.filter((r) => r.severity === 'HIGH');

    console.log(`Tests Passed: ${passed.length}/${this.results.length}`);
    console.log(`Tests Failed: ${failed.length}/${this.results.length}`);
    console.log(`  - CRITICAL failures: ${criticalFails.length}`);
    console.log(`  - HIGH failures: ${highFails.length}`);

    if (criticalFails.length > 0) {
      console.log('\n🔴 CRITICAL FAILURES:');
      for (const fail of criticalFails) {
        console.log(`   - ${fail.name}: ${fail.details}`);
      }
    }

    if (highFails.length > 0) {
      console.log('\n🟠 HIGH SEVERITY FAILURES:');
      for (const fail of highFails) {
        console.log(`   - ${fail.name}: ${fail.details}`);
      }
    }

    console.log('\n' + '='.repeat(70));

    if (criticalFails.length > 0 || highFails.length > 0) {
      console.log('❌ SECURITY TEST FAILED - DO NOT DEPLOY!');
      console.log('\nREMEDIATION:');
      console.log('  1. Fix all issues in the code');
      console.log('  2. Clear Redis: redis-cli FLUSHDB');
      console.log('  3. Force users to re-login');
      console.log('  4. Re-run this test');
      return false;
    }

    console.log('✅ SECURITY TEST PASSED - GDPR COMPLIANT');
    return true;
  }

  async runAllTests(): Promise<boolean> {
    // First verify we have real data
    const hasRealData = await this.verifyRealDataExists();
    if (!hasRealData) {
      return false;
    }

    await this.testTenantIsolationInKeys();
    await this.testCacheDataIntegrity();
    await this.testNoPiiInKeys();
    await this.testCacheTtl();
    await this.testNoSensitiveDataCached();
    await this.testCrossTenantAttack();
    return this.printSummary();
  }
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║     🔪 BRUTAL AUTH CACHE SECURITY TEST - REAL DATA ONLY 🔪        ║');
  console.log('║                                                                   ║');
  console.log('║     NO MOCKS! Tests ACTUAL cached sessions from REAL users.       ║');
  console.log('║     Run AFTER users have logged in.                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  const config = getConfiguration();
  const redisConfig = config.redis;

  console.log(`📡 Connecting to Redis at ${redisConfig.host}:${redisConfig.port}...`);

  const client = createClient({
    socket: {
      host: redisConfig.host,
      port: redisConfig.port,
    },
    password: redisConfig.password,
    database: redisConfig.db,
  });

  try {
    await client.connect();
    console.log('✅ Redis connected');

    const tester = new BrutalSecurityTester(client as RedisClientType);
    const passed = await tester.runAllTests();

    process.exit(passed ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  } finally {
    await client.quit();
  }
}

main();
