/**
 * Memory Profiler Script
 *
 * Profiles memory usage during NestJS startup to identify heavy modules.
 * Run: npx dotenv -e .env -- npx ts-node scripts/profile-memory.ts
 */

import 'dotenv/config';

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

function getMemoryUsage(): { heapUsed: number; heapTotal: number; rss: number; external: number } {
  const mem = process.memoryUsage();
  return {
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    rss: mem.rss,
    external: mem.external,
  };
}

function logMemory(label: string): void {
  const mem = getMemoryUsage();
  console.log(`[${label}] Heap: ${formatBytes(mem.heapUsed)} / ${formatBytes(mem.heapTotal)} | RSS: ${formatBytes(mem.rss)} | External: ${formatBytes(mem.external)}`);
}

async function profileModule(name: string, importFn: () => Promise<unknown>): Promise<{ name: string; delta: number }> {
  const before = getMemoryUsage();
  await importFn();
  // Force GC if available
  if (global.gc) {
    global.gc();
  }
  const after = getMemoryUsage();
  const delta = after.heapUsed - before.heapUsed;
  console.log(`  ${name}: ${delta > 0 ? '+' : ''}${formatBytes(delta)}`);
  return { name, delta };
}

async function main() {
  console.log('\n🔍 Memory Profiler - Identifying Heavy Modules\n');
  console.log('='.repeat(60));

  logMemory('BASELINE');

  const results: { name: string; delta: number }[] = [];

  console.log('\n📦 Testing Individual Heavy Packages:\n');

  // Test googleapis (known to be huge)
  results.push(await profileModule('googleapis', async () => {
    const { google } = await import('googleapis');
    return google;
  }));
  logMemory('After googleapis');

  // Test @google/generative-ai
  results.push(await profileModule('@google/generative-ai', async () => {
    return await import('@google/generative-ai');
  }));

  // Test @anthropic-ai/sdk
  results.push(await profileModule('@anthropic-ai/sdk', async () => {
    return await import('@anthropic-ai/sdk');
  }));

  // Test @mistralai/mistralai
  results.push(await profileModule('@mistralai/mistralai', async () => {
    return await import('@mistralai/mistralai');
  }));

  // Test ai (Vercel AI SDK)
  results.push(await profileModule('ai', async () => {
    return await import('ai');
  }));

  // Test @voltagent/core
  results.push(await profileModule('@voltagent/core', async () => {
    return await import('@voltagent/core');
  }));

  // Test bullmq
  results.push(await profileModule('bullmq', async () => {
    return await import('bullmq');
  }));

  // Test ioredis
  results.push(await profileModule('ioredis', async () => {
    return await import('ioredis');
  }));

  // Test jsdom
  results.push(await profileModule('jsdom', async () => {
    return await import('jsdom');
  }));

  // Test chrono-node
  results.push(await profileModule('chrono-node', async () => {
    return await import('chrono-node');
  }));

  // Test @aws-sdk/client-s3
  results.push(await profileModule('@aws-sdk/client-s3', async () => {
    return await import('@aws-sdk/client-s3');
  }));

  // Test @prisma/client
  results.push(await profileModule('@prisma/client', async () => {
    return await import('@prisma/client');
  }));

  logMemory('After all imports');

  // Sort by memory impact
  console.log('\n📊 Memory Impact Ranking:\n');
  results
    .sort((a, b) => b.delta - a.delta)
    .forEach((r, i) => {
      const bar = '█'.repeat(Math.max(1, Math.round(r.delta / (1024 * 1024) / 5)));
      console.log(`${i + 1}. ${r.name.padEnd(25)} ${formatBytes(r.delta).padStart(12)} ${bar}`);
    });

  const totalDelta = results.reduce((sum, r) => sum + r.delta, 0);
  console.log(`\n📈 Total from tested packages: ${formatBytes(totalDelta)}`);

  logMemory('\nFINAL');

  console.log('\n💡 Recommendations:');
  const topHogs = results.filter(r => r.delta > 50 * 1024 * 1024);
  if (topHogs.length > 0) {
    console.log('   Heavy packages (>50MB):');
    topHogs.forEach(r => console.log(`   - ${r.name}: Consider lazy loading or removing`));
  }

  console.log('\n✅ Profiling complete');
}

main().catch(console.error);
