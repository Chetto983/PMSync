import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Fetching providers...');
    const providers = await prisma.providerConfig.findMany({
        include: {
            _count: {
                select: { emails: true, folders: true },
            },
        },
    });

    console.log('\n---------------------------------------------------');
    console.log('Found ' + providers.length + ' providers:');
    console.log('---------------------------------------------------');

    // Format output as a table
    console.log(
        '| ID'.padEnd(38) +
        '| Email'.padEnd(30) +
        '| Active'.padEnd(8) +
        '| Tenant'.padEnd(38) +
        '| Emails'.padEnd(10)
    );
    console.log('-'.repeat(124));

    for (const p of providers) {
        console.log(
            `| ${p.id.padEnd(36)} | ${p.email.padEnd(28)} | ${String(p.isActive).padEnd(6)} | ${p.tenantId.padEnd(36)} | ${String(p._count.emails).padEnd(8)}`
        );
    }
    console.log('---------------------------------------------------\n');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
