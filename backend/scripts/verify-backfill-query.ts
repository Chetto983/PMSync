/**
 * Verify Backfill Logic (Option C)
 * Checks how many emails found for embedding with 30-day limit
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { Prisma } from '@prisma/client';

async function main() {
    const prisma = createPrismaClient();
    const BACKFILL_DAYS = 30;

    console.log(`🔍 Verifying Backfill Query (Limit: ${BACKFILL_DAYS} days)...`);

    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - BACKFILL_DAYS);
    console.log(`   Cutoff Date: ${limitDate.toISOString()}`);

    const excludedSpecialUse = ['SPAM', 'TRASH', 'ARCHIVE', 'JUNK', 'DELETED'];
    const excludedPatterns = [
        'spam', 'junk', 'trash', 'deleted', 'archive',
        'posta indesiderata', 'cestino', 'eliminat', 'archivi',
        '[gmail]/spam', '[gmail]/trash', '[gmail]/all mail',
        'deleted items', 'junk email', 'junk e-mail',
    ];

    const patternConditions = Prisma.join(
        excludedPatterns.map((pattern) =>
            Prisma.sql`LOWER(COALESCE(e."folder", '')) LIKE ${`%${pattern.toLowerCase()}%`}`,
        ),
        ' OR ',
    );

    const result = await prisma.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "emails" e
      LEFT JOIN "embeddings" emb
        ON emb.metadata ->> 'emailId' = e."id"
      LEFT JOIN "folders" f
        ON f."providerId" = e."providerId"
        AND (f."path" = e."folder" OR f."name" = e."folder" OR f."externalId" = e."folder")
      WHERE emb."id" IS NULL
        AND e."isDeleted" = FALSE
        AND e."receivedAt" > ${limitDate}
        AND (f."specialUse" IS NULL OR f."specialUse" NOT IN (${Prisma.join(excludedSpecialUse)}))
        AND NOT (${patternConditions});
    `,
    );

    const count = Number(result?.[0]?.count ?? BigInt(0));

    const totalEmails = await prisma.email.count();

    console.log('---------------------------------------------------');
    console.log(`📧 Total Emails in DB: ${totalEmails}`);
    console.log(`🎯 Emails matching 30-day Backfill Rule: ${count}`);
    console.log('---------------------------------------------------');

    if (count === 0 && totalEmails > 0) {
        console.log("✅ Result: 0 emails to embed (implies all are older than 30 days or already embedded).");
        console.log("   Option C is working! (Skipping old history)");
    } else {
        console.log(`ℹ️  Result: ${count} recent emails will be embedded.`);
    }

    await prisma.$disconnect();
}

main().catch(console.error);
