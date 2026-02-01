import { Test, TestingModule } from '@nestjs/testing';
import { MicrosoftFolderService } from '../microsoft-folder.service';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { CryptoService } from '../../../../../common/services/crypto.service';
import { ProviderTokenService } from '../../provider-token.service';
import { ConflictException } from '@nestjs/common';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import axios, { AxiosError } from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock PrismaService
const mockPrismaService = {
  folder: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  providerConfig: {
    findUnique: jest.fn(),
  },
};

// Mock CryptoService
const mockCryptoService = {
  decrypt: jest.fn(),
};

// Mock ProviderTokenService
const mockProviderTokenService = {
  getProviderWithToken: jest.fn(),
};

describe('MicrosoftFolderService', () => {
  let service: MicrosoftFolderService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MicrosoftFolderService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CryptoService, useValue: mockCryptoService },
        { provide: ProviderTokenService, useValue: mockProviderTokenService },
      ],
    }).compile();

    service = module.get<MicrosoftFolderService>(MicrosoftFolderService);
  });

  describe('determineFolderFromParentId', () => {
    const providerId = 'provider-1';

    it('should return INBOX when parentFolderId is undefined and not draft', async () => {
      const result = await service.determineFolderFromParentId(undefined, providerId, false);
      expect(result).toBe('INBOX');
    });

    it('should return DRAFTS when parentFolderId is undefined and isDraft is true', async () => {
      const result = await service.determineFolderFromParentId(undefined, providerId, true);
      expect(result).toBe('DRAFTS');
    });

    it('should return canonical folder when exact match by externalId found', async () => {
      mockPrismaService.folder.findFirst.mockResolvedValueOnce({
        specialUse: 'SENT',
        name: 'Sent Items',
        path: 'SENT',
      });

      const result = await service.determineFolderFromParentId('folder-id-123', providerId, false);

      expect(result).toBe('SENT');
      expect(mockPrismaService.folder.findFirst).toHaveBeenCalledWith({
        where: { providerId, externalId: 'folder-id-123' },
        select: { specialUse: true, name: true, path: true },
      });
    });

    it('should return canonical folder when partial match (prefix) found', async () => {
      // First findFirst returns null (no exact match)
      mockPrismaService.folder.findFirst.mockResolvedValueOnce(null);
      // Then findMany returns all folders for prefix matching
      mockPrismaService.folder.findMany.mockResolvedValueOnce([
        { externalId: 'AAMkADI3YjQ1MzE5LWY2YzgtNGNjMS1hMDRjLWNkODI1YjNhMzY4MwAuAAAAAAA', specialUse: 'INBOX', name: 'Inbox' },
        { externalId: 'AAMkADI3YjQ1MzE5LWY2YzgtNGNjMS1hMDRjLWNkODI1YjNhMzY4MwAuBBBBBBB', specialUse: 'SENT', name: 'Sent Items' },
      ]);

      // Use a parentFolderId that shares the first 80 chars with one of the folders
      const parentFolderId = 'AAMkADI3YjQ1MzE5LWY2YzgtNGNjMS1hMDRjLWNkODI1YjNhMzY4MwAuAAAAAAA-different-suffix';
      const result = await service.determineFolderFromParentId(parentFolderId, providerId, false);

      expect(result).toBe('INBOX');
    });

    it('should return canonical folder from specialUse field', async () => {
      mockPrismaService.folder.findFirst.mockResolvedValueOnce({
        specialUse: 'JUNK',
        name: 'Junk Email',
        path: 'Junk Email',
      });

      const result = await service.determineFolderFromParentId('folder-id-junk', providerId, false);

      expect(result).toBe('SPAM');
    });

    it('should map localized display names to canonical (e.g., Posta inviata -> SENT)', async () => {
      // No specialUse, so must use displayName mapping
      mockPrismaService.folder.findFirst.mockResolvedValueOnce({
        specialUse: null,
        name: 'Posta inviata',
        path: 'Posta inviata',
      });

      const result = await service.determineFolderFromParentId('folder-id-sent', providerId, false);

      expect(result).toBe('SENT');
    });

    it('should default to INBOX when no match found', async () => {
      mockPrismaService.folder.findFirst
        .mockResolvedValueOnce(null) // exact match
        .mockResolvedValueOnce(null); // path lookup
      mockPrismaService.folder.findMany.mockResolvedValueOnce([]); // no folders for prefix match

      const result = await service.determineFolderFromParentId('unknown-folder-id', providerId, false);

      expect(result).toBe('INBOX');
    });

    it('should default to DRAFTS when no match found and isDraft is true', async () => {
      mockPrismaService.folder.findFirst
        .mockResolvedValueOnce(null) // exact match
        .mockResolvedValueOnce(null); // path lookup
      mockPrismaService.folder.findMany.mockResolvedValueOnce([]); // no folders for prefix match

      const result = await service.determineFolderFromParentId('unknown-folder-id', providerId, true);

      expect(result).toBe('DRAFTS');
    });
  });

  describe('syncMicrosoftFolders', () => {
    const tenantId = 'tenant-1';
    const providerId = 'provider-1';

    it('should sync folders from Microsoft Graph API to database', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        accessToken: 'encrypted-token',
        tokenEncryptionIv: 'iv-123',
      });
      mockCryptoService.decrypt.mockReturnValue('decrypted-access-token');
      mockedAxios.get.mockResolvedValue({
        data: {
          value: [
            { id: 'folder-1', displayName: 'Inbox', totalItemCount: 100, unreadItemCount: 5 },
            { id: 'folder-2', displayName: 'Sent Items', totalItemCount: 50, unreadItemCount: 0 },
          ],
        },
      });
      mockPrismaService.folder.findMany.mockResolvedValue([]);
      mockPrismaService.folder.upsert.mockResolvedValue({});

      await service.syncMicrosoftFolders(tenantId, providerId);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/mailFolders',
        { headers: { Authorization: 'Bearer decrypted-access-token' } },
      );
      expect(mockPrismaService.folder.upsert).toHaveBeenCalledTimes(2);
    });

    it('should throw error when provider not found', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue(null);

      await expect(service.syncMicrosoftFolders(tenantId, providerId)).rejects.toThrow(
        'Provider not found or missing access token',
      );
    });

    it('should throw error when access token missing', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        accessToken: null,
        tokenEncryptionIv: null,
      });

      await expect(service.syncMicrosoftFolders(tenantId, providerId)).rejects.toThrow(
        'Provider not found or missing access token',
      );
    });

    it('should delete folders no longer on server', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        accessToken: 'encrypted-token',
        tokenEncryptionIv: 'iv-123',
      });
      mockCryptoService.decrypt.mockReturnValue('decrypted-access-token');
      mockedAxios.get.mockResolvedValue({
        data: {
          value: [
            { id: 'folder-1', displayName: 'Inbox', totalItemCount: 100, unreadItemCount: 5 },
          ],
        },
      });
      mockPrismaService.folder.findMany.mockResolvedValue([
        { id: 'db-folder-1', path: 'INBOX', tenantId, providerId },
        { id: 'db-folder-2', path: 'OldFolder', tenantId, providerId },
      ]);
      mockPrismaService.folder.deleteMany.mockResolvedValue({ count: 1 });
      mockPrismaService.folder.upsert.mockResolvedValue({});

      await service.syncMicrosoftFolders(tenantId, providerId);

      expect(mockPrismaService.folder.deleteMany).toHaveBeenCalledWith({
        where: {
          providerId,
          path: { in: ['OldFolder'] },
        },
      });
    });

    it('should handle Graph API errors gracefully', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        accessToken: 'encrypted-token',
        tokenEncryptionIv: 'iv-123',
      });
      mockCryptoService.decrypt.mockReturnValue('decrypted-access-token');
      mockedAxios.get.mockRejectedValue(new Error('Graph API error'));

      await expect(service.syncMicrosoftFolders(tenantId, providerId)).rejects.toThrow('Graph API error');
    });
  });

  describe('fetchMicrosoftFolders', () => {
    const accessToken = 'test-access-token';

    it('should fetch all folders with pagination', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          value: [
            { id: 'folder-1', displayName: 'Inbox' },
            { id: 'folder-2', displayName: 'Sent' },
          ],
          '@odata.deltaLink': 'https://graph.microsoft.com/delta?token=abc123',
        },
      });

      const result = await service.fetchMicrosoftFolders(accessToken);

      expect(result.folders).toHaveLength(2);
      expect(result.deltaLink).toBe('https://graph.microsoft.com/delta?token=abc123');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/mailFolders/delta',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
    });

    it('should return deltaLink for incremental sync', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          value: [{ id: 'folder-1', displayName: 'Inbox' }],
          '@odata.deltaLink': 'https://graph.microsoft.com/delta?token=xyz789',
        },
      });

      const result = await service.fetchMicrosoftFolders(accessToken);

      expect(result.deltaLink).toBe('https://graph.microsoft.com/delta?token=xyz789');
    });

    it('should handle @odata.nextLink pagination', async () => {
      // First page
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          value: [{ id: 'folder-1', displayName: 'Inbox' }],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/delta?$skiptoken=page2',
        },
      });
      // Second page
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          value: [{ id: 'folder-2', displayName: 'Sent' }],
          '@odata.deltaLink': 'https://graph.microsoft.com/delta?token=final',
        },
      });

      const result = await service.fetchMicrosoftFolders(accessToken);

      expect(result.folders).toHaveLength(2);
      expect(result.folders[0].id).toBe('folder-1');
      expect(result.folders[1].id).toBe('folder-2');
      expect(result.deltaLink).toBe('https://graph.microsoft.com/delta?token=final');
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('createMicrosoftFolder', () => {
    const providerId = 'provider-1';

    it('should create folder via Graph API and return ID', async () => {
      mockProviderTokenService.getProviderWithToken.mockResolvedValue({
        accessToken: 'test-token',
        provider: { id: providerId },
      });
      mockedAxios.post.mockResolvedValue({
        data: { id: 'new-folder-id-123' },
      });

      const result = await service.createMicrosoftFolder(providerId, 'My New Folder');

      expect(result).toEqual({ externalId: 'new-folder-id-123', path: 'new-folder-id-123' });
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/mailFolders',
        { displayName: 'My New Folder' },
        {
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        },
      );
    });

    it('should create child folder when parentFolderId provided', async () => {
      mockProviderTokenService.getProviderWithToken.mockResolvedValue({
        accessToken: 'test-token',
        provider: { id: providerId },
      });
      mockedAxios.post.mockResolvedValue({
        data: { id: 'child-folder-id' },
      });

      const result = await service.createMicrosoftFolder(providerId, 'Subfolder', 'parent-folder-id');

      expect(result).toEqual({ externalId: 'child-folder-id', path: 'child-folder-id' });
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/mailFolders/parent-folder-id/childFolders',
        { displayName: 'Subfolder' },
        expect.any(Object),
      );
    });

    it('should throw ConflictException when Graph returns 409', async () => {
      mockProviderTokenService.getProviderWithToken.mockResolvedValue({
        accessToken: 'test-token',
        provider: { id: providerId },
      });
      const axiosError = new Error('Conflict') as AxiosError;
      (axiosError as any).response = { status: 409 };
      (axiosError as any).isAxiosError = true;
      mockedAxios.post.mockRejectedValue(axiosError);
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(true) as any;

      await expect(service.createMicrosoftFolder(providerId, 'Existing Folder')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should handle API errors', async () => {
      mockProviderTokenService.getProviderWithToken.mockResolvedValue({
        accessToken: 'test-token',
        provider: { id: providerId },
      });
      const error = new Error('Network error');
      mockedAxios.post.mockRejectedValue(error);
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(false) as any;

      await expect(service.createMicrosoftFolder(providerId, 'New Folder')).rejects.toThrow('Network error');
    });
  });

  describe('renameMicrosoftFolder', () => {
    const providerId = 'provider-1';
    const folderId = 'folder-123';

    it('should rename folder via Graph API PATCH', async () => {
      mockProviderTokenService.getProviderWithToken.mockResolvedValue({
        accessToken: 'test-token',
        provider: { id: providerId },
      });
      mockedAxios.patch.mockResolvedValue({ data: { id: folderId, displayName: 'Renamed Folder' } });

      await service.renameMicrosoftFolder(providerId, folderId, 'Renamed Folder');

      expect(mockedAxios.patch).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/mailFolders/folder-123',
        { displayName: 'Renamed Folder' },
        {
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        },
      );
    });

    it('should handle API errors', async () => {
      mockProviderTokenService.getProviderWithToken.mockResolvedValue({
        accessToken: 'test-token',
        provider: { id: providerId },
      });
      mockedAxios.patch.mockRejectedValue(new Error('Forbidden'));

      await expect(
        service.renameMicrosoftFolder(providerId, folderId, 'New Name'),
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('deleteMicrosoftFolder', () => {
    const providerId = 'provider-1';
    const folderId = 'folder-to-delete';

    it('should delete folder via Graph API DELETE', async () => {
      mockProviderTokenService.getProviderWithToken.mockResolvedValue({
        accessToken: 'test-token',
        provider: { id: providerId },
      });
      mockedAxios.delete.mockResolvedValue({ status: 204 });

      await service.deleteMicrosoftFolder(providerId, folderId);

      expect(mockedAxios.delete).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/mailFolders/folder-to-delete',
        { headers: { Authorization: 'Bearer test-token' } },
      );
    });

    it('should handle API errors', async () => {
      mockProviderTokenService.getProviderWithToken.mockResolvedValue({
        accessToken: 'test-token',
        provider: { id: providerId },
      });
      mockedAxios.delete.mockRejectedValue(new Error('Not found'));

      await expect(service.deleteMicrosoftFolder(providerId, folderId)).rejects.toThrow('Not found');
    });
  });

  describe('displayNameToCanonical (via determineFolderFromParentId)', () => {
    const providerId = 'provider-1';

    it('should map Inbox to INBOX', async () => {
      mockPrismaService.folder.findFirst.mockResolvedValueOnce({
        specialUse: null,
        name: 'Inbox',
        path: 'Inbox',
      });

      const result = await service.determineFolderFromParentId('inbox-folder-id', providerId, false);

      expect(result).toBe('INBOX');
    });

    it('should map Sent Items to SENT', async () => {
      mockPrismaService.folder.findFirst.mockResolvedValueOnce({
        specialUse: null,
        name: 'Sent Items',
        path: 'Sent Items',
      });

      const result = await service.determineFolderFromParentId('sent-folder-id', providerId, false);

      expect(result).toBe('SENT');
    });

    it('should map Deleted Items to TRASH', async () => {
      mockPrismaService.folder.findFirst.mockResolvedValueOnce({
        specialUse: null,
        name: 'Deleted Items',
        path: 'Deleted Items',
      });

      const result = await service.determineFolderFromParentId('trash-folder-id', providerId, false);

      expect(result).toBe('TRASH');
    });

    it('should map Junk Email to SPAM', async () => {
      mockPrismaService.folder.findFirst.mockResolvedValueOnce({
        specialUse: null,
        name: 'Junk Email',
        path: 'Junk Email',
      });

      const result = await service.determineFolderFromParentId('junk-folder-id', providerId, false);

      expect(result).toBe('SPAM');
    });
  });

  describe('syncFolders (facade method)', () => {
    it('should delegate to syncMicrosoftFolders', async () => {
      const tenantId = 'tenant-1';
      const providerId = 'provider-1';

      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: providerId,
        accessToken: 'encrypted-token',
        tokenEncryptionIv: 'iv-123',
      });
      mockCryptoService.decrypt.mockReturnValue('decrypted-token');
      mockedAxios.get.mockResolvedValue({ data: { value: [] } });
      mockPrismaService.folder.findMany.mockResolvedValue([]);

      await service.syncFolders(tenantId, providerId);

      expect(mockedAxios.get).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle error during folder lookup gracefully', async () => {
      mockPrismaService.folder.findFirst.mockRejectedValue(new Error('Database connection failed'));

      const result = await service.determineFolderFromParentId('any-folder-id', 'provider-1', false);

      // Should default to INBOX on error
      expect(result).toBe('INBOX');
    });

    it('should handle error during folder lookup with isDraft=true', async () => {
      mockPrismaService.folder.findFirst.mockRejectedValue(new Error('Database error'));

      const result = await service.determineFolderFromParentId('any-folder-id', 'provider-1', true);

      // Should default to DRAFTS on error when isDraft is true
      expect(result).toBe('DRAFTS');
    });
  });
});
