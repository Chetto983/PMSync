const { Client } = require('pg');

async function main() {
  const c = new Client(process.env.DATABASE_URL || process.argv[2]);
  await c.connect();

  const r = await c.query(`
    SELECT id, "providerType", email, "isActive", "lastSyncedAt", "nextSyncAt", "errorStreak", metadata, "createdAt"
    FROM provider_configs ORDER BY "createdAt" DESC
  `);
  for (const row of r.rows) {
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
    console.log('Provider:', row.email, '| Type:', row.providerType, '| Active:', row.isActive);
    console.log('  lastSync:', row.lastSyncedAt, '| nextSync:', row.nextSyncAt, '| errors:', row.errorStreak);
    if (meta) console.log('  metadata:', JSON.stringify(meta, null, 2));
    console.log();
  }

  const r2 = await c.query(`
    SELECT "receivedAt"::date as day, COUNT(*)::int as cnt
    FROM emails WHERE "isDeleted" = false
    GROUP BY "receivedAt"::date
    ORDER BY day DESC LIMIT 15
  `);
  console.log('Emails per day:');
  console.table(r2.rows);

  const r3 = await c.query(`
    SELECT MIN("receivedAt") as earliest, MAX("receivedAt") as latest, COUNT(*)::int as total
    FROM emails WHERE "isDeleted" = false
  `);
  console.log('Date range:', r3.rows[0]);

  await c.end();
}

main().catch(console.error);
