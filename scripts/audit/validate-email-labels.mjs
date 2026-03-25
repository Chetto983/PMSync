/**
 * Email & Label Data Consistency Validation Script
 * Sprint 01 — T-0105
 *
 * Checks:
 * 1. Emails where `folder` doesn't match derivation from `labels[]`
 * 2. Emails with unknown/stale label IDs
 * 3. Label count summary
 *
 * Usage:
 *   node scripts/audit/validate-email-labels.mjs
 *
 * Requires: DATABASE_URL in backend/.env
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, '../../backend/package.json'));
const pg = require('pg');

// Load DATABASE_URL from backend/.env
function loadDatabaseUrl() {
  const envPath = resolve(__dirname, '../../backend/.env');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^DATABASE_URL=(.+)$/);
    if (match) return match[1].trim();
  }
  throw new Error('DATABASE_URL not found in backend/.env');
}

const DATABASE_URL = loadDatabaseUrl();
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

/**
 * Derive expected folder from Gmail label IDs
 * Mirrors backend determineFolderFromLabels logic
 */
function deriveFolder(labels) {
  if (!labels || labels.length === 0) return 'INBOX';
  if (labels.includes('TRASH')) return 'TRASH';
  if (labels.includes('SPAM')) return 'SPAM';
  if (labels.includes('SENT')) return 'SENT';
  if (labels.includes('DRAFT') || labels.includes('DRAFTS')) return 'DRAFTS';

  const cat = labels.find((l) => l.startsWith('CATEGORY_'));
  if (cat) {
    const map = {
      CATEGORY_PERSONAL: 'INBOX',
      CATEGORY_SOCIAL: 'SOCIAL',
      CATEGORY_PROMOTIONS: 'PROMOTIONS',
      CATEGORY_UPDATES: 'UPDATES',
      CATEGORY_FORUMS: 'FORUMS',
    };
    if (map[cat]) return map[cat];
  }

  if (labels.includes('INBOX')) return 'INBOX';
  return 'ARCHIVE';
}

// Known system label IDs (always valid)
const SYSTEM_LABELS = new Set([
  'INBOX', 'SENT', 'DRAFTS', 'DRAFT', 'TRASH', 'SPAM', 'ARCHIVE',
  'IMPORTANT', 'STARRED', 'OUTBOX', 'JUNK', 'FLAGGED',
  'UNREAD', 'MUTED', 'CHAT', 'ALL',
  'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES',
  'CATEGORY_FORUMS', 'CATEGORY_PROMOTIONS',
  'YELLOW_STAR', 'BLUE_STAR', 'GREEN_STAR', 'RED_STAR',
  'ORANGE_STAR', 'PURPLE_STAR',
]);

async function run() {
  console.log('=== Email & Label Data Consistency Audit ===\n');

  const client = await pool.connect();

  try {
    // 1. Total email count per provider
    const { rows: providerStats } = await client.query(`
      SELECT
        pc."providerType",
        pc.id AS "providerId",
        COUNT(e.id) AS "emailCount",
        COUNT(DISTINCT e.folder) AS "folderCount"
      FROM emails e
      JOIN provider_configs pc ON pc.id = e."providerId"
      GROUP BY pc."providerType", pc.id
      ORDER BY "emailCount" DESC
    `);

    console.log('--- Provider Summary ---');
    for (const row of providerStats) {
      console.log(`  ${row.providerType} (${row.providerId}): ${row.emailCount} emails, ${row.folderCount} folders`);
    }
    console.log();

    // 2. Folder distribution
    const { rows: folderDist } = await client.query(`
      SELECT folder, COUNT(*) AS count
      FROM emails
      GROUP BY folder
      ORDER BY count DESC
    `);

    console.log('--- Folder Distribution ---');
    for (const row of folderDist) {
      console.log(`  ${row.folder}: ${row.count}`);
    }
    console.log();

    // 3. Check folder vs labels derivation mismatch (Google only)
    const { rows: googleEmails } = await client.query(`
      SELECT e.id, e.folder, e.labels, e.subject
      FROM emails e
      JOIN provider_configs pc ON pc.id = e."providerId"
      WHERE pc."providerType" = 'google'
        AND array_length(e.labels, 1) > 0
      LIMIT 10000
    `);

    let mismatchCount = 0;
    const mismatchSamples = [];
    for (const email of googleEmails) {
      const expected = deriveFolder(email.labels);
      const actual = (email.folder || '').toUpperCase();
      if (expected.toUpperCase() !== actual) {
        mismatchCount++;
        if (mismatchSamples.length < 10) {
          mismatchSamples.push({
            id: email.id,
            subject: (email.subject || '').substring(0, 50),
            folder: email.folder,
            expected,
            labels: email.labels.slice(0, 5),
          });
        }
      }
    }

    console.log(`--- Folder vs Labels Derivation (Google, ${googleEmails.length} emails checked) ---`);
    console.log(`  Mismatches: ${mismatchCount} (${((mismatchCount / Math.max(googleEmails.length, 1)) * 100).toFixed(1)}%)`);
    if (mismatchSamples.length > 0) {
      console.log('  Samples:');
      for (const s of mismatchSamples) {
        console.log(`    [${s.id}] folder="${s.folder}" expected="${s.expected}" labels=${JSON.stringify(s.labels)} — "${s.subject}"`);
      }
    }
    console.log();

    // 4. Stale label IDs (not system and not matching any Folder.externalId)
    const { rows: folderExternalIds } = await client.query(`
      SELECT DISTINCT "externalId" FROM folders WHERE "externalId" IS NOT NULL
    `);
    const validExternalIds = new Set(folderExternalIds.map((r) => r.externalId));

    let staleCount = 0;
    const staleSamples = [];
    for (const email of googleEmails) {
      const staleIds = email.labels.filter(
        (id) => !SYSTEM_LABELS.has(id) && !validExternalIds.has(id),
      );
      if (staleIds.length > 0) {
        staleCount++;
        if (staleSamples.length < 5) {
          staleSamples.push({ id: email.id, staleIds });
        }
      }
    }

    console.log(`--- Stale Label IDs (not in Gmail labels or system) ---`);
    console.log(`  Emails with stale IDs: ${staleCount}`);
    if (staleSamples.length > 0) {
      console.log('  Samples:');
      for (const s of staleSamples) {
        console.log(`    [${s.id}] stale: ${JSON.stringify(s.staleIds)}`);
      }
    }
    console.log();

    // 5. Labels array stats
    const { rows: labelStats } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE array_length(labels, 1) IS NULL OR array_length(labels, 1) = 0) AS "emptyLabels",
        COUNT(*) FILTER (WHERE array_length(labels, 1) > 0) AS "withLabels",
        AVG(array_length(labels, 1)) FILTER (WHERE array_length(labels, 1) > 0) AS "avgLabelCount",
        MAX(array_length(labels, 1)) AS "maxLabelCount"
      FROM emails
    `);

    console.log('--- Labels Array Stats ---');
    const stats = labelStats[0];
    console.log(`  Emails with labels: ${stats.withLabels}`);
    console.log(`  Emails without labels: ${stats.emptyLabels}`);
    console.log(`  Avg labels per email: ${Number(stats.avgLabelCount || 0).toFixed(1)}`);
    console.log(`  Max labels on email: ${stats.maxLabelCount || 0}`);
    console.log();

    // 6. Summary
    const hasIssues = mismatchCount > 0 || staleCount > 0;
    console.log('=== RESULT ===');
    if (hasIssues) {
      console.log(`ISSUES FOUND: ${mismatchCount} folder mismatches, ${staleCount} stale label emails`);
      console.log('Run T-0103 stale cleanup and re-derive folders for mismatches.');
    } else {
      console.log('ALL CLEAR: No folder mismatches or stale labels detected.');
    }

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
