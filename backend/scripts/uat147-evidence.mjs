import pg from 'pg';

const url = process.env.DATABASE_PUBLIC_URL;
if (!url) { console.error('NO DB URL'); process.exit(1); }
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

async function q(label, sql, params = []) {
  try {
    const r = await c.query(sql, params);
    console.log('===', label, '===', 'rows=', r.rowCount);
    console.log(JSON.stringify(r.rows, null, 2));
  } catch (e) {
    console.log('=== ERR', label, '===', String(e).slice(0, 300));
  }
  console.log('');
}

// ────────────────────────── TEST 7: Auto-diff evidence ──────────────────────────
await q('T7 — feedback counts by signal (all time)', `
  SELECT signal, COUNT(*) AS n
  FROM email_triage_feedback
  GROUP BY signal ORDER BY signal;
`);

await q('T7 — feedback counts by signal (last 7d)', `
  SELECT signal, COUNT(*) AS n
  FROM email_triage_feedback
  WHERE "createdAt" > NOW() - INTERVAL '7 days'
  GROUP BY signal ORDER BY signal;
`);

await q('T7 — most recent 5 edit rows', `
  SELECT id, "tenantId", "emailId", signal, "oldValue", "newValue", reason, "createdAt"
  FROM email_triage_feedback
  WHERE signal = 'edit'
  ORDER BY "createdAt" DESC LIMIT 5;
`);

await q('T7 — most recent 5 correction rows', `
  SELECT id, "tenantId", "emailId", signal, "oldValue", "newValue", reason, "createdAt"
  FROM email_triage_feedback
  WHERE signal = 'correction'
  ORDER BY "createdAt" DESC LIMIT 5;
`);

// ────────────────────────── TESTS 4 + 5: triageSource distribution ──────────────
await q('T4/T5 — triageSource distribution', `
  SELECT COALESCE("triageSource", '(null)') AS ts, COUNT(*) AS n
  FROM email_analyses
  GROUP BY "triageSource" ORDER BY n DESC;
`);

await q('T4/T5 — triageSource distribution (last 24h)', `
  SELECT COALESCE("triageSource", '(null)') AS ts, COUNT(*) AS n
  FROM email_analyses
  WHERE "processedAt" > NOW() - INTERVAL '24 hours'
  GROUP BY "triageSource" ORDER BY n DESC;
`);

// ────────────────────────── TriageOverride population ──────────────────────────
await q('OVR — override counts by action', `
  SELECT action, COUNT(*) AS n
  FROM triage_overrides
  WHERE "disabledAt" IS NULL
  GROUP BY action ORDER BY n DESC;
`);

await q('OVR — sample muting overrides', `
  SELECT id, "tenantId", scope, pattern, action, "createdAt"
  FROM triage_overrides
  WHERE action IN ('always-system-alert','never-follow-up')
    AND "disabledAt" IS NULL
  ORDER BY "createdAt" DESC LIMIT 5;
`);

await q('OVR — sample visible overrides', `
  SELECT id, "tenantId", scope, pattern, action, "createdAt"
  FROM triage_overrides
  WHERE action IN ('always-important','always-review-later','always-customer-vip')
    AND "disabledAt" IS NULL
  ORDER BY "createdAt" DESC LIMIT 5;
`);

// ────────────────────────── TEST 4: Muting short-circuit proof ──────────────────
await q('T4 — muting evidence: emails analyzed with triageSource=rule', `
  SELECT ea.id, ea."emailId", ea."triageSource", ea."modelUsed", ea.summary, ea."keyPoints", ea."suggestedActions",
         e."from", e."aiLane", e."aiLabels", e."isAutoTriaged"
  FROM email_analyses ea
  JOIN emails e ON e.id = ea."emailId"
  WHERE ea."triageSource" = 'rule'
  ORDER BY ea."processedAt" DESC NULLS LAST
  LIMIT 5;
`);

// ────────────────────────── TEST 5: Visible override proof ──────────────────────
await q('T5 — visible evidence: triageSource=llm+rule', `
  SELECT ea.id, ea."emailId", ea."triageSource", ea."modelUsed", ea.lane,
         e."from", e."aiLane", e."aiLabels"
  FROM email_analyses ea
  JOIN emails e ON e.id = ea."emailId"
  WHERE ea."triageSource" = 'llm+rule'
  ORDER BY ea."processedAt" DESC NULLS LAST
  LIMIT 5;
`);

// ────────────────────────── Correlate visible override → forced lane ───────────
await q('T5 — visible override + resulting lane (for correlation)', `
  SELECT tov.pattern, tov.action, e.id AS email_id, e."from", e."aiLane",
         ea."triageSource", ea."processedAt"
  FROM triage_overrides tov
  JOIN emails e ON e."tenantId" = tov."tenantId"
                AND (
                  (tov.scope = 'sender' AND LOWER(e."from") = LOWER(tov.pattern))
                  OR (tov.scope = 'domain' AND LOWER(e."from") LIKE '%@' || LOWER(tov.pattern))
                )
  LEFT JOIN email_analyses ea ON ea."emailId" = e.id
  WHERE tov.action IN ('always-important','always-review-later','always-customer-vip')
    AND tov."disabledAt" IS NULL
    AND e."processedAt" IS NOT NULL
  ORDER BY e."processedAt" DESC
  LIMIT 10;
`);

// ────────────────────────── Tenants that have any phase-147 activity ───────────
await q('META — tenants with feedback activity', `
  SELECT "tenantId", signal, COUNT(*) AS n
  FROM email_triage_feedback
  GROUP BY "tenantId", signal
  ORDER BY "tenantId", signal;
`);

await q('META — users by role (for Test 6 RBAC check)', `
  SELECT role, COUNT(*) AS n
  FROM users
  GROUP BY role ORDER BY n DESC;
`);

// ────────────────────────── TEST 3: Few-shot examples data availability ────────
await q('T3 — senders with correction rows (last 30d) — feed for <CORRECTIONS>', `
  SELECT "tenantId",
         split_part(
           COALESCE(
             (SELECT e."from" FROM emails e WHERE e.id = f."emailId" LIMIT 1),
             '(unknown)'
           ), '@', 2) AS domain,
         COUNT(*) AS corrections
  FROM email_triage_feedback f
  WHERE signal = 'correction'
    AND "createdAt" > NOW() - INTERVAL '30 days'
  GROUP BY "tenantId", domain
  ORDER BY corrections DESC
  LIMIT 10;
`);

await c.end();
