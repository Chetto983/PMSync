const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    const settings = await p.$queryRawUnsafe("SELECT name, setting, unit FROM pg_settings WHERE name IN ('shared_buffers','work_mem','effective_cache_size','max_connections','random_page_cost','maintenance_work_mem','wal_buffers','checkpoint_completion_target','max_wal_size','effective_io_concurrency') ORDER BY name");
    console.log('SETTINGS:', JSON.stringify(settings));

    const size = await p.$queryRawUnsafe("SELECT pg_size_pretty(pg_database_size(current_database())) as db_size");
    console.log('DB_SIZE:', JSON.stringify(size));

    const tables = await p.$queryRawUnsafe("SELECT relname, n_live_tup::text, n_dead_tup::text FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 15");
    console.log('TABLES:', JSON.stringify(tables));

    const indexes = await p.$queryRawUnsafe("SELECT schemaname, relname, indexrelname, idx_scan::text, idx_tup_read::text FROM pg_stat_user_indexes ORDER BY idx_scan ASC LIMIT 10");
    console.log('UNUSED_INDEXES:', JSON.stringify(indexes));

    const cache = await p.$queryRawUnsafe("SELECT sum(heap_blks_read)::text as read, sum(heap_blks_hit)::text as hit, CASE WHEN sum(heap_blks_hit) + sum(heap_blks_read) > 0 THEN round(sum(heap_blks_hit) * 100.0 / (sum(heap_blks_hit) + sum(heap_blks_read)), 2)::text ELSE '0' END as ratio FROM pg_statio_user_tables");
    console.log('CACHE_HIT:', JSON.stringify(cache));

    const bloat = await p.$queryRawUnsafe("SELECT relname, n_dead_tup::text, n_live_tup::text, CASE WHEN n_live_tup > 0 THEN round(n_dead_tup * 100.0 / n_live_tup, 2)::text ELSE '0' END as dead_pct FROM pg_stat_user_tables WHERE n_dead_tup > 100 ORDER BY n_dead_tup DESC LIMIT 10");
    console.log('BLOAT:', JSON.stringify(bloat));

    const connCount = await p.$queryRawUnsafe("SELECT count(*)::text as cnt, state FROM pg_stat_activity GROUP BY state ORDER BY cnt DESC");
    console.log('CONNECTIONS:', JSON.stringify(connCount));

    const longQueries = await p.$queryRawUnsafe("SELECT pid, state, query, extract(epoch from now() - query_start)::text as duration_sec FROM pg_stat_activity WHERE state != 'idle' AND query NOT LIKE '%pg_stat%' ORDER BY query_start ASC LIMIT 5");
    console.log('LONG_QUERIES:', JSON.stringify(longQueries));

    await p.$disconnect();
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
