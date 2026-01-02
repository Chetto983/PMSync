
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const profiles = await prisma.writingStyleProfile.findMany();
        console.log('--- DATA START ---');
        console.log(`Found ${profiles.length} profiles.`);
        if (profiles.length > 0) {
            console.log('Sample count of first profile:', profiles[0].sampleCount);
            console.log('Profile ID:', profiles[0].id);
        }

        const sentCount = await prisma.email.count({
            where: { folder: 'SENT' }
        });
        console.log(`Total SENT emails: ${sentCount}`);
        console.log('--- DATA END ---');
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
