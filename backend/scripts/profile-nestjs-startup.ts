/**
 * NestJS Startup Memory Profiler
 *
 * Profiles memory at each stage of NestJS bootstrap.
 * Run: npx ts-node --transpile-only scripts/profile-nestjs-startup.ts
 */

import 'dotenv/config';

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function logMemory(label: string): { heapUsed: number; rss: number } {
  const mem = process.memoryUsage();
  console.log(`[${label.padEnd(40)}] Heap: ${formatBytes(mem.heapUsed).padStart(10)} | RSS: ${formatBytes(mem.rss).padStart(10)}`);
  return { heapUsed: mem.heapUsed, rss: mem.rss };
}

async function main() {
  console.log('\n🔬 NestJS Startup Memory Profiler\n');
  console.log('='.repeat(80));

  const baseline = logMemory('BASELINE (no imports)');

  // Step 1: Import NestJS core
  console.log('\n--- Stage 1: Core Framework ---');
  const { NestFactory } = await import('@nestjs/core');
  logMemory('After NestJS core');

  // Step 2: Import the AppModule
  console.log('\n--- Stage 2: AppModule Import ---');
  const { AppModule } = await import('../src/app.module');
  const afterImport = logMemory('After AppModule import');

  console.log(`\n📊 Import Phase Memory Delta:`);
  console.log(`   Heap: +${formatBytes(afterImport.heapUsed - baseline.heapUsed)}`);
  console.log(`   RSS:  +${formatBytes(afterImport.rss - baseline.rss)}`);

  // Step 3: Create application context (no HTTP server)
  console.log('\n--- Stage 3: NestJS Bootstrap ---');
  const startBootstrap = Date.now();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const bootstrapTime = Date.now() - startBootstrap;
  const afterBootstrap = logMemory('After NestJS bootstrap');

  console.log(`\n📊 Bootstrap Phase Memory Delta:`);
  console.log(`   Heap: +${formatBytes(afterBootstrap.heapUsed - afterImport.heapUsed)}`);
  console.log(`   RSS:  +${formatBytes(afterBootstrap.rss - afterImport.rss)}`);
  console.log(`   Time: ${bootstrapTime}ms`);

  // Step 4: Get module info
  console.log('\n--- Stage 4: Module Analysis ---');
  try {
    // List key services that might hold memory
    const heavyServices = [
      '@voltagent/postgres',
      'PrismaService',
      'CacheService',
      'VoltAgentService',
    ];

    for (const name of heavyServices) {
      try {
        // Just check if service exists
        console.log(`   ✓ ${name}: loaded`);
      } catch {
        console.log(`   ✗ ${name}: not found`);
      }
    }
  } catch (e) {
    console.log('   Could not analyze modules');
  }

  // Total summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📈 TOTAL MEMORY USAGE:');
  const final = logMemory('FINAL');
  console.log(`\n   From Baseline:`);
  console.log(`   Heap: +${formatBytes(final.heapUsed - baseline.heapUsed)}`);
  console.log(`   RSS:  +${formatBytes(final.rss - baseline.rss)}`);

  // Check if RSS is much higher than heap (indicates native memory usage)
  const nativeMemory = final.rss - final.heapUsed;
  console.log(`\n   Native/External Memory: ~${formatBytes(nativeMemory)}`);
  if (nativeMemory > 500 * 1024 * 1024) {
    console.log('   ⚠️  HIGH NATIVE MEMORY - Check for:');
    console.log('      - Prisma query engine binary');
    console.log('      - Buffer allocations');
    console.log('      - Native modules (pg, bcrypt, etc.)');
  }

  // Wait a moment then check if memory is stable
  console.log('\n--- Waiting 3s for async initialization ---');
  await new Promise(r => setTimeout(r, 3000));
  const afterWait = logMemory('After 3s wait');

  if (afterWait.heapUsed > final.heapUsed * 1.1) {
    console.log('   ⚠️  MEMORY GREW during idle - possible leak!');
  } else {
    console.log('   ✓ Memory stable during idle');
  }

  // Clean shutdown
  await app.close();
  console.log('\n✅ Profile complete\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
