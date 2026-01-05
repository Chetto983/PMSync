/**
 * Debug Embedding Status
 * Counts Total, Recent, and Embedded emails to diagnose Backfill logic
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
    const prisma = createPrismaClient();
    const BACKFILL_DAYS = 30;

    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - BACKFILL_DAYS);

    console.log(`🔍 Debugging Embeddings (Cutoff: ${limitDate.toISOString()})`);

    // 1. Total valid emails
    const total = await prisma.email.count({
        where: { isDeleted: false }
    });

    // 2. Recent valid emails
    const recent = await prisma.email.count({
        where: {
            isDeleted: false,
            receivedAt: { gt: limitDate }
        }
    });

    // 3. Emails WITH embeddings
    // We can't easily count distinct emails in embeddings table via prisma without join, 
    // but we can count emails that HAVE a related embedding if relation exists?
    // Schema check: Email has `embeddings Embedding[]`? 
    // Let's assume yes or use raw query for accuracy.

    const embeddedCount = await prisma.embedding.count();

    // 4. Orphan Recent Emails (The target of Backfill)
    // Re-run the raw query logic to be sure
    const orphans = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint as count
    FROM "emails" e
    LEFT JOIN "embeddings" emb ON emb.metadata->>'emailId' = e.id
    WHERE e."isDeleted" = false
      AND e."receivedAt" > ${limitDate}
      AND emb.id IS NULL
  `;

    console.log('---------------------------------------------------');
    console.log(`📊 STATS:`);
    console.log(`   Total Emails:      ${total}`);
    console.log(`   Recent (<30d):     ${recent}`);
    console.log(`   Total Embeddings:  ${embeddedCount}`);
    console.log(`   Orphans (Recent):  ${Number(orphans[0].count)}`);
    console.log('---------------------------------------------------');

    if (recent > 0 && Number(orphans[0].count) === 0) {
        if (embeddedCount >= recent) {
            console.log("✅ CONCLUSION: Recent emails are ALREADY embedded.");
            console.log("   The backfill correctly skips them.");
        } else {
            console.log("⚠️  CONCLUSION: Mismatch! Embeddings < Recent, but Orphans = 0?");
            console.log("   Maybe folder headers/spam filters are excluding them?");
        }
    }

    await prisma.$disconnect();
}

main().catch(console.error);
