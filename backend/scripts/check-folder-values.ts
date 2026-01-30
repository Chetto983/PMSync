import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter }) as unknown as PrismaClient;

async function check() {
  // Get distinct folder values
  const folders = await prisma.email.groupBy({
    by: ['folder'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  console.log('=== DISTINCT EMAIL FOLDERS ===\n');
  for (const f of folders) {
    console.log(`"${f.folder}" - ${f._count.id} emails`);
  }

  await prisma.$disconnect();
}

check().catch(console.error);
