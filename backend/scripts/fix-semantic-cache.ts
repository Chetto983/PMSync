/**
 * Fix corrupted semantic cache entries
 *
 * Removes entries containing hallucinated Italian test content
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

  console.log('=== FIX SEMANTIC CACHE ===\n');

  const davidesTenantId = 'cmjgylxkg000054yhnjpkmzd9';
  const cacheKey = `voltagent:metrics:semantic_cache:${davidesTenantId}`;

  const italianPatterns = ['Mario Rossi', 'Laura Bianchi', 'Luca Verdi', 'Sofia Neri', 'azienda.com', 'partner.com', 'cliente.com', 'fornitore.com'];

  // Read current cache
  const value = await redis.get(cacheKey);
  if (!value) {
    console.log('No cache found for Davide\'s tenant');
    await redis.quit();
    return;
  }

  const entries = JSON.parse(value);
  console.log(`Current entries: ${entries.length}`);

  // Filter out entries with Italian test patterns
  const cleanEntries = entries.filter((entry: any) => {
    const response = entry.response || '';
    const query = entry.queryText || '';

    for (const pattern of italianPatterns) {
      if (response.includes(pattern) || query.includes(pattern)) {
        console.log(`  ❌ Removing entry with "${pattern}" in ${query.substring(0, 50)}...`);
        return false;
      }
    }
    return true;
  });

  console.log(`\nClean entries: ${cleanEntries.length}`);
  console.log(`Removed: ${entries.length - cleanEntries.length}`);

  // Save cleaned cache
  if (cleanEntries.length !== entries.length) {
    await redis.set(cacheKey, JSON.stringify(cleanEntries));
    console.log('\n✅ Cache cleaned!');
  } else {
    console.log('\n✅ No entries to remove');
  }

  // Also clear analytics cache
  const analyticsKey = `voltagent:metrics:semantic_cache:analytics:${davidesTenantId}`;
  const analyticsValue = await redis.get(analyticsKey);
  if (analyticsValue) {
    const analytics = JSON.parse(analyticsValue);
    for (const pattern of italianPatterns) {
      if (analyticsValue.includes(pattern)) {
        console.log(`  ❌ Analytics cache contains ${pattern}`);
        await redis.del(analyticsKey);
        console.log('  ✅ Analytics cache cleared');
        break;
      }
    }
  }

  console.log('\n=== FIX COMPLETE ===');
  await redis.quit();
}

main().catch(console.error);
