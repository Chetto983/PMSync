import pg from 'pg';
const url = process.env.DATABASE_PUBLIC_URL;
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

async function q(label, sql, params = []) {
  try {
    const r = await c.query(sql, params);
    console.log('===', label, '===', 'rows=', r.rowCount);
    console.log(JSON.stringify(r.rows, null, 2));
  } catch (e) { console.log('=== ERR', label, '===', String(e).slice(0, 300)); }
  console.log('');
}

const EMAIL_ID = 'cmo6lq52108d901oti8vza1qj';

await q('T2+T7 — all feedback rows for test email', `
  SELECT id, signal, type, "oldValue", "newValue", "createdAt"
  FROM email_triage_feedback
  WHERE "emailId" = $1
  ORDER BY "createdAt" DESC;
`, [EMAIL_ID]);

await q('T2+T7 — all feedback rows in last 10 minutes', `
  SELECT id, "tenantId", "emailId", signal, type, "oldValue", "newValue", "createdAt"
  FROM email_triage_feedback
  WHERE "createdAt" > NOW() - INTERVAL '10 minutes'
  ORDER BY "createdAt" DESC;
`);

await q('T7 — email aiLabels state after PATCH', `
  SELECT id, "from", "aiLabels", labels, "aiLane", "updatedAt"
  FROM emails WHERE id = $1;
`, [EMAIL_ID]);

// Aggregate: did signal='correction' AND signal='edit' both fire?
await q('SIGNAL SUMMARY (last 10min)', `
  SELECT signal, COUNT(*) AS n
  FROM email_triage_feedback
  WHERE "createdAt" > NOW() - INTERVAL '10 minutes'
  GROUP BY signal ORDER BY signal;
`);

await c.end();
