const { Client } = require('pg');

async function main() {
  const c = new Client(process.env.DATABASE_URL);
  await c.connect();
  try {
    const r1 = await c.query('ALTER TABLE emails ALTER COLUMN "sentAt" DROP NOT NULL');
    console.log('sentAt:', r1.command);

    const r2 = await c.query('ALTER TABLE telegram_settings ADD COLUMN IF NOT EXISTS "aiConversationId" TEXT');
    console.log('addCol:', r2.command);

    // Use DO block to conditionally add FK
    const r3 = await c.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'telegram_settings_aiConversationId_fkey'
        ) THEN
          ALTER TABLE telegram_settings
            ADD CONSTRAINT "telegram_settings_aiConversationId_fkey"
            FOREIGN KEY ("aiConversationId") REFERENCES ai_conversations(id)
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
    console.log('fk:', r3.command);

    // Mark migrations as applied in _prisma_migrations
    const r4 = await c.query(`
      INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count)
      SELECT gen_random_uuid(), 'manual', '20260319162100_make_email_sentat_nullable', now(), 1
      WHERE NOT EXISTS (
        SELECT 1 FROM _prisma_migrations
        WHERE migration_name = '20260319162100_make_email_sentat_nullable'
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
      )
    `);
    console.log('mark sentAt migration:', r4.rowCount, 'rows');

    const r5 = await c.query(`
      INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count)
      SELECT gen_random_uuid(), 'manual', '20260320180000_add_telegram_chat_conversation', now(), 1
      WHERE NOT EXISTS (
        SELECT 1 FROM _prisma_migrations
        WHERE migration_name = '20260320180000_add_telegram_chat_conversation'
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
      )
    `);
    console.log('mark telegram migration:', r5.rowCount, 'rows');

    console.log('ALL DONE');
  } finally {
    await c.end();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
