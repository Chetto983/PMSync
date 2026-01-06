/**
 * Check Redis cache for cross-tenant data leakage
 *
 * Looks for:
 * 1. Semantic cache entries
 * 2. Query embedding cache entries
 * 3. Any keys containing Italian test tenant content
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

  console.log('=== REDIS CACHE CROSS-TENANT AUDIT ===\n');

  // Get all keys
  const allKeys = await redis.keys('*');
  console.log(`Total Redis keys: ${allKeys.length}\n`);

  // Group keys by prefix
  const keysByPrefix: Record<string, string[]> = {};
  for (const key of allKeys) {
    const prefix = key.split(':').slice(0, 2).join(':');
    if (!keysByPrefix[prefix]) {
      keysByPrefix[prefix] = [];
    }
    keysByPrefix[prefix].push(key);
  }

  console.log('=== KEYS BY PREFIX ===');
  for (const [prefix, keys] of Object.entries(keysByPrefix)) {
    console.log(`  ${prefix}: ${keys.length} keys`);
    if (keys.length <= 5) {
      keys.forEach(k => console.log(`    - ${k}`));
    }
  }
  console.log('');

  // Check semantic cache specifically
  const semanticCacheKeys = allKeys.filter(k => k.includes('semantic_cache'));
  console.log(`=== SEMANTIC CACHE KEYS (${semanticCacheKeys.length}) ===`);
  for (const key of semanticCacheKeys) {
    console.log(`  ${key}`);
    try {
      const value = await redis.get(key);
      if (value) {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          console.log(`    Entries: ${parsed.length}`);
          if (parsed.length > 0 && parsed[0].response) {
            // Check if response contains Italian names
            const italianPatterns = ['Mario Rossi', 'Laura Bianchi', 'Luca Verdi', 'Sofia Neri', 'azienda.com', 'partner.com'];
            for (const pattern of italianPatterns) {
              const containsPattern = parsed.some((e: any) =>
                e.response?.includes(pattern) || e.queryText?.includes(pattern)
              );
              if (containsPattern) {
                console.log(`    ⚠️  CONTAINS ITALIAN TEST PATTERN: "${pattern}"`);
              }
            }
          }
        }
      }
    } catch (e) {
      console.log(`    Error reading: ${e}`);
    }
  }
  console.log('');

  // Check query embedding cache
  const qembKeys = allKeys.filter(k => k.startsWith('qemb:'));
  console.log(`=== QUERY EMBEDDING CACHE KEYS (${qembKeys.length}) ===`);
  if (qembKeys.length > 0) {
    console.log('  (First 10 keys)');
    for (const key of qembKeys.slice(0, 10)) {
      console.log(`  ${key}`);
    }
    console.log(`  ... and ${Math.max(0, qembKeys.length - 10)} more`);
  }
  console.log('');

  // Check for any keys containing test tenant ID
  const testTenantId = 'cmk2x2zwj0000s4yh5nlq8izj';
  const davidesTenantId = 'cmjgylxkg000054yhnjpkmzd9';

  const testTenantKeys = allKeys.filter(k => k.includes(testTenantId));
  const davidesKeys = allKeys.filter(k => k.includes(davidesTenantId));

  console.log(`=== KEYS BY TENANT ===`);
  console.log(`  Italian RAG Test (${testTenantId}): ${testTenantKeys.length} keys`);
  console.log(`  Davide's Workspace (${davidesTenantId}): ${davidesKeys.length} keys`);

  // Check if any Davide's keys contain Italian test content
  console.log('\n=== CHECKING DAVIDE\'S CACHE FOR ITALIAN TEST CONTENT ===');
  for (const key of davidesKeys.slice(0, 20)) {
    try {
      const value = await redis.get(key);
      if (value) {
        const italianPatterns = ['Mario Rossi', 'Laura Bianchi', 'Luca Verdi', 'Sofia Neri', 'azienda.com', 'partner.com'];
        for (const pattern of italianPatterns) {
          if (value.includes(pattern)) {
            console.log(`  ⚠️  KEY ${key} CONTAINS: "${pattern}"`);
            console.log(`      Value preview: ${value.substring(0, 200)}...`);
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  console.log('\n=== AUDIT COMPLETE ===');
  await redis.quit();
}

main().catch(console.error);
