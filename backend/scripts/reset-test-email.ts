/**
 * Reset Test Email (Raw SQL)
 * 1. Finds 'Test' email
 * 2. Deletes its embedding via RAW SQL
 * 3. Updates date to NOW
 * 4. Checks verify logic
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
    const prisma = createPrismaClient();

    // Find the email
    const email = await prisma.email.findFirst({
        where: {
            subject: { contains: 'Test' }, // Safer search
            isDeleted: false
        },
        select: { id: true, subject: true, folder: true }
    });

    if (!email) {
        console.log('❌ Email "Test" not found.');
        await prisma.$disconnect();
        return;
    }

    console.log(`target: ${email.id} | ${email.subject} | Folder: ${email.folder}`);

    // Delete embeddings using RAW SQL
    // 'metadata' is jsonb. We want where metadata->>'emailId' = email.id
    try {
        const deletedCount = await prisma.$executeRaw`
         DELETE FROM "embeddings" 
         WHERE metadata->>'emailId' = ${email.id}
      `;
        console.log(`🗑️  Deleted embeddings: ${deletedCount}`);
    } catch (e) {
        console.error("Error deleting embedding:", e);
    }

    // Update Date
    const newDate = new Date();
    await prisma.email.update({
        where: { id: email.id },
        data: { receivedAt: newDate }
    });
    console.log(`✅ Updated receivedAt to: ${newDate.toISOString()}`);

    // VERIFY QUERY immediately
    const BACKFILL_DAYS = 30;
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - BACKFILL_DAYS);

    const pending = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint as count
    FROM "emails" e
    LEFT JOIN "embeddings" emb ON emb.metadata->>'emailId' = e.id
    WHERE e.id = ${email.id}
      AND emb.id IS NULL
      AND e."receivedAt" > ${limitDate}
  `;

    const isPending = Number(pending[0].count);
    console.log(`🔍 Check: Is it pending backfill? count=${isPending}`);

    if (isPending === 1) {
        console.log("✅ READY FOR TEST. The system sees it as pending.");
    } else {
        console.log("❌ STILL IGNORED. Check folder exclusions?");
    }

    await prisma.$disconnect();
}

main().catch(console.error);
