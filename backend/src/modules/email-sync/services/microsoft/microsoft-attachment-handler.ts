import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AttachmentStorageService } from '../../../email/services/attachment.storage';
import { IcsParserService, ParsedCalendarInvite } from '../../../calendar/services/ics-parser.service';

/**
 * Microsoft Graph API attachment metadata
 */
export interface MicrosoftAttachmentMeta {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  contentId?: string;
}

/**
 * Microsoft-specific attachment handler
 * Handles all Microsoft Graph API attachment operations
 *
 * Architectural pattern: Pluggable adapter (inspired by Mail-0/Zero)
 * - Provider-specific implementation for Microsoft Graph API
 * - Clear separation from core sync logic
 * - Injectable dependencies for testability
 */
@Injectable()
export class MicrosoftAttachmentHandler {
  private readonly logger = new Logger(MicrosoftAttachmentHandler.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

  constructor(
    private readonly prisma: PrismaService,
    private readonly attachmentStorage: AttachmentStorageService,
    private readonly icsParser: IcsParserService,
  ) {}

  /**
   * Fetch attachment metadata from Microsoft Graph API
   *
   * @param accessToken - Microsoft access token
   * @param messageId - External message ID
   * @param msRequestWithRetry - Retry wrapper function from MicrosoftSyncService
   * @returns Array of attachment metadata
   */
  async fetchMicrosoftAttachments(
    accessToken: string,
    messageId: string,
    msRequestWithRetry: <T>(fn: () => Promise<T>) => Promise<T>,
  ): Promise<MicrosoftAttachmentMeta[]> {
    try {
      const response = await msRequestWithRetry(() =>
        axios.get(`${this.GRAPH_API_BASE}/me/messages/${messageId}/attachments`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { $select: 'id,name,contentType,size,isInline,contentId' },
        }),
      );

      const attachments = response.data?.value || [];
      return attachments.map((att: any) => ({
        id: att.id,
        name: att.name || 'unnamed',
        contentType: att.contentType || 'application/octet-stream',
        size: att.size || 0,
        isInline: !!att.isInline,
        contentId: att.contentId,
      }));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to fetch attachments for message ${messageId}: ${err.message}`,
      );
      return [];
    }
  }

  /**
   * Download attachment data from Microsoft Graph API
   *
   * @param accessToken - Microsoft access token
   * @param messageId - External message ID
   * @param attachmentId - Attachment ID
   * @param msRequestWithRetry - Retry wrapper function from MicrosoftSyncService
   * @returns Attachment data as Buffer or null if failed
   */
  async downloadMicrosoftAttachment(
    accessToken: string,
    messageId: string,
    attachmentId: string,
    msRequestWithRetry: <T>(fn: () => Promise<T>) => Promise<T>,
  ): Promise<Buffer | null> {
    try {
      const response = await msRequestWithRetry(() =>
        axios.get(
          `${this.GRAPH_API_BASE}/me/messages/${messageId}/attachments/${attachmentId}/$value`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            responseType: 'arraybuffer',
          },
        ),
      );

      return Buffer.from(response.data);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to download attachment ${attachmentId} for message ${messageId}: ${err.message}`,
      );
      return null;
    }
  }

  /**
   * Process and store attachments for a Microsoft email using intelligent strategy:
   * - Inline images: skip (already in HTML)
   * - Small documents (<5MB): download + store + queue for embeddings
   * - Everything else: metadata-only (on-demand download)
   *
   * @param accessToken - Microsoft access token
   * @param emailId - Database email ID
   * @param externalId - External message ID
   * @param tenantId - Tenant ID
   * @param providerId - Provider config ID
   * @param msRequestWithRetry - Retry wrapper function from MicrosoftSyncService
   */
  async processEmailAttachments(
    accessToken: string,
    emailId: string,
    externalId: string,
    tenantId: string,
    providerId: string,
    msRequestWithRetry: <T>(fn: () => Promise<T>) => Promise<T>,
  ): Promise<void> {
    try {
      // Fetch attachment metadata
      const attachments = await this.fetchMicrosoftAttachments(
        accessToken,
        externalId,
        msRequestWithRetry,
      );

      if (!attachments.length) {
        return;
      }

      // PHASE 1: Process all attachments and collect DB records to create
      // This includes external operations (Microsoft API downloads, S3 uploads, calendar parsing)
      // We do this BEFORE any DB modifications to ensure atomicity
      const attachmentRecords: Array<{
        emailId: string;
        filename: string;
        mimeType: string;
        size: number;
        contentId: string | null;
        storageType: string;
        storagePath: string | null;
        contentHash: string | null;
        isInline: boolean;
      }> = [];

      // Process each attachment with intelligent strategy
      for (const attachment of attachments) {
        try {
          // Calendar detection (side effect: updates email record)
          if (this.icsParser.isCalendarAttachment(attachment.contentType, attachment.name)) {
            const data = await this.downloadMicrosoftAttachment(
              accessToken,
              externalId,
              attachment.id,
              msRequestWithRetry,
            );

            if (data) {
              const parsed = await this.icsParser.parseIcs(data.toString('utf-8'));
              if (parsed) {
                await this.saveCalendarInvite(emailId, tenantId, providerId, parsed);
              }
            }
          }

          // Convert to provider-agnostic metadata
          const metadata = {
            filename: attachment.name,
            mimeType: attachment.contentType,
            size: attachment.size,
            isInline: attachment.isInline,
            contentId: attachment.contentId,
            externalId: attachment.id,
            externalMessageId: externalId,
          };

          // Determine processing strategy
          const strategy = this.attachmentStorage.getProcessingStrategy(metadata);

          if (strategy === 'skip') {
            this.logger.debug(`Skipping inline image ${attachment.name} for email ${emailId}`);
            continue;
          }

          if (strategy === 'embeddings') {
            // Small document: download + store + queue for embeddings
            const data = await this.downloadMicrosoftAttachment(
              accessToken,
              externalId,
              attachment.id,
              msRequestWithRetry,
            );

            if (!data) {
              this.logger.warn(
                `Failed to download document ${attachment.name}, storing metadata only`,
              );
              // Fall back to metadata-only
              const stored = this.attachmentStorage.storeAttachmentMetadata(providerId, metadata);
              attachmentRecords.push({
                emailId,
                filename: stored.filename,
                mimeType: stored.mimeType,
                size: stored.size,
                contentId: stored.contentId || null,
                storageType: stored.storageType,
                storagePath: stored.storagePath || null,
                contentHash: null,
                isInline: stored.isInline,
              });
              continue;
            }

            // Upload to S3/MinIO
            const uploaded = await this.attachmentStorage.uploadAttachment(tenantId, providerId, {
              filename: attachment.name,
              content: data,
              contentType: attachment.contentType,
            });

            attachmentRecords.push({
              emailId,
              filename: uploaded.filename,
              mimeType: uploaded.mimeType,
              size: uploaded.size,
              contentId: attachment.contentId || null,
              storageType: uploaded.storageType,
              storagePath: uploaded.storagePath || null,
              contentHash: uploaded.contentHash || null,
              isInline: uploaded.isInline,
            });

            this.logger.debug(
              `Downloaded document ${attachment.name} (${(attachment.size / 1024 / 1024).toFixed(2)}MB) for embeddings`,
            );

            // Embeddings will be processed automatically by KnowledgeBaseService
            // which extracts text from PDF/Office files via AttachmentContentExtractorService
          } else {
            // metadata-only: save reference for on-demand download
            const stored = this.attachmentStorage.storeAttachmentMetadata(providerId, metadata);

            attachmentRecords.push({
              emailId,
              filename: stored.filename,
              mimeType: stored.mimeType,
              size: stored.size,
              contentId: stored.contentId || null,
              storageType: stored.storageType,
              storagePath: stored.storagePath || null,
              contentHash: null,
              isInline: stored.isInline,
            });

            this.logger.debug(
              `Stored metadata-only for ${attachment.name} (${(attachment.size / 1024 / 1024).toFixed(2)}MB)`,
            );
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.logger.error(
            `Failed to process attachment ${attachment.name} for email ${emailId}: ${error.message}`,
          );
          // Continue processing other attachments
        }
      }

      // PHASE 2: Atomic DB operation - delete old + create new in transaction
      // This ensures we don't lose attachment records if something fails mid-way
      if (attachmentRecords.length > 0) {
        await this.prisma.$transaction(async (tx) => {
          // Delete existing attachments for this email (in case of re-sync)
          await tx.emailAttachment.deleteMany({
            where: { emailId },
          });

          // Create all new attachment records
          await tx.emailAttachment.createMany({
            data: attachmentRecords,
          });
        });
      } else {
        // No new attachments to create, just delete existing ones
        await this.prisma.emailAttachment.deleteMany({
          where: { emailId },
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Failed to process attachments for email ${emailId}: ${error.message}`,
      );
    }
  }

  /**
   * Persist parsed calendar invitation onto the email record
   */
  private async saveCalendarInvite(emailId: string, tenantId: string, providerId: string, invite: ParsedCalendarInvite) {
    try {
      await this.prisma.email.update({
        where: { id: emailId },
        data: {
          hasCalendarInvite: true,
          calendarInviteStatus: invite.method === 'CANCEL' ? 'declined' : 'pending',
          calendarInviteData: this.serializeInvite(invite),
        },
      });

      await this.syncCalendarEventFromInvite(tenantId, providerId, invite);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to save calendar invite for email ${emailId}: ${err.message}`);
    }
  }

  /**
   * Convert ParsedCalendarInvite to JSON-safe payload (dates to ISO)
   */
  private serializeInvite(invite: ParsedCalendarInvite) {
    return {
      ...invite,
      startTime: invite.startTime?.toISOString?.() || invite.startTime,
      endTime: invite.endTime?.toISOString?.() || invite.endTime,
      created: invite.created ? invite.created.toISOString() : undefined,
      lastModified: invite.lastModified ? invite.lastModified.toISOString() : undefined,
    };
  }

  /**
   * Update existing calendar event when receiving updates or cancellations
   */
  private async syncCalendarEventFromInvite(tenantId: string, providerId: string, invite: ParsedCalendarInvite) {
    if (!invite.uid) return;

    const existing = await this.prisma.calendarEvent.findFirst({
      where: {
        tenantId,
        providerId,
        iCalUID: invite.uid,
      },
    });

    if (!existing) return;

    const existingMetadata = (existing.metadata as Record<string, any> | null) ?? {};
    const existingSequence = typeof existingMetadata.sequence === 'number' ? existingMetadata.sequence : 0;

    if (invite.method === 'REPLY') {
      const responder = invite.attendees?.find((a) => a.email && a.status);
      if (!responder) return;

      const attendees = Array.isArray(existing.attendees) ? [...existing.attendees as any[]] : [];
      const idx = attendees.findIndex(
        (a) => typeof a?.email === 'string' && a.email.toLowerCase() === responder.email.toLowerCase(),
      );

      const updatedAttendee = {
        email: responder.email,
        name: responder.name,
        status: responder.status,
        role: responder.role,
        rsvp: responder.rsvp ?? true,
      };

      if (idx >= 0) {
        attendees[idx] = { ...attendees[idx], ...updatedAttendee };
      } else {
        attendees.push(updatedAttendee);
      }

      await this.prisma.calendarEvent.update({
        where: { id: existing.id },
        data: { attendees },
      });
      return;
    }

    if (invite.method === 'REQUEST' && invite.sequence !== undefined && invite.sequence <= existingSequence) {
      return;
    }

    if (invite.method === 'CANCEL') {
      await this.prisma.calendarEvent.update({
        where: { id: existing.id },
        data: { isCancelled: true, status: 'cancelled' },
      });
      return;
    }

    await this.prisma.calendarEvent.update({
      where: { id: existing.id },
      data: {
        title: invite.summary,
        description: invite.description,
        location: invite.location,
        startTime: new Date(invite.startTime),
        endTime: new Date(invite.endTime),
        isAllDay: !!invite.isAllDay,
        timeZone: invite.timezone || existing.timeZone,
        attendees: invite.attendees,
        isCancelled: false,
        status: 'confirmed',
        recurrence: invite.recurrence ?? existing.recurrence,
        metadata: { ...existingMetadata, sequence: invite.sequence ?? existingSequence },
      },
    });
  }
}
