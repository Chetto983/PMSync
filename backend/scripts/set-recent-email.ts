/**
 * Set One Email to NOW
 * Updates a single real email to have receivedAt = NOW()
 * This allows testing the Backfill Scheduler (Option C)
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
    const prisma = createPrismaClient();

    // Find one valid email (not deleted, not spam)
    const email = await prisma.email.findFirst({
        where: {
            isDeleted: false,
            folder: { not: { contains: 'spam' } } // Simple check
        },
        select: { id: true, subject: true, receivedAt: true }
    });

    if (!email) {
        console.log('❌ No valid email found to update.');
        await prisma.$disconnect();
        return;
    }

    console.log(`found Email: ${email.id}`);
    console.log(`Subject: ${email.subject}`);
    console.log(`Original Date: ${email.receivedAt?.toISOString()}`);

    const newDate = new Date();
    await prisma.email.update({
        where: { id: email.id },
        data: { receivedAt: newDate }
    });

    console.log(`✅ Updated to: ${newDate.toISOString()}`);
    console.log('Run verify-backfill-query.ts to see if it is detected.');

    await prisma.$disconnect();
}

main().catch(console.error);
