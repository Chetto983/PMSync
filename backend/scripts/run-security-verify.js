#!/usr/bin/env node
/**
 * Runner for security verification scripts against Railway.
 * Sets credentials in-process to avoid shell escaping issues with '!' in passwords.
 *
 * Usage: node scripts/run-security-verify.js [script-name|all]
 */
const { execSync } = require('child_process');
const path = require('path');

const BASE_URL = process.argv[3] || 'https://backend-production-78e1.up.railway.app';
const scriptArg = process.argv[2] || 'all';

const ENV = {
  ...process.env,
  AUDIT_BASE_URL: BASE_URL,
  TEST_USER_EMAIL: 'admin@pmsync.local',
  TEST_USER_PASSWORD: 'TestPassword123!',
  CROSS_TENANT_ID: 'fake-tenant-id-for-cross-check',
  MEMBER_USER_EMAIL: 'member@pmsync.local',
  MEMBER_USER_PASSWORD: 'MemberPassword123!',
};

const SCRIPTS = {
  'auth-guards': 'scripts/verify-auth-guards.ts',
  'tenant-isolation': 'scripts/verify-tenant-isolation.ts',
  'rbac': 'scripts/verify-rbac.ts',
  'csrf': 'scripts/verify-csrf.ts',
  'rate-limiting': 'scripts/verify-rate-limiting.ts',
  'redis-pool': 'scripts/audit-redis-pool.ts',
};

function runScript(name, file) {
  console.log(`\n${'#'.repeat(60)}`);
  console.log(`# Running: ${name} (${file})`);
  console.log(`${'#'.repeat(60)}\n`);
  try {
    execSync(`npx tsx ${file}`, {
      env: ENV,
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..'),
      timeout: 120000,
    });
    console.log(`\n>>> ${name}: PASSED <<<\n`);
    return true;
  } catch (e) {
    console.log(`\n>>> ${name}: FAILED (exit ${e.status}) <<<\n`);
    return false;
  }
}

async function main() {
  const toRun = scriptArg === 'all'
    ? Object.entries(SCRIPTS)
    : [[scriptArg, SCRIPTS[scriptArg]]];

  if (!toRun[0][1]) {
    console.error(`Unknown script: ${scriptArg}. Available: ${Object.keys(SCRIPTS).join(', ')}`);
    process.exit(1);
  }

  let passed = 0, failed = 0;
  for (const [name, file] of toRun) {
    const ok = runScript(name, file);
    if (ok) passed++; else failed++;
    // Small delay between scripts to avoid rate limiting
    if (toRun.length > 1) await new Promise(r => setTimeout(r, 3000));
  }

  console.log('\n' + '='.repeat(60));
  console.log(`TOTAL: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  console.log('='.repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

main();
