/**
 * Re-embed All Contacts Script (BullMQ Producer)
 *
 * Queries all Contact records from Prisma and enqueues them into the
 * ContactEmbeddingQueueService's BullMQ queue for re-embedding.
 *
 * This script does NOT call embed() or write to pgvector directly.
 * The existing queue workers handle: content composition -> AI SDK embed() -> pgvector storage.
 *
 * Usage:
 *   npx ts-node scripts/re-embed-contacts.ts                    # Full run
 *   npx ts-node scripts/re-embed-contacts.ts --dry-run           # Query only, no enqueue
 *   npx ts-node scripts/re-embed-contacts.ts --dry-run --limit 10 # Query first 10 contacts
 *   npx ts-node scripts/re-embed-contacts.ts --limit 100         # Enqueue first 100 contacts
 *
 * @requires DATABASE_URL environment variable for Prisma connection
 * @requires REDIS_HOST or REDIS_URL environment variable for BullMQ connection
 */

import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { getRedisConnectionOptions, QUEUE_NAMES } from '../src/common/config';

interface ContactEmbeddingJob {
  tenantId: string;
  contactId: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  notes?: string | null;
  tags?: string[];
  emails?: { value: string; type?: string }[] | null;
  phoneNumbers?: { value: string; type?: string }[] | null;
}

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

if (isNaN(limit) || limit <= 0) {
  console.error('ERROR: --limit requires a positive integer');
  process.exit(1);
}

const BATCH_SIZE = 50;

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log(`[re-embed-contacts] Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`[re-embed-contacts] Limit: ${limit === Infinity ? 'none' : limit}`);

  const prisma = new PrismaClient();
  let queue: Queue<ContactEmbeddingJob> | null = null;

  try {
    // Query contacts from Prisma
    const contacts = await prisma.contact.findMany({
      select: {
        id: true,
        tenantId: true,
        displayName: true,
        firstName: true,
        lastName: true,
        company: true,
        jobTitle: true,
        department: true,
        notes: true,
        tags: true,
        emails: true,
        phoneNumbers: true,
      },
      take: limit === Infinity ? undefined : limit,
      orderBy: { createdAt: 'asc' },
    });

    console.log(`[re-embed-contacts] Found ${contacts.length} contacts`);

    if (contacts.length === 0) {
      console.log('[re-embed-contacts] No contacts to process');
      return;
    }

    if (!dryRun) {
      const connection = getRedisConnectionOptions();
      queue = new Queue<ContactEmbeddingJob>(QUEUE_NAMES.CONTACT_EMBEDDING, {
        connection,
      });
    }

    let enqueued = 0;
    let failed = 0;
    let batch: { name: string; data: ContactEmbeddingJob }[] = [];

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];

      const job: ContactEmbeddingJob = {
        tenantId: contact.tenantId,
        contactId: contact.id,
        displayName: contact.displayName,
        firstName: contact.firstName,
        lastName: contact.lastName,
        company: contact.company,
        jobTitle: contact.jobTitle,
        department: contact.department,
        notes: contact.notes,
        tags: contact.tags || [],
        emails: contact.emails as ContactEmbeddingJob['emails'],
        phoneNumbers: contact.phoneNumbers as ContactEmbeddingJob['phoneNumbers'],
      };

      if (!dryRun) {
        batch.push({ name: 'embed-contact', data: job });

        if (batch.length >= BATCH_SIZE) {
          try {
            await queue!.addBulk(batch);
            enqueued += batch.length;
          } catch (err) {
            console.error(`[re-embed-contacts] ERROR: Batch enqueue failed: ${err}`);
            failed += batch.length;
          }
          batch = [];
        }
      }

      if ((i + 1) % 100 === 0) {
        console.log(`[re-embed-contacts] Progress: ${i + 1}/${contacts.length} processed, ${enqueued} enqueued, ${failed} failed`);
      }
    }

    // Flush remaining batch
    if (!dryRun && batch.length > 0) {
      try {
        await queue!.addBulk(batch);
        enqueued += batch.length;
      } catch (err) {
        console.error(`[re-embed-contacts] ERROR: Final batch enqueue failed: ${err}`);
        failed += batch.length;
      }
    }

    // Cleanup
    if (queue) {
      await queue.close();
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('');
    console.log(`[re-embed-contacts] === COMPLETE ===`);
    console.log(`[re-embed-contacts] Total contacts: ${contacts.length}`);
    console.log(`[re-embed-contacts] Total enqueued:  ${dryRun ? '0 (dry run)' : enqueued}`);
    console.log(`[re-embed-contacts] Total failed:    ${failed}`);
    console.log(`[re-embed-contacts] Time elapsed:    ${elapsed}s`);

    process.exit(failed > 0 ? 1 : 0);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`[re-embed-contacts] FATAL: ${err}`);
  process.exit(1);
});
