#!/usr/bin/env node
/**
 * Schema/migration sync guard (Guard E).
 *
 * Rejects commits / PRs that modify `backend/prisma/schema.prisma` without
 * adding a new file under `backend/prisma/migrations/**\/migration.sql`.
 *
 * Rationale: the 2026-04-01 drift incident (commit 55e3d1a2) shipped
 * `schema.prisma` + code with no migration. Compiled Prisma Client expected
 * columns the prod DB didn't have. Reminder-alert-check crashed every 5 min
 * for 23 days. This check would have blocked that commit.
 *
 * Bypass for legitimate non-DDL schema changes (comments, generator block,
 * datasource tweaks): add on ANY added line in schema.prisma the comment
 *   // ALLOW-SCHEMA-WITHOUT-MIGRATION: <reason at least 10 chars>
 *
 * Modes:
 *   node check-schema-migration-sync.js --staged           # pre-commit
 *   node check-schema-migration-sync.js --base <SHA>       # CI: diff against base
 */
'use strict';

const { execSync } = require('child_process');

const SCHEMA_PATH = 'backend/prisma/schema.prisma';
const MIGRATION_GLOB_RE = /^backend\/prisma\/migrations\/[^/]+\/migration\.sql$/;
const ALLOW_COMMENT_RE = /\/\/\s*ALLOW-SCHEMA-WITHOUT-MIGRATION:\s*(.{10,})/;

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8' });
}

function getChangedFiles(mode, baseSha) {
  if (mode === '--staged') {
    return sh('git diff --cached --name-status').trim();
  }
  if (mode === '--base') {
    if (!baseSha) throw new Error('--base requires a SHA argument');
    return sh(`git diff --name-status ${baseSha} HEAD`).trim();
  }
  throw new Error(`unknown mode: ${mode}`);
}

function getSchemaAddedLines(mode, baseSha) {
  const diffCmd =
    mode === '--staged'
      ? `git diff --cached -- ${SCHEMA_PATH}`
      : `git diff ${baseSha} HEAD -- ${SCHEMA_PATH}`;
  const diff = sh(diffCmd);
  return diff
    .split(/\r?\n/)
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1));
}

function parseFileStatus(raw) {
  // Format: "<STATUS>\t<PATH>" per line. Status: A M D R… (R includes rename destination).
  const entries = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const status = parts[0];
    const path = parts[parts.length - 1];
    entries.push({ status, path });
  }
  return entries;
}

function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  const baseSha = args[1];

  let raw;
  try {
    raw = getChangedFiles(mode, baseSha);
  } catch (e) {
    console.error(`[schema-migration-sync] ${e.message}`);
    process.exit(1);
  }

  if (!raw) return;

  const entries = parseFileStatus(raw);
  const schemaTouched = entries.some(
    (e) => e.path === SCHEMA_PATH && (e.status === 'M' || e.status === 'A'),
  );
  if (!schemaTouched) {
    console.log('[schema-migration-sync] schema.prisma unchanged — skipping.');
    return;
  }

  const newMigrationAdded = entries.some(
    (e) => e.status === 'A' && MIGRATION_GLOB_RE.test(e.path),
  );
  if (newMigrationAdded) {
    console.log(
      '[schema-migration-sync] schema.prisma change is backed by a new migration file — OK.',
    );
    return;
  }

  // No new migration. Check for explicit bypass comment on an ADDED line.
  const addedLines = getSchemaAddedLines(mode, baseSha);
  const allowMatch = addedLines
    .map((l) => l.match(ALLOW_COMMENT_RE))
    .find((m) => m);
  if (allowMatch) {
    console.log(
      `[schema-migration-sync] ALLOW-SCHEMA-WITHOUT-MIGRATION accepted — reason: ${allowMatch[1].trim()}`,
    );
    return;
  }

  console.error('');
  console.error('='.repeat(72));
  console.error('[schema-migration-sync] BLOCKED — schema.prisma modified without a migration.');
  console.error('');
  console.error('  backend/prisma/schema.prisma changed.');
  console.error('  No new file under backend/prisma/migrations/**/migration.sql.');
  console.error('  No ALLOW-SCHEMA-WITHOUT-MIGRATION comment on an added line.');
  console.error('');
  console.error('  This is the exact pattern that broke reminders for 23 days');
  console.error('  (commit 55e3d1a2, 2026-04-01). Shipping schema changes without');
  console.error('  a matching migration causes prod DB drift.');
  console.error('');
  console.error('  Fix:');
  console.error('    npx prisma migrate dev --name <what-you-changed>');
  console.error('  This creates a migration file. Stage it with the schema change.');
  console.error('');
  console.error('  Escape hatch (for comment/generator/datasource-only edits):');
  console.error('  add this comment on a NEW line in schema.prisma:');
  console.error('    // ALLOW-SCHEMA-WITHOUT-MIGRATION: <reason at least 10 chars>');
  console.error('='.repeat(72));
  console.error('');
  process.exit(1);
}

main();
