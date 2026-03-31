/**
 * Calendar & Contacts Data Hygiene Validation Script
 * Sprint 09 — T-0904
 *
 * Checks:
 * 1. Contacts with duplicate emails within same tenant
 * 2. Contacts without any provider link (orphan local contacts)
 * 3. Calendar events with missing or invalid timezone
 * 4. CalendarSyncState with expired sync tokens
 * 5. Contacts with stale relationship scores (>30 days old)
 *
 * Usage:
 *   node scripts/audit/validate-calendar-contacts.mjs
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

// ── Check 1: Duplicate emails within same tenant ──────────────────

async function checkDuplicateEmails() {
  const result = await pool.query(`
    WITH contact_emails AS (
      SELECT c.id, c."tenantId", c."displayName",
             LOWER(email_obj->>'value') AS email
      FROM "unified_contacts" c,
           jsonb_array_elements(c.emails) AS email_obj
      WHERE c."isDeleted" = false
        AND c.emails IS NOT NULL
    )
    SELECT "tenantId", email, COUNT(*) AS cnt,
           array_agg(id ORDER BY id) AS contact_ids
    FROM contact_emails
    GROUP BY "tenantId", email
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 20
  `);

  return {
    name: 'Duplicate emails within tenant',
    count: result.rows.length,
    samples: result.rows.slice(0, 5).map((r) => ({
      tenant: r.tenantId.substring(0, 8) + '...',
      email: r.email,
      duplicates: r.cnt,
      contactIds: r.contact_ids.slice(0, 3),
    })),
  };
}

// ── Check 2: Orphan contacts (no provider link) ──────────────────

async function checkOrphanContacts() {
  const result = await pool.query(`
    SELECT c.id, c."tenantId", c."displayName", c.metadata->>'source' AS source
    FROM "unified_contacts" c
    LEFT JOIN "provider_contacts" pc ON pc."contactId" = c.id AND pc."tenantId" = c."tenantId"
    WHERE c."isDeleted" = false
      AND pc.id IS NULL
    ORDER BY c."createdAt" DESC
    LIMIT 50
  `);

  // Count by source
  const bySrc = {};
  for (const row of result.rows) {
    const src = row.source || 'unknown';
    bySrc[src] = (bySrc[src] || 0) + 1;
  }

  return {
    name: 'Orphan contacts (no provider link)',
    count: result.rows.length,
    bySource: bySrc,
    samples: result.rows.slice(0, 5).map((r) => ({
      id: r.id.substring(0, 12) + '...',
      name: r.displayName,
      source: r.source || 'unknown',
    })),
  };
}

// ── Check 3: Calendar events with missing/invalid timezone ───────

async function checkInvalidTimezones() {
  // Valid IANA timezone pattern (simplified)
  const result = await pool.query(`
    SELECT id, "tenantId", title, timezone, "startTime"
    FROM "calendar_events"
    WHERE "isDeleted" = false
      AND (
        timezone IS NULL
        OR timezone = ''
        OR (timezone NOT LIKE '%/%' AND timezone != 'UTC' AND timezone NOT LIKE 'Etc/%')
      )
    ORDER BY "startTime" DESC
    LIMIT 20
  `);

  return {
    name: 'Calendar events with missing/invalid timezone',
    count: result.rows.length,
    samples: result.rows.slice(0, 5).map((r) => ({
      id: r.id.substring(0, 12) + '...',
      title: (r.title || '').substring(0, 40),
      timezone: r.timezone || 'NULL',
      startTime: r.startTime,
    })),
  };
}

// ── Check 4: Expired calendar sync tokens ────────────────────────

async function checkExpiredSyncTokens() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const result = await pool.query(
    `
    SELECT css.id, css."tenantId", css."calendarId", css."providerType",
           css."lastSyncedAt", css."syncToken" IS NOT NULL AS has_token,
           css."deltaLink" IS NOT NULL AS has_delta
    FROM "calendar_sync_states" css
    WHERE css."lastSyncedAt" < $1
    ORDER BY css."lastSyncedAt" ASC
    LIMIT 20
  `,
    [sevenDaysAgo],
  );

  return {
    name: 'Calendar sync states with stale tokens (>7 days)',
    count: result.rows.length,
    samples: result.rows.slice(0, 5).map((r) => ({
      id: r.id.substring(0, 12) + '...',
      provider: r.providerType,
      lastSynced: r.lastSyncedAt,
      hasToken: r.has_token,
      hasDelta: r.has_delta,
    })),
  };
}

// ── Check 5: Stale relationship scores ───────────────────────────

async function checkStaleScores() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const result = await pool.query(
    `
    SELECT c.id, c."tenantId", c."displayName", c."relationshipScore",
           c."lastInteractedAt", c."totalInteractions"
    FROM "unified_contacts" c
    WHERE c."isDeleted" = false
      AND c."totalInteractions" > 0
      AND c."relationshipScore" IS NOT NULL
      AND (c."updatedAt" < $1)
    ORDER BY c."totalInteractions" DESC
    LIMIT 20
  `,
    [thirtyDaysAgo],
  );

  return {
    name: 'Contacts with stale relationship scores (>30 days)',
    count: result.rows.length,
    samples: result.rows.slice(0, 5).map((r) => ({
      id: r.id.substring(0, 12) + '...',
      name: r.displayName,
      score: r.relationshipScore,
      lastInteracted: r.lastInteractedAt,
      interactions: r.totalInteractions,
    })),
  };
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log('=== Calendar & Contacts Data Hygiene Validation ===\n');
  console.log(`Run at: ${new Date().toISOString()}\n`);

  const checks = [
    checkDuplicateEmails,
    checkOrphanContacts,
    checkInvalidTimezones,
    checkExpiredSyncTokens,
    checkStaleScores,
  ];

  const results = [];
  let criticalIssues = 0;

  for (const check of checks) {
    try {
      const result = await check();
      results.push(result);

      const icon = result.count === 0 ? '✅' : result.count > 10 ? '❌' : '⚠️';
      if (result.count > 10) criticalIssues++;

      console.log(`${icon} ${result.name}: ${result.count} issues`);

      if (result.bySource) {
        console.log(`   By source: ${JSON.stringify(result.bySource)}`);
      }

      if (result.count > 0 && result.samples.length > 0) {
        console.log(`   Samples:`);
        for (const sample of result.samples) {
          console.log(`     ${JSON.stringify(sample)}`);
        }
      }
      console.log('');
    } catch (error) {
      console.error(`❌ ${check.name} failed: ${error.message}`);
      results.push({ name: check.name, count: -1, error: error.message });
    }
  }

  // Summary table
  console.log('=== Summary ===\n');
  console.log('Check                                          | Issues');
  console.log('-----------------------------------------------|-------');
  for (const r of results) {
    const name = r.name.padEnd(47);
    const count = r.count === -1 ? 'ERROR' : String(r.count);
    console.log(`${name}| ${count}`);
  }

  console.log(`\nCritical issues (>10): ${criticalIssues}`);
  console.log(`Total checks: ${results.length}`);

  await pool.end();
  process.exit(criticalIssues > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Script failed:', err);
  pool.end();
  process.exit(1);
});
