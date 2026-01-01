import { createPrismaAdapter } from '../src/prisma/prisma-client.factory';
import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

    const results = await prisma.userProfileEmbedding.groupBy({
        by: ['memoryType'],
        _count: true,
        where: {
            tenantId: 'cmjgylxkg000054yhnjpkmzd9',
            userId: 'cmjgylxqp000154yhyl5mu6ss',
        },
    });

    console.log('\n📊 Memory counts by type:');
    for (const r of results) {
        console.log(`   ${r.memoryType}: ${r._count}`);
    }

    await prisma.$disconnect();
}

main();
