#!/usr/bin/env node
/**
 * Prisma command preflight guard.
 *
 * Aborts destructive-capable Prisma commands when DATABASE_URL points at
 * a production Railway host, unless the caller explicitly sets
 *   ALLOW_PROD_DB_OP=yes
 *
 * Triggered by package.json pre-hooks (predb:migrate, predb:seed, predb:reset)
 * and as a standalone check before any risky npm run path.
 *
 * Defense-in-depth: prisma.config.ts carries the same check for `npx prisma`
 * invocations that bypass npm scripts.
 */
'use strict';

require('dotenv/config');

const PROD_HOST_PATTERNS = [/rlwy\.net$/i, /railway\.app$/i, /ballast\.proxy/i];

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn('[prisma-preflight] DATABASE_URL unset — letting Prisma report the error.');
    return;
  }

  const host = hostOf(url);
  const isProd = PROD_HOST_PATTERNS.some((p) => p.test(host));
  if (!isProd) {
    console.log(`[prisma-preflight] OK — target host '${host}' is not production.`);
    return;
  }

  if ((process.env.ALLOW_PROD_DB_OP || '').toLowerCase() === 'yes') {
    console.warn(
      `\n[prisma-preflight] WARNING — destructive command allowed against PROD host '${host}' via ALLOW_PROD_DB_OP=yes.\n`,
    );
    return;
  }

  console.error('');
  console.error('='.repeat(72));
  console.error('[prisma-preflight] BLOCKED — destructive Prisma command on PRODUCTION.');
  console.error('');
  console.error(`  host:   ${host}`);
  console.error(`  script: ${process.env.npm_lifecycle_event || '<unknown>'}`);
  console.error('');
  console.error('  Previous prod wipes: 2026-04-01, 2026-04-20, 2026-04-24.');
  console.error('  Every wipe followed a local Prisma command against this host.');
  console.error('');
  console.error('  Fix:');
  console.error('    1. Point DATABASE_URL at a LOCAL Postgres in backend/.env, OR');
  console.error('    2. If you truly mean to mutate prod (accepted data loss):');
  console.error('         ALLOW_PROD_DB_OP=yes npm run <script>');
  console.error('='.repeat(72));
  console.error('');
  process.exit(1);
}

main();
