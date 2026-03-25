/**
 * Fix Email Folder/Labels Drift — T-0205
 *
 * Idempotent script that:
 * 1. Finds Google emails where folder != deriveFolder(labels)
 * 2. Re-derives folder from labels[] and updates the record
 * 3. Also updates labels[] to include the correct folder label
 *
 * Safe to re-run: only touches emails with actual mismatches.
 *
 * Usage:
 *   node scripts/audit/fix-email-folder-drift.mjs [--dry-run]
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

const DRY_RUN = process.argv.includes('--dry-run');

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

/** Mirrors backend determineFolderFromLabels logic (Sprint 01 fix) */
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

/** Map folder name to the Gmail label that should be present */
const FOLDER_TO_LABEL = {
  INBOX: 'INBOX',
  SENT: 'SENT',
  TRASH: 'TRASH',
  SPAM: 'SPAM',
  DRAFTS: 'DRAFT',
  PROMOTIONS: 'CATEGORY_PROMOTIONS',
  SOCIAL: 'CATEGORY_SOCIAL',
  UPDATES: 'CATEGORY_UPDATES',
  FORUMS: 'CATEGORY_FORUMS',
};

/** System labels that represent folders — only one should be active */
const FOLDER_LABELS = new Set(Object.values(FOLDER_TO_LABEL));

async function run() {
  console.log(`=== Fix Email Folder/Labels Drift ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  const client = await pool.connect();

  try {
    // Fetch all Google emails with labels
    const { rows: emails } = await client.query(`
      SELECT e.id, e."tenantId", e.folder, e.labels
      FROM emails e
      JOIN provider_configs pc ON pc.id = e."providerId"
      WHERE pc."providerType" = 'google'
        AND array_length(e.labels, 1) > 0
    `);

    console.log(`Checking ${emails.length} Google emails...\n`);

    let fixedCount = 0;
    let skippedCount = 0;

    for (const email of emails) {
      const expectedFolder = deriveFolder(email.labels);
      const actualFolder = (email.folder || '').toUpperCase();

      if (expectedFolder.toUpperCase() === actualFolder) {
        continue; // No mismatch
      }

      // Skip emails manually moved to TRASH/SPAM — user intent takes precedence
      // Their labels[] are stale (pre-T-0204) but folder is correct
      if ((actualFolder === 'TRASH' || actualFolder === 'SPAM') &&
          !email.labels.includes(actualFolder)) {
        skippedCount++;
        continue;
      }

      // Fix: update folder to match derived value from labels
      // Also ensure labels[] contains the correct folder label
      const expectedLabel = FOLDER_TO_LABEL[expectedFolder];
      const updatedLabels = email.labels.filter((l) => !FOLDER_LABELS.has(l));
      if (expectedLabel) {
        updatedLabels.push(expectedLabel);
      }

      if (DRY_RUN) {
        console.log(`  [DRY] ${email.id}: folder "${email.folder}" -> "${expectedFolder}" labels: ${JSON.stringify(email.labels.slice(0, 5))}`);
        fixedCount++;
        continue;
      }

      await client.query(
        `UPDATE emails SET folder = $1, labels = $2, "updatedAt" = NOW() WHERE id = $3 AND "tenantId" = $4`,
        [expectedFolder, updatedLabels, email.id, email.tenantId],
      );
      fixedCount++;

      if (fixedCount <= 10) {
        console.log(`  Fixed ${email.id}: "${email.folder}" -> "${expectedFolder}"`);
      }
    }

    console.log(`\n=== RESULT ===`);
    console.log(`  Emails checked: ${emails.length}`);
    console.log(`  Fixed: ${fixedCount}`);
    console.log(`  Skipped (already consistent): ${emails.length - fixedCount}`);
    if (DRY_RUN && fixedCount > 0) {
      console.log(`\n  Re-run without --dry-run to apply fixes.`);
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
