/**
 * Clear ALL semantic cache data from Redis
 *
 * Run after removing SemanticCacheService to ensure no cached data remains.
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

  console.log('=== CLEAR ALL SEMANTIC CACHE ===\n');

  // Find all semantic cache keys
  const cacheKeys = await redis.keys('voltagent:metrics:semantic_cache:*');
  console.log(`Found ${cacheKeys.length} semantic cache key(s)`);

  if (cacheKeys.length > 0) {
    for (const key of cacheKeys) {
      console.log(`  Deleting: ${key}`);
      await redis.del(key);
    }
    console.log(`\n✅ Deleted ${cacheKeys.length} semantic cache key(s)`);
  } else {
    console.log('\n✅ No semantic cache keys found');
  }

  console.log('\n=== CLEAR COMPLETE ===');
  await redis.quit();
}

main().catch(console.error);
