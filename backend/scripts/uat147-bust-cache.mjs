import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_PUBLIC_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const EMAIL_ID = 'cmo6lq52108d901oti8vza1qj';

// Bust the 24h cache by setting processedAt to epoch. Keep all other analysis data.
const r = await c.query(
  `UPDATE email_analyses SET "processedAt" = 'epoch' WHERE "emailId" = $1 RETURNING "emailId", "processedAt", "triageSource", lane`,
  [EMAIL_ID],
);
console.log('CACHE_BUSTED=', r.rowCount);
console.log(JSON.stringify(r.rows, null, 2));

// Verify email still eligible
const r2 = await c.query(
  `SELECT id, "from", "isAutoTriaged", "receivedAt", folder, "isDeleted", "isDraft" FROM emails WHERE id = $1`,
  [EMAIL_ID],
);
console.log('EMAIL_STATE=');
console.log(JSON.stringify(r2.rows, null, 2));

await c.end();
