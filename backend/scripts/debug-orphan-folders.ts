/**
 * Debug Orphan Folders (Raw SQL Version)
 * Why are 127 recent emails skipped? Check their folders.
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
    const prisma = createPrismaClient();
    const BACKFILL_DAYS = 30;

    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - BACKFILL_DAYS);

    console.log(`🔍 Checking Folders of Orphan Emails (Recent > ${limitDate.toISOString().split('T')[0]})`);

    try {
        // Use Raw Query to avoid TS issues and get group count directly
        const folderCounts = await prisma.$queryRaw<Array<{ folder: string, count: number }>>`
        SELECT 
          COALESCE(e."folder", 'NULL') as folder, 
          COUNT(*)::integer as count
        FROM "emails" e
        LEFT JOIN "embeddings" emb ON emb.metadata->>'emailId' = e.id
        WHERE e."isDeleted" = false
          AND e."receivedAt" > ${limitDate}
          AND emb.id IS NULL
        GROUP BY e."folder"
        ORDER BY count DESC
      `;

        console.log(`Found orphan groups:`);
        console.log('---------------------------------------------------');
        console.log('📁 Folder Breakdown:');

        if (Array.isArray(folderCounts)) {
            folderCounts.forEach(row => {
                console.log(`   - "${row.folder}": ${row.count}`);
            });
        } else {
            console.log('Error: folderCounts is not an array', folderCounts);
        }
        console.log('---------------------------------------------------');

        // Also check the specific "Test" email if possible
        const testEmail = await prisma.email.findFirst({
            where: { subject: 'Test' },
            select: { id: true, folder: true, receivedAt: true, subject: true }
        });
        if (testEmail) {
            console.log(`DEBUG: 'Test' email is in folder: "${testEmail.folder}"`);
            console.log(`       Date: ${testEmail.receivedAt?.toISOString()}`);
        } else {
            console.log("DEBUG: 'Test' email not found via Prisma findFirst");
        }

    } catch (err) {
        console.error('Error executing query:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(console.error);
