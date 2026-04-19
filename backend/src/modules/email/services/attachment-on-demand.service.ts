import { Inject, Injectable, Logger, NotFoundException, Optional, PayloadTooLargeException } from '@nestjs/common';
import { gmail as gmailFactory } from '@googleapis/gmail';
import { OAuth2Client } from 'google-auth-library';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorageService } from './storage.service';
import { AttachmentStorageService } from './attachment.storage';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { RedisLockService } from '../../../common/services/redis-lock.service';
import { AttachmentMetricsService, AttachmentLogContext } from './attachment-metrics.service';
import { formatBytes } from '../../../common/utils';
import { parseImapExternalId } from '../../../common/utils/imap-utils';

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
    private readonly providerTokenService: ProviderTokenService,
    private readonly crypto: CryptoService,
    // RACE CONDITION FIX RC-3: Add Redis lock for attachment download coordination
    private readonly redisLock: RedisLockService,
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(AttachmentMetricsService) private readonly metrics?: AttachmentMetricsService,
  ) { }

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

    // SEC-6 FIX: Fetch attachment with tenant filter in query to prevent timing attacks
    // Previously used two-step check that could reveal attachment existence via timing
    const attachment = await this.prisma.emailAttachment.findFirst({
      where: {
        id: attachmentId,
        email: { tenantId }, // Tenant filter in query - prevents resource enumeration
      },
      include: {
        email: {
          include: {
            provider: true,
          },
        },
      },
    });

    if (!attachment) {
      // Generic message - same for not-found and wrong-tenant cases
      throw new NotFoundException('Attachment not found');
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

    // RACE CONDITION FIX RC-3: Use Redis lock to prevent concurrent downloads
    // Multiple requests for the same attachment should not all download from provider
    const lockKey = `attachment-download:${attachmentId}`;
    const lockTtlMs = 120000; // 2 minute TTL for attachment download

    return await this.redisLock.withLock(
      lockKey,
      lockTtlMs,
      async () => {
        // Re-check if attachment is now cached (another request may have downloaded it)
        const freshAttachment = await this.prisma.emailAttachment.findUnique({
          where: { id: attachmentId },
          select: { storageType: true, storagePath: true },
        });

        if (freshAttachment?.storageType === 's3' && freshAttachment?.storagePath) {
          const url = await this.storage.getSignedDownloadUrl(freshAttachment.storagePath, 300);
          const duration = Date.now() - startTime;
          this.metrics?.recordDownload(context, duration, true);
          this.logger.debug(`Attachment ${attachmentId} already downloaded by another request`);
          return {
            url,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
          };
        }

        // CASE 3: Cache miss - fetch from provider and upload to S3

        // CRIT-7 FIX (2025-01-05): Check attachment size BEFORE downloading
        // Prevents OOM attacks from malicious/large attachments
        const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024; // 50MB limit
        if (attachment.size && attachment.size > MAX_ATTACHMENT_SIZE) {
          throw new Error(
            `Attachment ${attachment.filename} exceeds maximum size limit (${Math.round(attachment.size / 1024 / 1024)}MB > ${MAX_ATTACHMENT_SIZE / 1024 / 1024}MB)`
          );
        }

        this.logger.log(
          JSON.stringify({
            event: 'attachment_download_start',
            ...context,
            providerType: attachment.email.provider.providerType,
            message: `Downloading ${attachment.filename} from ${attachment.email.provider.providerType}`,
          }),
        );

        // Download from provider
        const providerType =
          attachment.email.provider.providerType === 'generic'
            ? 'imap'
            : (attachment.email.provider.providerType as 'google' | 'microsoft' | 'imap');
        const buffer = await this.fetchFromProvider(
          providerType,
          reference.externalMessageId,
          reference.externalAttachmentId,
          attachment.email.providerId,
          tenantId,
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
            message: `Downloaded and cached ${attachment.filename} (${formatBytes(buffer.byteLength)})`,
          }),
        );

        return {
          url,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
        };
      },
      { maxRetries: 3 },
    );
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
    providerType: 'google' | 'microsoft' | 'imap' | 'generic',
    externalMessageId: string,
    externalAttachmentId: string,
    providerId: string,
    tenantId: string,
  ): Promise<Buffer> {
    this.logger.debug(
      `Fetching attachment from ${providerType}: message=${externalMessageId}, attachment=${externalAttachmentId}`,
    );

    switch (providerType) {
      case 'google':
        return await this.fetchFromGmail(externalMessageId, externalAttachmentId, providerId, tenantId);

      case 'microsoft':
        return await this.fetchFromMicrosoft(
          externalMessageId,
          externalAttachmentId,
          providerId,
          tenantId,
        );

      case 'imap':
      case 'generic':
        return await this.fetchFromImap(externalMessageId, externalAttachmentId, providerId, tenantId);

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
    tenantId: string,
  ): Promise<Buffer> {
    let client: ImapFlow | null = null;

    try {
      // Get provider credentials
      const provider = await this.prisma.providerConfig.findFirst({
        where: { id: providerId, tenantId },
      });

      if (!provider || !['imap', 'generic'].includes(provider.providerType) || !provider.imapPassword) {
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

      const { folderPath, uid: rawUid } = parseImapExternalId(externalMessageId);

      // Select the actual mailbox that contains the message
      await client.mailboxOpen(folderPath);

      const uid = parseInt(rawUid, 10);
      if (isNaN(uid)) {
        throw new Error(`Invalid IMAP UID: ${externalMessageId} (parsed: ${rawUid})`);
      }

      // Download the entire message
      this.logger.debug(`Downloading IMAP message UID ${uid} (full message for attachment extraction)`);
      const source = await client.download(`${uid}`, undefined, { uid: true });

      // Stream message content into buffer
      // FIX (BUG-006): Use configurable limit and clear memory before throwing
      const chunks: Buffer[] = [];
      const MAX_SIZE = parseInt(process.env.IMAP_MAX_MESSAGE_SIZE || '10485760', 10); // 10MB default
      let totalBytes = 0;

      for await (const chunk of source.content) {
        totalBytes += chunk.length;
        if (totalBytes > MAX_SIZE) {
          // Clear accumulated chunks before throwing to free memory
          chunks.length = 0;
          throw new PayloadTooLargeException(
            `Message size (${(totalBytes / 1024 / 1024).toFixed(2)}MB) exceeds limit (${(MAX_SIZE / 1024 / 1024).toFixed(2)}MB)`,
          );
        }
        chunks.push(chunk);
      }

      const messageBuffer = Buffer.concat(chunks);
      // Clear chunks array to allow GC
      chunks.length = 0;
      this.logger.debug(`Downloaded IMAP message: ${totalBytes} bytes`);

      // Parse message with mailparser
      const parsed = await simpleParser(messageBuffer);

      // Find the specific attachment
      if (!parsed.attachments || parsed.attachments.length === 0) {
        throw new Error(`No attachments found in IMAP message UID ${uid}`);
      }

      const normalizedAttachmentId = externalAttachmentId
        .replace(/^cid:/i, '')
        .replace(/^<|>$/g, '');

      // Match attachment by filename or contentId
      let attachment = parsed.attachments.find(
        (att: { filename?: string; contentId?: string }) =>
          att.filename === externalAttachmentId ||
          att.filename === normalizedAttachmentId ||
          att.contentId === externalAttachmentId ||
          att.contentId === normalizedAttachmentId ||
          att.contentId === `<${externalAttachmentId}>` ||
          att.contentId === `<${normalizedAttachmentId}>`,
      );

      if (!attachment && /^att_\d+$/i.test(externalAttachmentId)) {
        const index = parseInt(externalAttachmentId.replace(/^att_/i, ''), 10);
        if (!isNaN(index) && parsed.attachments[index]) {
          attachment = parsed.attachments[index];
        }
      }

      if (!attachment) {
        this.logger.warn(
          `Attachment not found. Available: ${parsed.attachments.map((a: { filename?: string; contentId?: string }) => a.filename || a.contentId).join(', ')}`,
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
   * Fetch attachment from Gmail using Gmail API directly
   * NOTE: Calls Gmail API directly instead of handler to avoid driver dependency
   */
  private async fetchFromGmail(
    messageId: string,
    attachmentId: string,
    providerId: string,
    tenantId: string,
  ): Promise<Buffer> {
    try {
      // Get fresh access token (auto-refresh if needed)
      const { provider, accessToken } =
        await this.providerTokenService.getProviderWithToken(providerId, tenantId);

      if (provider.providerType !== 'google') {
        throw new Error(`Provider ${providerId} is not a Gmail provider`);
      }

      // Create OAuth2 client and Gmail API client
      const oauth2Client = new OAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });
      const gmail = gmailFactory({ version: 'v1', auth: oauth2Client });

      // Call Gmail API directly to get attachment
      const response = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId,
      });

      if (!response.data.data) {
        throw new Error(
          `Failed to download Gmail attachment: ${attachmentId} from message ${messageId}`,
        );
      }

      // Gmail API returns base64url-encoded content
      const buffer = Buffer.from(response.data.data, 'base64');

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
   * Fetch attachment from Microsoft using Graph API directly
   * NOTE: Calls Graph API directly with retry logic to avoid driver dependency
   */
  private async fetchFromMicrosoft(
    messageId: string,
    attachmentId: string,
    providerId: string,
    tenantId: string,
  ): Promise<Buffer> {
    const GRAPH_API_URL = 'https://graph.microsoft.com/v1.0';
    const MAX_RETRIES = 3;

    try {
      // Get fresh access token (auto-refresh if needed)
      const { provider, accessToken } =
        await this.providerTokenService.getProviderWithToken(providerId, tenantId);

      if (provider.providerType !== 'microsoft') {
        throw new Error(`Provider ${providerId} is not a Microsoft provider`);
      }

      // Retry logic for flaky Microsoft Graph API
      let lastError: Error | undefined;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          // Call Microsoft Graph API directly
          const response = await fetch(
            `${GRAPH_API_URL}/me/messages/${messageId}/attachments/${attachmentId}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            },
          );

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const attachment = await response.json();

          if (!attachment.contentBytes) {
            throw new Error(
              `Failed to download Microsoft attachment: ${attachmentId} from message ${messageId}`,
            );
          }

          // Microsoft Graph API returns base64-encoded content in contentBytes
          const buffer = Buffer.from(attachment.contentBytes, 'base64');

          this.logger.debug(
            `Successfully downloaded Microsoft attachment: ${buffer.byteLength} bytes`,
          );

          return buffer;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          if (attempt < MAX_RETRIES) {
            const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
            this.logger.debug(
              `Microsoft Graph request failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms...`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      throw lastError ?? new Error('Microsoft Graph download failed after retries');
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
    // SEC-6 FIX: Tenant filter in query to prevent timing attacks
    const attachment = await this.prisma.emailAttachment.findFirst({
      where: {
        id: attachmentId,
        email: { tenantId },
      },
      select: {
        filename: true,
        mimeType: true,
        size: true,
        storageType: true,
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    return {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      isInS3: attachment.storageType === 's3',
    };
  }
}
