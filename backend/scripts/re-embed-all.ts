/**
 * Re-embed All Emails Script (BullMQ Producer)
 *
 * Reads email records from a JSONL file and enqueues them into the
 * EmailEmbeddingQueueService's BullMQ queue for re-embedding.
 *
 * This script does NOT call embed() or write to pgvector directly.
 * The existing queue workers handle: AI SDK embed() -> pgvector storage.
 *
 * Usage:
 *   npx ts-node scripts/re-embed-all.ts                    # Full run
 *   npx ts-node scripts/re-embed-all.ts --dry-run           # Parse only, no enqueue
 *   npx ts-node scripts/re-embed-all.ts --dry-run --limit 10 # Parse first 10 records
 *   npx ts-node scripts/re-embed-all.ts --limit 100         # Enqueue first 100 records
 *
 * @requires REDIS_HOST or REDIS_URL environment variable for BullMQ connection
 */

import * as fs from 'node:fs';
import * as readline from 'node:readline';
import * as path from 'node:path';
import { Queue } from 'bullmq';
import { getRedisConnectionOptions, QUEUE_NAMES } from '../src/common/config';

interface JsonlRecord {
  subject?: string;
  bodyText?: string;
  from?: string;
  fromName?: string;
  to?: string[];
  sentAt?: string;
  folder?: string;
  externalId?: string;
}

interface EmailEmbeddingJob {
  tenantId: string;
  emailId: string;
  subject: string;
  bodyText?: string | null;
  from?: string | null;
  receivedAt?: string | null;
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

const JSONL_PATH = path.resolve(__dirname, '../../data/posta_extracted.jsonl');
const BATCH_SIZE = 50;
const TENANT_ID = 'pst-import'; // Default tenant for PST imports

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log(`[re-embed-all] Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`[re-embed-all] JSONL: ${JSONL_PATH}`);
  console.log(`[re-embed-all] Limit: ${limit === Infinity ? 'none' : limit}`);

  if (!fs.existsSync(JSONL_PATH)) {
    console.error(`ERROR: JSONL file not found: ${JSONL_PATH}`);
    process.exit(1);
  }

  let queue: Queue<EmailEmbeddingJob> | null = null;
  if (!dryRun) {
    const connection = getRedisConnectionOptions();
    queue = new Queue<EmailEmbeddingJob>(QUEUE_NAMES.EMAIL_EMBEDDING, {
      connection,
    });
  }

  const fileStream = fs.createReadStream(JSONL_PATH, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let parsed = 0;
  let enqueued = 0;
  let failed = 0;
  let batch: { name: string; data: EmailEmbeddingJob }[] = [];

  for await (const line of rl) {
    if (parsed >= limit) break;

    const trimmed = line.trim();
    if (!trimmed) continue;

    let record: JsonlRecord;
    try {
      record = JSON.parse(trimmed) as JsonlRecord;
    } catch (err) {
      console.warn(`[re-embed-all] WARN: Skipping malformed JSON at line ${parsed + 1}`);
      failed++;
      continue;
    }

    parsed++;

    // Compose embedding content
    const fromDisplay = record.fromName
      ? `${record.fromName} <${record.from || ''}>`
      : (record.from || '');
    const content = [
      record.subject ? `Subject: ${record.subject}` : '',
      fromDisplay ? `From: ${fromDisplay}` : '',
      record.bodyText || '',
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 8000);

    const job: EmailEmbeddingJob = {
      tenantId: TENANT_ID,
      emailId: record.externalId || `pst-${parsed}`,
      subject: record.subject || '(no subject)',
      bodyText: content,
      from: record.from || null,
      receivedAt: record.sentAt || null,
    };

    if (!dryRun) {
      batch.push({ name: 'embed-email', data: job });

      if (batch.length >= BATCH_SIZE) {
        try {
          await queue!.addBulk(batch);
          enqueued += batch.length;
        } catch (err) {
          console.error(`[re-embed-all] ERROR: Batch enqueue failed: ${err}`);
          failed += batch.length;
        }
        batch = [];
      }
    }

    if (parsed % 100 === 0) {
      console.log(`[re-embed-all] Progress: ${parsed} parsed, ${enqueued} enqueued, ${failed} failed`);
    }
  }

  // Flush remaining batch
  if (!dryRun && batch.length > 0) {
    try {
      await queue!.addBulk(batch);
      enqueued += batch.length;
    } catch (err) {
      console.error(`[re-embed-all] ERROR: Final batch enqueue failed: ${err}`);
      failed += batch.length;
    }
  }

  // Cleanup
  if (queue) {
    await queue.close();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log(`[re-embed-all] === COMPLETE ===`);
  console.log(`[re-embed-all] Total parsed:   ${parsed}`);
  console.log(`[re-embed-all] Total enqueued:  ${dryRun ? '0 (dry run)' : enqueued}`);
  console.log(`[re-embed-all] Total failed:    ${failed}`);
  console.log(`[re-embed-all] Time elapsed:    ${elapsed}s`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`[re-embed-all] FATAL: ${err}`);
  process.exit(1);
});
