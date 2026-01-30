/**
 * Diagnose why auto-triage is not working
 * Run: npx tsx scripts/diagnose-auto-triage.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

const prisma = createPrismaClient();

async function diagnose() {
  console.log('=== AUTO-TRIAGE DIAGNOSTIC ===\n');

  // 1. Check user preferences
  const prefs = await prisma.userPreferences.findMany({
    select: { userId: true, aiAutoTriageEnabled: true }
  });
  console.log('1. User Preferences (aiAutoTriageEnabled):');
  if (prefs.length === 0) {
    console.log('   WARNING: No user preferences found!');
  } else {
    prefs.forEach(p => {
      const status = p.aiAutoTriageEnabled ? '✓ ENABLED' : '✗ DISABLED';
      console.log(`   - User ${p.userId}: ${status}`);
    });
  }

  // 2. Check subscription plan
  const subs = await prisma.subscription.findMany({
    select: { tenantId: true, plan: true, status: true }
  });
  console.log('\n2. Subscription Plans:');
  subs.forEach(s => {
    const hasFeature = s.plan === 'PROFESSIONAL' || s.plan === 'ENTERPRISE';
    const status = hasFeature ? '✓ HAS auto_triage' : '✗ NO auto_triage';
    console.log(`   - Tenant ${s.tenantId}: ${s.plan} (${s.status}) - ${status}`);
  });

  // 3. Check eligible emails
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24);
  const skipFolders = ['spam', 'junk', 'trash', '[gmail]/spam', '[gmail]/trash'];

  const eligible = await prisma.email.count({
    where: {
      isAutoTriaged: false,
      receivedAt: { gte: cutoff },
      folder: { notIn: skipFolders },
      isDeleted: false,
      isDraft: false,
    }
  });

  const alreadyTriaged = await prisma.email.count({
    where: { isAutoTriaged: true }
  });

  const tooOld = await prisma.email.count({
    where: {
      isAutoTriaged: false,
      receivedAt: { lt: cutoff },
    }
  });

  console.log('\n3. Email Triage Status:');
  console.log(`   - Eligible for triage (last 24h, not junk): ${eligible}`);
  console.log(`   - Already triaged: ${alreadyTriaged}`);
  console.log(`   - Too old (>24h): ${tooOld}`);

  // 4. Check providers have userId
  const providers = await prisma.providerConfig.findMany({
    select: { id: true, email: true, userId: true, syncStatus: true, lastSyncAt: true }
  });
  console.log('\n4. Provider Configuration:');
  providers.forEach(p => {
    const userStatus = p.userId ? '✓' : '✗ MISSING userId';
    console.log(`   - ${p.email}: ${userStatus}, syncStatus=${p.syncStatus}`);
  });

  // 5. Check if incremental sync is happening
  console.log('\n5. Sync Type Check:');
  const providersWithToken = await prisma.providerConfig.findMany({
    select: { email: true, metadata: true }
  });
  providersWithToken.forEach(p => {
    const meta = p.metadata as Record<string, unknown> | null;
    const hasToken = !!(meta?.lastSyncToken || meta?.historyId);
    const syncType = hasToken ? 'INCREMENTAL (has token)' : 'FULL (no token yet)';
    console.log(`   - ${p.email}: ${syncType}`);
  });

  // 6. Summary
  console.log('\n=== DIAGNOSIS ===');

  const issues: string[] = [];

  const enabledPrefs = prefs.filter(p => p.aiAutoTriageEnabled);
  if (enabledPrefs.length === 0) {
    issues.push('aiAutoTriageEnabled is FALSE for all users');
  }

  if (eligible === 0) {
    issues.push('No eligible emails (all triaged, too old, or in junk)');
  }

  const providersWithoutUser = providers.filter(p => !p.userId);
  if (providersWithoutUser.length > 0) {
    issues.push(`${providersWithoutUser.length} provider(s) missing userId`);
  }

  if (issues.length === 0) {
    console.log('✓ All checks passed - triage should work on next incremental sync');
  } else {
    console.log('Issues found:');
    issues.forEach(i => console.log(`   ✗ ${i}`));
  }

  await prisma.$disconnect();
}

diagnose().catch(e => {
  console.error('Diagnostic failed:', e);
  process.exit(1);
});
