import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { gmail_v1, google } from 'googleapis';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CryptoService } from '../../../../common/services/crypto.service';
import { ProviderTokenService } from '../provider-token.service';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { isSystemFolder, SYSTEM_LABEL_IDS } from '../../drivers/interfaces/canonical.types';

/**
 * Gmail-specific folder (labels) management service
 * Handles Gmail label synchronization and folder determination logic
 *
 * Architectural pattern: Pluggable adapter (inspired by Mail-0/Zero)
 * - Provider-specific implementation for Gmail labels
 * - Clear separation from core sync logic
 * - Injectable dependencies for testability
 */
@Injectable()
export class GmailFolderService {
  private readonly logger = new Logger(GmailFolderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly providerTokenService: ProviderTokenService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  getFolderPathForLabel(labelId: string, labelName: string): string {
    return this.labelIdToFolderPath(labelId, labelName);
  }

  getSpecialUseForLabel(labelId: string): string | undefined {
    return this.determineFolderTypeFromLabelId(labelId);
  }

  /**
   * Determine primary folder from Gmail label IDs
   * Gmail uses labels instead of folders, this maps labels to folder names
   *
   * @param labelIds - Array of Gmail label IDs
   * @param fallback - Fallback folder name if no match found
   * @returns Folder name (INBOX, SENT, TRASH, etc.)
   */
  determineFolderFromLabels(labelIds?: string[], fallback?: string): string {
    if (!labelIds || labelIds.length === 0) {
      return fallback ?? 'INBOX';
    }

    if (labelIds.includes('TRASH')) {
      return 'TRASH';
    }

    if (labelIds.includes('SPAM')) {
      return 'SPAM';
    }

    if (labelIds.includes('SENT')) {
      return 'SENT';
    }

    if (labelIds.includes('DRAFT') || labelIds.includes('DRAFTS')) {
      return 'DRAFTS';
    }

    // Check for Gmail categories BEFORE generic INBOX
    // Gmail adds both INBOX and CATEGORY_ labels, so we prioritize categories
    const categoryLabel = labelIds.find((label) => label.startsWith('CATEGORY_'));
    if (categoryLabel) {
      switch (categoryLabel) {
        case 'CATEGORY_PERSONAL':
          return 'INBOX';
        case 'CATEGORY_SOCIAL':
          return 'SOCIAL';
        case 'CATEGORY_PROMOTIONS':
          return 'PROMOTIONS';
        case 'CATEGORY_UPDATES':
          return 'UPDATES';
        case 'CATEGORY_FORUMS':
          return 'FORUMS';
        default:
          break;
      }
    }

    if (labelIds.includes('INBOX')) {
      return 'INBOX';
    }

    // FIX C2: Emails with only custom labels (Label_xyz) or non-folder system
    // labels (STARRED, IMPORTANT, UNREAD) were incorrectly defaulting to INBOX.
    // In Gmail, absence of INBOX label means the email was archived.
    return fallback ?? 'ARCHIVE';
  }

  /**
   * Sync Gmail labels as folders
   * Fetches all labels from Gmail API and syncs them to the database
   *
   * @param gmail - Gmail API client
   * @param tenantId - Tenant ID
   * @param providerId - Provider config ID
   */
  async syncGmailFolders(
    gmail: gmail_v1.Gmail,
    tenantId: string,
    providerId: string,
  ): Promise<Map<string, string>> {
    this.logger.log(`Starting Gmail folder (labels) sync for provider ${providerId}`);

    try {
      // List all labels
      const labelsResponse = await gmail.users.labels.list({
        userId: 'me',
      });

      const labels = labelsResponse.data.labels || [];
      this.logger.log(`Found ${labels.length} Gmail labels for provider ${providerId}`);

      // Get existing folders
      const existingFolders = await (this.prisma as any).folder.findMany({
        where: { providerId, tenantId },
      });

      const existingPaths = new Set<string>(existingFolders.map((f: any) => f.path as string));
      // Convert new label IDs to folder paths using the same mapping as syncGmailFolders
      const newPaths = new Set<string>(
        labels
          .filter((l): l is gmail_v1.Schema$Label & { id: string; name: string } => !!l.id && !!l.name)
          .map((l) => this.labelIdToFolderPath(l.id, l.name)),
      );

      // Delete folders that no longer exist
      const deletedPaths: string[] = [];
      existingPaths.forEach((path) => {
        if (!newPaths.has(path)) {
          deletedPaths.push(path);
        }
      });

      if (deletedPaths.length > 0) {
        this.logger.log(`Deleting ${deletedPaths.length} removed Gmail labels`);
        await (this.prisma as any).folder.deleteMany({
          where: {
            providerId,
            path: { in: deletedPaths },
          },
        });
      }

      // Fetch real counts from Gmail API (labels.list doesn't include messagesTotal/messagesUnread)
      const labelsToSync = labels.filter(
        (l): l is gmail_v1.Schema$Label & { id: string; name: string } =>
          !!l.id && !!l.name && l.id !== 'CATEGORY_PERSONAL',
      );

      // Batch labels.get calls (Gmail rate limit: 10 req/s per user)
      const BATCH_SIZE = 8;
      const enrichedLabels = new Map<string, { messagesTotal: number; messagesUnread: number }>();

      for (let i = 0; i < labelsToSync.length; i += BATCH_SIZE) {
        const batch = labelsToSync.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (label) => {
            try {
              const detail = await gmail.users.labels.get({ userId: 'me', id: label.id });
              return {
                id: label.id,
                messagesTotal: detail.data.messagesTotal || 0,
                messagesUnread: detail.data.messagesUnread || 0,
              };
            } catch {
              // If labels.get fails for one label, fall back to 0
              return { id: label.id, messagesTotal: 0, messagesUnread: 0 };
            }
          }),
        );
        results.forEach((r) => enrichedLabels.set(r.id, r));
      }

      // Build map of existing folders for change detection
      const existingCountMap = new Map<string, { totalCount: number; unreadCount: number; id: string }>();
      for (const f of existingFolders) {
        existingCountMap.set(f.path, { totalCount: f.totalCount ?? 0, unreadCount: f.unreadCount ?? 0, id: f.id });
      }

      // Sync each label as a folder
      for (const label of labelsToSync) {
        // CRITICAL: folder.path MUST match what determineFolderFromLabels returns
        // This ensures email.folder can join with folder.path
        // determineFolderFromLabels returns: INBOX, SENT, TRASH, SPAM, PROMOTIONS, SOCIAL, UPDATES, FORUMS, DRAFTS
        const folderPath = this.labelIdToFolderPath(label.id, label.name);

        // Determine special use from Gmail label ID
        const specialUse = this.determineFolderTypeFromLabelId(label.id);

        // Determine if selectable
        const isSelectable = label.type !== 'system' || specialUse !== undefined;

        // Determine if this is a system folder (protected from edit/delete)
        const isSystem = isSystemFolder(specialUse ?? '');

        // Use Gmail's authoritative counts from labels.get
        const counts = enrichedLabels.get(label.id) || { messagesTotal: 0, messagesUnread: 0 };

        const upsertResult = await (this.prisma as any).folder.upsert({
          where: {
            providerId_path: {
              providerId,
              path: folderPath,
            },
          },
          create: {
            tenantId,
            providerId,
            path: folderPath,
            externalId: label.id,
            name: label.name,
            delimiter: '/',
            specialUse,
            isSystem,
            isSelectable,
            totalCount: counts.messagesTotal,
            unreadCount: counts.messagesUnread,
            level: 0,
          },
          update: {
            name: label.name,
            externalId: label.id,
            specialUse,
            isSystem,
            isSelectable,
            totalCount: counts.messagesTotal,
            unreadCount: counts.messagesUnread,
            lastSyncedAt: new Date(),
          },
        });

        // Emit realtime event if counts changed
        const existing = existingCountMap.get(folderPath);
        if (!existing || existing.totalCount !== counts.messagesTotal || existing.unreadCount !== counts.messagesUnread) {
          this.realtimeEvents.emitFolderCountsUpdate(tenantId, {
            providerId,
            folderId: upsertResult.id,
            folderName: label.name,
            totalCount: counts.messagesTotal,
            unreadCount: counts.messagesUnread,
            timestamp: new Date().toISOString(),
          });
        }
      }

      this.logger.log(`Synced ${labelsToSync.length} Gmail labels as folders for provider ${providerId}`);

      // Build label ID -> name mapping
      const labelIdToName = new Map<string, string>();
      for (const label of labels) {
        if (label.id && label.name) {
          labelIdToName.set(label.id, label.name);
        }
      }

      // FIX C1: Clean stale label IDs from Email.labels[]
      // Valid IDs = Gmail response labels + system labels (always valid)
      const validLabelIds = new Set<string>([
        ...labelIdToName.keys(),
        ...SYSTEM_LABEL_IDS,
      ]);

      await this.cleanStaleLabels(tenantId, providerId, validLabelIds);

      return labelIdToName;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Error syncing Gmail folders for provider ${providerId}: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }

  /**
   * Convert Gmail label ID to folder path that matches what determineFolderFromLabels returns
   * This ensures email.folder can properly join with folder.path
   *
   * @param labelId - Gmail label ID (e.g., 'CATEGORY_PROMOTIONS', 'INBOX')
   * @param labelName - Gmail label display name (used for custom labels)
   * @returns Folder path that matches determineFolderFromLabels output
   */
  private labelIdToFolderPath(labelId: string, labelName: string): string {
    // Map category labels to simplified names (matches determineFolderFromLabels)
    const categoryMap: Record<string, string> = {
      CATEGORY_PERSONAL: 'INBOX', // Personal goes to INBOX
      CATEGORY_SOCIAL: 'SOCIAL',
      CATEGORY_PROMOTIONS: 'PROMOTIONS',
      CATEGORY_UPDATES: 'UPDATES',
      CATEGORY_FORUMS: 'FORUMS',
    };

    if (categoryMap[labelId]) {
      return categoryMap[labelId];
    }

    // System labels use their ID as path
    const systemLabels = [
      'INBOX',
      'SENT',
      'TRASH',
      'SPAM',
      'DRAFT',
      'STARRED',
      'IMPORTANT',
      'UNREAD',
      'CHAT',
    ];
    if (systemLabels.includes(labelId)) {
      // DRAFT -> DRAFTS to match determineFolderFromLabels
      return labelId === 'DRAFT' ? 'DRAFTS' : labelId;
    }

    // For custom labels (Label_xxx or label_xxx), use the label name as path
    // This allows custom labels to be properly identified
    // Gmail can return both "Label_" and "label_" prefixes
    if (labelId.startsWith('Label_') || labelId.startsWith('label_')) {
      return labelName;
    }

    // Default: use label ID
    return labelId;
  }

  /**
   * Determine folder type (specialUse) from Gmail label ID
   * Maps Gmail system labels to standard folder types
   *
   * @param labelId - Gmail label ID (e.g., 'INBOX', 'SENT', 'TRASH')
   * @returns Folder type or undefined for non-standard labels
   */
  private determineFolderTypeFromLabelId(labelId: string): string | undefined {
    // Map Gmail label IDs to specialUse values
    // Labels with specialUse are protected from deletion in the UI
    const labelMap: Record<string, string | undefined> = {
      // Core system folders - PROTECTED
      'INBOX': 'INBOX',
      'SENT': 'SENT',
      'DRAFT': 'DRAFTS',
      'TRASH': 'TRASH',
      'SPAM': 'JUNK',
      'STARRED': 'FLAGGED',
      'IMPORTANT': 'IMPORTANT',
      // Gmail categories - PROTECTED (can't be deleted via API)
      'CATEGORY_PERSONAL': 'CATEGORY_PERSONAL',
      'CATEGORY_SOCIAL': 'CATEGORY_SOCIAL',
      'CATEGORY_PROMOTIONS': 'CATEGORY_PROMOTIONS',
      'CATEGORY_UPDATES': 'CATEGORY_UPDATES',
      'CATEGORY_FORUMS': 'CATEGORY_FORUMS',
      // Gmail system labels - PROTECTED (cannot be deleted, keep as-is for specialUse)
      'UNREAD': 'UNREAD',
      'CHAT': 'CHAT',
      'MUTED': 'MUTED',
      // Gmail star variants - system labels
      'YELLOW_STAR': 'YELLOW_STAR',
      'BLUE_STAR': 'BLUE_STAR',
      'GREEN_STAR': 'GREEN_STAR',
      'RED_STAR': 'RED_STAR',
      'ORANGE_STAR': 'ORANGE_STAR',
      'PURPLE_STAR': 'PURPLE_STAR',
    };

    return labelMap[labelId];
  }

  // ========== UNIFIED FACADE METHODS ==========

  /**
   * Unified sync method for facade pattern
   * Creates Gmail client internally and delegates to syncGmailFolders
   *
   * @param tenantId - Tenant ID
   * @param providerId - Provider config ID
   */
  async syncFolders(tenantId: string, providerId: string): Promise<Map<string, string>> {
    // P0-5 FIX: Pass tenantId to enforce tenant isolation
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId, tenantId);

    // Create OAuth2 client with access token
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    return this.syncGmailFolders(gmail, tenantId, providerId);
  }

  /**
   * Get label ID -> name mapping from persisted Folder records.
   * Uses the DB as source of truth (populated during syncGmailFolders).
   *
   * @returns Map of Gmail label ID (externalId) -> label name
   */
  async getLabelMapping(
    tenantId: string,
    providerId: string,
  ): Promise<Map<string, string>> {
    const folders = await this.prisma.folder.findMany({
      where: { tenantId, providerId },
      select: { externalId: true, name: true },
    });

    const mapping = new Map<string, string>();
    for (const folder of folders) {
      if (folder.externalId) {
        mapping.set(folder.externalId, folder.name);
      }
    }
    return mapping;
  }

  /**
   * Detect stale label IDs in Email.labels[] that no longer exist in Gmail.
   * Compares stored label IDs against the current label mapping.
   *
   * @param labelIds - Array of Gmail label IDs from an Email record
   * @param validLabelIds - Set of currently valid Gmail label IDs
   * @returns Array of stale label IDs not found in current Gmail labels
   */
  findStaleLabels(labelIds: string[], validLabelIds: Set<string>): string[] {
    return labelIds.filter((id) => !validLabelIds.has(id));
  }

  /**
   * Remove stale label IDs from Email.labels[] for a provider.
   * Called after folder sync to clean up IDs of deleted/renamed Gmail labels.
   * Preserves Email.folder — only cleans the raw labels array.
   *
   * Uses batch raw SQL to avoid N+1 queries.
   */
  private async cleanStaleLabels(
    tenantId: string,
    providerId: string,
    validLabelIds: Set<string>,
  ): Promise<void> {
    // Query emails that have any labels for this provider
    // We need raw SQL because Prisma can't express "array contains element NOT in set"
    const validArray = Array.from(validLabelIds);

    // Find emails where labels[] contains at least one ID not in validLabelIds
    // PostgreSQL: check if labels array has elements not contained in the valid set
    const staleEmails: Array<{ id: string; labels: string[] }> = await this.prisma.$queryRaw`
      SELECT "id", "labels"
      FROM "emails"
      WHERE "tenantId" = ${tenantId}
        AND "providerId" = ${providerId}
        AND array_length("labels", 1) > 0
        AND NOT "labels" <@ ${validArray}::text[]
      LIMIT 5000
    `;

    if (staleEmails.length === 0) {
      return;
    }

    this.logger.log(`Found ${staleEmails.length} emails with stale label IDs for provider ${providerId}`);

    // Batch update: remove stale IDs from each email's labels array
    // Use a single UPDATE with array_intersect pattern
    const updatedCount = await this.prisma.$executeRaw`
      UPDATE "emails"
      SET "labels" = (
        SELECT array_agg(elem)
        FROM unnest("labels") AS elem
        WHERE elem = ANY(${validArray}::text[])
      ),
      "updatedAt" = NOW()
      WHERE "tenantId" = ${tenantId}
        AND "providerId" = ${providerId}
        AND array_length("labels", 1) > 0
        AND NOT "labels" <@ ${validArray}::text[]
    `;

    this.logger.log(`Cleaned stale labels from ${updatedCount} emails for provider ${providerId}`);
  }

  // ========== GMAIL LABEL CRUD OPERATIONS ==========

  /**
   * Create a new Gmail label
   * FIX 1.2: Validates that label name doesn't conflict with reserved system folder names
   */
  async createGmailFolder(
    providerId: string,
    name: string,
  ): Promise<{ externalId: string; path: string }> {
    // FIX 1.2: Validate that label name doesn't conflict with reserved system folder names
    const RESERVED_NAMES = [
      'INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'JUNK',
      'ARCHIVE', 'ALL', 'FLAGGED', 'IMPORTANT',
    ];
    const normalizedName = name.toUpperCase().trim();

    if (RESERVED_NAMES.includes(normalizedName)) {
      throw new ConflictException(
        `Cannot create label with reserved system folder name: "${name}". Please choose a different name.`,
      );
    }

    // Also check for CATEGORY_ prefix (Gmail internal categories)
    if (normalizedName.startsWith('CATEGORY_')) {
      throw new ConflictException(
        `Cannot create label with CATEGORY_ prefix: "${name}". This prefix is reserved for Gmail categories.`,
      );
    }

    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    try {
      const response = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });

      const labelId = response.data.id!;
      this.logger.log(`Created Gmail label "${name}" with ID: ${labelId}`);
      return { externalId: labelId, path: labelId };
    } catch (error: any) {
      const status = error?.code || error?.response?.status;
      if (status === 409) {
        // Gmail returns 409 for duplicate label names
        throw new ConflictException('A label with this name already exists on Gmail');
      }
      throw error;
    }
  }

  /**
   * Rename a Gmail label
   */
  async renameGmailFolder(
    providerId: string,
    labelId: string,
    newName: string,
  ): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    await gmail.users.labels.update({
      userId: 'me',
      id: labelId,
      requestBody: { name: newName },
    });

    this.logger.log(`Renamed Gmail label ${labelId} to "${newName}"`);
  }

  /**
   * Delete a Gmail label
   */
  async deleteGmailFolder(providerId: string, labelId: string): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    await gmail.users.labels.delete({
      userId: 'me',
      id: labelId,
    });

    this.logger.log(`Deleted Gmail label ${labelId}`);
  }
}
