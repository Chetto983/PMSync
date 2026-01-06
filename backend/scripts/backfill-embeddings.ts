/**
 * Backfill Missing Embeddings
 * Skips TRASH and SPAM folders
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Mistral } from '@mistralai/mistralai';
import { nanoid } from 'nanoid';

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

const prisma = createPrismaClient();

const CONFIG = {
  batchSize: 10,
  embeddingModel: 'mistral-embed',
  skipFolders: ['TRASH', 'SPAM', 'JUNK', '[Gmail]/Trash', '[Gmail]/Spam'],
};

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    // Find all tenants with missing embeddings
    const tenants = await prisma.tenant.findMany({
      select: { id: true, name: true },
    });
    console.log('Usage: npx ts-node scripts/backfill-embeddings.ts <tenantId>\n');
    console.log('Available tenants:');
    for (const t of tenants) {
      const emailCount = await prisma.email.count({ where: { tenantId: t.id } });
      const embCount = await prisma.embedding.count({ where: { tenantId: t.id } });
      console.log(`  ${t.id} - ${t.name} (${emailCount} emails, ${embCount} embeddings)`);
    }
    await prisma.$disconnect();
    return;
  }

  console.log('🔄 Backfill Embeddings\n');

  const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY! });

  // Get emails without embeddings, excluding trash/spam
  const embeddedEmailIds = await prisma.embedding.findMany({
    where: { tenantId, emailId: { not: null } },
    select: { emailId: true },
  });
  const embeddedSet = new Set(embeddedEmailIds.map(e => e.emailId));

  const allEmails = await prisma.email.findMany({
    where: {
      tenantId,
      folder: { notIn: CONFIG.skipFolders },
    },
    select: {
      id: true,
      subject: true,
      snippet: true,
      bodyText: true,
      from: true,
      folder: true,
    },
  });

  const missing = allEmails.filter(e => !embeddedSet.has(e.id));

  console.log(`📊 Stats:`);
  console.log(`   Total emails (excl. trash/spam): ${allEmails.length}`);
  console.log(`   Already embedded:                ${embeddedSet.size}`);
  console.log(`   Missing embeddings:              ${missing.length}`);
  console.log(`   Skipping folders:                ${CONFIG.skipFolders.join(', ')}\n`);

  if (missing.length === 0) {
    console.log('✅ All emails have embeddings!');
    await prisma.$disconnect();
    return;
  }

  // Group by folder for stats
  const byFolder: Record<string, number> = {};
  for (const e of missing) {
    byFolder[e.folder] = (byFolder[e.folder] || 0) + 1;
  }
  console.log('Missing by folder:');
  for (const [folder, count] of Object.entries(byFolder).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${folder}: ${count}`);
  }
  console.log();

  // Generate embeddings in batches
  console.log(`🧠 Generating embeddings for ${missing.length} emails...\n`);

  let embedded = 0;
  let skipped = 0;

  for (let i = 0; i < missing.length; i += CONFIG.batchSize) {
    const batch = missing.slice(i, i + CONFIG.batchSize);

    // Prepare texts
    const validBatch: { email: typeof batch[0]; text: string }[] = [];
    for (const email of batch) {
      const content = email.bodyText || email.snippet || '';
      if (content.trim().length < 10) {
        skipped++;
        continue;
      }
      const text = `${email.subject || ''}\n${content.substring(0, 500)}\nDa: ${email.from}`;
      validBatch.push({ email, text });
    }

    if (validBatch.length === 0) continue;

    try {
      const response = await mistral.embeddings.create({
        model: CONFIG.embeddingModel,
        inputs: validBatch.map(v => v.text),
      });

      for (let j = 0; j < validBatch.length; j++) {
        const embedding = response.data?.[j]?.embedding;
        if (embedding) {
          await prisma.$executeRawUnsafe(`
            INSERT INTO embeddings (id, "tenantId", content, vector, "embeddingModel", "emailId", "createdAt")
            VALUES ($1, $2, $3, $4::vector, $5, $6, NOW())
            ON CONFLICT DO NOTHING
          `,
            nanoid(),
            tenantId,
            validBatch[j].text,
            `[${embedding.join(',')}]`,
            CONFIG.embeddingModel,
            validBatch[j].email.id,
          );
          embedded++;
        }
      }

      console.log(`  Progress: ${Math.min(i + CONFIG.batchSize, missing.length)}/${missing.length} (embedded: ${embedded}, skipped: ${skipped})`);
    } catch (error) {
      console.error(`  Error at batch ${i}:`, error);
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n✅ Backfill Complete!`);
  console.log(`   Embedded: ${embedded}`);
  console.log(`   Skipped (too short): ${skipped}`);

  // Final count
  const finalCount = await prisma.embedding.count({ where: { tenantId } });
  console.log(`   Total embeddings: ${finalCount}`);

  await prisma.$disconnect();
}

main().catch(console.error);
