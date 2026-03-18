/**
 * Sync Message Processor Service
 *
 * Extracted from base-email-sync.service.ts (Phase 6 Plan 01)
 * Handles message upsert, batch processing, and deletion operations.
 *
 * Key features preserved:
 * - RC-1: Distributed Redis lock for concurrent upserts
 * - RC-2: User modification check (5-minute window)
 * - RC-6: Conditional update with userModifiedAt check
 * - RC-9: Mandatory lock requirement
 * - P11: Batch indexing for 100+ emails (50% cheaper via Mistral Batch API)
 * - P2002/P2034 retry logic in batch processing
 */

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { RedisLockService } from '../../../common/services/redis-lock.service';
import { CanonicalMessage } from '../drivers/interfaces/canonical.types';
import { IEmailDriver } from '../drivers/interfaces/email-driver.interface';
import {
  MessageProcessorContext,
  DeletionResult,
  UpsertResult,
  BatchResult,
} from '../interfaces/sync-context.interface';
import { isJunkFolder } from '../../email/email.helpers';
import { EmailIndexedEvent } from '../../../common/events/email.events';

@Injectable()
export class SyncMessageProcessorService {
  private readonly logger = new Logger(SyncMessageProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // RedisLockService injected separately (matching base class pattern)
  private redisLock: RedisLockService | null = null;

  /**
   * Set the Redis lock service (injected by parent class)
   * This pattern matches BaseEmailSyncService.setRedisLockService()
   */
  setRedisLockService(redisLock: RedisLockService): void {
    this.redisLock = redisLock;
  }

  /**
   * Parse IMAP external ID to extract folder and UID
   * AUDIT FIX #1: Supports folder:uid format and special markers
   *
   * @param externalId The external ID to parse
   * @returns Object with folder, uid (if valid), and special marker type
   */
  parseImapExternalId(externalId: string): {
    folder: string | null;
    uid: number | null;
    isSpecialMarker: boolean;
    markerType: 'NEW' | 'EXPUNGE' | 'FLAGS' | null;
  } {
    const lastColon = externalId.lastIndexOf(':');

    if (lastColon <= 0) {
      // Legacy format: just UID
      const uid = parseInt(externalId, 10);
      return {
        folder: null,
        uid: isNaN(uid) ? null : uid,
        isSpecialMarker: false,
        markerType: null,
      };
    }

    const folder = externalId.substring(0, lastColon);
    const uidPart = externalId.substring(lastColon + 1);

    // Check for special markers
    if (uidPart.startsWith('__NEW__')) {
      return { folder, uid: null, isSpecialMarker: true, markerType: 'NEW' };
    }
    if (uidPart.startsWith('__EXPUNGE__')) {
      return { folder, uid: null, isSpecialMarker: true, markerType: 'EXPUNGE' };
    }
    if (uidPart.startsWith('__FLAGS__')) {
      return { folder, uid: null, isSpecialMarker: true, markerType: 'FLAGS' };
    }

    // Normal folder:uid format
    const uid = parseInt(uidPart, 10);
    return {
      folder,
      uid: isNaN(uid) ? null : uid,
      isSpecialMarker: false,
      markerType: null,
    };
  }

  /**
   * Handle message deletion - mark as deleted in database and emit events
   * This is identical across all providers and has been moved to base class
   *
   * Phase 4 Deduplication: Removes ~30 lines of duplicate code per provider
   * AUDIT FIX #1: Now handles folder:uid format for IMAP
   *
   * @param messageId - External message ID from provider
   * @param providerId - Provider ID
   * @param tenantId - Tenant ID
   * @returns Object indicating if reconciliation is needed
   */
  async handleDeletion(
    messageId: string,
    providerId: string,
    tenantId: string,
  ): Promise<DeletionResult> {
    // AUDIT FIX #1: Parse the messageId to handle folder:uid format
    const parsed = this.parseImapExternalId(messageId);

    // Special markers indicate reconciliation is needed
    if (parsed.isSpecialMarker && parsed.markerType === 'EXPUNGE') {
      this.logger.debug(`IMAP deletion reconciliation needed for folder: ${parsed.folder}`);
      return { needsReconciliation: true, folder: parsed.folder || undefined };
    }

    // Build query based on format
    // Try to match both folder:uid format and just uid for backwards compatibility
    const existing = await this.prisma.email.findFirst({
      where: {
        providerId,
        OR: [
          // Match full folder:uid format (new)
          { externalId: messageId },
          // Match just the UID part for backwards compatibility
          ...(parsed.uid !== null ? [{ externalId: parsed.uid.toString() }] : []),
          // Match folder:uid format if we have both parts
          ...(parsed.folder && parsed.uid !== null
            ? [{ externalId: `${parsed.folder}:${parsed.uid}` }]
            : []),
        ],
      },
      select: { id: true, folder: true, externalId: true },
    });

    if (!existing) {
      this.logger.debug(`Message not found for deletion: ${messageId}`);
      return { needsReconciliation: false };
    }

    // Mark as deleted or move to trash
    await this.prisma.email.update({
      where: { id_tenantId: { id: existing.id, tenantId } },
      data: {
        isDeleted: true,
        folder: 'TRASH',
      },
    });

    // Emit realtime event
    this.realtimeEvents.emitEmailDelete(tenantId, {
      emailId: existing.id,
      providerId,
      folder: existing.folder,
      reason: 'message-deleted',
    });

    return { needsReconciliation: false };
  }

  /**
   * Upsert a message from driver canonical format into database
   * This is nearly identical across all providers - only attachment processing differs
   *
   * RACE CONDITION FIX RC-1: Uses distributed Redis lock to prevent duplicate upserts
   * RACE CONDITION FIX RC-2: Uses optimistic locking to preserve user mutations
   * RACE CONDITION FIX RC-6: Conditional update with userModifiedAt check
   * RACE CONDITION FIX RC-9: Mandatory lock requirement
   *
   * Phase 4 Deduplication: Removes ~90 lines of duplicate code per provider
   *
   * @param driver - The connected email driver
   * @param canonicalMsg - Message in canonical format
   * @param providerId - Provider ID
   * @param tenantId - Tenant ID
   * @param context - Message processor context with callbacks
   * @returns Object indicating if the message was new
   */
  async upsertMessage(
    driver: IEmailDriver,
    canonicalMsg: CanonicalMessage,
    providerId: string,
    tenantId: string,
    context: MessageProcessorContext,
  ): Promise<UpsertResult> {
    // RC-1 FIX: Create unique lock key for this message (folder-independent - externalId is globally unique)
    const lockKey = `email:upsert:${providerId}:${canonicalMsg.id}`;
    const lockTtlMs = 5000; // 5 second timeout

    // Execute upsert with distributed lock (if available)
    const executeUpsert = async (): Promise<UpsertResult> => {
      // RC-2 FIX: Check for recent user modifications before overwriting
      // FIX 2025-01-07: Use providerId_externalId (not folder) to find email regardless of current folder
      const existing = await this.prisma.email.findUnique({
        where: {
          providerId_externalId: {
            providerId,
            externalId: canonicalMsg.id,
          },
        },
        select: {
          id: true,
          version: true,
          userModifiedAt: true,
          isRead: true,
          isStarred: true,
          isFlagged: true,
          folder: true,
          labels: true,
        },
      });

      // Full body sync: Store both bodyText and bodyHtml
      // This ensures AI embeddings work and UI displays properly
      const hasBody = Boolean(canonicalMsg.bodyText || canonicalMsg.bodyHtml);

      // Common data for both create and update
      const baseUpdateData = {
        subject: canonicalMsg.subject || '(No Subject)',
        from: canonicalMsg.from.email,
        to: canonicalMsg.to?.map((r) => r.email) || [],
        cc: canonicalMsg.cc?.map((r) => r.email) || [],
        bcc: canonicalMsg.bcc?.map((r) => r.email) || [],
        bodyText: canonicalMsg.bodyText || '',
        bodyHtml: canonicalMsg.bodyHtml || '',
        snippet: canonicalMsg.snippet || '',
        receivedAt: canonicalMsg.receivedAt,
        isBodyFetched: hasBody,
      };

      // RC-2 FIX: If user recently modified the email, preserve their changes
      // User modifications within the last 5 minutes take precedence
      const userModifiedRecently =
        existing?.userModifiedAt &&
        Date.now() - existing.userModifiedAt.getTime() < 5 * 60 * 1000;

      const updateData = userModifiedRecently
        ? {
            ...baseUpdateData,
            // Preserve user's state changes when they modified recently
            // Only update content fields, not state fields
          }
        : {
            ...baseUpdateData,
            isRead: canonicalMsg.isRead ?? false,
            isStarred: canonicalMsg.isStarred ?? false,
            isFlagged: canonicalMsg.isFlagged ?? false,
            labels: canonicalMsg.labels || [],
            folder: canonicalMsg.folder,
          };

      let result;
      let wasNew: boolean;

      if (existing) {
        // RC-6 FIX: Use conditional update with userModifiedAt check
        // This prevents overwriting user modifications that occurred after our read
        // The WHERE clause ensures update only succeeds if userModifiedAt hasn't changed
        const originalUserModifiedAt = existing.userModifiedAt;

        if (userModifiedRecently) {
          // User modified recently - only update content fields (already handled in updateData)
          result = await this.prisma.email.update({
            where: { id_tenantId: { id: existing.id, tenantId } },
            data: {
              ...updateData,
              version: { increment: 1 },
            },
          });
          this.logger.debug(
            `Preserved user modifications for email ${existing.id} (modified ${Math.round((Date.now() - existing.userModifiedAt!.getTime()) / 1000)}s ago)`,
          );
        } else {
          // No recent user modification at check time - use conditional update
          // This ensures we don't overwrite changes made between check and update
          const conditionalUpdate = await this.prisma.$executeRaw`
            UPDATE "emails"
            SET
              "subject" = ${updateData.subject},
              "from" = ${updateData.from},
              "to" = ${updateData.to},
              "cc" = ${updateData.cc},
              "bcc" = ${updateData.bcc},
              "bodyText" = ${updateData.bodyText},
              "bodyHtml" = ${updateData.bodyHtml},
              "snippet" = ${updateData.snippet},
              "receivedAt" = ${updateData.receivedAt},
              "isBodyFetched" = ${updateData.isBodyFetched},
              "isRead" = ${(updateData as any).isRead ?? existing.isRead},
              "isStarred" = ${(updateData as any).isStarred ?? existing.isStarred},
              "isFlagged" = ${(updateData as any).isFlagged ?? existing.isFlagged},
              "labels" = ${(updateData as any).labels ?? existing.labels},
              "folder" = ${(updateData as any).folder ?? existing.folder},
              "version" = "version" + 1,
              "updatedAt" = NOW()
            WHERE "id" = ${existing.id} AND "tenantId" = ${tenantId}
              AND (
                "userModifiedAt" IS NULL
                OR "userModifiedAt" = ${originalUserModifiedAt}
              )
          `;

          if (conditionalUpdate === 0) {
            // User modified email during sync - skip update to preserve their changes
            this.logger.debug(
              `RC-6: User modified email ${existing.id} during sync, preserving user state`,
            );
            // Re-fetch to return current state
            result = await this.prisma.email.findUnique({
              where: { id_tenantId: { id: existing.id, tenantId } },
            });
            if (!result) {
              throw new Error(`Email ${existing.id} was deleted during sync`);
            }
            return { wasNew: false, conflictDetected: true };
          }

          // Update succeeded - fetch the updated record
          result = await this.prisma.email.findUnique({
            where: { id_tenantId: { id: existing.id, tenantId } },
          });
          if (!result) {
            throw new Error(`Email ${existing.id} was deleted during sync`);
          }
        }
        wasNew = false;
      } else {
        // Create new record
        result = await this.prisma.email.create({
          data: {
            tenantId,
            providerId,
            externalId: canonicalMsg.id,
            ...baseUpdateData,
            isRead: canonicalMsg.isRead ?? false,
            isStarred: canonicalMsg.isStarred ?? false,
            isFlagged: canonicalMsg.isFlagged ?? false,
            labels: canonicalMsg.labels || [],
            sentAt: canonicalMsg.sentAt || canonicalMsg.receivedAt,
            isDeleted: false,
            folder: canonicalMsg.folder,
            threadId: canonicalMsg.threadId || null,
            version: 1,
          },
        });
        wasNew = true;
      }

      // Process attachments using provider-specific implementation (via context callback)
      if (canonicalMsg.hasAttachments && canonicalMsg.attachments.length > 0) {
        await context.processAttachments(
          driver,
          result.id,
          tenantId,
          providerId,
          canonicalMsg.id,
          canonicalMsg.attachments,
        );
      }

      // Only queue embeddings and emit events for new messages
      if (wasNew) {
        // Phase 45-03: Emit domain event instead of direct embedding queue call
        // AiModule's EmailIndexedHandler listens and enqueues the embedding job
        if (!isJunkFolder(result.folder)) {
          this.eventEmitter.emit(
            EmailIndexedEvent.eventName,
            new EmailIndexedEvent(
              result.id,
              tenantId,
              providerId,
              result.subject,
              result.snippet || '',
              result.bodyText || '',
              result.bodyHtml || '',
              result.from || '',
              result.receivedAt || new Date(),
            ),
          );
        }

        // Emit realtime event
        this.realtimeEvents.emitEmailNew(tenantId, {
          emailId: result.id,
          providerId,
          folder: result.folder,
          reason: 'message-processed',
        });

      }

      return { wasNew, conflictDetected: userModifiedRecently ?? false };
    };

    // RC-9 FIX: Execute with MANDATORY distributed lock
    // Lock is now required to prevent race conditions in multi-worker environments
    // FIX Phase 1.4: Throw error instead of silent fallback - locks are REQUIRED
    if (!this.redisLock) {
      throw new Error(
        `RC-9: RedisLockService not available for email upsert. ` +
          `Distributed locking is REQUIRED in multi-worker environments. ` +
          `Ensure RedisLockService is properly injected.`,
      );
    }

    try {
      return await this.redisLock.withLock(lockKey, lockTtlMs, executeUpsert);
    } catch (lockError) {
      // FIX Phase 1.4: Throw error on lock failure instead of proceeding without lock
      // Proceeding without lock causes race conditions and data corruption
      // If Redis is consistently failing, the system should stop and alert
      this.logger.error(
        `RC-9: Lock acquisition failed for ${lockKey}: ${lockError instanceof Error ? lockError.message : String(lockError)}`,
      );
      throw new Error(
        `RC-9: Failed to acquire distributed lock for ${lockKey}. ` +
          `Email upsert aborted to prevent race conditions. ` +
          `Check Redis connectivity.`,
      );
    }
  }

  /**
   * Process a batch of messages using transaction for DB operations
   * Performance fix (N1-4/N1-5): Reduces DB round-trips by batching upserts
   *
   * P11: Batch indexing for 100+ emails (50% cheaper via Mistral Batch API)
   *
   * Phase 4 Deduplication: Removes ~90 lines of duplicate code per provider
   *
   * @param driver - The connected email driver
   * @param messages - Array of messages in canonical format
   * @param providerId - Provider ID
   * @param tenantId - Tenant ID
   * @param context - Message processor context with callbacks
   * @returns Object with processed count and new message count
   */
  async processBatch(
    driver: IEmailDriver,
    messages: CanonicalMessage[],
    providerId: string,
    tenantId: string,
    context: MessageProcessorContext,
  ): Promise<BatchResult> {
    if (messages.length === 0) {
      return { processed: 0, newCount: 0 };
    }

    // BUG FIX B-5: Query existing emails to check userModifiedAt
    // This prevents overwriting user's flag changes during full sync
    const externalIds = messages.map((m) => m.id);
    const existingEmails = await this.prisma.email.findMany({
      where: {
        providerId,
        externalId: { in: externalIds },
      },
      select: {
        externalId: true,
        folder: true,
        userModifiedAt: true,
      },
    });

    // Derive existing email IDs from the first query (eliminates second DB roundtrip)
    const existingEmailIds = new Set(existingEmails.map((e) => e.externalId));

    // Build lookup map: `externalId:folder` -> userModifiedAt
    const userModifiedMap = new Map<string, Date | null>();
    for (const email of existingEmails) {
      userModifiedMap.set(`${email.externalId}:${email.folder}`, email.userModifiedAt);
    }

    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;

    // Prepare all upsert operations
    const upsertOps = messages.map((msg) => {
      // BUG FIX B-5: Check if user modified this email recently
      const userModifiedAt = userModifiedMap.get(`${msg.id}:${msg.folder}`);
      const userModifiedRecently = userModifiedAt && now - userModifiedAt.getTime() < FIVE_MINUTES;

      // Full body sync for AI and UI
      const hasBody = Boolean(msg.bodyText || msg.bodyHtml);

      // Base update data (content fields only)
      const baseUpdateData = {
        subject: msg.subject || '(No Subject)',
        from: msg.from.email,
        to: msg.to?.map((r) => r.email) || [],
        cc: msg.cc?.map((r) => r.email) || [],
        bcc: msg.bcc?.map((r) => r.email) || [],
        bodyText: msg.bodyText || '',
        bodyHtml: msg.bodyHtml || '',
        snippet: msg.snippet || '',
        receivedAt: msg.receivedAt,
        isBodyFetched: hasBody,
      };

      // Only include state fields if user didn't modify recently
      const updateData = userModifiedRecently
        ? baseUpdateData
        : {
            ...baseUpdateData,
            isRead: msg.isRead ?? false,
            isStarred: msg.isStarred ?? false,
            isFlagged: msg.isFlagged ?? false,
            labels: msg.labels || [],
          };

      // FIX 2025-01-07: Use providerId_externalId (not folder) to properly handle folder moves
      return this.prisma.email.upsert({
        where: {
          providerId_externalId: {
            providerId,
            externalId: msg.id,
          },
        },
        update: { ...updateData, folder: msg.folder }, // Update folder to new location
        create: {
          tenantId,
          providerId,
          externalId: msg.id,
          ...baseUpdateData,
          isRead: msg.isRead ?? false,
          isStarred: msg.isStarred ?? false,
          isFlagged: msg.isFlagged ?? false,
          labels: msg.labels || [],
          sentAt: msg.sentAt || msg.receivedAt,
          isDeleted: false,
          folder: msg.folder,
          threadId: msg.threadId || null,
        },
      });
    });

    // Execute upserts in chunked transactions to avoid interactive transaction timeout (5s default).
    // Large batches (100+ messages) can exceed the timeout over network to Railway Postgres.
    // Per Prisma best practices: handle P2002 (unique constraint) and P2034 (deadlock) and retry.
    const MAX_RETRIES = 3;
    const CHUNK_SIZE = 25;
    const results: Awaited<ReturnType<typeof this.prisma.email.upsert>>[] = [];

    for (let chunkStart = 0; chunkStart < upsertOps.length; chunkStart += CHUNK_SIZE) {
      const chunk = upsertOps.slice(chunkStart, chunkStart + CHUNK_SIZE);
      let retryCount = 0;

      while (true) {
        try {
          const chunkResults = await this.prisma.$transaction(chunk);
          results.push(...chunkResults);
          break; // Success - exit retry loop
        } catch (error: unknown) {
          const isPrismaError = error && typeof error === 'object' && 'code' in error;
          const errorCode = isPrismaError ? (error as { code: string }).code : null;
          const isRetryable = errorCode === 'P2002' || errorCode === 'P2034';

          if (isRetryable && retryCount < MAX_RETRIES) {
            retryCount++;
            const errorType = errorCode === 'P2002' ? 'unique constraint' : 'deadlock/write conflict';
            this.logger.warn(
              `${errorCode} ${errorType} error on batch upsert chunk ${chunkStart / CHUNK_SIZE + 1} (attempt ${retryCount}/${MAX_RETRIES}). ` +
                `Retrying in ${100 * retryCount}ms...`,
            );
            // Exponential backoff: 100ms, 200ms, 300ms
            await new Promise((resolve) => setTimeout(resolve, 100 * retryCount));
            continue;
          }

          // Non-retryable error or max retries exceeded
          this.logger.error(
            `Batch upsert failed after ${retryCount} retries: ${error instanceof Error ? error.message : String(error)}`,
          );
          throw error;
        }
      }
    }

    // Track new messages and process post-upsert operations
    let newCount = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const msg = messages[i];
      // HIGH-1 FIX: Use pre-query Set instead of unreliable timestamp comparison
      const wasNew = !existingEmailIds.has(msg.id);

      if (wasNew) {
        newCount++;

        // Phase 45-03: Emit domain event instead of direct embedding queue call
        if (!isJunkFolder(result.folder)) {
          this.eventEmitter.emit(
            EmailIndexedEvent.eventName,
            new EmailIndexedEvent(
              result.id,
              tenantId,
              providerId,
              result.subject,
              result.snippet || '',
              result.bodyText || '',
              result.bodyHtml || '',
              result.from || '',
              result.receivedAt || new Date(),
            ),
          );
        }

        // Emit realtime event
        this.realtimeEvents.emitEmailNew(tenantId, {
          emailId: result.id,
          providerId,
          folder: result.folder,
          reason: 'message-processed',
        });

      }

      // Process attachments (must be sequential - involves external API calls)
      if (msg.hasAttachments && msg.attachments.length > 0) {
        await context.processAttachments(
          driver,
          result.id,
          tenantId,
          providerId,
          msg.id,
          msg.attachments,
        );
      }
    }

    return { processed: results.length, newCount };
  }
}
