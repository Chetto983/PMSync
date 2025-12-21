import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { google } from 'googleapis';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorageService } from './storage.service';
import { AttachmentStorageService } from './attachment.storage';
import { GmailAttachmentHandler } from '../../email-sync/services/gmail/gmail-attachment-handler';
import { MicrosoftAttachmentHandler } from '../../email-sync/services/microsoft/microsoft-attachment-handler';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { AttachmentMetricsService, AttachmentLogContext } from './attachment-metrics.service';

/**
 * AttachmentOnDemandService - Downloads attachments lazily when requested
 *
 * Implements a "metadata-only" sync strategy where attachments are not downloaded
 * during email sync, but fetched on-demand when a user requests them.
 *
 * Features:
 * - Hash-based deduplication: reuses S3 objects by contentHash
 * - Provider-agnostic: supports Gmail, Microsoft Graph, and IMAP
 * - Observability: structured logging with tenant/provider/email/attachment context
 *
 * @see EMAIL_MODULE_ROADMAP.md Phase 2 - Attachment Lifecycle
 */
@Injectable()
export class AttachmentOnDemandService {
  private readonly logger = new Logger(AttachmentOnDemandService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly attachmentStorage: AttachmentStorageService,
    private readonly gmailHandler: GmailAttachmentHandler,
    private readonly microsoftHandler: MicrosoftAttachmentHandler,
    private readonly providerTokenService: ProviderTokenService,
    private readonly crypto: CryptoService,
    @Optional() private readonly metrics?: AttachmentMetricsService,
  ) {}

  /**
   * Download attachment on-demand with full observability
   *
   * Flow:
   * 1. Check if already cached in S3 → return signed URL (cache hit)
   * 2. Check if hash exists in S3 → update metadata and return (hash dedup)
   * 3. Fetch from provider → upload to S3 → return signed URL (cache miss)
   *
   * @param attachmentId - Attachment database ID
   * @param tenantId - Tenant ID for access control and metrics
   * @returns Signed download URL, filename, and mimeType
   */
  async downloadAttachment(
    attachmentId: string,
    tenantId: string,
  ): Promise<{ url: string; filename: string; mimeType: string }> {
    const startTime = Date.now();

    // Fetch attachment with email and provider context
    const attachment = await this.prisma.emailAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        email: {
          include: {
            provider: true,
          },
        },
      },
    });

    if (!attachment) {
      throw new NotFoundException(`Attachment ${attachmentId} not found`);
    }

    // Verify tenant access
    if (attachment.email.tenantId !== tenantId) {
      throw new NotFoundException(`Attachment ${attachmentId} not found`);
    }

    // Build metrics context for structured logging
    const context: AttachmentLogContext = {
      tenantId,
      providerId: attachment.email.providerId,
      emailId: attachment.emailId,
      attachmentId,
      filename: attachment.filename,
      contentHash: attachment.contentHash || undefined,
      mimeType: attachment.mimeType,
      size: attachment.size,
    };

    // CASE 1: Already cached in S3 - return signed URL immediately
    if (attachment.storageType === 's3' && attachment.storagePath) {
      const url = await this.storage.getSignedDownloadUrl(attachment.storagePath, 300);
      const duration = Date.now() - startTime;

      // Record cache hit
      this.metrics?.recordDownload(context, duration, true);

      this.logger.log(
        JSON.stringify({
          event: 'attachment_cache_hit',
          ...context,
          durationMs: duration,
          message: `Returned cached S3 URL for ${attachment.filename}`,
        }),
      );

      return {
        url,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
      };
    }

    // Parse the storagePath to get provider reference
    // Format: "providerId/externalMessageId/externalAttachmentId"
    const reference = this.attachmentStorage.parsePendingReference(attachment.storagePath || '');
    if (!reference) {
      throw new Error(`Invalid attachment storage path: ${attachment.storagePath}`);
    }

    // CASE 2: Hash exists - check if S3 object already exists (dedup by hash)
    if (attachment.contentHash) {
      const hashKey = `attachments/${attachment.contentHash}`;
      const exists = await this.attachmentStorage.objectExists(hashKey);
      if (exists) {
        // Update metadata to point to existing S3 object
        await this.prisma.emailAttachment.update({
          where: { id: attachmentId },
          data: {
            storageType: 's3',
            storagePath: hashKey,
            contentHash: attachment.contentHash,
          },
        });

        const url = await this.storage.getSignedDownloadUrl(hashKey, 300);
        const duration = Date.now() - startTime;

        // Record as cache hit (hash dedup)
        this.metrics?.recordDownload({ ...context, contentHash: attachment.contentHash }, duration, true);

        this.logger.log(
          JSON.stringify({
            event: 'attachment_hash_dedup_hit',
            ...context,
            contentHash: attachment.contentHash.substring(0, 16) + '...',
            durationMs: duration,
            message: `Reused S3 object by hash for ${attachment.filename}`,
          }),
        );

        return {
          url,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
        };
      }
    }

    // CASE 3: Cache miss - fetch from provider and upload to S3
    this.logger.log(
      JSON.stringify({
        event: 'attachment_download_start',
        ...context,
        providerType: attachment.email.provider.providerType,
        message: `Downloading ${attachment.filename} from ${attachment.email.provider.providerType}`,
      }),
    );

    // Download from provider
    const buffer = await this.fetchFromProvider(
      attachment.email.provider.providerType as 'google' | 'microsoft' | 'imap',
      reference.externalMessageId,
      reference.externalAttachmentId,
      attachment.email.providerId,
    );

    // Upload to S3 with deduplication
    const uploaded = await this.attachmentStorage.uploadAttachment(
      tenantId,
      attachment.email.providerId,
      {
        filename: attachment.filename,
        content: buffer,
        contentType: attachment.mimeType,
      },
      attachment.emailId, // Pass emailId for full context
    );

    // Update attachment record with S3 path and hash
    await this.prisma.emailAttachment.update({
      where: { id: attachmentId },
      data: {
        storageType: 's3',
        storagePath: uploaded.storagePath,
        contentHash: uploaded.contentHash,
      },
    });

    // Return signed URL
    const url = await this.storage.getSignedDownloadUrl(uploaded.storagePath, 300);
    const duration = Date.now() - startTime;

    // Record cache miss (provider download)
    this.metrics?.recordDownload(
      { ...context, contentHash: uploaded.contentHash, size: buffer.byteLength },
      duration,
      false,
    );

    this.logger.log(
      JSON.stringify({
        event: 'attachment_download_complete',
        ...context,
        contentHash: uploaded.contentHash.substring(0, 16) + '...',
        size: buffer.byteLength,
        dedupHit: uploaded.dedupHit,
        durationMs: duration,
        message: `Downloaded and cached ${attachment.filename} (${this.formatBytes(buffer.byteLength)})`,
      }),
    );

    return {
      url,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
    };
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Fetch attachment from provider (Gmail, Microsoft, IMAP)
   *
   * This method:
   * 1. Gets fresh access token (with auto-refresh if expired)
   * 2. Creates provider-specific API client
   * 3. Downloads attachment binary data
   * 4. Returns Buffer for upload to S3
   *
   * @throws Error if provider token invalid/expired and refresh fails
   * @throws Error if attachment download fails
   */
  private async fetchFromProvider(
    providerType: 'google' | 'microsoft' | 'imap',
    externalMessageId: string,
    externalAttachmentId: string,
    providerId: string,
  ): Promise<Buffer> {
    this.logger.debug(
      `Fetching attachment from ${providerType}: message=${externalMessageId}, attachment=${externalAttachmentId}`,
    );

    switch (providerType) {
      case 'google':
        return await this.fetchFromGmail(externalMessageId, externalAttachmentId, providerId);

      case 'microsoft':
        return await this.fetchFromMicrosoft(
          externalMessageId,
          externalAttachmentId,
          providerId,
        );

      case 'imap':
        return await this.fetchFromImap(externalMessageId, externalAttachmentId, providerId);

      default:
        throw new Error(`Unknown provider type: ${providerType}`);
    }
  }

  /**
   * Fetch attachment from IMAP server
   *
   * NOTE: IMAP doesn't support downloading individual attachments directly.
   * This method downloads the ENTIRE message and parses it to extract the specific attachment.
   * This is inefficient for large messages but necessary due to IMAP protocol limitations.
   *
   * Alternative: IMAP FETCH BODY[part] could be more efficient but requires knowing the MIME part number,
   * which we don't store during sync. For now, we use the simpler approach of downloading the full message.
   *
   * @param externalMessageId - IMAP UID (unique ID) of the message
   * @param externalAttachmentId - Attachment filename or content-id to match
   * @param providerId - Provider config ID
   */
  private async fetchFromImap(
    externalMessageId: string,
    externalAttachmentId: string,
    providerId: string,
  ): Promise<Buffer> {
    let client: ImapFlow | null = null;

    try {
      // Get provider credentials
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider || provider.providerType !== 'imap' || !provider.imapPassword) {
        throw new Error(`Provider ${providerId} is not a valid IMAP provider`);
      }

      // Decrypt IMAP password
      const imapPassword = this.crypto.decrypt(
        provider.imapPassword,
        provider.imapEncryptionIv!,
      );

      // Create IMAP client
      client = new ImapFlow({
        host: provider.imapHost!,
        port: provider.imapPort || 993,
        secure: provider.imapUseTls ?? true,
        auth: {
          user: provider.imapUsername!,
          pass: imapPassword,
        },
        logger: false,
      });

      await client.connect();
      this.logger.debug(`Connected to IMAP server for attachment download: ${provider.email}`);

      // Select INBOX (default mailbox)
      await client.mailboxOpen('INBOX');

      // Parse UID from externalMessageId
      // IMAP externalId format is "folder:uid" (e.g., "INBOX:271")
      // Extract just the numeric UID part
      let rawUid = externalMessageId;
      if (rawUid.includes(':')) {
        rawUid = rawUid.split(':').pop() || rawUid;
      }
      const uid = parseInt(rawUid, 10);
      if (isNaN(uid)) {
        throw new Error(`Invalid IMAP UID: ${externalMessageId} (parsed: ${rawUid})`);
      }

      // Download the entire message
      this.logger.debug(`Downloading IMAP message UID ${uid} (full message for attachment extraction)`);
      const source = await client.download(`${uid}`, undefined, { uid: true });

      // Stream message content into buffer
      const chunks: Buffer[] = [];
      const MAX_SIZE = 10 * 1024 * 1024; // 10MB limit for safety
      let totalBytes = 0;

      for await (const chunk of source.content) {
        totalBytes += chunk.length;
        if (totalBytes > MAX_SIZE) {
          throw new Error(`IMAP message exceeds ${MAX_SIZE} bytes limit`);
        }
        chunks.push(chunk);
      }

      const messageBuffer = Buffer.concat(chunks);
      this.logger.debug(`Downloaded IMAP message: ${totalBytes} bytes`);

      // Parse message with mailparser
      const parsed = await simpleParser(messageBuffer);

      // Find the specific attachment
      if (!parsed.attachments || parsed.attachments.length === 0) {
        throw new Error(`No attachments found in IMAP message UID ${uid}`);
      }

      // Match attachment by filename or contentId
      const attachment = parsed.attachments.find(
        (att: any) =>
          att.filename === externalAttachmentId ||
          att.contentId === externalAttachmentId ||
          att.contentId === `<${externalAttachmentId}>`,
      );

      if (!attachment) {
        this.logger.warn(
          `Attachment not found. Available: ${parsed.attachments.map((a: any) => a.filename || a.contentId).join(', ')}`,
        );
        throw new Error(
          `Attachment ${externalAttachmentId} not found in IMAP message UID ${uid}`,
        );
      }

      this.logger.debug(
        `Successfully extracted IMAP attachment: ${attachment.filename} (${attachment.size} bytes)`,
      );

      return attachment.content;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to fetch IMAP attachment ${externalAttachmentId}: ${err.message}`,
        err.stack,
      );
      throw new Error(
        `Failed to download IMAP attachment: ${err.message}. ` +
          `This may be due to invalid credentials, deleted message, or connection timeout.`,
      );
    } finally {
      // Always close IMAP connection
      if (client) {
        try {
          await client.logout();
          this.logger.debug('Closed IMAP connection');
        } catch (logoutError) {
          this.logger.warn(
            `Failed to close IMAP connection: ${logoutError instanceof Error ? logoutError.message : String(logoutError)}`,
          );
        }
      }
    }
  }

  /**
   * Fetch attachment from Gmail using Gmail API
   */
  private async fetchFromGmail(
    messageId: string,
    attachmentId: string,
    providerId: string,
  ): Promise<Buffer> {
    try {
      // Get fresh access token (auto-refresh if needed)
      const { provider, accessToken } =
        await this.providerTokenService.getProviderWithToken(providerId);

      if (provider.providerType !== 'google') {
        throw new Error(`Provider ${providerId} is not a Gmail provider`);
      }

      // Create OAuth2 client
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });

      // Create Gmail API client
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // Download attachment using existing handler
      const buffer = await this.gmailHandler.downloadAttachment(
        { messageId, attachmentId },
        gmail,
      );

      if (!buffer) {
        throw new Error(
          `Failed to download Gmail attachment: ${attachmentId} from message ${messageId}`,
        );
      }

      this.logger.debug(
        `Successfully downloaded Gmail attachment: ${buffer.byteLength} bytes`,
      );

      return buffer;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to fetch Gmail attachment ${attachmentId}: ${err.message}`,
        err.stack,
      );
      throw new Error(
        `Failed to download Gmail attachment: ${err.message}. ` +
          `This may be due to expired OAuth token or deleted message.`,
      );
    }
  }

  /**
   * Fetch attachment from Microsoft using Graph API
   */
  private async fetchFromMicrosoft(
    messageId: string,
    attachmentId: string,
    providerId: string,
  ): Promise<Buffer> {
    try {
      // Get fresh access token (auto-refresh if needed)
      const { provider, accessToken } =
        await this.providerTokenService.getProviderWithToken(providerId);

      if (provider.providerType !== 'microsoft') {
        throw new Error(`Provider ${providerId} is not a Microsoft provider`);
      }

      // Create retry wrapper (Microsoft Graph can be flaky)
      const msRequestWithRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
        const maxRetries = 3;
        let lastError: Error | undefined;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await fn();
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < maxRetries) {
              const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
              this.logger.debug(
                `Microsoft Graph request failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`,
              );
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
        }

        throw lastError ?? new Error('Microsoft Graph download failed after retries');
      };

      // Download attachment using existing handler
      const buffer = await this.microsoftHandler.downloadAttachment(
        { messageId, attachmentId },
        accessToken,
        msRequestWithRetry,
      );

      if (!buffer) {
        throw new Error(
          `Failed to download Microsoft attachment: ${attachmentId} from message ${messageId}`,
        );
      }

      this.logger.debug(
        `Successfully downloaded Microsoft attachment: ${buffer.byteLength} bytes`,
      );

      return buffer;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to fetch Microsoft attachment ${attachmentId}: ${err.message}`,
        err.stack,
      );
      throw new Error(
        `Failed to download Microsoft attachment: ${err.message}. ` +
          `This may be due to expired OAuth token or deleted message.`,
      );
    }
  }

  /**
   * Get attachment metadata without downloading
   */
  async getAttachmentMetadata(
    attachmentId: string,
    tenantId: string,
  ): Promise<{
    filename: string;
    mimeType: string;
    size: number;
    isInS3: boolean;
  }> {
    const attachment = await this.prisma.emailAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        filename: true,
        mimeType: true,
        size: true,
        storageType: true,
        email: {
          select: { tenantId: true },
        },
      },
    });

    if (!attachment || attachment.email.tenantId !== tenantId) {
      throw new NotFoundException(`Attachment ${attachmentId} not found`);
    }

    return {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      isInS3: attachment.storageType === 's3',
    };
  }
}
