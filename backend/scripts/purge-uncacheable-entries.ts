/**
 * Purge Uncacheable Category Entries from Semantic Cache
 *
 * This script removes ALL entries that belong to categories that should
 * never have been cached (email_search, calendar, insights, compose).
 *
 * Run after deploying the semantic-cache.service.ts fix to clean up
 * any previously cached user-specific data.
 */
import 'dotenv/config';
import Redis from 'ioredis';
import { getConfiguration } from '../src/config/configuration';

// Uncacheable categories - matches UNCACHEABLE_CATEGORIES in semantic-cache.service.ts
const UNCACHEABLE_CATEGORIES = new Set(['email_search', 'calendar', 'insights', 'compose']);

// Category patterns for classification (copied from semantic-cache.service.ts - English + Italian)
const CATEGORY_PATTERNS: Array<{ category: string; patterns: RegExp[] }> = [
  {
    category: 'greeting',
    patterns: [
      // English
      /^(hi|hello|hey|good\s*(morning|afternoon|evening))/i,
      /^(who\s+am\s+i|what('s|\s+is)\s+my\s+name|what\s+time)/i,
      /^(what('s|\s+is)\s+today|what\s+day)/i,
      // Italian
      /^(ciao|buongiorno|buonasera|salve|buonanotte)/i,
      /^(chi\s+sono|come\s+mi\s+chiamo)/i,
    ],
  },
  {
    category: 'email_search',
    patterns: [
      // English
      /\b(search|find|look\s+for|show\s+me)\b.*\b(email|message|mail)/i,
      /\b(email|message|mail)s?\s+(from|to|about|containing)/i,
      /\bunread\s+(email|message|mail)/i,
      // Italian - CRITICAL: match "mail", "email", "posta", "messaggio"
      /\b(cerca|trova|mostrami|fammi vedere)\b.*\b(email|mail|posta|messaggio|messagi)/i,
      /\b(email|mail|posta|messaggi?)\s+(da|a|di|su|riguardo)/i,
      /\b(non lette?|da leggere)\s+(email|mail|posta)/i,
      /\b(email|mail|posta)\s+(non lette?|da leggere|important[ei])/i,
      // Generic Italian mail queries
      /\b(ho\s+|hai\s+)?.*\b(mail|email)\b/i,
      /\b(delle|le|mie)\s+(mail|email)/i,
    ],
  },
  {
    category: 'calendar',
    patterns: [
      // English
      /\b(calendar|event|meeting|appointment|schedule)/i,
      /\b(what('s|\s+is)\s+on\s+my\s+calendar)/i,
      /\b(free|busy|available)\s+.*(today|tomorrow|this\s+week)/i,
      // Italian
      /\b(calendario|evento|riunione|appuntamento|agenda)/i,
      /\b(cosa\s+ho|che\s+ho)\s+(oggi|domani|questa\s+settimana)/i,
      /\b(libero|occupato|disponibile)\s+.*(oggi|domani)/i,
    ],
  },
  {
    category: 'insights',
    patterns: [
      // English
      /\b(summarize|summary|analyze|sentiment|priority|categorize)/i,
      /\b(extract\s+action|action\s+items|to-?do)/i,
      /\b(what\s+should\s+I|prioritize)/i,
      // Italian
      /\b(riassumi|riassunto|analizza|sentimento|priorit[àa]|categorizza)/i,
      /\b(estrai\s+azioni|cose\s+da\s+fare)/i,
      /\b(cosa\s+devo|dai\s+priorit[àa])/i,
    ],
  },
  {
    category: 'compose',
    patterns: [
      // English
      /\b(compose|write|draft|send|reply|forward)\s+.*(email|message|mail)/i,
      /\b(email|message|mail)\s+(about|regarding|for)/i,
      /\bwrite\s+a?\s*(response|reply)/i,
      // Italian
      /\b(componi|scrivi|bozza|invia|rispondi|inoltra)\s+.*(email|mail|messaggio)/i,
      /\b(email|mail|messaggio)\s+(su|riguardo|per)/i,
      /\bscrivi\s+.*(risposta|messaggio)/i,
    ],
  },
];

function classifyQuery(query: string): string {
  const normalizedQuery = query.toLowerCase().trim();
  for (const { category, patterns } of CATEGORY_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(normalizedQuery))) {
      return category;
    }
  }
  return 'general';
}

async function main() {
  const config = getConfiguration();
  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
  });

  console.log('=== PURGE UNCACHEABLE ENTRIES ===\n');
  console.log('Categories that should NEVER be cached:');
  UNCACHEABLE_CATEGORIES.forEach((cat) => console.log(`  - ${cat}`));
  console.log('\n');

  // Find all semantic cache keys
  const keys = await redis.keys('voltagent:metrics:semantic_cache:*');
  const cacheKeys = keys.filter((k) => !k.includes(':analytics:'));

  console.log(`Found ${cacheKeys.length} tenant cache(s)\n`);

  let totalRemoved = 0;
  let totalKept = 0;

  for (const cacheKey of cacheKeys) {
    const tenantId = cacheKey.replace('voltagent:metrics:semantic_cache:', '');
    const value = await redis.get(cacheKey);

    if (!value) continue;

    const entries = JSON.parse(value);
    console.log(`\nTenant ${tenantId}:`);
    console.log(`  Current entries: ${entries.length}`);

    // Filter out uncacheable entries
    const cleanEntries = entries.filter((entry: any) => {
      const query = entry.queryText || '';
      const storedCategory = entry.category || classifyQuery(query);

      if (UNCACHEABLE_CATEGORIES.has(storedCategory)) {
        console.log(`    ❌ REMOVING [${storedCategory}]: "${query.substring(0, 60)}..."`);
        return false;
      }

      // Double-check by re-classifying in case category was stored incorrectly
      const actualCategory = classifyQuery(query);
      if (UNCACHEABLE_CATEGORIES.has(actualCategory)) {
        console.log(`    ❌ REMOVING [${actualCategory}]: "${query.substring(0, 60)}..."`);
        return false;
      }

      console.log(`    ✅ KEEPING [${storedCategory}]: "${query.substring(0, 60)}..."`);
      return true;
    });

    const removed = entries.length - cleanEntries.length;
    totalRemoved += removed;
    totalKept += cleanEntries.length;

    if (removed > 0) {
      await redis.set(cacheKey, JSON.stringify(cleanEntries));
      console.log(`  Removed: ${removed}, Remaining: ${cleanEntries.length}`);
    } else {
      console.log(`  No uncacheable entries found`);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total removed: ${totalRemoved}`);
  console.log(`Total kept: ${totalKept}`);
  console.log('\n=== PURGE COMPLETE ===');

  await redis.quit();
}

main().catch(console.error);
