import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CryptoService } from '../../../../common/services/crypto.service';

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
   * Determine folder name from Microsoft folder ID
   * Returns the actual folder name from the provider, not normalized names
   * This ensures sync-back operations work correctly with provider-specific folder names
   *
   * @param parentFolderId - Microsoft folder ID
   * @param providerId - Provider config ID
   * @param isDraft - Whether the message is a draft
   * @returns Actual folder name from the provider
   */
  async determineFolderFromParentId(
    parentFolderId: string | undefined,
    providerId: string,
    isDraft: boolean,
  ): Promise<string> {
    // Default fallback
    if (!parentFolderId) {
      return isDraft ? 'Drafts' : 'Inbox';
    }

    try {
      // Lookup folder in database by externalId (Microsoft folder ID)
      // folder.path now stores displayName, folder.externalId stores the API folder ID
      const folder = await this.prisma.folder.findFirst({
        where: {
          providerId,
          externalId: parentFolderId, // Lookup by external ID (Microsoft folder ID)
        },
        select: {
          specialUse: true,
          name: true,
          path: true,
          id: true,
        },
      });

      if (!folder) {
        // Fallback: try looking up by path (for backwards compatibility)
        const folderByPath = await this.prisma.folder.findFirst({
          where: {
            providerId,
            path: parentFolderId,
          },
          select: { name: true },
        });
        if (folderByPath) {
          return folderByPath.name;
        }
        return isDraft ? 'Drafts' : 'Inbox';
      }

      // Return the folder name (which matches folder.path)
      // This ensures email.folder joins correctly with folder.path
      return folder.name;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to determine folder from parentId ${parentFolderId}: ${errorMessage}`,
      );
      return isDraft ? 'Drafts' : 'Inbox';
    }
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
      // Use displayName as path (matches email.folder and folder.path)
      const newPaths = new Set(
        folders.filter((f: any) => f.displayName).map((f: any) => f.displayName as string),
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
      // CRITICAL: folder.path MUST match what determineFolderFromParentId returns (displayName)
      // This ensures email.folder can join with folder.path
      for (const folder of folders) {
        if (!folder.id || !folder.displayName) continue;

        // Determine special use based on well-known folder names
        const specialUse = this.determineMicrosoftFolderType(folder.displayName);

        await (this.prisma as any).folder.upsert({
          where: {
            providerId_path: {
              providerId,
              path: folder.displayName, // Use displayName as path (matches email.folder)
            },
          },
          create: {
            tenantId,
            providerId,
            path: folder.displayName, // Use displayName as path (matches email.folder)
            externalId: folder.id, // Keep folder ID for API operations
            name: folder.displayName,
            delimiter: '/',
            specialUse,
            isSelectable: true,
            totalCount: folder.totalItemCount || 0,
            unreadCount: folder.unreadItemCount || 0,
            level: folder.parentFolderId ? 1 : 0,
          },
          update: {
            name: folder.displayName,
            externalId: folder.id, // Update external ID if needed
            specialUse,
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
   *
   * @param folderName - Microsoft folder display name
   * @returns Standard folder type or undefined
   */
  private determineMicrosoftFolderType(folderName: string): string | undefined {
    const lowerName = folderName.toLowerCase();

    // Well-known Microsoft folder names
    if (lowerName === 'inbox' || lowerName === 'posta in arrivo' || lowerName === 'posteingang')
      return 'INBOX';
    if (
      lowerName === 'sent items' ||
      lowerName === 'sentitems' ||
      lowerName === 'sent' ||
      lowerName === 'posta inviata' ||
      lowerName === 'inviata' ||
      lowerName === 'elementi inviati'
    )
      return 'SENT';
    if (lowerName === 'drafts' || lowerName === 'bozze' || lowerName === 'draft') return 'DRAFTS';
    if (
      lowerName === 'deleted items' ||
      lowerName === 'deleteditems' ||
      lowerName === 'trash' ||
      lowerName === 'posta eliminata' ||
      lowerName === 'cestino' ||
      lowerName === 'eliminata'
    )
      return 'TRASH';
    if (
      lowerName === 'junk email' ||
      lowerName === 'junk' ||
      lowerName === 'spam' ||
      lowerName === 'posta indesiderata' ||
      lowerName === 'post indiserata'
    )
      return 'JUNK';
    if (
      lowerName === 'archive' ||
      lowerName === 'archivia' ||
      lowerName === 'archivio' ||
      lowerName === 'all mail'
    )
      return 'ARCHIVE';
    if (lowerName === 'outbox' || lowerName === 'posta in uscita') return undefined; // Outbox is temporary

    return undefined;
  }
}
