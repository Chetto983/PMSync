import { Injectable, Logger } from '@nestjs/common';
import { gmail_v1 } from 'googleapis';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CryptoService } from '../../../../common/services/crypto.service';

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
  ) {}

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

    return fallback ?? 'INBOX';
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
  ): Promise<void> {
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

      // Sync each label as a folder
      for (const label of labels) {
        if (!label.id || !label.name) continue;

        // Determine special use
        const specialUse = this.determineFolderTypeFromLabelId(label.id);

        // Determine if selectable
        const isSelectable = label.type !== 'system' || specialUse !== undefined;

        // CRITICAL: folder.path MUST match what determineFolderFromLabels returns
        // This ensures email.folder can join with folder.path
        // determineFolderFromLabels returns: INBOX, SENT, TRASH, SPAM, PROMOTIONS, SOCIAL, UPDATES, FORUMS, DRAFTS
        const folderPath = this.labelIdToFolderPath(label.id, label.name);

        await (this.prisma as any).folder.upsert({
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
            externalId: label.id, // Keep original label ID for API operations
            name: label.name,
            delimiter: '/',
            specialUse,
            isSelectable,
            totalCount: label.messagesTotal || 0,
            unreadCount: label.messagesUnread || 0,
            level: 0,
          },
          update: {
            name: label.name,
            externalId: label.id, // Update external ID if needed
            specialUse,
            isSelectable,
            totalCount: label.messagesTotal || 0,
            unreadCount: label.messagesUnread || 0,
            lastSyncedAt: new Date(),
          },
        });
      }

      this.logger.log(`Synced ${labels.length} Gmail labels as folders for provider ${providerId}`);
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

    // For custom labels (Label_xxx), use the label name as path
    // This allows custom labels to be properly identified
    if (labelId.startsWith('Label_')) {
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
    const labelMap: Record<string, string | undefined> = {
      'INBOX': 'INBOX',
      'SENT': 'SENT',
      'DRAFT': 'DRAFTS',
      'TRASH': 'TRASH',
      'SPAM': 'JUNK',
      'STARRED': 'FLAGGED',
      'IMPORTANT': 'IMPORTANT',
      'UNREAD': undefined, // Not a folder, it's a filter
      'CATEGORY_PERSONAL': undefined,
      'CATEGORY_SOCIAL': undefined,
      'CATEGORY_PROMOTIONS': undefined,
      'CATEGORY_UPDATES': undefined,
      'CATEGORY_FORUMS': undefined,
    };

    return labelMap[labelId];
  }
}
