import { Test, TestingModule } from '@nestjs/testing';
import { ImapFolderSyncService } from '../imap-folder-sync.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ImapService } from '../../../providers/services/imap.service';
import { ProviderTokenService } from '../provider-token.service';
import { FolderSyncQueryService, FolderInfo } from '../folder-sync-query.service';
import { ConflictException } from '@nestjs/common';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock PrismaService
const mockPrismaService = {
  providerConfig: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  folder: {
    findFirst: jest.fn(),
  },
};

// Mock IMAP client with chainable methods
const mockImapClient = {
  connect: jest.fn(),
  logout: jest.fn(),
  mailboxCreate: jest.fn(),
  mailboxRename: jest.fn(),
  mailboxDelete: jest.fn(),
};

// Mock ImapService
const mockImapService = {
  listFolders: jest.fn(),
  createClient: jest.fn(() => mockImapClient),
};

// Mock ProviderTokenService
const mockProviderTokenService = {
  getImapCredentials: jest.fn(() => ({
    host: 'imap.example.com',
    port: 993,
    username: 'user@example.com',
    password: 'password123',
    useTls: true,
  })),
};

// Mock FolderSyncQueryService
const mockQueryService = {
  syncFoldersToDatabase: jest.fn(),
};

describe('ImapFolderSyncService', () => {
  let service: ImapFolderSyncService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset mock implementations
    mockImapClient.connect.mockResolvedValue(undefined);
    mockImapClient.logout.mockResolvedValue(undefined);
    mockImapClient.mailboxCreate.mockResolvedValue({ path: 'NewFolder' });
    mockImapClient.mailboxRename.mockResolvedValue({ newPath: 'RenamedFolder' });
    mockImapClient.mailboxDelete.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImapFolderSyncService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ImapService, useValue: mockImapService },
        { provide: ProviderTokenService, useValue: mockProviderTokenService },
        { provide: FolderSyncQueryService, useValue: mockQueryService },
      ],
    }).compile();

    service = module.get<ImapFolderSyncService>(ImapFolderSyncService);
  });

  describe('syncImapFolders', () => {
    const tenantId = 'tenant-1';
    const providerId = 'provider-1';

    it('should sync folders from IMAP server to database', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        providerType: 'imap',
        tenantId,
      });

      mockImapService.listFolders.mockResolvedValue([
        { path: 'INBOX', name: 'INBOX', delimiter: '/', attributes: ['\\HasNoChildren'] },
        { path: 'Sent', name: 'Sent', delimiter: '/', attributes: ['\\Sent'] },
      ]);

      const expectedFolders = [
        { id: 'f1', path: 'INBOX', name: 'INBOX', tenantId, providerId },
        { id: 'f2', path: 'Sent', name: 'Sent', tenantId, providerId },
      ];
      mockQueryService.syncFoldersToDatabase.mockResolvedValue(expectedFolders);
      mockPrismaService.providerConfig.update.mockResolvedValue({});

      const result = await service.syncImapFolders(tenantId, providerId);

      expect(result).toHaveLength(2);
      expect(mockImapService.listFolders).toHaveBeenCalledWith({
        host: 'imap.example.com',
        port: 993,
        username: 'user@example.com',
        password: 'password123',
        useTls: true,
      });
      expect(mockQueryService.syncFoldersToDatabase).toHaveBeenCalled();
      expect(mockPrismaService.providerConfig.update).toHaveBeenCalledWith({
        where: { id: providerId },
        data: { lastSyncedAt: expect.any(Date) },
      });
    });

    it('should throw error when provider not found', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue(null);

      await expect(service.syncImapFolders(tenantId, providerId)).rejects.toThrow(
        `Provider ${providerId} not found`,
      );
    });

    it('should throw error when provider is not IMAP type', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        providerType: 'google',
        tenantId,
      });

      await expect(service.syncImapFolders(tenantId, providerId)).rejects.toThrow(
        `Provider ${providerId} is not an IMAP provider`,
      );
    });

    it('should update lastSyncedAt after successful sync', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        providerType: 'imap',
        tenantId,
      });
      mockImapService.listFolders.mockResolvedValue([]);
      mockQueryService.syncFoldersToDatabase.mockResolvedValue([]);
      mockPrismaService.providerConfig.update.mockResolvedValue({});

      await service.syncImapFolders(tenantId, providerId);

      expect(mockPrismaService.providerConfig.update).toHaveBeenCalledWith({
        where: { id: providerId },
        data: { lastSyncedAt: expect.any(Date) },
      });
    });

    it('should handle IMAP connection errors gracefully', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        providerType: 'imap',
        tenantId,
      });

      mockImapService.listFolders.mockRejectedValue(new Error('Connection refused'));

      await expect(service.syncImapFolders(tenantId, providerId)).rejects.toThrow(
        'Connection refused',
      );
    });

    it('should handle empty folder list', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        providerType: 'imap',
        tenantId,
      });
      mockImapService.listFolders.mockResolvedValue([]);
      mockQueryService.syncFoldersToDatabase.mockResolvedValue([]);
      mockPrismaService.providerConfig.update.mockResolvedValue({});

      const result = await service.syncImapFolders(tenantId, providerId);

      expect(result).toHaveLength(0);
      expect(mockQueryService.syncFoldersToDatabase).toHaveBeenCalledWith(
        tenantId,
        providerId,
        [],
      );
    });
  });

  describe('parseImapFolders', () => {
    it('should parse IMAP folder list with path and attributes', () => {
      const imapFolders = [
        { path: 'INBOX', name: 'INBOX', delimiter: '/', attributes: ['\\HasChildren'], uidNext: 100, uidValidity: '12345' },
        { path: 'Sent', name: 'Sent', delimiter: '.', attributes: ['\\Sent'], uidNext: 50, uidValidity: '67890' },
      ];

      const result = service.parseImapFolders(imapFolders);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        path: 'INBOX',
        name: 'INBOX',
        delimiter: '/',
        attributes: ['\\HasChildren'],
        uidNext: 100,
        uidValidity: '12345',
        syncToken: '100',
      });
      expect(result[1]).toMatchObject({
        path: 'Sent',
        name: 'Sent',
        delimiter: '.',
        attributes: ['\\Sent'],
        uidNext: 50,
        uidValidity: '67890',
        syncToken: '50',
      });
    });

    it('should skip folders with no path or name', () => {
      const imapFolders = [
        { path: 'INBOX', name: 'INBOX', delimiter: '/', attributes: [] },
        { path: null, name: null, delimiter: '/', attributes: [] },
        { path: '', name: '', delimiter: '/', attributes: [] },
      ];

      const result = service.parseImapFolders(imapFolders);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('INBOX');
    });

    it('should extract parent folder from path with delimiter', () => {
      const imapFolders = [
        { path: 'INBOX/Subfolder/Deep', name: 'Deep', delimiter: '/', attributes: [] },
        { path: 'Archive.2024', name: '2024', delimiter: '.', attributes: [] },
      ];

      const result = service.parseImapFolders(imapFolders);

      expect(result[0].parent).toBe('INBOX/Subfolder');
      expect(result[1].parent).toBe('Archive');
    });

    it('should detect \\Noselect and \\NonExistent attributes', () => {
      const imapFolders = [
        { path: 'Folder1', name: 'Folder1', delimiter: '/', attributes: ['\\Noselect'] },
        { path: 'Folder2', name: 'Folder2', delimiter: '/', attributes: ['\\NonExistent'] },
        { path: 'Folder3', name: 'Folder3', delimiter: '/', attributes: ['\\noselect'] },
        { path: 'Folder4', name: 'Folder4', delimiter: '/', attributes: [] },
      ];

      const result = service.parseImapFolders(imapFolders);

      expect(result[0].isSelectable).toBe(false);
      expect(result[1].isSelectable).toBe(false);
      expect(result[2].isSelectable).toBe(false);
      expect(result[3].isSelectable).toBe(true);
    });

    it('should preserve uidNext and uidValidity', () => {
      const imapFolders = [
        { path: 'INBOX', name: 'INBOX', delimiter: '/', attributes: [], uidNext: 999, uidValidity: 'abc123' },
      ];

      const result = service.parseImapFolders(imapFolders);

      expect(result[0].uidNext).toBe(999);
      expect(result[0].uidValidity).toBe('abc123');
      expect(result[0].syncToken).toBe('999');
    });
  });

  describe('determineSpecialUse', () => {
    it('should map RFC 6154 attributes (\\Sent -> SENT, \\Trash -> TRASH, etc.)', () => {
      expect(service.determineSpecialUse('path', 'name', ['\\Sent'])).toBe('SENT');
      expect(service.determineSpecialUse('path', 'name', ['\\Trash'])).toBe('TRASH');
      expect(service.determineSpecialUse('path', 'name', ['\\Drafts'])).toBe('DRAFTS');
      expect(service.determineSpecialUse('path', 'name', ['\\Junk'])).toBe('JUNK');
      expect(service.determineSpecialUse('path', 'name', ['\\Archive'])).toBe('ARCHIVE');
      expect(service.determineSpecialUse('path', 'name', ['\\Flagged'])).toBe('FLAGGED');
      expect(service.determineSpecialUse('path', 'name', ['\\All'])).toBe('ALL');
      expect(service.determineSpecialUse('path', 'name', ['\\Important'])).toBe('IMPORTANT');
    });

    it('should detect INBOX from folder name heuristics', () => {
      const result = service.determineSpecialUse('INBOX', 'INBOX', []);
      expect(result).toBe('INBOX');

      const result2 = service.determineSpecialUse('Inbox', 'Inbox', []);
      expect(result2).toBe('INBOX');
    });

    it('should detect SENT from folder name heuristics', () => {
      const result = service.determineSpecialUse('Sent', 'Sent', []);
      expect(result).toBe('SENT');

      const result2 = service.determineSpecialUse('Sent Items', 'Sent Items', []);
      expect(result2).toBe('SENT');
    });

    it('should detect DRAFTS from folder name heuristics', () => {
      const result = service.determineSpecialUse('Drafts', 'Drafts', []);
      expect(result).toBe('DRAFTS');

      const result2 = service.determineSpecialUse('Draft', 'Draft', []);
      expect(result2).toBe('DRAFTS');
    });

    it('should return uppercased name for unrecognized custom folder names', () => {
      // folderNameToCanonical returns uppercased name for unknown folders
      const result = service.determineSpecialUse('MyCustomFolder', 'MyCustomFolder', []);
      expect(result).toBe('MYCUSTOMFOLDER');

      const result2 = service.determineSpecialUse('Projects/2024', 'Projects/2024', []);
      expect(result2).toBe('PROJECTS/2024');
    });
  });

  describe('createImapFolder', () => {
    const providerId = 'provider-1';

    it('should create folder on IMAP server and return path', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        providerType: 'imap',
      });
      mockPrismaService.folder.findFirst.mockResolvedValue(null);
      mockImapClient.mailboxCreate.mockResolvedValue({ path: 'NewFolder' });

      const result = await service.createImapFolder(providerId, 'NewFolder');

      expect(result).toEqual({ externalId: 'NewFolder', path: 'NewFolder' });
      expect(mockImapClient.connect).toHaveBeenCalled();
      expect(mockImapClient.mailboxCreate).toHaveBeenCalledWith('NewFolder');
      expect(mockImapClient.logout).toHaveBeenCalled();
    });

    it('should throw ConflictException when folder already exists in DB', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        providerType: 'imap',
      });
      mockPrismaService.folder.findFirst.mockResolvedValue({ id: 'existing-folder' });

      await expect(service.createImapFolder(providerId, 'ExistingFolder')).rejects.toThrow(
        ConflictException,
      );
      await expect(service.createImapFolder(providerId, 'ExistingFolder')).rejects.toThrow(
        'A folder with this name already exists on the mail server',
      );
    });

    it('should throw ConflictException when server returns "already exists"', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        providerType: 'imap',
      });
      mockPrismaService.folder.findFirst.mockResolvedValue(null);
      mockImapClient.mailboxCreate.mockRejectedValue(new Error('Mailbox already exists'));

      await expect(service.createImapFolder(providerId, 'ExistingFolder')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw error when provider not found', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue(null);

      await expect(service.createImapFolder(providerId, 'NewFolder')).rejects.toThrow(
        `Provider ${providerId} not found`,
      );
    });
  });

  describe('renameImapFolder', () => {
    const providerId = 'provider-1';

    it('should rename folder on IMAP server', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        providerType: 'imap',
      });
      mockImapClient.mailboxRename.mockResolvedValue({ newPath: 'RenamedFolder' });

      const result = await service.renameImapFolder(providerId, 'OldFolder', 'NewName');

      expect(result).toBe('RenamedFolder');
      expect(mockImapClient.connect).toHaveBeenCalled();
      expect(mockImapClient.mailboxRename).toHaveBeenCalledWith('OldFolder', 'NewName');
      expect(mockImapClient.logout).toHaveBeenCalled();
    });

    it('should create folder if it does not exist on server during rename', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        providerType: 'imap',
      });
      mockImapClient.mailboxRename.mockRejectedValue(new Error('Mailbox does not exist'));
      mockImapClient.mailboxCreate.mockResolvedValue({ path: 'NewName' });

      const result = await service.renameImapFolder(providerId, 'OldFolder', 'NewName');

      expect(result).toBe('NewName');
      expect(mockImapClient.mailboxCreate).toHaveBeenCalledWith('NewName');
    });

    it('should throw ConflictException when new name already exists', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        providerType: 'imap',
      });
      mockImapClient.mailboxRename.mockRejectedValue(new Error('Target mailbox already exists'));

      await expect(
        service.renameImapFolder(providerId, 'OldFolder', 'ExistingFolder'),
      ).rejects.toThrow(ConflictException);
    });

    it('should handle permission denied errors', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        providerType: 'imap',
      });
      mockImapClient.mailboxRename.mockRejectedValue(new Error('Permission denied'));

      await expect(
        service.renameImapFolder(providerId, 'SystemFolder', 'NewName'),
      ).rejects.toThrow('Permission denied: Cannot rename this folder');
    });
  });

  describe('deleteImapFolder', () => {
    const providerId = 'provider-1';

    it('should delete folder from IMAP server', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        providerType: 'imap',
      });
      mockImapClient.mailboxDelete.mockResolvedValue(undefined);

      await service.deleteImapFolder(providerId, 'FolderToDelete');

      expect(mockImapClient.connect).toHaveBeenCalled();
      expect(mockImapClient.mailboxDelete).toHaveBeenCalledWith('FolderToDelete');
      expect(mockImapClient.logout).toHaveBeenCalled();
    });

    it('should succeed silently if folder does not exist on server', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        providerType: 'imap',
      });
      mockImapClient.mailboxDelete.mockRejectedValue(new Error('Mailbox does not exist'));

      // Should not throw
      await expect(service.deleteImapFolder(providerId, 'NonExistentFolder')).resolves.toBeUndefined();
    });

    it('should throw error on permission denied', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        providerType: 'imap',
      });
      mockImapClient.mailboxDelete.mockRejectedValue(new Error('Permission denied'));

      await expect(service.deleteImapFolder(providerId, 'SystemFolder')).rejects.toThrow(
        'Permission denied: Cannot delete this folder',
      );
    });

    it('should throw error when folder is not empty', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        providerType: 'imap',
      });
      mockImapClient.mailboxDelete.mockRejectedValue(new Error('Mailbox not empty'));

      await expect(service.deleteImapFolder(providerId, 'FolderWithEmails')).rejects.toThrow(
        'Folder is not empty. Please delete or move all emails first.',
      );
    });
  });

  describe('edge cases', () => {
    it('should handle folder with parent path construction', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: 'provider-1',
        providerType: 'imap',
      });
      mockPrismaService.folder.findFirst.mockResolvedValue(null);
      mockImapClient.mailboxCreate.mockResolvedValue({ path: 'Parent/Child' });

      const result = await service.createImapFolder('provider-1', 'Child', 'Parent');

      expect(mockImapClient.mailboxCreate).toHaveBeenCalledWith('Parent/Child');
      expect(result.path).toBe('Parent/Child');
    });

    it('should handle parseImapFolders with missing delimiter', () => {
      const imapFolders = [
        { path: 'INBOX', name: 'INBOX', attributes: [] },
      ];

      const result = service.parseImapFolders(imapFolders);

      expect(result[0].delimiter).toBe('/'); // Default delimiter
    });

    it('should handle parseImapFolders with missing attributes', () => {
      const imapFolders = [
        { path: 'INBOX', name: 'INBOX', delimiter: '/' },
      ];

      const result = service.parseImapFolders(imapFolders);

      expect(result[0].attributes).toEqual([]);
      expect(result[0].isSelectable).toBe(true);
    });

    it('should handle syncToken as undefined when uidNext is missing', () => {
      const imapFolders = [
        { path: 'INBOX', name: 'INBOX', delimiter: '/', attributes: [] },
      ];

      const result = service.parseImapFolders(imapFolders);

      expect(result[0].syncToken).toBeUndefined();
    });
  });
});
