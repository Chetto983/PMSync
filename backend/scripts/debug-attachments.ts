/**
 * Debug Attachments
 * 1. Count EmailAttachment rows
 * 2. Check metadata keys in Embeddings
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
    const prisma = createPrismaClient();

    console.log('🔍 Debugging Attachments...');

    // 1. Count actual attachments in DB
    const attachmentCount = await prisma.emailAttachment.count();
    console.log(`📎 Total EmailAttachments in DB: ${attachmentCount}`);

    // 2. Check a sample of attachments
    const sample = await prisma.emailAttachment.findMany({
        take: 3,
        select: { id: true, filename: true, storageType: true }
    });
    sample.forEach(a => console.log(`   - ${a.filename} (${a.storageType})`));

    // 3. Scan Embeddings for ANY key resembling attachment
    // Since we can't easily list json keys in prisma, we'll fetch a sample of ALL embeddings
    // and inspect their metadata keys in JS.
    const embeddings = await prisma.embedding.findMany({
        take: 100,
        select: { metadata: true }
    });

    const keysFound = new Set<string>();
    embeddings.forEach(e => {
        if (e.metadata && typeof e.metadata === 'object' && !Array.isArray(e.metadata)) {
            Object.keys(e.metadata).forEach(k => keysFound.add(k));
        }
    });

    console.log('---------------------------------------------------');
    console.log(`🧩 Keys found in Embedding Metadata: ${Array.from(keysFound).join(', ')}`);

    // Specific check
    if (keysFound.has('attachmentId')) {
        console.log("   ✅ 'attachmentId' key exists in SOME records.");
    } else {
        console.log("   ❌ 'attachmentId' key NOT found in sample.");
    }

    await prisma.$disconnect();
}

main().catch(console.error);
