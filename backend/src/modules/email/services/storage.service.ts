import { Injectable, Logger } from '@nestjs/common';
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

export type StorageType = 's3';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
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
   */
  async putObjectIfAbsent(key: string, body: Buffer, contentType: string): Promise<'uploaded' | 'skipped'> {
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
    } catch (err: any) {
      if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) {
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
      if ((error as any).name === 'NoSuchKey') {
        this.logger.warn(`S3 object not found (already deleted): ${key}`);
      } else {
        this.logger.error(`Failed to delete S3 object ${key}: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }
  }

  /**
   * Delete multiple objects from S3 in batch (max 1000 per request)
   */
  async deleteObjects(keys: string[]): Promise<{ deleted: number; failed: number }> {
    if (keys.length === 0) {
      return { deleted: 0, failed: 0 };
    }

    let deleted = 0;
    let failed = 0;

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

        if (result.Deleted?.length) {
          this.logger.debug(`Deleted ${result.Deleted.length} S3 objects from batch`);
        }

        if (result.Errors?.length) {
          this.logger.error(`Failed to delete ${result.Errors.length} S3 objects:`, result.Errors);
        }
      } catch (error) {
        this.logger.error(`Failed to delete S3 batch (${batch.length} objects): ${error instanceof Error ? error.message : String(error)}`);
        failed += batch.length;
      }
    }

    this.logger.log(`Batch delete complete: ${deleted} deleted, ${failed} failed out of ${keys.length} total`);
    return { deleted, failed };
  }
}
