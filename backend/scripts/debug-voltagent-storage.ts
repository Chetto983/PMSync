import * as dotenv from 'dotenv';
import * as path from 'path';
import Redis from 'ioredis';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { getConfiguration } from '../src/config/configuration';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

interface JsonColumn {
  table_name: string;
  column_name: string;
  data_type: 'json' | 'jsonb';
}

interface TableStat {
  table_name: string;
  live_rows: string | number | bigint | null;
}

interface TenantColumn {
  table_name: string;
  column_name: string;
}

interface CitusPartition {
  table_name: string;
  partmethod: string | null;
  partkey: string | null;
}

function normalizeTableName(raw: string): string {
  const cleaned = raw.replace(/"/g, '');
  const parts = cleaned.split('.');
  return parts.length > 1 ? parts[1] : cleaned;
}

function formatCount(value: unknown): string {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'number') {
    return Math.trunc(value).toString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return '0';
}

async function main() {
  const prisma = createPrismaClient();
  console.log('=== VOLTAGENT STORAGE AUDIT ===');
  console.log(`Time: ${new Date().toISOString()}`);

  const jsonColumns = await prisma.$queryRaw<JsonColumn[]>`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('json', 'jsonb')
    ORDER BY table_name, column_name
  `;

  const tableStats = await prisma.$queryRaw<TableStat[]>`
    SELECT relname AS table_name, n_live_tup::bigint AS live_rows
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
  `;

  const statsByTable = new Map<string, string>();
  for (const stat of tableStats) {
    statsByTable.set(stat.table_name, formatCount(stat.live_rows));
  }

  console.log('\n=== JSON/JSONB COLUMNS BY TABLE ===');
  if (jsonColumns.length === 0) {
    console.log('No JSON/JSONB columns found.');
  } else {
    const grouped = new Map<string, JsonColumn[]>();
    for (const col of jsonColumns) {
      if (!grouped.has(col.table_name)) {
        grouped.set(col.table_name, []);
      }
      grouped.get(col.table_name)?.push(col);
    }

    for (const [table, cols] of grouped) {
      const rowCount = statsByTable.get(table) ?? '0';
      const columnList = cols.map(col => `${col.column_name} (${col.data_type})`).join(', ');
      console.log(`- ${table} [rows=${rowCount}]`);
      console.log(`  ${columnList}`);
    }
  }

  const voltagentTables = [
    'voltagent_memory_conversations',
    'voltagent_memory_messages',
    'voltagent_memory_steps',
    'voltagent_memory_users',
    'voltagent_memory_workflow_states',
  ];

  console.log('\n=== VOLTAGENT MEMORY TABLES ===');
  for (const table of voltagentTables) {
    const rowCount = statsByTable.get(table) ?? '0';
    const columns = jsonColumns
      .filter(col => col.table_name === table)
      .map(col => col.column_name)
      .join(', ');
    console.log(`- ${table} [rows=${rowCount}] json_columns=${columns || 'none'}`);
  }

  const tenantColumns = await prisma.$queryRaw<TenantColumn[]>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('tenantId', 'tenant_id')
  `;

  const tenantTables = new Set(tenantColumns.map(col => col.table_name));
  console.log(`\nTenant-scoped tables detected: ${tenantTables.size}`);

  const citusInstalled = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'citus') AS exists
  `;

  console.log('\n=== CITUS DISTRIBUTION ===');
  if (citusInstalled[0]?.exists) {
    const distRows = await prisma.$queryRaw<CitusPartition[]>`
      SELECT logicalrelid::text AS table_name,
             partmethod::text AS partmethod,
             partkey::text AS partkey
      FROM pg_dist_partition
    `;

    const distributed = new Map<string, CitusPartition>();
    for (const row of distRows) {
      distributed.set(normalizeTableName(row.table_name), row);
    }

    const missingDistribution = [...tenantTables].filter(table => !distributed.has(table));
    console.log(`Distributed tables: ${distributed.size}`);
    if (missingDistribution.length > 0) {
      console.log('Missing distribution for tenant-scoped tables:');
      missingDistribution.forEach(table => console.log(`- ${table}`));
    } else {
      console.log('All tenant-scoped tables appear distributed.');
    }
  } else {
    console.log('Citus extension not detected; distribution audit skipped.');
  }

  console.log('\n=== REDIS KEYSPACE (SAFE SUMMARY) ===');
  let redis: Redis | null = null;
  try {
    const config = getConfiguration();
    redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
    });

    const keys = await redis.keys('*');
    console.log(`Total Redis keys: ${keys.length}`);

    const prefixes = new Map<string, number>();
    for (const key of keys) {
      const prefix = key.split(':').slice(0, 2).join(':');
      prefixes.set(prefix, (prefixes.get(prefix) ?? 0) + 1);
    }

    const sorted = [...prefixes.entries()].sort((a, b) => b[1] - a[1]);
    for (const [prefix, count] of sorted.slice(0, 20)) {
      console.log(`- ${prefix}: ${count}`);
    }
  } catch (error) {
    console.log(`Redis audit skipped: ${(error as Error).message}`);
  } finally {
    if (redis) {
      await redis.quit();
    }
  }

  await prisma.$disconnect();
  console.log('\nAudit complete.');
}

main().catch((error) => {
  console.error('Audit failed:', error);
  process.exitCode = 1;
});
