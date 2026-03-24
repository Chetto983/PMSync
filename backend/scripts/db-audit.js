const { Client } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL.replace(
    'postgres.railway.internal:5432',
    'ballast.proxy.rlwy.net:39634',
  );
  const client = new Client({ connectionString: url, ssl: false });
  await client.connect();
  console.log('Connected');

  // 1. Most recent conversations
  const { rows: convos } = await client.query(`
    SELECT c.id, c.title, c."createdAt", c."updatedAt",
      (SELECT COUNT(*)::int FROM ai_messages m WHERE m."conversationId" = c.id) as msg_count
    FROM ai_conversations c
    ORDER BY c."updatedAt" DESC
    LIMIT 10
  `);

  console.log('\n=== RECENT CONVERSATIONS ===');
  for (const c of convos) {
    console.log(
      `${c.id} | msgs=${c.msg_count} | created=${c.createdAt.toISOString().slice(11,19)} | updated=${c.updatedAt.toISOString().slice(11,19)} | "${(c.title || '').slice(0,60)}"`
    );
  }

  // 2. Empty conversations created after cleanup
  const { rows: empty } = await client.query(`
    SELECT c.id, c."createdAt"
    FROM ai_conversations c
    WHERE NOT EXISTS (SELECT 1 FROM ai_messages m WHERE m."conversationId" = c.id)
    ORDER BY c."createdAt" DESC LIMIT 10
  `);
  console.log(`\n=== EMPTY CONVERSATIONS: ${empty.length} ===`);
  for (const c of empty) console.log(`  ${c.id} | ${c.createdAt.toISOString()}`);

  // 3. Duplicates (<5s apart)
  const { rows: dupes } = await client.query(`
    SELECT a.id as id_a, b.id as id_b,
      a."createdAt" as ca, b."createdAt" as cb,
      (SELECT COUNT(*)::int FROM ai_messages WHERE "conversationId" = a.id) as msgs_a,
      (SELECT COUNT(*)::int FROM ai_messages WHERE "conversationId" = b.id) as msgs_b
    FROM ai_conversations a
    JOIN ai_conversations b ON a."userId" = b."userId"
      AND a."tenantId" = b."tenantId"
      AND a.id < b.id
      AND ABS(EXTRACT(EPOCH FROM (a."createdAt" - b."createdAt"))) < 5
    WHERE a."createdAt" > NOW() - INTERVAL '1 hour'
    ORDER BY a."createdAt" DESC LIMIT 10
  `);
  console.log(`\n=== RECENT DUPLICATES (<5s, last hour): ${dupes.length} ===`);
  for (const d of dupes) {
    console.log(`  ${d.id_a}(${d.msgs_a}) <-> ${d.id_b}(${d.msgs_b}) | ${d.ca.toISOString().slice(11,23)} vs ${d.cb.toISOString().slice(11,23)}`);
  }

  // 4. Full message dump for the MOST RECENT conversation that has messages
  const recent = convos.find(c => c.msg_count > 0);
  if (recent) {
    const { rows: msgs } = await client.query(`
      SELECT id, role, LEFT(content::text, 200) as content_preview, "createdAt"
      FROM ai_messages WHERE "conversationId" = $1
      ORDER BY "createdAt" ASC LIMIT 30
    `, [recent.id]);
    console.log(`\n=== MESSAGES FOR MOST RECENT: ${recent.id} (${msgs.length}) ===`);
    for (const m of msgs) {
      console.log(`  ${m.role.padEnd(10)} | ${m.createdAt.toISOString().slice(11,23)} | ${m.content_preview}`);
    }
  }

  // 5. Check if the latest deploy has the fix — look for conversations created in last 10 min
  const { rows: veryRecent } = await client.query(`
    SELECT c.id, c."createdAt",
      (SELECT COUNT(*)::int FROM ai_messages m WHERE m."conversationId" = c.id) as msg_count
    FROM ai_conversations c
    WHERE c."createdAt" > NOW() - INTERVAL '10 minutes'
    ORDER BY c."createdAt" DESC
  `);
  console.log(`\n=== CONVERSATIONS CREATED IN LAST 10 MIN: ${veryRecent.length} ===`);
  for (const c of veryRecent) {
    console.log(`  ${c.id} | msgs=${c.msg_count} | ${c.createdAt.toISOString()}`);
  }

  await client.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
