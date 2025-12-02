import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StorageService } from './storage.service';
import { createHash } from 'crypto';

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

  constructor(private readonly storage: StorageService) {}

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
   * Upload attachment binary data to S3/MinIO
   * Used for on-demand download when user requests the attachment
   *
   * @param tenantId - Tenant ID
   * @param providerId - Provider config ID
   * @param attachment - Attachment binary data and metadata
   * @returns StoredAttachment with storageType='s3' and S3 path
   */
  async uploadAttachment(
    tenantId: string,
    providerId: string,
    attachment: AttachmentUploadInput,
  ): Promise<UploadedAttachment> {
    const hash = createHash('sha256').update(attachment.content).digest('hex');
    // Deduplicate by content hash across tenants/providers
    const key = `attachments/${hash}`;

    const result = await this.storage.putObjectIfAbsent(key, attachment.content, attachment.contentType);

    this.logger.debug(
      `${result === 'uploaded' ? 'Uploaded' : 'Reused'} attachment ${attachment.filename} (${attachment.content.byteLength} bytes) at ${key}`,
    );

    return {
      storageType: 's3',
      storagePath: key,
      size: attachment.content.byteLength,
      mimeType: attachment.contentType,
      filename: attachment.filename,
      isInline: false, // Will be set by caller if needed
    };
  }

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
    // Inline images: skip (already in email body)
    if (metadata.isInline && this.isImageMimeType(metadata.mimeType)) {
      return 'skip';
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
   * Build S3 object key for attachment storage
   */
  private buildObjectKey(tenantId: string, providerId: string, filename: string): string {
    const safeName = filename.replace(/[^\w.\-]/g, '_');
    return `tenants/${tenantId}/providers/${providerId}/attachments/${randomUUID()}-${safeName}`;
  }
}
