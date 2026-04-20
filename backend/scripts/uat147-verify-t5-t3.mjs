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

const EMAIL_ID = 'cmo6lq52108d901oti8vza1qj';
const TENANT = 'cmngk6g1j000001pbf8xh2b3h';

await q('T5 — email state after re-triage with override', `
  SELECT id, "from", "aiLabels", "aiLane", "isAutoTriaged", "autoTriagedAt", "updatedAt"
  FROM emails WHERE id = $1;
`, [EMAIL_ID]);

await q('T5 — EmailAnalysis state after re-triage', `
  SELECT "emailId", "triageSource", "modelUsed", lane, "processedAt",
         LENGTH(summary) AS summary_len, "keyPoints", "suggestedActions"
  FROM email_analyses WHERE "emailId" = $1;
`, [EMAIL_ID]);

// T3: simulate getFewShotExamples for bastardi sender — prove the correction is returned
await q('T3 — feedback rows visible to getFewShotExamples (last 30d, signal=correction)', `
  SELECT f.id, f."oldValue", f."newValue", f."createdAt",
         e."from" AS sender_from,
         split_part(regexp_replace(e."from", '^.*<|>$', '', 'g'), '@', 2) AS sender_domain
  FROM email_triage_feedback f
  JOIN emails e ON e.id = f."emailId"
  WHERE f."tenantId" = $1
    AND f.type = 'label_correction'
    AND f.signal = 'correction'
    AND f."createdAt" > NOW() - INTERVAL '30 days'
  ORDER BY f."createdAt" DESC;
`, [TENANT]);

// Promotion idempotency check (T6/T7): what's in Redis? we can only check DB side indicators.
// Our PATCH + correct-triage both trigger enqueueDebounced; the second should dedup.
await q('T6/T7 — total override count by pattern now', `
  SELECT pattern, action, type, "createdAt"
  FROM triage_overrides WHERE "tenantId" = $1 ORDER BY "createdAt" DESC;
`, [TENANT]);

await c.end();
