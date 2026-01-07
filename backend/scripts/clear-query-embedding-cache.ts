/**
 * Clear ALL query embedding cache entries
 *
 * Run after GDPR update to remove old non-tenant-isolated cache entries.
 * New entries will be created with tenant isolation: qemb:{tenantId}:{hash}
 */
import 'dotenv/config';
import Redis from 'ioredis';
import { getConfiguration } from '../src/config/configuration';

async function main() {
  const config = getConfiguration();
  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
  });

  console.log('=== CLEAR QUERY EMBEDDING CACHE (GDPR Upgrade) ===\n');
  console.log('Removing old non-tenant-isolated cache entries...\n');

  // Find all query embedding cache keys (old format: qemb:{hash})
  const pattern = 'qemb:*';
  let cursor = '0';
  let deleted = 0;

  do {
    const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = result[0];
    const keys = result[1];

    if (keys.length > 0) {
      for (const key of keys) {
        console.log(`  Deleting: ${key}`);
        await redis.del(key);
        deleted++;
      }
    }
  } while (cursor !== '0');

  if (deleted > 0) {
    console.log(`\n✅ Deleted ${deleted} old cache entries`);
  } else {
    console.log('\n✅ No old cache entries found');
  }

  console.log('\nNew entries will be created with GDPR-compliant format: qemb:{tenantId}:{hash}');
  console.log('\n=== CLEAR COMPLETE ===');
  await redis.quit();
}

main().catch(console.error);
