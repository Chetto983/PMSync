import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ImapService } from '../../providers/services/imap.service';
import { Folder } from '@prisma/client';
import axios from 'axios';
import { google } from 'googleapis';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { ProviderTokenService } from './provider-token.service';

export interface FolderInfo {
  path: string;
  externalId?: string;
  name: string;
  delimiter: string;
  attributes: string[];
  specialUse?: string;
  parent?: string;
  isSelectable?: boolean;
  uidNext?: number;
  uidValidity?: string;
  syncToken?: string;
}

@Injectable()
export class FolderSyncService {
  private readonly logger = new Logger(FolderSyncService.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

  constructor(
    private readonly prisma: PrismaService,
    private readonly imapService: ImapService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly providerTokenService: ProviderTokenService,
  ) {}

  /**
   * Sync folders for any provider type
   */
  async syncProviderFolders(tenantId: string, providerId: string): Promise<void> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    if (provider.providerType === 'generic') {
      await this.syncImapFolders(tenantId, providerId);
    } else if (provider.providerType === 'google') {
      await this.syncGmailFolders(tenantId, providerId);
    } else if (provider.providerType === 'microsoft') {
      await this.syncMicrosoftFolders(tenantId, providerId);
    } else {
      throw new Error(`Unsupported provider type: ${provider.providerType}`);
    }
  }

  /**
   * Synchronize folders from IMAP server to database
   */
  async syncImapFolders(
    tenantId: string,
    providerId: string,
  ): Promise<Folder[]> {
    this.logger.log(
      `Starting IMAP folder sync for provider ${providerId} (tenant: ${tenantId})`,
    );

    try {
      // Get provider config
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider) {
        throw new Error(`Provider ${providerId} not found`);
      }

      if (provider.providerType !== 'generic') {
        throw new Error(
          `Provider ${providerId} is not a generic IMAP provider`,
        );
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

      // Sync folders to database
      const syncedFolders = await this.syncFoldersToDatabase(
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

  /**
   * Parse IMAP folder list response
   */
  private parseImapFolders(imapFolders: any[]): FolderInfo[] {
    const folderInfos: FolderInfo[] = [];

    for (const folder of imapFolders) {
      // folder.path is the full path
      // folder.delimiter is the delimiter (usually "/")
      // folder.attributes is an array of attributes

      const path = folder.path || folder.name;
      if (!path) {
        this.logger.warn(`Skipping IMAP folder with no path or name: ${JSON.stringify(folder)}`);
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

  /**
   * Determine special folder use based on path, name and attributes
   */
  private determineSpecialUse(
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

    // Fallback: detect based on folder name (case-insensitive)
    // Supports multiple locales: EN, IT, DE, FR, ES
    const lowerPath = path.toLowerCase();
    const lowerName = name.toLowerCase();

    // INBOX
    if (lowerPath === 'inbox' || lowerName === 'inbox' || lowerName === 'posta in arrivo') {
      return 'INBOX';
    }

    // SENT - EN, IT, DE, FR, ES
    if (['sent', 'sent items', 'sent mail', 'posta inviata', 'inviata', 'elementi inviati',
         'gesendet', 'gesendete objekte', 'envoyés', 'enviados'].includes(lowerName)) {
      return 'SENT';
    }

    // DRAFTS - EN, IT, DE, FR, ES
    if (['drafts', 'draft', 'bozze', 'entwürfe', 'brouillons', 'borradores'].includes(lowerName)) {
      return 'DRAFTS';
    }

    // TRASH - EN, IT, DE, FR, ES
    if (['trash', 'deleted', 'deleted items', 'cestino', 'posta eliminata', 'eliminata',
         'papierkorb', 'gelöscht', 'corbeille', 'papelera', 'eliminados'].includes(lowerName)) {
      return 'TRASH';
    }

    // JUNK/SPAM - EN, IT, DE, FR, ES
    if (['spam', 'junk', 'junk email', 'posta indesiderata', 'indesiderata',
         'junk-e-mail', 'courrier indésirable', 'correo no deseado'].includes(lowerName)) {
      return 'JUNK';
    }

    // ARCHIVE - EN, IT, DE, FR, ES
    if (['archive', 'archivio', 'archivia', 'archiv', 'archives', 'archivo'].includes(lowerName)) {
      return 'ARCHIVE';
    }

    // OUTBOX - EN, IT, DE, FR, ES
    if (['outbox', 'posta in uscita', 'postausgang', 'boîte d\'envoi', 'bandeja de salida'].includes(lowerName)) {
      return 'OUTBOX';
    }

    if (lowerName === 'starred' || lowerName === 'flagged') {
      return 'FLAGGED';
    }

    return undefined;
  }

  /**
   * Sync folders to database
   */
  private async syncFoldersToDatabase(
    tenantId: string,
    providerId: string,
    folderInfos: FolderInfo[],
  ): Promise<Folder[]> {
    const syncedFolders: Folder[] = [];

    // Get existing folders from database
    const existingFolders = await this.prisma.folder.findMany({
      where: { providerId, tenantId },
    });

    const existingPaths = new Set(existingFolders.map((f) => f.path));
    const newPaths = new Set(folderInfos.map((f) => f.path));

    // Delete folders that no longer exist on server
    const deletedPaths = Array.from(existingPaths).filter(
      (path) => !newPaths.has(path),
    );

    if (deletedPaths.length > 0) {
      this.logger.log(`Deleting ${deletedPaths.length} removed folders`);
      await this.prisma.folder.deleteMany({
        where: {
          providerId,
          path: { in: deletedPaths },
        },
      });
    }

    // Build a map of path to parent folder ID
    const pathToIdMap = new Map<string, string>();

    // First pass: create/update all folders without parent relationships
    for (const folderInfo of folderInfos) {
      const level = folderInfo.path.split(folderInfo.delimiter).length - 1;

      const folder = await this.prisma.folder.upsert({
        where: {
          providerId_path: {
            providerId,
            path: folderInfo.path,
          },
        },
        create: {
          tenantId,
          providerId,
          externalId: folderInfo.externalId,
          path: folderInfo.path,
          name: folderInfo.name,
          delimiter: folderInfo.delimiter,
          attributes: folderInfo.attributes,
          specialUse: folderInfo.specialUse,
          level,
          isSelectable: !folderInfo.attributes.some(
            (attr) =>
              attr === '\\Noselect' ||
              attr === '\\NonExistent' ||
              attr.toLowerCase() === '\\noselect',
          ),
          syncToken: folderInfo.syncToken,
          uidNext: folderInfo.uidNext,
          uidValidity: folderInfo.uidValidity,
        },
        update: {
          name: folderInfo.name,
          delimiter: folderInfo.delimiter,
          attributes: folderInfo.attributes,
          specialUse: folderInfo.specialUse,
          externalId: folderInfo.externalId,
          level,
          isSelectable: !folderInfo.attributes.some(
            (attr) =>
              attr === '\\Noselect' ||
              attr === '\\NonExistent' ||
              attr.toLowerCase() === '\\noselect',
          ),
          syncToken: folderInfo.syncToken ?? undefined,
          uidNext: folderInfo.uidNext ?? undefined,
          uidValidity: folderInfo.uidValidity ?? undefined,
          lastSyncedAt: new Date(),
        },
      });

      pathToIdMap.set(folderInfo.path, folder.id);
      syncedFolders.push(folder);
    }

    // Second pass: update parent relationships
    for (const folderInfo of folderInfos) {
      if (folderInfo.parent && pathToIdMap.has(folderInfo.parent)) {
        const parentId = pathToIdMap.get(folderInfo.parent);
        const folderId = pathToIdMap.get(folderInfo.path);

        if (folderId && parentId) {
          await this.prisma.folder.update({
            where: { id: folderId },
            data: { parentId },
          });
        }
      }
    }

    return syncedFolders;
  }

  /**
   * Sync Gmail labels as folders
   */
  async syncGmailFolders(tenantId: string, providerId: string): Promise<void> {
    this.logger.log(`Starting Gmail folder (labels) sync for provider ${providerId}`);

    try {
      const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

      // Create OAuth2 client with access token
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
      const labels = labelsResponse.data.labels || [];
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });
      const syncToken =
        (provider?.metadata as any)?.lastSyncToken ??
        (provider?.metadata as any)?.historyId ??
        undefined;

      this.logger.log(`Found ${labels.length} Gmail labels for provider ${providerId}`);

      const existingFolders = await (this.prisma as any).folder.findMany({
        where: { providerId, tenantId },
      });

      const existingPaths = new Set<string>(existingFolders.map((f: any) => f.path as string));
      const newPaths = new Set<string>(labels.map((l) => l.id).filter((id): id is string => !!id));

      const deletedPaths: string[] = [];
      existingPaths.forEach((path) => {
        if (!newPaths.has(path)) {
          deletedPaths.push(path);
        }
      });

      if (deletedPaths.length > 0) {
        this.logger.log(`Deleting ${deletedPaths.length} removed Gmail labels`);
        await (this.prisma as any).folder.deleteMany({
          where: { providerId, path: { in: deletedPaths } },
        });
      }

      for (const label of labels) {
        if (!label.id || !label.name) continue;

        const specialUse = this.determineFolderTypeFromLabelId(label.id);
        const isSelectable = label.type !== 'system' || specialUse !== undefined;

        // Strip CATEGORY_ prefix from Gmail category label names for better UX
        const displayName = label.name.startsWith('CATEGORY_')
          ? label.name.replace('CATEGORY_', '')
          : label.name;

        await (this.prisma as any).folder.upsert({
          where: { providerId_path: { providerId, path: label.id } },
          create: {
            tenantId,
            providerId,
            externalId: label.id,
            path: label.id,
            name: displayName,
            delimiter: '/',
            specialUse,
            isSelectable,
            totalCount: label.messagesTotal || 0,
            unreadCount: label.messagesUnread || 0,
            level: 0,
            syncToken,
          },
          update: {
            name: displayName,
            specialUse,
            externalId: label.id,
            isSelectable,
            totalCount: label.messagesTotal || 0,
            unreadCount: label.messagesUnread || 0,
            lastSyncedAt: new Date(),
            syncToken: syncToken ?? undefined,
          },
        });
      }

      this.logger.log(`Synced ${labels.length} Gmail labels as folders for provider ${providerId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error syncing Gmail folders for provider ${providerId}: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * Sync Microsoft mail folders
   */
  async syncMicrosoftFolders(tenantId: string, providerId: string): Promise<void> {
    this.logger.log(`Starting Microsoft folder sync for provider ${providerId}`);

    try {
      const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

      const { folders, deltaLink } = await this.fetchMicrosoftFolders(accessToken);
      this.logger.log(`Found ${folders.length} Microsoft folders for provider ${providerId}`);

      const existingFolders = await (this.prisma as any).folder.findMany({
        where: { providerId, tenantId },
      });

      const existingPaths = new Set<string>(existingFolders.map((f: any) => f.path as string));
      const newPaths = new Set<string>(folders.map((f: any) => f.id as string));

      const deletedPaths: string[] = [];
      existingPaths.forEach((path) => {
        if (!newPaths.has(path)) {
          deletedPaths.push(path);
        }
      });

      if (deletedPaths.length > 0) {
        this.logger.log(`Deleting ${deletedPaths.length} removed Microsoft folders`);
        await (this.prisma as any).folder.deleteMany({
          where: { providerId, path: { in: deletedPaths } },
        });
      }

      for (const folder of folders) {
        if (!folder.id || !folder.displayName) continue;

        const specialUse =
          this.determineMicrosoftFolderType(folder.displayName) ||
          this.normalizeFolderName(folder.displayName);

        await (this.prisma as any).folder.upsert({
          where: { providerId_path: { providerId, path: folder.id } },
          create: {
            tenantId,
            providerId,
            externalId: folder.id,
            path: folder.id,
            name: folder.displayName,
            delimiter: '/',
            specialUse,
            isSelectable: true,
            totalCount: folder.totalItemCount || 0,
            unreadCount: folder.unreadItemCount || 0,
            level: folder.parentFolderId ? 1 : 0,
            syncToken: deltaLink,
            lastSyncedAt: new Date(),
          },
          update: {
            name: folder.displayName,
            externalId: folder.id,
            specialUse,
            totalCount: folder.totalItemCount || 0,
            unreadCount: folder.unreadItemCount || 0,
            lastSyncedAt: new Date(),
            syncToken: deltaLink ?? undefined,
          },
        });
      }

      this.logger.log(`Synced ${folders.length} Microsoft folders for provider ${providerId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error syncing Microsoft folders for provider ${providerId}: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  private determineFolderTypeFromLabelId(labelId: string): string | undefined {
    const labelMap: Record<string, string | undefined> = {
      'INBOX': 'INBOX',
      'SENT': 'SENT',
      'DRAFT': 'DRAFTS',
      'TRASH': 'TRASH',
      'SPAM': 'JUNK',
      'STARRED': 'FLAGGED',
      'IMPORTANT': 'IMPORTANT',
    };
    return labelMap[labelId];
  }

  private determineMicrosoftFolderType(folderName: string): string | undefined {
    const lowerName = folderName.toLowerCase();
    if (lowerName === 'inbox') return 'INBOX';
    if (lowerName === 'sent items' || lowerName === 'sentitems') return 'SENT';
    if (lowerName === 'drafts') return 'DRAFTS';
    if (lowerName === 'deleted items' || lowerName === 'deleteditems' || lowerName === 'trash') return 'TRASH';
    if (lowerName === 'junk email' || lowerName === 'junk' || lowerName === 'spam') return 'JUNK';
    if (lowerName === 'archive') return 'ARCHIVE';
    return undefined;
  }

  private async fetchMicrosoftFolders(
    accessToken: string,
  ): Promise<{ folders: any[]; deltaLink?: string }> {
    const headers = { Authorization: `Bearer ${accessToken}` };
    let url = `${this.GRAPH_API_BASE}/me/mailFolders/delta`;
    const folders: any[] = [];
    let deltaLink: string | undefined;

    while (url) {
      const response = await axios.get(url, { headers });
      const value = response.data.value || [];
      folders.push(...value);
      deltaLink = response.data['@odata.deltaLink'] || deltaLink;
      url = response.data['@odata.nextLink'] || '';
    }

    return { folders, deltaLink };
  }

  /**
   * Get all folders for a provider
   */
  async getFolders(
    tenantId: string,
    providerId: string,
  ): Promise<Folder[]> {
    return this.prisma.folder.findMany({
      where: { tenantId, providerId },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Get folder by path
   */
  async getFolderByPath(
    providerId: string,
    path: string,
  ): Promise<Folder | null> {
    return this.prisma.folder.findUnique({
      where: {
        providerId_path: {
          providerId,
          path,
        },
      },
    });
  }

  /**
   * Update folder counts (total and unread)
   */
  async updateFolderCounts(
    providerId: string,
    folderPath: string,
    tenantId?: string,
  ): Promise<{
    folderId: string;
    folderName: string;
    totalCount: number;
    unreadCount: number;
    tenantId?: string;
  } | null> {
    const folder = await this.prisma.folder.findUnique({
      where: {
        providerId_path: {
          providerId,
          path: folderPath,
        },
      },
      select: {
        id: true,
        name: true,
        tenantId: true,
        totalCount: true,
        unreadCount: true,
        specialUse: true,
      },
    });

    if (!folder) {
      this.logger.warn(
        `Folder not found: ${folderPath} (provider: ${providerId})`,
      );
      return null;
    }

    const folderKeys = this.getFolderKeys(folder);

    const totalCount = await this.prisma.email.count({
      where: {
        providerId,
        folder: { in: folderKeys },
      },
    });

    // Count unread emails in folder
    const unreadCount = await this.prisma.email.count({
      where: {
        providerId,
        folder: { in: folderKeys },
        isRead: false,
      },
    });

    // Skip DB + realtime if counts unchanged (debounce)
    if (folder.totalCount === totalCount && folder.unreadCount === unreadCount) {
      return null;
    }

    await this.prisma.folder.update({
      where: { id: folder.id },
      data: {
        totalCount,
        unreadCount,
      },
    });

    return {
      folderId: folder.id,
      folderName: folder.name,
      totalCount,
      unreadCount,
      tenantId: folder.tenantId ?? tenantId,
    };
  }

  /**
   * Update all folder counts for a provider
   */
  async updateAllFolderCounts(providerId: string): Promise<void> {
    this.logger.log(`Updating folder counts for provider ${providerId}`);

    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
      select: { id: true, tenantId: true },
    });

    const folders = await this.prisma.folder.findMany({
      where: { providerId },
    });

    let changed = 0;
    for (const folder of folders) {
      const result = await this.updateFolderCounts(providerId, folder.path, provider?.tenantId);

      if (result && provider?.tenantId) {
        changed += 1;
        this.realtimeEvents.emitFolderCountsUpdate(provider.tenantId, {
          providerId,
          folderId: result.folderId,
          folderName: result.folderName,
          totalCount: result.totalCount,
          unreadCount: result.unreadCount,
          timestamp: new Date().toISOString(),
        });
      }
    }

    this.logger.log(
      `Updated counts for ${changed}/${folders.length} folders (provider: ${providerId})`,
    );
  }

  /**
   * Resolve folder keys used for counting/filtering.
   * Prefer normalized specialUse if present, otherwise use the display name as-is.
   */
  private getFolderKeys(folder: {
    name: string;
    specialUse?: string | null;
  }): string[] {
    if (folder.specialUse) {
      return [folder.specialUse.replace('\\', '').toUpperCase()];
    }

    // Fallback: normalize common folder names even if specialUse was not set
    return [this.normalizeFolderName(folder.name)];
  }

  private normalizeFolderName(name: string): string {
    const lowerName = name.toLowerCase().trim();

    if (lowerName === 'inbox' || lowerName === 'posta in arrivo' || lowerName === 'posteingang') return 'INBOX';
    if (
      lowerName === 'sent items' ||
      lowerName === 'sentitems' ||
      lowerName === 'sent' ||
      lowerName === 'posta inviata' ||
      lowerName === 'inviata' ||
      lowerName === 'elementi inviati'
    )
      return 'SENT';
    if (
      lowerName === 'deleted items' ||
      lowerName === 'deleteditems' ||
      lowerName === 'trash' ||
      lowerName === 'posta eliminata' ||
      lowerName === 'cestino' ||
      lowerName === 'eliminata'
    )
      return 'TRASH';
    if (lowerName === 'drafts' || lowerName === 'bozze' || lowerName === 'draft') return 'DRAFTS';
    if (
      lowerName === 'junk email' ||
      lowerName === 'junk' ||
      lowerName === 'spam' ||
      lowerName === 'posta indesiderata' ||
      lowerName === 'post indiserata'
    )
      return 'SPAM';
    if (lowerName === 'archive' || lowerName === 'archivia' || lowerName === 'archivio' || lowerName === 'all mail')
      return 'ARCHIVE';

    return name.toUpperCase();
  }

  // ========== FOLDER AUDIT ==========

  /**
   * Audit folder sync status between database and provider
   * Returns discrepancies and sync recommendations
   */
  async auditFolderSync(
    tenantId: string,
    providerId: string,
  ): Promise<{
    dbFolderCount: number;
    serverFolderCount: number;
    inSync: boolean;
    onlyInDb: string[];
    onlyOnServer: string[];
    recommendations: string[];
  }> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    this.logger.log(`Auditing folder sync for provider ${providerId} (${provider.email})`);

    // Get folders from database
    const dbFolders = await this.prisma.folder.findMany({
      where: { providerId, tenantId },
      select: { path: true, name: true, specialUse: true },
    });
    const dbPaths = new Set(dbFolders.map((f) => f.path));

    // Get folders from server
    let serverPaths: Set<string>;
    let serverFolders: { path: string; name: string }[] = [];

    if (provider.providerType === 'generic') {
      const imapCreds = this.providerTokenService.getImapCredentials(provider);
      const imapFolders = await this.imapService.listFolders({
        host: imapCreds.host,
        port: imapCreds.port,
        username: imapCreds.username,
        password: imapCreds.password,
        useTls: imapCreds.useTls,
      });
      serverFolders = imapFolders.map((f) => ({ path: f.path, name: f.name }));
      serverPaths = new Set(serverFolders.map((f) => f.path));
    } else {
      // For Gmail/Microsoft, paths are IDs so comparison is different
      this.logger.warn(`Audit for ${provider.providerType} not fully implemented`);
      serverPaths = dbPaths; // Skip for now
    }

    // Find discrepancies
    const onlyInDb = Array.from(dbPaths).filter((p) => !serverPaths.has(p));
    const onlyOnServer = Array.from(serverPaths).filter((p) => !dbPaths.has(p));
    const inSync = onlyInDb.length === 0 && onlyOnServer.length === 0;

    // Generate recommendations
    const recommendations: string[] = [];
    if (onlyInDb.length > 0) {
      recommendations.push(
        `${onlyInDb.length} folder(s) exist in database but not on server. Run folder sync to clean up.`,
      );
      this.logger.warn(`Orphaned DB folders: ${onlyInDb.join(', ')}`);
    }
    if (onlyOnServer.length > 0) {
      recommendations.push(
        `${onlyOnServer.length} folder(s) exist on server but not in database. Run folder sync to add.`,
      );
      this.logger.warn(`Missing server folders: ${onlyOnServer.join(', ')}`);
    }
    if (inSync) {
      recommendations.push('All folders are in sync.');
    }

    return {
      dbFolderCount: dbFolders.length,
      serverFolderCount: serverPaths.size,
      inSync,
      onlyInDb,
      onlyOnServer,
      recommendations,
    };
  }

  /**
   * Clean up orphaned folders (exist in DB but not on server)
   */
  async cleanupOrphanedFolders(
    tenantId: string,
    providerId: string,
  ): Promise<{ deletedCount: number; deletedPaths: string[] }> {
    const audit = await this.auditFolderSync(tenantId, providerId);

    if (audit.onlyInDb.length === 0) {
      return { deletedCount: 0, deletedPaths: [] };
    }

    this.logger.log(`Cleaning up ${audit.onlyInDb.length} orphaned folders`);

    await this.prisma.folder.deleteMany({
      where: {
        providerId,
        tenantId,
        path: { in: audit.onlyInDb },
      },
    });

    return {
      deletedCount: audit.onlyInDb.length,
      deletedPaths: audit.onlyInDb,
    };
  }

  // ========== FOLDER CRUD OPERATIONS ==========

  /**
   * Create a new folder on the mail server and in database
   */
  async createFolder(
    tenantId: string,
    providerId: string,
    name: string,
    parentPath?: string,
  ): Promise<{ id: string; path: string; name: string }> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    this.logger.log(`Creating folder "${name}" for provider ${providerId} (type: ${provider.providerType})`);

    let result: { externalId: string; path: string };

    if (provider.providerType === 'generic') {
      result = await this.createImapFolder(providerId, name, parentPath);
    } else if (provider.providerType === 'google') {
      result = await this.createGmailLabel(providerId, name);
    } else if (provider.providerType === 'microsoft') {
      result = await this.createMicrosoftFolder(providerId, name, parentPath);
    } else {
      throw new Error(`Unsupported provider type: ${provider.providerType}`);
    }

    // Save to database
    const folder = await this.prisma.folder.create({
      data: {
        tenantId,
        providerId,
        externalId: result.externalId,
        path: result.path,
        name,
        delimiter: '/',
        isSelectable: true,
        level: parentPath ? 1 : 0,
      },
    });

    this.logger.log(`Created folder "${name}" with id ${folder.id}`);
    return { id: folder.id, path: result.path, name };
  }

  /**
   * Rename a folder on the mail server and in database
   */
  async renameFolder(
    tenantId: string,
    providerId: string,
    folderPath: string,
    newName: string,
  ): Promise<{ id: string; path: string; name: string }> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    const folder = await this.prisma.folder.findUnique({
      where: { providerId_path: { providerId, path: folderPath } },
    });

    if (!folder) {
      throw new Error(`Folder not found: ${folderPath}`);
    }

    this.logger.log(`Renaming folder "${folder.name}" to "${newName}" for provider ${providerId}`);

    let newPath: string;

    if (provider.providerType === 'generic') {
      newPath = await this.renameImapFolder(providerId, folderPath, newName);
    } else if (provider.providerType === 'google') {
      await this.renameGmailLabel(providerId, folder.externalId || folderPath, newName);
      newPath = folder.path; // Gmail label IDs don't change on rename
    } else if (provider.providerType === 'microsoft') {
      await this.renameMicrosoftFolder(providerId, folder.externalId || folderPath, newName);
      newPath = folder.path; // Microsoft folder IDs don't change on rename
    } else {
      throw new Error(`Unsupported provider type: ${provider.providerType}`);
    }

    // Update database
    const updatedFolder = await this.prisma.folder.update({
      where: { id: folder.id },
      data: {
        name: newName,
        path: newPath,
      },
    });

    this.logger.log(`Renamed folder to "${newName}" with path ${newPath}`);
    return { id: updatedFolder.id, path: newPath, name: newName };
  }

  /**
   * Delete a folder from the mail server and database
   */
  async deleteFolder(
    tenantId: string,
    providerId: string,
    folderPath: string,
  ): Promise<void> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    const folder = await this.prisma.folder.findUnique({
      where: { providerId_path: { providerId, path: folderPath } },
    });

    if (!folder) {
      throw new Error(`Folder not found: ${folderPath}`);
    }

    // Prevent deletion of system folders
    const systemFolders = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'JUNK', 'ARCHIVE'];
    if (folder.specialUse && systemFolders.includes(folder.specialUse)) {
      throw new Error(`Cannot delete system folder: ${folder.specialUse}`);
    }

    this.logger.log(`Deleting folder "${folder.name}" for provider ${providerId}`);

    if (provider.providerType === 'generic') {
      await this.deleteImapFolder(providerId, folderPath);
    } else if (provider.providerType === 'google') {
      await this.deleteGmailLabel(providerId, folder.externalId || folderPath);
    } else if (provider.providerType === 'microsoft') {
      await this.deleteMicrosoftFolder(providerId, folder.externalId || folderPath);
    } else {
      throw new Error(`Unsupported provider type: ${provider.providerType}`);
    }

    // Delete from database
    await this.prisma.folder.delete({ where: { id: folder.id } });

    this.logger.log(`Deleted folder "${folder.name}"`);
  }

  // ========== IMAP FOLDER OPERATIONS ==========

  private async createImapFolder(
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
      throw new ConflictException('A folder with this name already exists on the mail server');
    }

    try {
      await client.connect();
      this.logger.log(`Creating IMAP folder "${fullPath}" on server...`);
      const result = await client.mailboxCreate(fullPath);
      this.logger.log(`IMAP folder "${fullPath}" created successfully, path: ${result.path}`);
      return { externalId: result.path, path: result.path };
    } catch (error: any) {
      const message = String(error?.message || '').toLowerCase();
      this.logger.error(`Failed to create IMAP folder "${fullPath}": ${error?.message || error}`);
      if (message.includes('exists') || message.includes('already')) {
        throw new ConflictException('A folder with this name already exists on the mail server');
      }
      if (message.includes('permission') || message.includes('denied')) {
        throw new Error('Permission denied: Cannot create folder on this mail server');
      }
      throw error;
    } finally {
      await client.logout();
    }
  }

  private async renameImapFolder(
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
      this.logger.warn(`IMAP rename folder error for "${oldPath}": ${error?.message || error}`);

      // If folder doesn't exist on server, create it with new name instead
      if (message.includes('not exist') || message.includes('no such') || message.includes('nonexistent')) {
        this.logger.log(`Folder "${oldPath}" does not exist on IMAP server, creating new folder "${newName}"`);
        const parts = oldPath.split('/');
        parts[parts.length - 1] = newName;
        const newPath = parts.join('/');
        try {
          await client.mailboxCreate(newPath);
          return newPath;
        } catch (createError: any) {
          this.logger.error(`Failed to create folder "${newPath}": ${createError?.message || createError}`);
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

  private async deleteImapFolder(providerId: string, path: string): Promise<void> {
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
      this.logger.warn(`IMAP delete folder error for "${path}": ${error?.message || error}`);

      // If folder doesn't exist on server, that's OK - we still delete from DB
      if (message.includes('not exist') || message.includes('no such') || message.includes('nonexistent')) {
        this.logger.log(`Folder "${path}" does not exist on IMAP server, will delete from database only`);
        return; // Allow database deletion to proceed
      }

      // Provide user-friendly error messages for other errors
      if (message.includes('permission') || message.includes('denied')) {
        throw new Error('Permission denied: Cannot delete this folder');
      }
      if (message.includes('not empty') || message.includes('has children')) {
        throw new Error('Folder is not empty. Please delete or move all emails first.');
      }
      if (message.includes('cannot delete') || message.includes('not allowed')) {
        throw new Error('This folder cannot be deleted');
      }
      throw error;
    } finally {
      await client.logout();
    }
  }

  // ========== GMAIL LABEL OPERATIONS ==========

  private async createGmailLabel(
    providerId: string,
    name: string,
  ): Promise<{ externalId: string; path: string }> {
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

  private async renameGmailLabel(
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
  }

  private async deleteGmailLabel(providerId: string, labelId: string): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    await gmail.users.labels.delete({
      userId: 'me',
      id: labelId,
    });
  }

  // ========== MICROSOFT FOLDER OPERATIONS ==========

  private async createMicrosoftFolder(
    providerId: string,
    name: string,
    parentFolderId?: string,
  ): Promise<{ externalId: string; path: string }> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    const url = parentFolderId
      ? `${this.GRAPH_API_BASE}/me/mailFolders/${parentFolderId}/childFolders`
      : `${this.GRAPH_API_BASE}/me/mailFolders`;

    try {
      const response = await axios.post(
        url,
        { displayName: name },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
      );

      const folderId = response.data.id;
      return { externalId: folderId, path: folderId };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        // Microsoft Graph returns 409 on name conflicts; surface a clear conflict error.
        throw new ConflictException('A folder with this name already exists on Microsoft 365');
      }
      throw error;
    }
  }

  private async renameMicrosoftFolder(
    providerId: string,
    folderId: string,
    newName: string,
  ): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    await axios.patch(
      `${this.GRAPH_API_BASE}/me/mailFolders/${folderId}`,
      { displayName: newName },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
    );
  }

  private async deleteMicrosoftFolder(providerId: string, folderId: string): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    await axios.delete(`${this.GRAPH_API_BASE}/me/mailFolders/${folderId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
}
