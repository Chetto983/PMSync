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

// ───── Override population (real columns: type, pattern, action) ─────
await q('OVR — overrides by action (all)', `
  SELECT action, type, COUNT(*) AS n
  FROM triage_overrides
  GROUP BY action, type ORDER BY action, type;
`);

await q('OVR — all active overrides (for correlation)', `
  SELECT id, "tenantId", type, pattern, action, "createdAt"
  FROM triage_overrides
  ORDER BY "createdAt" DESC LIMIT 30;
`);

// ───── T4: correlate muting overrides with resulting EmailAnalysis ─────
await q('T4 — muting override correlation (sender-scope)', `
  SELECT tov.pattern, tov.action, tov.type AS ovtype,
         ea."triageSource", ea."modelUsed", ea.summary IS NULL AS summary_null,
         array_length(ea."keyPoints",1) AS kp_len,
         e."aiLane", array_length(e."aiLabels",1) AS lbl_len,
         e."from", e."isAutoTriaged",
         COUNT(*) OVER (PARTITION BY tov.id) AS matches
  FROM triage_overrides tov
  JOIN emails e ON e."tenantId" = tov."tenantId"
                AND tov.type = 'sender'
                AND LOWER(e."from") LIKE '%' || LOWER(tov.pattern) || '%'
  JOIN email_analyses ea ON ea."emailId" = e.id
  WHERE tov.action IN ('always-system-alert','never-follow-up')
  ORDER BY tov.pattern, ea."processedAt" DESC
  LIMIT 10;
`);

// ───── T5: visible overrides + correlation ─────
await q('T5 — visible override correlation (any lane-forced?)', `
  SELECT tov.pattern, tov.action, tov.type AS ovtype,
         ea."triageSource", ea.lane AS ea_lane,
         e."aiLane", e."from", ea."processedAt"
  FROM triage_overrides tov
  JOIN emails e ON e."tenantId" = tov."tenantId"
                AND (
                  (tov.type = 'sender' AND LOWER(e."from") LIKE '%' || LOWER(tov.pattern) || '%')
                  OR (tov.type = 'domain' AND LOWER(e."from") LIKE '%@' || LOWER(tov.pattern))
                )
  LEFT JOIN email_analyses ea ON ea."emailId" = e.id
  WHERE tov.action IN ('always-important','always-review-later','always-customer-vip')
  ORDER BY ea."processedAt" DESC NULLS LAST
  LIMIT 15;
`);

// ───── T7 hypothesis: any recent email has non-empty aiLabels? ─────
await q('T7 — emails with non-empty aiLabels (last 24h)', `
  SELECT COUNT(*) AS n
  FROM emails
  WHERE "aiLabels" IS NOT NULL
    AND array_length("aiLabels", 1) > 0
    AND "updatedAt" > NOW() - INTERVAL '24 hours';
`);

await q('T7 — emails where aiLabels changed since creation (updated>created)', `
  SELECT COUNT(*) AS candidates
  FROM emails e
  WHERE e."aiLabels" IS NOT NULL
    AND array_length(e."aiLabels", 1) > 0
    AND e."updatedAt" > e."createdAt" + INTERVAL '1 minute';
`);

// ───── T3/T7: data flow check — feedback service is wired but table empty. verify table write permissions via insert test (read-only: just check if there are rows from ANY timeframe) ─────
await q('T7 — feedback total rows (any time)', `
  SELECT COUNT(*) AS n, MIN("createdAt") AS first, MAX("createdAt") AS last
  FROM email_triage_feedback;
`);

// ───── Test 6 pre-check: super-admin + admin users (so user knows who to log in as) ─────
await q('T6 — users by role + email domain', `
  SELECT role,
         regexp_replace(email, '^([^@]).*@', '\\1***@') AS email_masked,
         "tenantId"
  FROM users
  ORDER BY role, email
  LIMIT 20;
`);

// ───── Triage runs on emails in last 24h — was there any muting override in play? ─────
await q('T4 — pattern→matches: github notifications (the muting evidence)', `
  SELECT tov.pattern, tov.action, COUNT(DISTINCT e.id) AS muted_emails
  FROM triage_overrides tov
  LEFT JOIN emails e ON e."tenantId" = tov."tenantId"
                     AND tov.type = 'sender'
                     AND LOWER(e."from") LIKE '%' || LOWER(tov.pattern) || '%'
                     AND e."createdAt" > NOW() - INTERVAL '7 days'
  WHERE tov.action IN ('always-system-alert','never-follow-up')
  GROUP BY tov.pattern, tov.action;
`);

// ───── Recent triage activity summary ─────
await q('META — last-5 triage events in prod', `
  SELECT e.id AS email_id, e."from", e."aiLane", ea."triageSource", ea."modelUsed", ea."processedAt"
  FROM email_analyses ea
  JOIN emails e ON e.id = ea."emailId"
  ORDER BY ea."processedAt" DESC NULLS LAST
  LIMIT 5;
`);

await c.end();
