import pg from 'pg';
const url = process.env.DATABASE_PUBLIC_URL;
if (!url) { console.error('NO DB URL'); process.exit(1); }
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await c.connect();
  const r = await c.query("SELECT migration_name, finished_at IS NOT NULL AS applied, finished_at FROM _prisma_migrations WHERE migration_name LIKE '%147%' ORDER BY started_at;");
  console.log('MIG_ROWS=' + r.rowCount);
  console.log(JSON.stringify(r.rows, null, 2));
  const r2 = await c.query("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE (table_name='email_analyses' AND column_name='triageSource') OR (table_name='email_triage_feedback' AND column_name='signal') ORDER BY table_name, column_name;");
  console.log('COL_ROWS=' + r2.rowCount);
  console.log(JSON.stringify(r2.rows, null, 2));
  const r3 = await c.query("SELECT indexname FROM pg_indexes WHERE tablename='email_triage_feedback' AND indexname LIKE '%signal%';");
  console.log('IDX_ROWS=' + r3.rowCount);
  console.log(JSON.stringify(r3.rows, null, 2));
} catch (e) {
  console.error('ERR: ' + String(e).slice(0, 500));
  process.exit(1);
} finally {
  await c.end();
}
