import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load env from backend/.env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const prisma = createPrismaClient();

async function main() {
  const providerArg = process.argv[2];
  const providers = await prisma.providerConfig.findMany({
    where: providerArg
      ? { id: providerArg }
      : {
          providerType: { in: ['google', 'microsoft'] },
        },
    select: {
      id: true,
      email: true,
      providerType: true,
      tenantId: true,
      syncPriority: true,
      errorStreak: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const snapshot: any = {
    generatedAt: new Date().toISOString(),
    providers: [] as any[],
  };

  for (const provider of providers) {
    const emailCount = await prisma.email.count({ where: { providerId: provider.id } });
    const mostRecentEmail = await prisma.email.findFirst({
      where: { providerId: provider.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, externalId: true, createdAt: true, sentAt: true },
    });

    snapshot.providers.push({
      id: provider.id,
      email: provider.email,
      type: provider.providerType,
      tenantId: provider.tenantId,
      syncPriority: provider.syncPriority,
      errorStreak: provider.errorStreak,
      metadata: provider.metadata,
      emailCount,
      mostRecentEmail,
      updatedAt: provider.updatedAt,
    });
  }

  const outDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outFile = path.join(outDir, `mail_sync_snapshot_${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2), { encoding: 'utf-8' });

  console.log(`Snapshot written to ${outFile}`);
}

main()
  .catch((err) => {
    console.error('Snapshot failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
