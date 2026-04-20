import pg from 'pg';
const url = process.env.DATABASE_PUBLIC_URL;
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

async function q(label, sql) {
  try {
    const r = await c.query(sql);
    console.log('===', label, '===', 'rows=', r.rowCount);
    console.log(JSON.stringify(r.rows, null, 2));
  } catch (e) { console.log('=== ERR', label, '===', String(e).slice(0, 300)); }
  console.log('');
}

// Feedback rows in last 15 min (should catch the 06:31 PATCH)
await q('T7 LIVE — feedback in last 15min', `
  SELECT id, "tenantId", "emailId", type, signal, "oldValue", "newValue", "createdAt"
  FROM email_triage_feedback
  WHERE "createdAt" > NOW() - INTERVAL '15 minutes'
  ORDER BY "createdAt" DESC;
`);

// PATCHed email inspection
await q('T7 LIVE — the PATCHed email aiLabels + updatedAt', `
  SELECT id, "from", "aiLabels", labels, "updatedAt", "createdAt"
  FROM emails
  WHERE id = 'cmo6s4vu601g201kw57ne3sw5';
`);

// Recent PATCH emails with aiLabels
await q('T7 LIVE — emails updated in last 10min', `
  SELECT id, "from", "aiLabels", labels,
         "updatedAt" AS upd,
         "createdAt" AS crt
  FROM emails
  WHERE "updatedAt" > NOW() - INTERVAL '10 minutes'
  ORDER BY "updatedAt" DESC LIMIT 10;
`);

// ExecutionAction / BullMQ queue state for promotion
await q('T7 LIVE — recent triage_promotion idempotency keys (via redis proxy columns unavailable; skip)', 'SELECT 1 AS placeholder;');

// Force check: get both aiLabels and any recent modification history for that email
await q('T7 LIVE — relate email → analysis → any feedback', `
  SELECT e.id AS email_id, e."aiLabels", ea."triageSource", ea."modelUsed",
         (SELECT COUNT(*) FROM email_triage_feedback f WHERE f."emailId" = e.id) AS fb_count
  FROM emails e
  LEFT JOIN email_analyses ea ON ea."emailId" = e.id
  WHERE e."updatedAt" > NOW() - INTERVAL '15 minutes'
  ORDER BY e."updatedAt" DESC LIMIT 15;
`);

await c.end();
