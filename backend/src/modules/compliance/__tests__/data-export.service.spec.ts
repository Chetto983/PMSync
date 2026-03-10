import { Test, TestingModule } from '@nestjs/testing';
import { DataExportService } from '../services/data-export.service';
import { PrismaService } from '../../../prisma/prisma.service';

// Mock archiver to avoid filesystem operations
jest.mock('archiver', () => {
  const appendedFiles: string[] = [];
  const mockArchive = {
    pipe: jest.fn(),
    append: jest.fn((_, opts: { name: string }) => {
      appendedFiles.push(opts.name);
    }),
    finalize: jest.fn(),
    on: jest.fn(),
    _appendedFiles: appendedFiles,
  };
  return {
    default: jest.fn(() => mockArchive),
    __mockArchive: mockArchive,
    __appendedFiles: appendedFiles,
  };
});

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    createWriteStream: jest.fn(() => ({
      on: jest.fn((event: string, cb: () => void) => {
        if (event === 'close') setTimeout(cb, 0);
      }),
    })),
  };
});

jest.mock('fs/promises', () => {
  const actual = jest.requireActual('fs/promises');
  return {
    ...actual,
    mkdir: jest.fn(),
    stat: jest.fn(() => ({ size: 1234 })),
    unlink: jest.fn(),
  };
});

describe('DataExportService', () => {
  let service: DataExportService;
  let prisma: Record<string, any>;

  const mockUserId = 'user-123';
  const mockTenantId = 'tenant-456';

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: mockUserId }) },
      userPreferences: { findUnique: jest.fn().mockResolvedValue(null) },
      email: { findMany: jest.fn().mockResolvedValue([]) },
      contact: { findMany: jest.fn().mockResolvedValue([]) },
      calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
      aIMemory: { findMany: jest.fn().mockResolvedValue([]) },
      userConsent: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      member: {
        findMany: jest.fn().mockResolvedValue([
          {
            role: 'admin',
            createdAt: new Date('2026-01-01'),
            organization: { id: 'org-1', name: 'Org One' },
          },
        ]),
      },
      invitation: {
        findMany: jest.fn().mockResolvedValue([
          {
            email: 'invite@example.com',
            role: 'member',
            status: 'pending',
            expiresAt: new Date('2026-06-01'),
            createdAt: new Date('2026-01-15'),
            organization: { id: 'org-1', name: 'Org One' },
          },
        ]),
      },
      account: {
        findMany: jest.fn().mockResolvedValue([
          {
            providerId: 'google',
            accountId: 'google-acc-1',
            scope: 'email profile',
            createdAt: new Date('2026-01-01'),
            updatedAt: new Date('2026-01-01'),
          },
        ]),
      },
      session: {
        findMany: jest.fn().mockResolvedValue([
          {
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
            activeOrganizationId: null,
            createdAt: new Date('2026-03-01'),
            updatedAt: new Date('2026-03-01'),
            expiresAt: new Date('2026-04-01'),
          },
        ]),
      },
      dataExportRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataExportService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<DataExportService>(DataExportService);
  });

  describe('assembleUserData', () => {
    it('should return organizationMemberships with role, createdAt, org name/id', async () => {
      const data = await service.assembleUserData(mockUserId, mockTenantId);

      expect(data.organizationMemberships).toBeDefined();
      expect(data.organizationMemberships).toHaveLength(1);
      expect(data.organizationMemberships[0]).toMatchObject({
        role: 'admin',
        organization: { id: 'org-1', name: 'Org One' },
      });
      expect(prisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: mockUserId },
        }),
      );
    });

    it('should return sentInvitations with email, role, status, expiresAt, org name/id', async () => {
      const data = await service.assembleUserData(mockUserId, mockTenantId);

      expect(data.sentInvitations).toBeDefined();
      expect(data.sentInvitations).toHaveLength(1);
      expect(data.sentInvitations[0]).toMatchObject({
        email: 'invite@example.com',
        role: 'member',
        status: 'pending',
        organization: { id: 'org-1', name: 'Org One' },
      });
      expect(prisma.invitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { inviterId: mockUserId },
        }),
      );
    });

    it('should return authAccounts WITHOUT password, accessToken, refreshToken, idToken', async () => {
      const data = await service.assembleUserData(mockUserId, mockTenantId);

      expect(data.authAccounts).toBeDefined();
      expect(data.authAccounts).toHaveLength(1);
      expect(data.authAccounts[0]).toMatchObject({
        providerId: 'google',
        accountId: 'google-acc-1',
        scope: 'email profile',
      });
      // Verify select excludes sensitive fields
      const accountCall = prisma.account.findMany.mock.calls[0][0];
      expect(accountCall.select).toBeDefined();
      expect(accountCall.select.password).toBeUndefined();
      expect(accountCall.select.accessToken).toBeUndefined();
      expect(accountCall.select.refreshToken).toBeUndefined();
      expect(accountCall.select.idToken).toBeUndefined();
    });

    it('should return activeSessions WITHOUT token field', async () => {
      const data = await service.assembleUserData(mockUserId, mockTenantId);

      expect(data.activeSessions).toBeDefined();
      expect(data.activeSessions).toHaveLength(1);
      expect(data.activeSessions[0]).toMatchObject({
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });
      // Verify select excludes token
      const sessionCall = prisma.session.findMany.mock.calls[0][0];
      expect(sessionCall.select).toBeDefined();
      expect(sessionCall.select.token).toBeUndefined();
    });

    it('should return all 12 fields (8 original + 4 new)', async () => {
      const data = await service.assembleUserData(mockUserId, mockTenantId);

      expect(data).toHaveProperty('profile');
      expect(data).toHaveProperty('preferences');
      expect(data).toHaveProperty('emails');
      expect(data).toHaveProperty('contacts');
      expect(data).toHaveProperty('calendarEvents');
      expect(data).toHaveProperty('aiHistory');
      expect(data).toHaveProperty('consentHistory');
      expect(data).toHaveProperty('auditLogs');
      expect(data).toHaveProperty('organizationMemberships');
      expect(data).toHaveProperty('sentInvitations');
      expect(data).toHaveProperty('authAccounts');
      expect(data).toHaveProperty('activeSessions');
    });
  });

  describe('generateExportZip', () => {
    it('should include 4 new JSON files in the archive', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const archiverMock = require('archiver');
      archiverMock.__appendedFiles.length = 0;

      const data = await service.assembleUserData(mockUserId, mockTenantId);
      // Don't await - the mock won't fully resolve the stream
      // Instead check the append calls directly
      const archive = archiverMock.__mockArchive;

      // Call generateExportZip - it will call archive.append for each file
      const promise = service.generateExportZip('export-1', data);
      // Let the close event fire
      await new Promise((r) => setTimeout(r, 50));

      const appendedNames = archive.append.mock.calls.map(
        (call: any[]) => call[1]?.name,
      );
      expect(appendedNames).toContain('organization-memberships.json');
      expect(appendedNames).toContain('sent-invitations.json');
      expect(appendedNames).toContain('auth-accounts.json');
      expect(appendedNames).toContain('active-sessions.json');
    });

    it('should include 4 new categories in metadata.json', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const archiverMock = require('archiver');
      const archive = archiverMock.__mockArchive;
      archive.append.mockClear();

      const data = await service.assembleUserData(mockUserId, mockTenantId);
      const promise = service.generateExportZip('export-2', data);
      await new Promise((r) => setTimeout(r, 50));

      // Find the metadata.json append call
      const metadataCall = archive.append.mock.calls.find(
        (call: any[]) => call[1]?.name === 'metadata.json',
      );
      expect(metadataCall).toBeDefined();
      const metadata = JSON.parse(metadataCall[0]);
      expect(metadata.categories).toContain('organization-memberships');
      expect(metadata.categories).toContain('sent-invitations');
      expect(metadata.categories).toContain('auth-accounts');
      expect(metadata.categories).toContain('active-sessions');
      expect(metadata.categories).toHaveLength(12);
    });
  });
});
