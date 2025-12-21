/**
 * Base Attachment Handler
 *
 * Abstract base class containing shared logic for all attachment handlers.
 * Reduces ~300 lines of code duplication between Gmail, Microsoft, and IMAP handlers.
 *
 * Provider-specific implementations only need to override:
 * - downloadAttachment() - uses provider-specific API
 * - fetchAttachments() (optional) - if provider needs to fetch attachment list separately
 *
 * DUP-1: Attachment Handler Refactoring
 * Before: Gmail (377 lines) + Microsoft (426 lines) = 803 lines total
 * After: Base (~250 lines) + Gmail (~80 lines) + Microsoft (~120 lines) + IMAP (~60 lines) = ~510 lines
 * Savings: ~290 lines (~36% reduction)
 */

import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AttachmentStorageService } from '../../email/services/attachment.storage';
import {
  IcsParserService,
  ParsedCalendarInvite,
} from '../../calendar/services/ics-parser.service';

/**
 * Provider-agnostic attachment metadata
 */
export interface AttachmentMeta {
  id: string; // Provider-specific attachment ID
  filename: string;
  mimeType: string;
  size: number;
  isInline: boolean;
  contentId?: string;
}

/**
 * Internal record structure for batch DB operations
 */
export interface AttachmentRecord {
  emailId: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId: string | null;
  storageType: string;
  storagePath: string | null;
  contentHash: string | null;
  isInline: boolean;
}

/**
 * Download context passed to provider-specific download method
 */
export interface DownloadContext {
  messageId: string;
  attachmentId: string;
}

export type AttachmentProviderType = 'gmail' | 'microsoft' | 'imap';

export abstract class BaseAttachmentHandler {
  protected readonly logger: Logger;
  protected abstract readonly providerType: AttachmentProviderType;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly attachmentStorage: AttachmentStorageService,
    protected readonly icsParser: IcsParserService,
  ) {
    this.logger = new Logger(this.constructor.name);
  }

  // ==================== Abstract Methods (Provider-Specific) ====================

  /**
   * Download attachment data from provider API
   * Each provider implements this with their specific API calls
   */
  abstract downloadAttachment(
    context: DownloadContext,
    ...args: any[]
  ): Promise<Buffer | null>;

  // ==================== Shared Processing Logic ====================

  /**
   * Process and store attachments for an email using intelligent strategy:
   * - Inline images: metadata-only (cid rendering)
   * - Small documents (<5MB): download + store + queue for embeddings
   * - Everything else: metadata-only (on-demand download)
   *
   * @param emailId - Internal email ID (database)
   * @param externalId - Provider message ID
   * @param attachments - Attachment metadata (provider-agnostic format)
   * @param tenantId - Tenant ID
   * @param providerId - Provider config ID
   * @param downloadFn - Provider-specific download function
   */
  async processEmailAttachments(
    emailId: string,
    externalId: string,
    attachments: AttachmentMeta[],
    tenantId: string,
    providerId: string,
    downloadFn: (attachmentId: string) => Promise<Buffer | null>,
  ): Promise<void> {
    if (!attachments.length) {
      return;
    }

    try {
      // PHASE 1: Process all attachments and collect DB records to create
      // This includes external operations (API downloads, S3 uploads, calendar parsing)
      // We do this BEFORE any DB modifications to ensure atomicity
      const attachmentRecords: AttachmentRecord[] = [];

      for (const attachment of attachments) {
        try {
          // Calendar detection (side effect: updates email record)
          if (
            this.icsParser.isCalendarAttachment(
              attachment.mimeType,
              attachment.filename,
            )
          ) {
            const data = await downloadFn(attachment.id);

            if (data) {
              const parsed = await this.icsParser.parseIcs(
                data.toString('utf-8'),
              );
              if (parsed) {
                await this.saveCalendarInvite(
                  emailId,
                  tenantId,
                  providerId,
                  parsed,
                );
              }
            }
          }

          // Convert to provider-agnostic metadata for storage service
          const metadata = {
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            size: attachment.size,
            isInline: attachment.isInline,
            contentId: attachment.contentId,
            externalId: attachment.id,
            externalMessageId: externalId,
          };

          // Determine processing strategy
          const strategy =
            this.attachmentStorage.getProcessingStrategy(metadata);

          if (strategy === 'skip') {
            this.logger.debug(
              `Skipping inline image ${attachment.filename} for email ${emailId}`,
            );
            continue;
          }

          if (strategy === 'embeddings') {
            // Small document: download + store + queue for embeddings
            const data = await downloadFn(attachment.id);

            if (!data) {
              this.logger.warn(
                `Failed to download document ${attachment.filename}, storing metadata only`,
              );
              // Fall back to metadata-only
              const stored = this.attachmentStorage.storeAttachmentMetadata(
                providerId,
                metadata,
              );
              attachmentRecords.push(
                this.createAttachmentRecord(emailId, stored, attachment),
              );
              continue;
            }

            // Upload to S3/MinIO
            const uploaded = await this.attachmentStorage.uploadAttachment(
              tenantId,
              providerId,
              {
                filename: attachment.filename,
                content: data,
                contentType: attachment.mimeType,
              },
            );

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
            const stored = this.attachmentStorage.storeAttachmentMetadata(
              providerId,
              metadata,
            );

            attachmentRecords.push(
              this.createAttachmentRecord(emailId, stored, attachment),
            );

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
      await this.persistAttachmentRecords(emailId, attachmentRecords);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Failed to process attachments for email ${emailId}: ${error.message}`,
      );
    }
  }

  // ==================== Calendar Integration (Shared) ====================

  /**
   * Persist parsed calendar invitation onto the email record
   */
  protected async saveCalendarInvite(
    emailId: string,
    tenantId: string,
    providerId: string,
    invite: ParsedCalendarInvite,
  ): Promise<void> {
    try {
      await this.prisma.email.update({
        where: { id: emailId },
        data: {
          hasCalendarInvite: true,
          calendarInviteStatus:
            invite.method === 'CANCEL' ? 'declined' : 'pending',
          calendarInviteData: this.serializeInvite(invite),
        },
      });

      await this.syncCalendarEventFromInvite(tenantId, providerId, invite);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to save calendar invite for email ${emailId}: ${err.message}`,
      );
    }
  }

  /**
   * Convert ParsedCalendarInvite to JSON-safe payload (dates to ISO)
   */
  protected serializeInvite(invite: ParsedCalendarInvite): Record<string, any> {
    return {
      ...invite,
      startTime: invite.startTime?.toISOString?.() || invite.startTime,
      endTime: invite.endTime?.toISOString?.() || invite.endTime,
      created: invite.created ? invite.created.toISOString() : undefined,
      lastModified: invite.lastModified
        ? invite.lastModified.toISOString()
        : undefined,
    };
  }

  /**
   * Update existing calendar event when receiving updates or cancellations
   */
  protected async syncCalendarEventFromInvite(
    tenantId: string,
    providerId: string,
    invite: ParsedCalendarInvite,
  ): Promise<void> {
    if (!invite.uid) return;

    const existing = await this.prisma.calendarEvent.findFirst({
      where: {
        tenantId,
        providerId,
        iCalUID: invite.uid,
      },
    });

    if (!existing) return;

    const existingMetadata =
      (existing.metadata as Record<string, any> | null) ?? {};
    const existingSequence =
      typeof existingMetadata.sequence === 'number'
        ? existingMetadata.sequence
        : 0;

    if (invite.method === 'REPLY') {
      await this.handleReplyInvite(existing, invite);
      return;
    }

    if (
      invite.method === 'REQUEST' &&
      invite.sequence !== undefined &&
      invite.sequence <= existingSequence
    ) {
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
        metadata: {
          ...existingMetadata,
          sequence: invite.sequence ?? existingSequence,
        },
      },
    });
  }

  /**
   * Handle REPLY invite method - update attendee status
   */
  private async handleReplyInvite(
    existing: any,
    invite: ParsedCalendarInvite,
  ): Promise<void> {
    const responder = invite.attendees?.find((a) => a.email && a.status);
    if (!responder) return;

    const attendees = Array.isArray(existing.attendees)
      ? [...(existing.attendees as any[])]
      : [];
    const idx = attendees.findIndex(
      (a) =>
        typeof a?.email === 'string' &&
        a.email.toLowerCase() === responder.email.toLowerCase(),
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
  }

  // ==================== Protected Helpers ====================

  /**
   * Create attachment record for database from stored metadata
   */
  protected createAttachmentRecord(
    emailId: string,
    stored: any,
    attachment: AttachmentMeta,
  ): AttachmentRecord {
    return {
      emailId,
      filename: stored.filename,
      mimeType: stored.mimeType,
      size: stored.size,
      contentId: stored.contentId || attachment.contentId || null,
      storageType: stored.storageType,
      storagePath: stored.storagePath || null,
      contentHash: null,
      isInline: stored.isInline,
    };
  }

  /**
   * Persist attachment records to database atomically
   */
  protected async persistAttachmentRecords(
    emailId: string,
    attachmentRecords: AttachmentRecord[],
  ): Promise<void> {
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
  }

  /**
   * Get provider type label for logging
   */
  protected getProviderLabel(): string {
    switch (this.providerType) {
      case 'gmail':
        return 'Gmail';
      case 'microsoft':
        return 'Microsoft';
      case 'imap':
        return 'IMAP';
      default:
        return 'Unknown';
    }
  }
}
