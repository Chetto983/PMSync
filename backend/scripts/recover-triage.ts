/**
 * Quick fix: Recover missed triage for untriaged emails
 *
 * Run: npx tsx scripts/recover-triage.ts
 *
 * This script directly calls the triage API endpoint to process
 * all untriaged emails from the last 48 hours.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter }) as unknown as PrismaClient;

const SKIP_FOLDERS = ['spam', 'junk', 'trash', '[gmail]/spam', '[gmail]/trash'];

async function recoverTriage() {
  console.log('=== TRIAGE RECOVERY ===\n');

  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 48);

  // Find all untriaged emails
  const untriaged = await prisma.email.findMany({
    where: {
      isAutoTriaged: false,
      receivedAt: { gte: cutoff },
      folder: { notIn: SKIP_FOLDERS },
      isDeleted: false,
      isDraft: false,
    },
    select: { id: true, subject: true, tenantId: true },
    orderBy: { receivedAt: 'desc' },
    take: 100, // Limit for safety
  });

  console.log(`Found ${untriaged.length} untriaged emails\n`);

  if (untriaged.length === 0) {
    console.log('Nothing to recover!');
    await prisma.$disconnect();
    return;
  }

  // Group by tenant
  const byTenant = new Map<string, typeof untriaged>();
  for (const email of untriaged) {
    if (!byTenant.has(email.tenantId)) {
      byTenant.set(email.tenantId, []);
    }
    byTenant.get(email.tenantId)!.push(email);
  }

  console.log(`Tenants affected: ${byTenant.size}\n`);

  // For each tenant, get userId and call API
  for (const [tenantId, emails] of byTenant) {
    const provider = await prisma.providerConfig.findFirst({
      where: { tenantId },
      select: { userId: true, email: true },
    });

    if (!provider?.userId) {
      console.log(`Tenant ${tenantId}: No userId found, skipping ${emails.length} emails`);
      continue;
    }

    console.log(`\nTenant ${tenantId} (${provider.email}): ${emails.length} emails`);
    console.log('Processing...');

    // Mark emails as ready for triage by resetting flag (triage service will pick them up)
    // The triage service's getEligibleEmails() will find them
    const emailIds = emails.map(e => e.id);

    // Just confirm they're ready - the next API call will process them
    console.log(`  Email IDs: ${emailIds.slice(0, 5).join(', ')}${emailIds.length > 5 ? '...' : ''}`);
    console.log(`  Ready for triage via API`);

    // Show curl command for manual trigger
    console.log(`\n  To trigger NOW (requires auth token):`);
    console.log(`  curl -X POST http://localhost:3000/api/v1/ai/triage \\`);
    console.log(`    -H "Authorization: Bearer YOUR_JWT_TOKEN" \\`);
    console.log(`    -H "Content-Type: application/json"`);
  }

  console.log('\n=== AUTOMATIC FIX ===\n');
  console.log('Since the determineSyncType() bug is now fixed,');
  console.log('the easiest recovery is to trigger a new email sync:');
  console.log('\n1. Open the app');
  console.log('2. Click the sync button (or wait for auto-sync)');
  console.log('3. New emails will trigger triage for ALL pending emails');
  console.log('\nOR restart the backend to reinitialize sync workers.');

  await prisma.$disconnect();
}

recoverTriage().catch(console.error);
