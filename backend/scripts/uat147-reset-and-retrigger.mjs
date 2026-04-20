import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_PUBLIC_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const EMAIL_ID = 'cmo6lq52108d901oti8vza1qj';

const r = await c.query(
  `UPDATE emails SET "isAutoTriaged" = false, "autoTriagedAt" = NULL WHERE id = $1 RETURNING id, "isAutoTriaged", "receivedAt", "aiLane", "aiLabels"`,
  [EMAIL_ID],
);
console.log('RESET_EMAIL_ROWS=', r.rowCount);
console.log(JSON.stringify(r.rows, null, 2));

const r2 = await c.query(
  `UPDATE email_analyses SET "triageSource" = NULL, lane = NULL, "modelUsed" = NULL WHERE "emailId" = $1 RETURNING "emailId", "triageSource", lane, "modelUsed"`,
  [EMAIL_ID],
);
console.log('RESET_ANALYSIS_ROWS=', r2.rowCount);
console.log(JSON.stringify(r2.rows, null, 2));

await c.end();
