import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_PUBLIC_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

async function q(label, sql, params = []) {
  try {
    const r = await c.query(sql, params);
    console.log('===', label, '===', 'rows=', r.rowCount);
    console.log(JSON.stringify(r.rows, null, 2));
  } catch (e) { console.log('=== ERR', label, '===', String(e).slice(0, 300)); }
  console.log('');
}

// What got triaged in the last 5min?
await q('Latest triage activity (EmailAnalysis processedAt > 5min ago)', `
  SELECT ea."emailId", ea."triageSource", ea."modelUsed", ea.lane, ea."processedAt",
         e."from", e."aiLane", e."isAutoTriaged", e."autoTriagedAt"
  FROM email_analyses ea
  JOIN emails e ON e.id = ea."emailId"
  WHERE ea."processedAt" > NOW() - INTERVAL '5 minutes'
  ORDER BY ea."processedAt" DESC;
`);

// Still-eligible emails (isAutoTriaged=false, last 24h)
await q('Currently eligible for triage (isAutoTriaged=false, last 24h)', `
  SELECT id, "from", "receivedAt", "aiLane", "aiLabels", "isAutoTriaged", folder, "isDeleted", "isDraft"
  FROM emails
  WHERE "tenantId" = $1
    AND "isAutoTriaged" = false
    AND "receivedAt" > NOW() - INTERVAL '24 hours'
    AND folder NOT IN ('SPAM','TRASH','DRAFTS')
    AND "isDeleted" = false
    AND "isDraft" = false
  ORDER BY "receivedAt" DESC LIMIT 10;
`, ['cmngk6g1j000001pbf8xh2b3h']);

// Target email full state
await q('Target email full state', `
  SELECT id, "from", "receivedAt", folder, "aiLane", "aiLabels", "isAutoTriaged", "autoTriagedAt", "isDeleted", "isDraft", "updatedAt"
  FROM emails WHERE id = 'cmo6lq52108d901oti8vza1qj';
`);

await c.end();
