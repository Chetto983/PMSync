const { createPrismaClient } = require('./prisma-client');
require('dotenv').config();

const prisma = createPrismaClient();

async function monitorSync() {
  console.clear();
  console.log('='.repeat(80));
  console.log('📊 MAIL AGENT - SYNC MONITORING DASHBOARD');
  console.log('='.repeat(80));
  console.log();

  try {
    // Providers summary
    const providers = await prisma.providerConfig.groupBy({
      by: ['providerType', 'isActive'],
      _count: true,
    });

    console.log('📧 PROVIDERS STATUS');
    console.log('-'.repeat(80));
    providers.forEach((p) => {
      const status = p.isActive ? '✅ Active' : '❌ Inactive';
      console.log(`  ${p.providerType.padEnd(15)} ${status.padEnd(15)} Count: ${p._count}`);
    });
    console.log();

    // Smart Sync Stats
    const priorityDist = await prisma.providerConfig.groupBy({
      by: ['syncPriority'],
      where: { isActive: true },
      _count: true,
    });

    console.log('🎯 SMART SYNC - PRIORITY DISTRIBUTION');
    console.log('-'.repeat(80));
    const priorityNames = {
      1: 'High (3min)',
      2: 'Medium-High (15min)',
      3: 'Medium (30min)',
      4: 'Low (2h)',
      5: 'Very Low (6h)',
    };
    priorityDist.forEach((p) => {
      const name = priorityNames[p.syncPriority] || 'Unknown';
      console.log(`  Priority ${p.syncPriority} - ${name.padEnd(25)} ${p._count} providers`);
    });
    console.log();

    // Activity Rate
    const avgActivity = await prisma.providerConfig.aggregate({
      where: { isActive: true },
      _avg: { avgActivityRate: true },
      _max: { avgActivityRate: true },
      _min: { avgActivityRate: true },
    });

    console.log('📈 ACTIVITY RATE (emails/hour)');
    console.log('-'.repeat(80));
    console.log(`  Average: ${(avgActivity._avg.avgActivityRate || 0).toFixed(2)}`);
    console.log(`  Max:     ${(avgActivity._max.avgActivityRate || 0).toFixed(2)}`);
    console.log(`  Min:     ${(avgActivity._min.avgActivityRate || 0).toFixed(2)}`);
    console.log();

    // Webhook subscriptions
    const webhooks = await prisma.webhookSubscription.groupBy({
      by: ['providerType', 'isActive'],
      _count: true,
    });

    console.log('🔔 WEBHOOK SUBSCRIPTIONS');
    console.log('-'.repeat(80));
    if (webhooks.length === 0) {
      console.log('  No webhook subscriptions yet');
    } else {
      webhooks.forEach((w) => {
        const status = w.isActive ? '✅ Active' : '❌ Inactive';
        console.log(`  ${w.providerType.padEnd(15)} ${status.padEnd(15)} Count: ${w._count}`);
      });
    }
    console.log();

    // Recent emails
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const emailCount = await prisma.email.count({
      where: { receivedAt: { gte: last24h } },
    });

    const emailByProvider = await prisma.email.groupBy({
      by: ['folder'],
      where: { receivedAt: { gte: last24h } },
      _count: true,
    });

    console.log('📬 EMAILS (Last 24 hours)');
    console.log('-'.repeat(80));
    console.log(`  Total: ${emailCount} emails`);
    emailByProvider.forEach((e) => {
      console.log(`    ${e.folder.padEnd(20)} ${e._count} emails`);
    });
    console.log();

    // Sync errors
    const errors = await prisma.providerConfig.count({
      where: {
        isActive: true,
        errorStreak: { gt: 0 },
      },
    });

    console.log('⚠️  SYNC ERRORS');
    console.log('-'.repeat(80));
    if (errors === 0) {
      console.log('  ✅ No errors');
    } else {
      console.log(`  ❌ ${errors} providers with errors`);

      const providersWithErrors = await prisma.providerConfig.findMany({
        where: {
          isActive: true,
          errorStreak: { gt: 0 },
        },
        select: {
          email: true,
          errorStreak: true,
          lastSyncedAt: true,
        },
        take: 5,
      });

      providersWithErrors.forEach((p) => {
        console.log(`    ${p.email.padEnd(35)} Errors: ${p.errorStreak} Last sync: ${p.lastSyncedAt ? p.lastSyncedAt.toLocaleString() : 'Never'}`);
      });
    }
    console.log();

    // Next sync schedule
    const nextSync = await prisma.providerConfig.findMany({
      where: {
        isActive: true,
        nextSyncAt: { not: null },
      },
      select: {
        email: true,
        syncPriority: true,
        nextSyncAt: true,
      },
      orderBy: { nextSyncAt: 'asc' },
      take: 5,
    });

    console.log('⏰ NEXT SCHEDULED SYNCS');
    console.log('-'.repeat(80));
    if (nextSync.length === 0) {
      console.log('  No syncs scheduled');
    } else {
      nextSync.forEach((p) => {
        const priority = p.syncPriority || 3;
        const timeUntil = p.nextSyncAt ? Math.round((p.nextSyncAt.getTime() - Date.now()) / 60000) : 'N/A';
        console.log(`  ${p.email.padEnd(35)} Priority: ${priority} In: ${timeUntil} min`);
      });
    }
    console.log();

    console.log('='.repeat(80));
    console.log('Last update: ' + new Date().toLocaleString());
    console.log('Press Ctrl+C to exit');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// Run once
monitorSync();

// Auto-refresh every 10 seconds if --watch flag is provided
if (process.argv.includes('--watch')) {
  setInterval(monitorSync, 10000);
}
