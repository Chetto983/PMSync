import pg from 'pg';
const url = process.env.DATABASE_PUBLIC_URL;
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const TENANT = 'cmngk6g1j000001pbf8xh2b3h';

// Candidate emails for T7 (aiLabels PATCH) — non-empty aiLabels, not trash
const emails = await c.query(`
  SELECT id, "from", "aiLabels", labels, "aiLane", "createdAt"
  FROM emails
  WHERE "tenantId" = $1
    AND "aiLabels" IS NOT NULL
    AND array_length("aiLabels", 1) > 0
    AND NOT ('TRASH' = ANY(labels))
    AND "isDeleted" = false
  ORDER BY "createdAt" DESC LIMIT 10;
`, [TENANT]);
console.log('=== T7 candidates (emails with non-empty aiLabels, not in trash) ===');
console.log('count:', emails.rowCount);
console.log(JSON.stringify(emails.rows, null, 2));

// Existing labels for the tenant
const labels = await c.query(`
  SELECT name, color FROM labels WHERE "tenantId" = $1 ORDER BY name LIMIT 30;
`, [TENANT]);
console.log('\n=== Available user labels ===');
console.log('count:', labels.rowCount);
console.log(JSON.stringify(labels.rows.slice(0, 10), null, 2));

// Candidate senders for T5 visible override (non-muted, non-role-account, has multiple emails)
const senders = await c.query(`
  SELECT split_part("from", '<', 2) AS raw_from_angle,
         regexp_replace("from", '^.*<|>$', '', 'g') AS extracted_email,
         COUNT(*) AS n_emails,
         MAX("createdAt") AS latest
  FROM emails
  WHERE "tenantId" = $1
    AND "from" ~* '<[^>]+@[^>]+>'
    AND "from" NOT ILIKE '%notifications@github.com%'
    AND "from" NOT ILIKE '%@accounts.google.com%'
    AND "isDeleted" = false
  GROUP BY extracted_email, raw_from_angle
  HAVING COUNT(*) >= 2
  ORDER BY n_emails DESC, latest DESC
  LIMIT 10;
`, [TENANT]);
console.log('\n=== T5 candidate senders (≥2 emails, not muted) ===');
console.log(JSON.stringify(senders.rows, null, 2));

await c.end();
