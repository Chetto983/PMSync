import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RedisLockService } from '../../../common/services/redis-lock.service';

export type StorageType = 's3';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly redisLock?: RedisLockService,
  ) {
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    this.bucket = this.config.get<string>('S3_BUCKET', 'mailagent-attachments');

    this.client = new S3Client({
      region: this.config.get<string>('S3_REGION', 'us-east-1'),
      endpoint,
      forcePathStyle: this.config.get<boolean>('S3_FORCE_PATH_STYLE', true),
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY', ''),
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY', ''),
      },
    });
  }

  /**
   * Generate a pre-signed GET URL for S3 object
   */
  async getSignedDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    });
    await this.client.send(command);
  }

  /**
   * Upload object only if it does not already exist (dedup by key)
   * FIX (RC-NEW-4): Uses distributed lock to prevent concurrent duplicate uploads
   */
  async putObjectIfAbsent(key: string, body: Buffer, contentType: string): Promise<'uploaded' | 'skipped'> {
    // If Redis lock available, use distributed locking for concurrent safety
    if (this.redisLock) {
      const lockKey = `s3:upload:${key}`;
      const result = await this.redisLock.tryWithLock(
        lockKey,
        30000, // 30 second TTL
        async () => {
          const exists = await this.objectExists(key);
          if (exists) {
            this.logger.debug(`Skipping upload, object already exists at ${key}`);
            return 'skipped' as const;
          }
          await this.putObject(key, body, contentType);
          return 'uploaded' as const;
        },
      );
      // If lock failed, assume another instance is uploading - skip
      return result ?? 'skipped';
    }

    // Fallback: no distributed lock (single instance mode)
    const exists = await this.objectExists(key);
    if (exists) {
      this.logger.debug(`Skipping upload, object already exists at ${key}`);
      return 'skipped';
    }
    await this.putObject(key, body, contentType);
    return 'uploaded';
  }

  /**
   * Check if object exists in bucket
   */
  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch (err: unknown) {
      const errObj = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (errObj?.name === 'NotFound' || errObj?.$metadata?.httpStatusCode === 404) {
        return false;
      }
      this.logger.warn(`HeadObject failed for ${key}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /**
   * Delete a single object from S3
   */
  async deleteObject(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.client.send(command);
      this.logger.debug(`Deleted S3 object: ${key}`);
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') {
        this.logger.warn(`S3 object not found (already deleted): ${key}`);
      } else {
        this.logger.error(`Failed to delete S3 object ${key}: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }
  }

  /**
   * Delete multiple objects from S3 in batch (max 1000 per request)
   * FIX (BUG-009): Returns detailed error info for failed keys
   */
  async deleteObjects(keys: string[]): Promise<{
    deleted: number;
    failed: number;
    errors?: Array<{ key: string; code?: string; message?: string }>;
  }> {
    if (keys.length === 0) {
      return { deleted: 0, failed: 0 };
    }

    let deleted = 0;
    let failed = 0;
    const errors: Array<{ key: string; code?: string; message?: string }> = [];

    // S3 batch delete supports up to 1000 objects per request
    const BATCH_SIZE = 1000;
    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      const batch = keys.slice(i, i + BATCH_SIZE);

      try {
        const command = new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: batch.map(key => ({ Key: key })),
            Quiet: false, // Return info about deleted/failed objects
          },
        });

        const result = await this.client.send(command);

        deleted += result.Deleted?.length || 0;
        failed += result.Errors?.length || 0;

        // FIX (BUG-009): Collect error details for each failed key
        if (result.Errors?.length) {
          for (const error of result.Errors) {
            if (error.Key) {
              errors.push({
                key: error.Key,
                code: error.Code,
                message: error.Message,
              });
            }
          }
          this.logger.error(`Failed to delete ${result.Errors.length} S3 objects:`, result.Errors);
        }

        if (result.Deleted?.length) {
          this.logger.debug(`Deleted ${result.Deleted.length} S3 objects from batch`);
        }
      } catch (error) {
        this.logger.error(`Failed to delete S3 batch (${batch.length} objects): ${error instanceof Error ? error.message : String(error)}`);
        // Complete batch failure - all keys failed
        for (const key of batch) {
          errors.push({
            key,
            code: 'BatchFailure',
            message: error instanceof Error ? error.message : String(error),
          });
        }
        failed += batch.length;
      }
    }

    this.logger.log(`Batch delete complete: ${deleted} deleted, ${failed} failed out of ${keys.length} total`);
    return { deleted, failed, errors: errors.length > 0 ? errors : undefined };
  }
}
