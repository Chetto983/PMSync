import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

const prisma = createPrismaClient();

async function main() {
  console.log('=== PHOTO STATS ===\n');

  // Count contacts with/without photos
  const stats = await prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE "photoUrl" IS NOT NULL) as with_photo,
      COUNT(*) FILTER (WHERE "photoUrl" IS NULL) as without_photo,
      COUNT(*) as total
    FROM unified_contacts
    WHERE "isDeleted" = false
  ` as any[];

  console.log('Photo statistics:');
  console.log(`  With photo: ${stats[0].with_photo}`);
  console.log(`  Without photo: ${stats[0].without_photo}`);
  console.log(`  Total: ${stats[0].total}`);

  // Sample contacts WITH photos
  console.log('\n=== SAMPLE CONTACTS WITH PHOTOS ===');
  const withPhotos = await prisma.$queryRaw`
    SELECT "displayName", "photoUrl", emails
    FROM unified_contacts
    WHERE "isDeleted" = false AND "photoUrl" IS NOT NULL
    LIMIT 5
  ` as any[];

  for (const c of withPhotos) {
    const emailList = c.emails?.map((e: any) => e.value).join(', ') || 'NONE';
    console.log(`  ${c.displayName}: ${emailList}`);
    console.log(`    Photo: ${c.photoUrl?.substring(0, 60)}...`);
  }

  // Check Monica specifically
  console.log('\n=== MONICA RICOTTO CONTACT ===');
  const monica = await prisma.$queryRaw`
    SELECT id, "displayName", "photoUrl", emails, "createdAt", "updatedAt"
    FROM unified_contacts
    WHERE "isDeleted" = false
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(emails) AS email_obj
      WHERE LOWER(email_obj->>'value') LIKE '%ricotto%'
    )
  ` as any[];

  for (const c of monica) {
    console.log(`  Name: ${c.displayName}`);
    console.log(`  Emails: ${c.emails?.map((e: any) => e.value).join(', ')}`);
    console.log(`  PhotoUrl: ${c.photoUrl || 'NULL'}`);
    console.log(`  Created: ${c.createdAt}`);
    console.log(`  Updated: ${c.updatedAt}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
