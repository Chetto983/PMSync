/**
 * Upload local PST attachments to MinIO and update Prisma records
 *
 * Follows existing patterns from:
 * - storage.service.ts: S3 key = "attachments/{sha256}"
 * - attachment.storage.ts: storageType='s3', contentHash, putObjectIfAbsent
 *
 * Run: cd backend && node scripts/upload-attachments-minio.js
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { S3Client, PutObjectCommand, HeadObjectCommand, CreateBucketCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

const TENANT_ID = 'cmm8zoftn0000rcyhu770d2ub';
const CONCURRENCY = 10;

async function main() {
  // Init Prisma
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  // Init S3/MinIO client
  const bucket = process.env.S3_BUCKET || 'pmsync-attachments';
  const s3 = new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    },
  });

  // Ensure bucket exists
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    console.log('Creating bucket:', bucket);
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }

  try {
    console.log('=== Upload Attachments to MinIO ===\n');

    // 1. Get all attachments with local storagePath
    const attachments = await prisma.emailAttachment.findMany({
      where: {
        tenantId: TENANT_ID,
        storageType: 'local',
        storagePath: { not: null },
      },
      select: {
        id: true,
        emailId: true,
        filename: true,
        mimeType: true,
        size: true,
        storagePath: true,
        contentHash: true,
        isInline: true,
      },
    });

    console.log(`Found ${attachments.length} attachments with storageType='local'\n`);

    if (attachments.length === 0) {
      console.log('Nothing to upload.');
      return;
    }

    let uploaded = 0;
    let dedupHits = 0;
    let skipped = 0;
    let errors = 0;
    let totalBytes = 0;

    // Helper: check if S3 object exists
    async function objectExists(key) {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    }

    // Helper: upload single attachment
    async function processAttachment(att) {
      const localPath = att.storagePath;

      // Check if local file exists
      if (!localPath || !fs.existsSync(localPath)) {
        skipped++;
        return;
      }

      try {
        // Read file content
        const content = fs.readFileSync(localPath);

        // SHA-256 hash (matches attachment.storage.ts pattern)
        const hash = att.contentHash || createHash('sha256').update(content).digest('hex');
        const s3Key = `attachments/${hash}`;

        // Upload if not already in S3 (dedup)
        const exists = await objectExists(s3Key);
        if (exists) {
          dedupHits++;
        } else {
          await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: s3Key,
            Body: content,
            ContentType: att.mimeType || 'application/octet-stream',
            // Note: SSE-S3 (AES256) requires KMS config on MinIO
            // Skip encryption for dev - production uses managed S3 with SSE enabled
          }));
          uploaded++;
          totalBytes += content.length;
        }

        // Update DB record: storageType='s3', storagePath='attachments/{hash}'
        await prisma.emailAttachment.update({
          where: { id: att.id },
          data: {
            storageType: 's3',
            storagePath: s3Key,
            contentHash: hash,
          },
        });
      } catch (err) {
        errors++;
        console.error(`  [ERR] ${att.filename}: ${err.message}`);
      }
    }

    // Process with concurrency control (worker pool)
    let index = 0;
    const total = attachments.length;

    async function worker() {
      while (index < total) {
        const i = index++;
        await processAttachment(attachments[i]);
        if ((uploaded + dedupHits + skipped + errors) % 50 === 0) {
          console.log(`  ... ${uploaded + dedupHits + skipped + errors}/${total} (${uploaded} uploaded, ${dedupHits} dedup, ${skipped} skipped, ${errors} errors)`);
        }
      }
    }

    const startTime = Date.now();
    const workers = [];
    for (let i = 0; i < Math.min(CONCURRENCY, total); i++) {
      workers.push(worker());
    }
    await Promise.all(workers);
    const duration = Date.now() - startTime;

    console.log(`\n========== UPLOAD COMPLETE ==========`);
    console.log(`Total attachments:   ${total}`);
    console.log(`Uploaded to MinIO:   ${uploaded} (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
    console.log(`Dedup hits:          ${dedupHits}`);
    console.log(`Skipped (no file):   ${skipped}`);
    console.log(`Errors:              ${errors}`);
    console.log(`Duration:            ${(duration / 1000).toFixed(1)}s`);
    console.log(`=====================================`);

    // Verify final state
    const s3Count = await prisma.emailAttachment.count({
      where: { tenantId: TENANT_ID, storageType: 's3' },
    });
    const localCount = await prisma.emailAttachment.count({
      where: { tenantId: TENANT_ID, storageType: 'local' },
    });
    console.log(`\nDB state: ${s3Count} attachments on S3, ${localCount} still local`);

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => {
  console.error('Upload failed:', e);
  process.exit(1);
});
