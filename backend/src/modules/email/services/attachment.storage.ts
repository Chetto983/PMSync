import { Injectable, Logger, Optional } from '@nestjs/common';
import { StorageService } from './storage.service';
import { createHash } from 'crypto';
import {
  AttachmentMetricsService,
  AttachmentLogContext,
} from './attachment-metrics.service';
import { formatBytes } from '../../../common/utils';

/**
 * Provider-agnostic attachment metadata
 * Used during email sync to store attachment info without downloading
 */
export interface AttachmentMetadata {
  filename: string;
  mimeType: string;
  size: number;
  isInline: boolean;
  contentId?: string;
  externalId: string; // Provider-specific attachment ID (Gmail attachmentId, MS Graph attachmentId)
  externalMessageId: string; // Provider-specific message ID needed for download
}

/**
 * Input for uploading attachment binary data
 */
export interface AttachmentUploadInput {
  filename: string;
  content: Buffer;
  contentType: string;
}

/**
 * Result of attachment metadata storage (not yet downloaded)
 */
export interface PendingAttachment {
  storageType: 'pending';
  storagePath: string;
  size: number;
  mimeType: string;
  filename: string;
  isInline: boolean;
  contentId?: string;
}

/**
 * Result of attachment upload to S3/MinIO
 */
export interface UploadedAttachment {
  storageType: 's3';
  storagePath: string;
  contentHash: string;
  dedupHit: boolean;
  size: number;
  mimeType: string;
  filename: string;
  isInline: boolean;
  contentId?: string;
}

/**
 * Union type for any stored attachment
 */
export type StoredAttachment = PendingAttachment | UploadedAttachment;

@Injectable()
export class AttachmentStorageService {
  private readonly logger = new Logger(AttachmentStorageService.name);

  constructor(
    private readonly storage: StorageService,
    @Optional() private readonly metrics?: AttachmentMetricsService,
  ) {}

  /**
   * Check if an object already exists by key.
   */
  async objectExists(key: string): Promise<boolean> {
    return this.storage.objectExists(key);
  }

  /**
   * Store attachment metadata WITHOUT downloading the file (metadata-only strategy)
   * Used during email sync to save attachment info for later on-demand download
   *
   * @param providerId - Provider config ID
   * @param metadata - Attachment metadata from provider
   * @returns StoredAttachment with storageType='pending' and reference for future download
   */
  storeAttachmentMetadata(
    providerId: string,
    metadata: AttachmentMetadata,
  ): PendingAttachment {
    // Store reference for future download: "providerId/externalMessageId/externalId"
    const storagePath = `${providerId}/${metadata.externalMessageId}/${metadata.externalId}`;

    return {
      storageType: 'pending',
      storagePath,
      size: metadata.size,
      mimeType: metadata.mimeType,
      filename: metadata.filename,
      isInline: metadata.isInline,
      contentId: metadata.contentId,
    };
  }

  /**
   * Upload attachment binary data to S3/MinIO with deduplication
   *
   * Uses SHA-256 content hash for deduplication across tenants/providers.
   * This is the recommended approach per AWS best practices:
   * @see https://aws.amazon.com/blogs/storage/managing-duplicate-objects-in-amazon-s3/
   *
   * @param tenantId - Tenant ID for metrics context
   * @param providerId - Provider config ID for metrics context
   * @param attachment - Attachment binary data and metadata
   * @param emailId - Optional email ID for full observability context
   * @returns UploadedAttachment with storageType='s3', S3 path, and dedupHit flag
   */
  async uploadAttachment(
    tenantId: string,
    providerId: string,
    attachment: AttachmentUploadInput,
    emailId?: string,
  ): Promise<UploadedAttachment> {
    const startTime = Date.now();

    // Compute SHA-256 hash for content-addressable storage
    // SHA-256 is the 2025 industry standard for deduplication (not MD5)
    const hashStart = Date.now();
    const hash = createHash('sha256').update(attachment.content).digest('hex');
    const hashDuration = Date.now() - hashStart;

    // Build metrics context for structured logging
    const context: AttachmentLogContext = {
      tenantId,
      providerId,
      emailId,
      filename: attachment.filename,
      contentHash: hash,
      mimeType: attachment.contentType,
      size: attachment.content.byteLength,
    };

    // Record hash computation time
    this.metrics?.recordOperation('hash_computed', context, hashDuration);

    // Deduplicate by content hash across tenants/providers
    // Key format: attachments/{sha256} enables global dedup
    const key = `attachments/${hash}`;

    const result = await this.storage.putObjectIfAbsent(
      key,
      attachment.content,
      attachment.contentType,
    );
    const dedupHit = result === 'skipped';
    const totalDuration = Date.now() - startTime;

    // Record upload metrics with dedup status
    this.metrics?.recordUpload(context, totalDuration, dedupHit);

    // Structured log with full context
    this.logger.log(
      JSON.stringify({
        event: dedupHit ? 'attachment_dedup_hit' : 'attachment_uploaded',
        tenantId,
        providerId,
        emailId,
        filename: attachment.filename,
        contentHash: hash.substring(0, 16) + '...',
        size: attachment.content.byteLength,
        sizeHuman: formatBytes(attachment.content.byteLength),
        dedupHit,
        durationMs: totalDuration,
        storagePath: key,
        message: dedupHit
          ? `Reused existing S3 object for ${attachment.filename} (saved ${formatBytes(attachment.content.byteLength)})`
          : `Uploaded ${attachment.filename} to S3`,
      }),
    );

    return {
      storageType: 's3',
      storagePath: key,
      contentHash: hash,
      dedupHit,
      size: attachment.content.byteLength,
      mimeType: attachment.contentType,
      filename: attachment.filename,
      isInline: false, // Will be set by caller if needed
    };
  }

  /**
   * Format bytes to human-readable string
   */
  /**
   * Parse pending storage path to extract provider reference
   * Format: "providerId/externalMessageId/externalAttachmentId"
   *
   * @param storagePath - Storage path from database
   * @returns Parsed reference or null if invalid
   */
  parsePendingReference(storagePath: string): {
    providerId: string;
    externalMessageId: string;
    externalAttachmentId: string;
  } | null {
    const parts = storagePath.split('/');
    if (parts.length !== 3) {
      this.logger.warn(`Invalid pending storage path format: ${storagePath}`);
      return null;
    }

    return {
      providerId: parts[0],
      externalMessageId: parts[1],
      externalAttachmentId: parts[2],
    };
  }

  /**
   * Check if attachment is pending download (metadata-only)
   */
  isPending(storageType: string): boolean {
    return storageType === 'pending';
  }

  /**
   * Determine if attachment should be downloaded for embeddings/AI processing
   * Supports: PDF, text files, Office documents (Word, Excel, PowerPoint)
   * Excludes: Images, videos, archives, executables
   *
   * @param metadata - Attachment metadata
   * @param maxSizeMB - Maximum size in MB (default: 5MB)
   * @returns true if attachment should be processed for embeddings
   */
  shouldProcessForEmbeddings(metadata: AttachmentMetadata, maxSizeMB: number = 5): boolean {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    // Don't process inline images (already in email body HTML)
    if (metadata.isInline) {
      return false;
    }

    // Must be under size limit
    if (metadata.size > maxSizeBytes) {
      return false;
    }

    const filename = metadata.filename.toLowerCase();
    const mimeType = metadata.mimeType.toLowerCase();

    // Text-extractable document types
    const isTextExtractable =
      // PDF
      mimeType === 'application/pdf' ||
      filename.endsWith('.pdf') ||
      // Plain text
      mimeType === 'text/plain' ||
      mimeType === 'text/markdown' ||
      filename.endsWith('.txt') ||
      filename.endsWith('.md') ||
      filename.endsWith('.log') ||
      // Microsoft Office (modern)
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      filename.endsWith('.docx') ||
      filename.endsWith('.xlsx') ||
      filename.endsWith('.pptx') ||
      // Microsoft Office (legacy)
      mimeType === 'application/msword' ||
      mimeType === 'application/vnd.ms-excel' ||
      mimeType === 'application/vnd.ms-powerpoint' ||
      filename.endsWith('.doc') ||
      filename.endsWith('.xls') ||
      filename.endsWith('.ppt') ||
      // OpenDocument
      mimeType === 'application/vnd.oasis.opendocument.text' ||
      mimeType === 'application/vnd.oasis.opendocument.spreadsheet' ||
      filename.endsWith('.odt') ||
      filename.endsWith('.ods') ||
      // Rich Text Format
      mimeType === 'application/rtf' ||
      filename.endsWith('.rtf');

    if (isTextExtractable) {
      this.logger.debug(
        `Attachment ${metadata.filename} (${(metadata.size / 1024 / 1024).toFixed(2)}MB) will be processed for embeddings`,
      );
    }

    return isTextExtractable;
  }

  /**
   * Determine attachment processing strategy based on type and size
   *
   * @param metadata - Attachment metadata
   * @returns Strategy: 'embeddings' (auto-download for AI), 'metadata-only' (on-demand), 'skip' (ignore)
   */
  getProcessingStrategy(
    metadata: AttachmentMetadata,
  ): 'embeddings' | 'metadata-only' | 'skip' {
    // Inline images: keep metadata for on-demand fetching (cid rendering)
    if (metadata.isInline && this.isImageMimeType(metadata.mimeType)) {
      return 'metadata-only';
    }

    // Small PDFs: download for embeddings
    if (this.shouldProcessForEmbeddings(metadata)) {
      return 'embeddings';
    }

    // Everything else: metadata-only (on-demand download)
    return 'metadata-only';
  }

  /**
   * Check if MIME type is an image
   */
  private isImageMimeType(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  /**
   * Batch upload multiple attachments with concurrency control
   *
   * Processes attachments in parallel with configurable concurrency.
   * Uses content-addressable storage for global deduplication.
   *
   * @param tenantId - Tenant ID
   * @param providerId - Provider config ID
   * @param attachments - Array of attachment inputs
   * @param options - Batch processing options
   * @returns Array of upload results with success/failure status
   *
   * @example
   * ```typescript
   * const results = await storage.batchUploadAttachments(
   *   tenantId,
   *   providerId,
   *   attachments,
   *   { concurrency: 5 }
   * );
   * console.log(`Uploaded: ${results.successful.length}, Failed: ${results.failed.length}`);
   * ```
   */
  async batchUploadAttachments(
    tenantId: string,
    providerId: string,
    attachments: AttachmentUploadInput[],
    options: { concurrency?: number; emailId?: string } = {},
  ): Promise<{
    successful: Array<{ input: AttachmentUploadInput; result: UploadedAttachment }>;
    failed: Array<{ input: AttachmentUploadInput; error: Error }>;
    dedupHitCount: number;
    dedupMissCount: number;
    totalBytes: number;
    durationMs: number;
  }> {
    const { concurrency = 5, emailId } = options;
    const startTime = Date.now();

    const successful: Array<{ input: AttachmentUploadInput; result: UploadedAttachment }> = [];
    const failed: Array<{ input: AttachmentUploadInput; error: Error }> = [];
    let dedupHitCount = 0;
    let dedupMissCount = 0;
    let totalBytes = 0;

    // HIGH-7 FIX (2025-01-05): Fixed concurrency bug - old code could exceed limit by 2x
    // because each worker in the initial batch spawned another worker on completion.
    // New implementation uses a proper worker pool pattern.
    let index = 0;

    const processNext = async (): Promise<void> => {
      const currentIndex = index++;
      if (currentIndex >= attachments.length) return;

      const attachment = attachments[currentIndex];
      try {
        const result = await this.uploadAttachment(
          tenantId,
          providerId,
          attachment,
          emailId,
        );
        successful.push({ input: attachment, result });
        totalBytes += attachment.content.byteLength;

        if (result.dedupHit) {
          dedupHitCount++;
        } else {
          dedupMissCount++;
        }
      } catch (error) {
        failed.push({
          input: attachment,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    };

    // HIGH-7 FIX: Proper worker pool - each worker loops until all items processed
    const createWorker = async (): Promise<void> => {
      while (index < attachments.length) {
        await processNext();
      }
    };

    // Start exactly 'concurrency' workers, each processing items until done
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(concurrency, attachments.length); i++) {
      workers.push(createWorker());
    }

    // Wait for all workers to complete
    await Promise.all(workers);

    const durationMs = Date.now() - startTime;

    // Log batch result
    this.logger.log(
      JSON.stringify({
        event: 'batch_upload_complete',
        tenantId,
        providerId,
        emailId,
        totalAttachments: attachments.length,
        successful: successful.length,
        failed: failed.length,
        dedupHitCount,
        dedupMissCount,
        dedupRatio: attachments.length > 0 ? dedupHitCount / attachments.length : 0,
        totalBytes,
        totalBytesHuman: formatBytes(totalBytes),
        durationMs,
        avgPerAttachment: attachments.length > 0 ? durationMs / attachments.length : 0,
      }),
    );

    return {
      successful,
      failed,
      dedupHitCount,
      dedupMissCount,
      totalBytes,
      durationMs,
    };
  }
}
