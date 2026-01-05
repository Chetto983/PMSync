/**
 * Audit Folder Inclusion
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
    const prisma = createPrismaClient();

    const EXCLUDED_PATTERNS = [
        'spam', 'junk', 'trash', 'deleted', 'archive',
        'posta indesiderata', 'cestino', 'eliminat', 'archivi',
        '[gmail]/spam', '[gmail]/trash', '[gmail]/all mail',
        'deleted items', 'junk email', 'junk e-mail',
    ];

    console.log('🔍 Auditing All Folder Names...');
    console.log('---------------------------------------------------');

    // Simple Select - Avoids strict checking of specialUse if not in schema
    const folders = await prisma.folder.findMany();

    const emailFolders = await prisma.email.groupBy({
        by: ['folder'],
        _count: true
    });

    const distinctFolders = new Set<string>();
    folders.forEach(f => distinctFolders.add(f.path || f.name));
    emailFolders.forEach(e => distinctFolders.add(e.folder || 'NULL'));

    const results: Array<{ name: string, status: '✅ INCLUDED' | '❌ EXCLUDED', reason?: string }> = [];

    for (const name of distinctFolders) {
        const lower = name.toLowerCase();
        let status: '✅ INCLUDED' | '❌ EXCLUDED' = '✅ INCLUDED';
        let reason = '';

        for (const p of EXCLUDED_PATTERNS) {
            if (lower.includes(p)) {
                status = '❌ EXCLUDED';
                reason = `Matches pattern: "${p}"`;
                break;
            }
        }

        results.push({ name, status, reason });
    }

    results.sort((a, b) => a.status.localeCompare(b.status));

    results.forEach(r => {
        console.log(`${r.status} : "${r.name}" ${r.reason ? '(' + r.reason + ')' : ''}`);
    });

    console.log('---------------------------------------------------');
    console.log(`Total Folders: ${results.length}`);

    await prisma.$disconnect();
}

main().catch(console.error);
