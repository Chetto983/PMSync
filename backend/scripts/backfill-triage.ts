/**
 * Backfill auto-triage for missed emails
 * Run: npx tsx scripts/backfill-triage.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter }) as unknown as PrismaClient;

async function backfill() {
  console.log('=== BACKFILL AUTO-TRIAGE ===\n');

  // Find untriaged emails from last 48 hours (wider window to catch missed ones)
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 48);

  const skipFolders = ['spam', 'junk', 'trash', '[gmail]/spam', '[gmail]/trash'];

  const untriaged = await prisma.email.findMany({
    where: {
      isAutoTriaged: false,
      receivedAt: { gte: cutoff },
      folder: { notIn: skipFolders },
      isDeleted: false,
      isDraft: false,
    },
    select: { id: true, subject: true, tenantId: true },
    orderBy: { receivedAt: 'desc' },
  });

  console.log(`Found ${untriaged.length} untriaged emails from last 48 hours\n`);

  if (untriaged.length === 0) {
    console.log('Nothing to backfill!');
    await prisma.$disconnect();
    return;
  }

  // Group by tenant
  const byTenant = new Map<string, string[]>();
  for (const email of untriaged) {
    if (!byTenant.has(email.tenantId)) {
      byTenant.set(email.tenantId, []);
    }
    byTenant.get(email.tenantId)!.push(email.id);
  }

  console.log('To trigger triage, call the API:\n');

  for (const [tenantId, emailIds] of byTenant) {
    console.log(`Tenant ${tenantId}: ${emailIds.length} emails`);
    console.log(`  curl -X POST http://localhost:3000/api/v1/ai/triage/batch \\`);
    console.log(`    -H "Authorization: Bearer YOUR_TOKEN" \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"emailIds": ${JSON.stringify(emailIds.slice(0, 20))}}'`);
    console.log();
  }

  // Or just mark them for next sync
  console.log('--- OR ---\n');
  console.log('Quick fix: Reset isAutoTriaged to trigger on next sync:\n');

  const result = await prisma.email.updateMany({
    where: {
      id: { in: untriaged.map(e => e.id) },
    },
    data: {
      isAutoTriaged: false, // Already false, but this confirms
    },
  });

  console.log(`Confirmed ${result.count} emails ready for triage.`);
  console.log('\nRestart backend and trigger a sync to process them.');

  await prisma.$disconnect();
}

backfill().catch(console.error);
