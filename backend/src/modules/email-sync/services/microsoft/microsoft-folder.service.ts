import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CryptoService } from '../../../../common/services/crypto.service';
import { isSystemFolder } from '../../drivers/interfaces/canonical.types';

/**
 * Microsoft-specific folder service
 * Handles all Microsoft Graph API folder operations
 *
 * Architectural pattern: Pluggable adapter (inspired by Mail-0/Zero)
 * - Provider-specific implementation for Microsoft folder management
 * - Clear separation from core sync logic
 * - Injectable dependencies for testability
 */
@Injectable()
export class MicrosoftFolderService {
  private readonly logger = new Logger(MicrosoftFolderService.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /**
   * Determine CANONICAL folder type from Microsoft folder ID
   * Returns canonical folder types (INBOX, SENT, TRASH, etc.) for multi-provider compatibility
   *
   * CANONICAL FOLDER ARCHITECTURE:
   * All emails across providers use canonical folder names (INBOX, SENT, TRASH, SPAM, etc.)
   * This enables simple queries without complex JOINs or specialUse lookups.
   *
   * @param parentFolderId - Microsoft folder ID
   * @param providerId - Provider config ID
   * @param isDraft - Whether the message is a draft
   * @returns Canonical folder type (INBOX, SENT, TRASH, SPAM, DRAFTS, ARCHIVE, or custom name)
   */
  async determineFolderFromParentId(
    parentFolderId: string | undefined,
    providerId: string,
    isDraft: boolean,
  ): Promise<string> {
    // Default fallback - use canonical names
    if (!parentFolderId) {
      return isDraft ? 'DRAFTS' : 'INBOX';
    }

    try {
      // Strategy 1: Exact match by externalId
      const folder = await this.prisma.folder.findFirst({
        where: {
          providerId,
          externalId: parentFolderId,
        },
        select: {
          specialUse: true,
          name: true,
          path: true,
        },
      });

      if (folder) {
        if (folder.specialUse) {
          return this.specialUseToCanonical(folder.specialUse);
        }
        return this.displayNameToCanonical(folder.name);
      }

      // Strategy 2: Partial match - Microsoft folder IDs share common prefixes
      // The message.parentFolderId may differ slightly from folder.id
      const allFolders = await this.prisma.folder.findMany({
        where: { providerId },
        select: { externalId: true, specialUse: true, name: true },
      });

      // Try to find a folder whose externalId shares a common prefix (first 80 chars)
      const parentIdPrefix = parentFolderId.substring(0, 80);
      const matchedFolder = allFolders.find(
        (f) => f.externalId && f.externalId.substring(0, 80) === parentIdPrefix,
      );

      if (matchedFolder) {
        if (matchedFolder.specialUse) {
          return this.specialUseToCanonical(matchedFolder.specialUse);
        }
        return this.displayNameToCanonical(matchedFolder.name);
      }

      // Strategy 3: Fallback to path lookup (backwards compatibility)
      const folderByPath = await this.prisma.folder.findFirst({
        where: {
          providerId,
          path: parentFolderId,
        },
        select: { specialUse: true, name: true },
      });
      if (folderByPath?.specialUse) {
        return this.specialUseToCanonical(folderByPath.specialUse);
      }
      if (folderByPath?.name) {
        return this.displayNameToCanonical(folderByPath.name);
      }

      // Strategy 4: If all lookups fail, default to INBOX (not TRASH!)
      // This prevents emails from being incorrectly marked as deleted
      this.logger.debug(
        `Could not find folder for parentId ${parentFolderId.substring(0, 50)}..., defaulting to INBOX`,
      );
      return isDraft ? 'DRAFTS' : 'INBOX';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to determine folder from parentId ${parentFolderId}: ${errorMessage}`,
      );
      return isDraft ? 'DRAFTS' : 'INBOX';
    }
  }

  /**
   * Convert RFC 6154 specialUse attribute to canonical folder type
   */
  private specialUseToCanonical(specialUse: string): string {
    const mapping: Record<string, string> = {
      'INBOX': 'INBOX',
      'SENT': 'SENT',
      'DRAFTS': 'DRAFTS',
      'TRASH': 'TRASH',
      'JUNK': 'SPAM',
      'SPAM': 'SPAM',
      'ARCHIVE': 'ARCHIVE',
      'FLAGGED': 'STARRED',
      'IMPORTANT': 'IMPORTANT',
    };
    return mapping[specialUse.toUpperCase()] || specialUse.toUpperCase();
  }

  /**
   * Convert Microsoft display name to canonical folder type
   * Used as fallback when specialUse is not available
   */
  private displayNameToCanonical(displayName: string): string {
    const lowerName = displayName.toLowerCase().trim();

    // Inbox variations (English, Italian, German)
    if (lowerName === 'inbox' || lowerName === 'posta in arrivo' || lowerName === 'posteingang') {
      return 'INBOX';
    }

    // Sent variations
    if (
      lowerName === 'sent items' ||
      lowerName === 'sentitems' ||
      lowerName === 'sent' ||
      lowerName === 'posta inviata' ||
      lowerName === 'inviata' ||
      lowerName === 'elementi inviati'
    ) {
      return 'SENT';
    }

    // Trash variations
    if (
      lowerName === 'deleted items' ||
      lowerName === 'deleteditems' ||
      lowerName === 'trash' ||
      lowerName === 'posta eliminata' ||
      lowerName === 'cestino' ||
      lowerName === 'eliminata'
    ) {
      return 'TRASH';
    }

    // Drafts variations
    if (lowerName === 'drafts' || lowerName === 'bozze' || lowerName === 'draft') {
      return 'DRAFTS';
    }

    // Spam/Junk variations
    if (
      lowerName === 'junk email' ||
      lowerName === 'junk' ||
      lowerName === 'spam' ||
      lowerName === 'posta indesiderata' ||
      lowerName === 'post indiserata'
    ) {
      return 'SPAM';
    }

    // Archive variations
    if (
      lowerName === 'archive' ||
      lowerName === 'archivia' ||
      lowerName === 'archivio' ||
      lowerName === 'all mail'
    ) {
      return 'ARCHIVE';
    }

    // Outbox
    if (lowerName === 'outbox' || lowerName === 'posta in uscita') {
      return 'OUTBOX';
    }

    // Return original name for custom folders
    return displayName;
  }

  /**
   * Sync Microsoft folders from Microsoft Graph API
   *
   * @param tenantId - Tenant ID
   * @param providerId - Provider config ID
   */
  async syncMicrosoftFolders(tenantId: string, providerId: string): Promise<void> {
    this.logger.log(`Starting Microsoft folder sync for provider ${providerId}`);

    try {
      // Get provider config
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider || !provider.accessToken || !provider.tokenEncryptionIv) {
        throw new Error('Provider not found or missing access token');
      }

      // Decrypt access token
      const accessToken = this.crypto.decrypt(
        provider.accessToken,
        provider.tokenEncryptionIv,
      );

      // Fetch folders from Microsoft Graph
      const url = `${this.GRAPH_API_BASE}/me/mailFolders`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const folders = response.data.value || [];
      this.logger.log(`Found ${folders.length} Microsoft folders for provider ${providerId}`);

      // Get existing folders
      const existingFolders = await (this.prisma as any).folder.findMany({
        where: { providerId, tenantId },
      });

      const existingPaths = new Set(existingFolders.map((f: any) => f.path as string));
      const newPaths = new Set(
        folders
          .filter((f: any) => f.displayName)
          .map((f: any) => {
            const displayName = f.displayName as string;
            const specialUse = this.determineMicrosoftFolderType(displayName);
            return specialUse || displayName;
          }),
      );

      // Delete folders that no longer exist
      const deletedPaths = Array.from(existingPaths).filter((path) => !newPaths.has(path));

      if (deletedPaths.length > 0) {
        this.logger.log(`Deleting ${deletedPaths.length} removed Microsoft folders`);
        await (this.prisma as any).folder.deleteMany({
          where: {
            providerId,
            path: { in: deletedPaths },
          },
        });
      }

      // Sync each folder
      // Use canonical path for known system folders; keep displayName for custom folders.
      for (const folder of folders) {
        if (!folder.id || !folder.displayName) continue;

        // Determine special use based on well-known folder names
        const specialUse = this.determineMicrosoftFolderType(folder.displayName);
        const folderPath = specialUse || folder.displayName;

        // Determine if this is a system folder (protected from edit/delete)
        const isSystem = isSystemFolder(specialUse ?? '');

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
            externalId: folder.id, // Keep folder ID for API operations
            name: folder.displayName,
            delimiter: '/',
            specialUse,
            isSystem,  // Set system flag based on specialUse
            isSelectable: true,
            totalCount: folder.totalItemCount || 0,
            unreadCount: folder.unreadItemCount || 0,
            level: folder.parentFolderId ? 1 : 0,
          },
          update: {
            name: folder.displayName,
            externalId: folder.id, // Update external ID if needed
            specialUse,
            isSystem,  // Update system flag
            totalCount: folder.totalItemCount || 0,
            unreadCount: folder.unreadItemCount || 0,
            lastSyncedAt: new Date(),
          },
        });
      }

      this.logger.log(`Synced ${folders.length} Microsoft folders for provider ${providerId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : error instanceof Object ? JSON.stringify(error) : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Error syncing Microsoft folders for provider ${providerId}: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }

  /**
   * Determine folder type from Microsoft folder name
   * Based on Zero/Mail-0 systemFolderNames pattern
   *
   * @see https://github.com/elie222/inbox-zero (Zero reference)
   * @param folderName - Microsoft folder display name
   * @returns Standard folder type or undefined for custom folders
   */
  private determineMicrosoftFolderType(folderName: string): string | undefined {
    const lowerName = folderName.toLowerCase().trim();

    // Microsoft system folder names (based on Zero pattern)
    // These folders cannot be deleted or renamed by users
    const systemFolderMap: Record<string, string> = {
      // INBOX
      'inbox': 'INBOX',
      'posta in arrivo': 'INBOX',
      'posteingang': 'INBOX',
      // SENT
      'sent items': 'SENT',
      'sentitems': 'SENT',
      'sent': 'SENT',
      'posta inviata': 'SENT',
      'elementi inviati': 'SENT',
      // DRAFTS
      'drafts': 'DRAFTS',
      'bozze': 'DRAFTS',
      'draft': 'DRAFTS',
      // TRASH
      'deleted items': 'TRASH',
      'deleteditems': 'TRASH',
      'trash': 'TRASH',
      'posta eliminata': 'TRASH',
      'cestino': 'TRASH',
      // JUNK/SPAM
      'junk email': 'JUNK',
      'junkemail': 'JUNK',
      'junk': 'JUNK',
      'spam': 'JUNK',
      'posta indesiderata': 'JUNK',
      // ARCHIVE
      'archive': 'ARCHIVE',
      'archivio': 'ARCHIVE',
      'all mail': 'ARCHIVE',
      // OUTBOX
      'outbox': 'OUTBOX',
      'posta in uscita': 'OUTBOX',
      // Microsoft extended system folders (from Zero)
      'clutter': 'CLUTTER',
      'conversation history': 'CONVERSATIONHISTORY',
      'conversationhistory': 'CONVERSATIONHISTORY',
      'notes': 'NOTES',
      'journal': 'JOURNAL',
    };

    return systemFolderMap[lowerName];
  }
}
