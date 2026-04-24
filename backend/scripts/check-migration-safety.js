#!/usr/bin/env node
/**
 * Migration safety linter.
 *
 * Rejects destructive SQL in new Prisma migration files unless the file
 * declares explicit intent via a header comment:
 *   -- ALLOW-DESTRUCTIVE: <reason at least 10 chars>
 *
 * Blocked patterns (case-insensitive, data-destroying only):
 *   DROP TABLE, DROP COLUMN, TRUNCATE, DELETE FROM, ALTER TABLE … DROP COLUMN
 *
 * Not blocked (structural, no row loss): DROP CONSTRAINT, DROP INDEX, DROP DEFAULT.
 *
 * Modes:
 *   node check-migration-safety.js <file1> <file2> ...   # explicit list (CI)
 *   node check-migration-safety.js --staged              # staged adds only
 *   node check-migration-safety.js --all                 # scan all migrations
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DANGEROUS_PATTERNS = [
  { name: 'DROP TABLE',        regex: /\bDROP\s+TABLE\b/i },
  { name: 'DROP COLUMN',       regex: /\bDROP\s+COLUMN\b/i },
  { name: 'TRUNCATE',          regex: /\bTRUNCATE\b/i },
  { name: 'DELETE FROM',       regex: /\bDELETE\s+FROM\b/i },
];

const ALLOW_HEADER_REGEX = /^--\s*ALLOW-DESTRUCTIVE:\s*(.{10,})$/m;

function collectFiles(args) {
  if (args.includes('--all')) {
    const root = path.resolve(__dirname, '..', 'prisma', 'migrations');
    if (!fs.existsSync(root)) return [];
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(root, d.name, 'migration.sql'))
      .filter((p) => fs.existsSync(p));
  }

  if (args.includes('--staged')) {
    const out = execSync(
      'git diff --cached --name-only --diff-filter=A -- "backend/prisma/migrations/**/migration.sql"',
      { encoding: 'utf8' },
    );
    return out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((p) => path.resolve(process.cwd(), p));
  }

  return args.filter((a) => !a.startsWith('--')).map((p) => path.resolve(p));
}

function check(file) {
  const sql = fs.readFileSync(file, 'utf8');
  const hits = DANGEROUS_PATTERNS.filter((p) => p.regex.test(sql));
  if (hits.length === 0) return { file, ok: true };

  const allowMatch = sql.match(ALLOW_HEADER_REGEX);
  if (allowMatch) {
    return { file, ok: true, allowed: true, reason: allowMatch[1].trim(), hits };
  }
  return { file, ok: false, hits };
}

function main() {
  const args = process.argv.slice(2);
  const files = collectFiles(args);

  if (files.length === 0) {
    console.log('[migration-safety] No migration files to check.');
    return;
  }

  const results = files.map(check);
  const failed = results.filter((r) => !r.ok);
  const allowed = results.filter((r) => r.allowed);

  for (const r of allowed) {
    console.log(
      `[migration-safety] ALLOW-DESTRUCTIVE accepted in ${path.basename(
        path.dirname(r.file),
      )} — reason: ${r.reason}`,
    );
  }

  if (failed.length === 0) {
    console.log(`[migration-safety] ${files.length} file(s) OK.`);
    return;
  }

  console.error('');
  console.error('='.repeat(72));
  console.error('[migration-safety] BLOCKED — destructive SQL found in migration(s):');
  console.error('');
  for (const r of failed) {
    console.error(`  ${r.file}`);
    for (const h of r.hits) console.error(`    - ${h.name}`);
  }
  console.error('');
  console.error('  Migrations that drop tables/columns or delete rows require explicit');
  console.error('  opt-in. Add this as the FIRST line of the migration.sql:');
  console.error('');
  console.error('    -- ALLOW-DESTRUCTIVE: <explain why, at least 10 chars>');
  console.error('');
  console.error('  If you can avoid the destructive change, prefer additive migrations:');
  console.error('  add new column → backfill → switch reads → deprecate old column');
  console.error('  in a LATER migration after prod is confirmed healthy.');
  console.error('='.repeat(72));
  console.error('');
  process.exit(1);
}

main();
