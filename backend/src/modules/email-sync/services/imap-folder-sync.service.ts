import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ImapService } from '../../providers/services/imap.service';
import { ProviderTokenService } from './provider-token.service';
import { FolderSyncQueryService, FolderInfo } from './folder-sync-query.service';
import { folderNameToCanonical } from '../drivers/interfaces/canonical.types';
import type { Folder } from '@prisma/client';

/** IMAP-specific folder sync service - Phase 4 extraction from folder-sync.service.ts */
@Injectable()
export class ImapFolderSyncService {
  private readonly logger = new Logger(ImapFolderSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imapService: ImapService,
    private readonly providerTokenService: ProviderTokenService,
    private readonly queryService: FolderSyncQueryService,
  ) {}

  /** Synchronize folders from IMAP server to database */
  async syncImapFolders(tenantId: string, providerId: string): Promise<Folder[]> {
    this.logger.log(`Starting IMAP folder sync for provider ${providerId} (tenant: ${tenantId})`);

    try {
      // Get provider config
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider) {
        throw new Error(`Provider ${providerId} not found`);
      }

      if (provider.providerType !== 'imap') {
        throw new Error(`Provider ${providerId} is not an IMAP provider`);
      }

      // Decrypt IMAP credentials
      const imapCreds = this.providerTokenService.getImapCredentials(provider);

      // List folders from IMAP server
      const imapFolders = await this.imapService.listFolders({
        host: imapCreds.host,
        port: imapCreds.port,
        username: imapCreds.username,
        password: imapCreds.password,
        useTls: imapCreds.useTls,
      });

      this.logger.log(
        `Found ${imapFolders.length} folders on IMAP server for provider ${providerId}`,
      );

      // Parse folder information
      const folderInfos = this.parseImapFolders(imapFolders);

      // Persist via query service (handles all DB operations)
      const syncedFolders = await this.queryService.syncFoldersToDatabase(
        tenantId,
        providerId,
        folderInfos,
      );

      // Update last synced timestamp
      await this.prisma.providerConfig.update({
        where: { id: providerId },
        data: { lastSyncedAt: new Date() },
      });

      this.logger.log(
        `Synced ${syncedFolders.length} folders for provider ${providerId}`,
      );

      return syncedFolders;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Error syncing IMAP folders for provider ${providerId}: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }

  /** Parse IMAP folder list response into FolderInfo objects */
  parseImapFolders(imapFolders: any[]): FolderInfo[] {
    const folderInfos: FolderInfo[] = [];

    for (const folder of imapFolders) {
      const path = folder.path || folder.name;
      if (!path) {
        this.logger.warn(
          `Skipping IMAP folder with no path or name: ${JSON.stringify(folder)}`,
        );
        continue;
      }

      const delimiter = folder.delimiter || '/';
      const attributes = folder.attributes || [];
      const syncToken = folder.uidNext ? String(folder.uidNext) : undefined;

      // Extract folder name from path
      const parts = path.split(delimiter);
      const name = parts[parts.length - 1] || path;

      // Determine parent folder path
      let parent: string | undefined;
      if (parts.length > 1) {
        parent = parts.slice(0, -1).join(delimiter);
      }

      // Determine special use based on folder name and attributes
      const specialUse = this.determineSpecialUse(path, name, attributes);

      // Check if folder is selectable
      const isSelectable = !attributes.some(
        (attr: string) =>
          attr === '\\Noselect' ||
          attr === '\\NonExistent' ||
          attr.toLowerCase() === '\\noselect',
      );

      folderInfos.push({
        path,
        externalId: path,
        name,
        delimiter,
        attributes,
        specialUse,
        parent,
        isSelectable,
        uidNext: folder.uidNext,
        uidValidity: folder.uidValidity,
        syncToken,
      });
    }

    return folderInfos;
  }

  /** Determine special folder use based on RFC 6154 attributes and heuristic matching */
  determineSpecialUse(
    path: string,
    name: string,
    attributes: string[],
  ): string | undefined {
    // Check IMAP special-use attributes (RFC 6154)
    const specialUseMap: Record<string, string> = {
      '\\All': 'ALL',
      '\\Archive': 'ARCHIVE',
      '\\Drafts': 'DRAFTS',
      '\\Flagged': 'FLAGGED',
      '\\Junk': 'JUNK',
      '\\Sent': 'SENT',
      '\\Trash': 'TRASH',
      '\\Important': 'IMPORTANT',
    };

    for (const attr of attributes) {
      if (specialUseMap[attr]) {
        return specialUseMap[attr];
      }
    }

    // Fallback: Use centralized heuristic matching from canonical.types
    return folderNameToCanonical(name);
  }

  /** Create a new folder on the IMAP server */
  async createImapFolder(
    providerId: string,
    name: string,
    parentPath?: string,
  ): Promise<{ externalId: string; path: string }> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    const imapCreds = this.providerTokenService.getImapCredentials(provider);
    const client = this.imapService.createClient({
      host: imapCreds.host,
      port: imapCreds.port,
      username: imapCreds.username,
      password: imapCreds.password,
      useTls: imapCreds.useTls,
    });

    const fullPath = parentPath ? `${parentPath}/${name}` : name;

    // Local pre-check to avoid server call on duplicates
    const existing = await this.prisma.folder.findFirst({
      where: { providerId, path: fullPath },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'A folder with this name already exists on the mail server',
      );
    }

    try {
      await client.connect();
      this.logger.log(`Creating IMAP folder "${fullPath}" on server...`);
      const result = await client.mailboxCreate(fullPath);
      this.logger.log(
        `IMAP folder "${fullPath}" created successfully, path: ${result.path}`,
      );
      return { externalId: result.path, path: result.path };
    } catch (error: any) {
      const message = String(error?.message || '').toLowerCase();
      this.logger.error(
        `Failed to create IMAP folder "${fullPath}": ${error?.message || error}`,
      );
      if (message.includes('exists') || message.includes('already')) {
        throw new ConflictException(
          'A folder with this name already exists on the mail server',
        );
      }
      if (message.includes('permission') || message.includes('denied')) {
        throw new Error(
          'Permission denied: Cannot create folder on this mail server',
        );
      }
      throw error;
    } finally {
      await client.logout();
    }
  }

  /** Rename an IMAP folder on the server */
  async renameImapFolder(
    providerId: string,
    oldPath: string,
    newName: string,
  ): Promise<string> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    const imapCreds = this.providerTokenService.getImapCredentials(provider);
    const client = this.imapService.createClient({
      host: imapCreds.host,
      port: imapCreds.port,
      username: imapCreds.username,
      password: imapCreds.password,
      useTls: imapCreds.useTls,
    });

    try {
      await client.connect();
      this.logger.log(`IMAP connected for rename operation`);

      // Build new path: replace last segment with new name
      const parts = oldPath.split('/');
      parts[parts.length - 1] = newName;
      const newPath = parts.join('/');

      this.logger.log(`IMAP mailboxRename: "${oldPath}" -> "${newPath}"`);
      const result = await client.mailboxRename(oldPath, newPath);
      this.logger.log(`IMAP mailboxRename result: ${JSON.stringify(result)}`);
      return result.newPath || newPath;
    } catch (error: any) {
      const message = String(error?.message || error || '').toLowerCase();
      this.logger.warn(
        `IMAP rename folder error for "${oldPath}": ${error?.message || error}`,
      );

      // If folder doesn't exist on server, create it with new name instead
      if (
        message.includes('not exist') ||
        message.includes('no such') ||
        message.includes('nonexistent')
      ) {
        this.logger.log(
          `Folder "${oldPath}" does not exist on IMAP server, creating new folder "${newName}"`,
        );
        const parts = oldPath.split('/');
        parts[parts.length - 1] = newName;
        const newPath = parts.join('/');
        try {
          await client.mailboxCreate(newPath);
          return newPath;
        } catch (createError: any) {
          this.logger.error(
            `Failed to create folder "${newPath}": ${createError?.message || createError}`,
          );
          // Return the new path anyway - DB will be updated
          return newPath;
        }
      }

      // Provide user-friendly error messages for other errors
      if (message.includes('permission') || message.includes('denied')) {
        throw new Error('Permission denied: Cannot rename this folder');
      }
      if (message.includes('already exist')) {
        throw new ConflictException('A folder with this name already exists');
      }
      throw error;
    } finally {
      await client.logout();
    }
  }

  /** Delete an IMAP folder from the server */
  async deleteImapFolder(providerId: string, path: string): Promise<void> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    const imapCreds = this.providerTokenService.getImapCredentials(provider);
    const client = this.imapService.createClient({
      host: imapCreds.host,
      port: imapCreds.port,
      username: imapCreds.username,
      password: imapCreds.password,
      useTls: imapCreds.useTls,
    });

    try {
      await client.connect();
      this.logger.log(`IMAP connected for delete operation`);
      this.logger.log(`IMAP mailboxDelete: "${path}"`);
      await client.mailboxDelete(path);
      this.logger.log(`IMAP mailboxDelete completed successfully for "${path}"`);
    } catch (error: any) {
      const message = String(error?.message || error || '').toLowerCase();
      this.logger.warn(
        `IMAP delete folder error for "${path}": ${error?.message || error}`,
      );

      // If folder doesn't exist on server, that's OK - we still delete from DB
      if (
        message.includes('not exist') ||
        message.includes('no such') ||
        message.includes('nonexistent')
      ) {
        this.logger.log(
          `Folder "${path}" does not exist on IMAP server, will delete from database only`,
        );
        return; // Allow database deletion to proceed
      }

      // Provide user-friendly error messages for other errors
      if (message.includes('permission') || message.includes('denied')) {
        throw new Error('Permission denied: Cannot delete this folder');
      }
      if (message.includes('not empty') || message.includes('has children')) {
        throw new Error(
          'Folder is not empty. Please delete or move all emails first.',
        );
      }
      if (message.includes('cannot delete') || message.includes('not allowed')) {
        throw new Error('This folder cannot be deleted');
      }
      throw error;
    } finally {
      await client.logout();
    }
  }
}
