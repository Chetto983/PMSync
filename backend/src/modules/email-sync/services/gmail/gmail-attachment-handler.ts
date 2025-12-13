import { Injectable, Logger } from '@nestjs/common';
import { gmail_v1 } from 'googleapis';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AttachmentStorageService } from '../../../email/services/attachment.storage';
import { IcsParserService, ParsedCalendarInvite } from '../../../calendar/services/ics-parser.service';

/**
 * Attachment metadata from Gmail message
 */
export interface GmailAttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
  contentId?: string;
  isInline: boolean;
}

/**
 * Gmail-specific attachment handler
 * Handles downloading and processing Gmail attachments with intelligent strategy
 *
 * Architectural pattern: Pluggable adapter (inspired by Mail-0/Zero)
 * - Provider-specific implementation
 * - Clear separation from core sync logic
 * - Injectable dependencies for testability
 */
@Injectable()
export class GmailAttachmentHandler {
  private readonly logger = new Logger(GmailAttachmentHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attachmentStorage: AttachmentStorageService,
    private readonly icsParser: IcsParserService,
  ) {}

  /**
   * Download attachment data from Gmail API
   *
   * @param gmail - Gmail API client
   * @param messageId - Gmail message ID
   * @param attachmentId - Gmail attachment ID
   * @returns Buffer with attachment data or null if download fails
   */
  async downloadGmailAttachment(
    gmail: gmail_v1.Gmail,
    messageId: string,
    attachmentId: string,
  ): Promise<Buffer | null> {
    try {
      const response = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId,
      });

      if (!response.data.data) {
        return null;
      }

      // Gmail returns base64url-encoded data, need to convert to Buffer
      return Buffer.from(response.data.data, 'base64');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to download attachment ${attachmentId} for message ${messageId}: ${err.message}`,
      );
      return null;
    }
  }

  /**
   * Process and store attachments for an email using intelligent strategy:
   * - Inline images: skip (already in HTML)
   * - Small documents (<5MB): download + store + queue for embeddings
   * - Everything else: metadata-only (on-demand download)
   *
   * @param gmail - Gmail API client
   * @param emailId - Internal email ID (database)
   * @param externalId - Gmail message ID
   * @param attachments - Attachment metadata from Gmail
   * @param tenantId - Tenant ID
   * @param providerId - Provider config ID
   */
  async processEmailAttachments(
    gmail: gmail_v1.Gmail,
    emailId: string,
    externalId: string,
    attachments: GmailAttachmentMeta[],
    tenantId: string,
    providerId: string,
  ): Promise<void> {
    if (!attachments.length) {
      return;
    }

    try {
      // PHASE 1: Process all attachments and collect DB records to create
      // This includes external operations (Gmail API downloads, S3 uploads, calendar parsing)
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

      for (const attachment of attachments) {
        try {
          // Calendar detection (side effect: updates email record)
          if (this.icsParser.isCalendarAttachment(attachment.mimeType, attachment.filename)) {
            const data = await this.downloadGmailAttachment(
              gmail,
              externalId,
              attachment.attachmentId,
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
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            size: attachment.size,
            isInline: attachment.isInline,
            contentId: attachment.contentId,
            externalId: attachment.attachmentId,
            externalMessageId: externalId,
          };

          // Determine processing strategy
          const strategy = this.attachmentStorage.getProcessingStrategy(metadata);

          if (strategy === 'skip') {
            this.logger.debug(
              `Skipping inline image ${attachment.filename} for email ${emailId}`,
            );
            continue;
          }

          if (strategy === 'embeddings') {
            // Small document: download + store + queue for embeddings
            const data = await this.downloadGmailAttachment(
              gmail,
              externalId,
              attachment.attachmentId,
            );

            if (!data) {
              this.logger.warn(
                `Failed to download document ${attachment.filename}, storing metadata only`,
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
              filename: attachment.filename,
              content: data,
              contentType: attachment.mimeType,
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
              `Downloaded document ${attachment.filename} (${(attachment.size / 1024 / 1024).toFixed(2)}MB) for embeddings`,
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
              `Stored metadata-only for ${attachment.filename} (${(attachment.size / 1024 / 1024).toFixed(2)}MB)`,
            );
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.logger.error(
            `Failed to process attachment ${attachment.filename} for email ${emailId}: ${error.message}`,
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
