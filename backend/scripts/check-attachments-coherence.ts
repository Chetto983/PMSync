/**
 * Check Attachments Coherence Script
 *
 * Verifies that attachments in database match MinIO storage
 *
 * Usage: npx ts-node --transpile-only scripts/check-attachments-coherence.ts
 */

import 'dotenv/config';
import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

async function main() {
  console.log('='.repeat(60));
  console.log('ATTACHMENT COHERENCE CHECK');
  console.log('='.repeat(60));

  const prisma = createPrismaClient();

  // S3 Client
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9100',
    region: process.env.S3_REGION || 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
    },
  });

  const bucket = process.env.S3_BUCKET || 'mailagent-attachments';

  try {
    // 1. Get all S3 objects
    console.log('\n[1] Fetching MinIO/S3 objects...');
    const s3Objects = new Map<string, number>();
    let continuationToken: string | undefined;

    do {
      const res = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of res.Contents || []) {
        if (obj.Key) {
          s3Objects.set(obj.Key, obj.Size || 0);
        }
      }

      continuationToken = res.NextContinuationToken;
    } while (continuationToken);

    console.log(`   Found ${s3Objects.size} objects in MinIO`);

    // 2. Get database attachments
    console.log('\n[2] Fetching database attachments...');
    const dbAttachments = await prisma.emailAttachment.findMany({
      select: {
        id: true,
        filename: true,
        storageType: true,
        storagePath: true,
        size: true,
        mimeType: true,
        contentHash: true,
        email: {
          select: {
            id: true,
            subject: true,
            providerId: true,
          },
        },
      },
    });

    const s3Attachments = dbAttachments.filter((a) => a.storageType === 's3');
    const pendingAttachments = dbAttachments.filter((a) => a.storageType === 'pending');

    console.log(`   Total attachments: ${dbAttachments.length}`);
    console.log(`   S3 stored: ${s3Attachments.length}`);
    console.log(`   Pending (on-demand): ${pendingAttachments.length}`);

    // 3. Check S3 coherence
    console.log('\n[3] Checking S3 coherence...');
    let missingInS3 = 0;
    let sizeMismatch = 0;
    let coherent = 0;

    for (const att of s3Attachments) {
      if (!att.storagePath) {
        console.log(`   [WARN] No storagePath for ${att.filename}`);
        continue;
      }

      const s3Size = s3Objects.get(att.storagePath);

      if (s3Size === undefined) {
        console.log(`   [MISSING] ${att.filename} -> ${att.storagePath}`);
        missingInS3++;
      } else if (s3Size !== att.size) {
        console.log(
          `   [SIZE MISMATCH] ${att.filename}: DB=${att.size}, S3=${s3Size}`,
        );
        sizeMismatch++;
      } else {
        coherent++;
      }
    }

    console.log(`\n   Results:`);
    console.log(`   - Coherent: ${coherent}`);
    console.log(`   - Missing in S3: ${missingInS3}`);
    console.log(`   - Size mismatch: ${sizeMismatch}`);

    // 4. Check for orphaned S3 objects
    console.log('\n[4] Checking for orphaned S3 objects...');
    const dbPaths = new Set(s3Attachments.map((a) => a.storagePath).filter(Boolean));
    let orphanedCount = 0;

    for (const [key] of s3Objects) {
      if (!dbPaths.has(key)) {
        orphanedCount++;
        if (orphanedCount <= 5) {
          console.log(`   [ORPHAN] ${key}`);
        }
      }
    }

    if (orphanedCount > 5) {
      console.log(`   ... and ${orphanedCount - 5} more orphaned objects`);
    }
    console.log(`   Total orphaned S3 objects: ${orphanedCount}`);

    // 5. Sample of pending attachments
    console.log('\n[5] Sample pending attachments (metadata-only):');
    pendingAttachments.slice(0, 5).forEach((a) => {
      console.log(`   - ${a.filename} (${(a.size / 1024).toFixed(1)} KB)`);
      console.log(`     Ref: ${a.storagePath}`);
    });

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`MinIO objects: ${s3Objects.size}`);
    console.log(`DB attachments: ${dbAttachments.length} (${s3Attachments.length} S3, ${pendingAttachments.length} pending)`);
    console.log(`Coherent S3 refs: ${coherent}/${s3Attachments.length}`);
    console.log(`Missing in S3: ${missingInS3}`);
    console.log(`Orphaned in S3: ${orphanedCount}`);

    if (missingInS3 === 0 && sizeMismatch === 0) {
      console.log('\n✅ All S3 attachments are coherent!');
    } else {
      console.log('\n⚠️ Some attachments have issues');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
