import { Test, TestingModule } from '@nestjs/testing';
import { ContactsService } from './contacts.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { GoogleOAuthService } from '../../providers/services/google-oauth.service';
import { MicrosoftOAuthService } from '../../providers/services/microsoft-oauth.service';
import { GoogleContactsSyncService } from './google-contacts-sync.service';
import { MicrosoftContactsSyncService } from './microsoft-contacts-sync.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';

/**
 * Unit Tests for ContactsService - vCard Import Functionality
 *
 * Tests vCard parsing and import for:
 * - vCard 3.0 format (Outlook, Apple Contacts)
 * - vCard 4.0 format (Google Contacts)
 * - Multiple contacts in single file
 * - Duplicate detection
 * - Edge cases (missing fields, special characters)
 */
describe('ContactsService - vCard Import', () => {
  let service: ContactsService;

  const mockTenantId = 'tenant-vcard-test';

  // Mock PrismaService
  const mockPrismaService = {
    contact: {
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    providerConfig: {
      findMany: jest.fn(),
    },
  };

  // Mock other services
  const mockCryptoService = {
    encrypt: jest.fn(),
    decrypt: jest.fn(),
  };

  const mockGoogleOAuthService = {
    getValidAccessToken: jest.fn(),
  };

  const mockMicrosoftOAuthService = {
    getValidAccessToken: jest.fn(),
  };

  const mockGoogleContactsSyncService = {
    syncContacts: jest.fn(),
  };

  const mockMicrosoftContactsSyncService = {
    syncContacts: jest.fn(),
  };

  const mockRealtimeEventsService = {
    emitToTenant: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: CryptoService,
          useValue: mockCryptoService,
        },
        {
          provide: GoogleOAuthService,
          useValue: mockGoogleOAuthService,
        },
        {
          provide: MicrosoftOAuthService,
          useValue: mockMicrosoftOAuthService,
        },
        {
          provide: GoogleContactsSyncService,
          useValue: mockGoogleContactsSyncService,
        },
        {
          provide: MicrosoftContactsSyncService,
          useValue: mockMicrosoftContactsSyncService,
        },
        {
          provide: RealtimeEventsService,
          useValue: mockRealtimeEventsService,
        },
      ],
    }).compile();

    service = module.get<ContactsService>(ContactsService);

    // Reset all mocks
    jest.clearAllMocks();

    // Default: no existing contacts
    mockPrismaService.contact.findMany.mockResolvedValue([]);
    mockPrismaService.contact.create.mockImplementation(async (args) => ({
      id: `contact-${Date.now()}`,
      ...args.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mockPrismaService.contact.count.mockResolvedValue(0);
    mockPrismaService.providerConfig.findMany.mockResolvedValue([]);
  });

  // Helper to create properly formatted vCard strings
  const vcard = (...lines: string[]) => lines.join('\r\n');

  describe('vCard 3.0 Format (Outlook/Apple)', () => {
    it('should import a single vCard 3.0 contact with basic info', async () => {
      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:John Doe',
        'N:Doe;John;;;',
        'EMAIL;TYPE=INTERNET:john.doe@example.com',
        'TEL;TYPE=CELL:+1-555-123-4567',
        'ORG:Acme Corporation',
        'TITLE:Software Engineer',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      expect(mockPrismaService.contact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: mockTenantId,
          firstName: 'John',
          lastName: 'Doe',
          displayName: 'John Doe',
          company: 'Acme Corporation',
          jobTitle: 'Software Engineer',
          emails: expect.arrayContaining([
            expect.objectContaining({
              value: 'john.doe@example.com',
              primary: true,
            }),
          ]),
          phoneNumbers: expect.arrayContaining([
            expect.objectContaining({
              value: expect.stringContaining('555'),
            }),
          ]),
        }),
      });
    });

    it('should import vCard 3.0 with multiple emails', async () => {
      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Jane Smith',
        'N:Smith;Jane;;;',
        'EMAIL;TYPE=WORK:jane.work@company.com',
        'EMAIL;TYPE=HOME:jane.personal@gmail.com',
        'EMAIL;TYPE=PREF,INTERNET:jane.main@example.com',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(1);

      const createCall = mockPrismaService.contact.create.mock.calls[0][0];
      expect(createCall.data.emails).toHaveLength(3);
    });

    it('should import vCard 3.0 with multiple phone numbers', async () => {
      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Bob Johnson',
        'N:Johnson;Bob;;;',
        'EMAIL:bob@test.com',
        'TEL;TYPE=WORK:+1-555-WORK',
        'TEL;TYPE=CELL:+1-555-CELL',
        'TEL;TYPE=HOME:+1-555-HOME',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(1);

      const createCall = mockPrismaService.contact.create.mock.calls[0][0];
      expect(createCall.data.phoneNumbers).toHaveLength(3);
    });

    it('should import vCard 3.0 with birthday', async () => {
      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Alice Wonder',
        'N:Wonder;Alice;;;',
        'EMAIL:alice@example.com',
        'BDAY:1990-06-15',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(1);

      const createCall = mockPrismaService.contact.create.mock.calls[0][0];
      expect(createCall.data.birthday).toBeInstanceOf(Date);
    });

    it('should import vCard 3.0 with notes', async () => {
      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Charlie Notes',
        'N:Notes;Charlie;;;',
        'EMAIL:charlie@example.com',
        'NOTE:Important client - handle with care',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(1);

      const createCall = mockPrismaService.contact.create.mock.calls[0][0];
      expect(createCall.data.notes).toContain('Important client');
    });
  });

  describe('vCard 4.0 Format (Google Contacts)', () => {
    it('should import a vCard 4.0 contact', async () => {
      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:4.0',
        'FN:David Brown',
        'N:Brown;David;;;',
        'EMAIL:david.brown@google.com',
        'TEL;VALUE=uri;TYPE="voice,cell":tel:+1-555-987-6543',
        'ORG:Google LLC',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);

      expect(mockPrismaService.contact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firstName: 'David',
          lastName: 'Brown',
          displayName: 'David Brown',
        }),
      });
    });

    it('should handle vCard 4.0 with VALUE=text format', async () => {
      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:4.0',
        'FN:Eva Green',
        'N:Green;Eva;;;',
        'EMAIL;TYPE=work:eva@company.org',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(1);
    });
  });

  describe('Multiple Contacts in Single File', () => {
    it('should import multiple contacts from a single vCard file', async () => {
      const vcardContent = [
        vcard(
          'BEGIN:VCARD',
          'VERSION:3.0',
          'FN:Contact One',
          'N:One;Contact;;;',
          'EMAIL:contact1@test.com',
          'END:VCARD',
        ),
        vcard(
          'BEGIN:VCARD',
          'VERSION:3.0',
          'FN:Contact Two',
          'N:Two;Contact;;;',
          'EMAIL:contact2@test.com',
          'END:VCARD',
        ),
        vcard(
          'BEGIN:VCARD',
          'VERSION:3.0',
          'FN:Contact Three',
          'N:Three;Contact;;;',
          'EMAIL:contact3@test.com',
          'END:VCARD',
        ),
      ].join('\r\n');

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(3);
      expect(result.skipped).toBe(0);
      expect(mockPrismaService.contact.create).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed vCard versions in single file', async () => {
      const vcardContent = [
        vcard(
          'BEGIN:VCARD',
          'VERSION:3.0',
          'FN:Version Three',
          'N:Three;Version;;;',
          'EMAIL:v3@test.com',
          'END:VCARD',
        ),
        vcard(
          'BEGIN:VCARD',
          'VERSION:4.0',
          'FN:Version Four',
          'N:Four;Version;;;',
          'EMAIL:v4@test.com',
          'END:VCARD',
        ),
      ].join('\r\n');

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(2);
    });

    it('should track import count correctly for large imports', async () => {
      // Generate 10 contacts
      const vcards: string[] = [];
      for (let i = 1; i <= 10; i++) {
        vcards.push(
          vcard(
            'BEGIN:VCARD',
            'VERSION:3.0',
            `FN:Bulk User ${i}`,
            `N:User ${i};Bulk;;;`,
            `EMAIL:bulk${i}@test.com`,
            'END:VCARD',
          ),
        );
      }

      const result = await service.importFromVCard(mockTenantId, vcards.join('\r\n'));

      expect(result.imported).toBe(10);
      expect(mockPrismaService.contact.create).toHaveBeenCalledTimes(10);
    });
  });

  describe('Duplicate Detection', () => {
    it('should skip contacts that already exist by email', async () => {
      // Mock existing contact
      mockPrismaService.contact.findMany.mockResolvedValue([
        {
          id: 'existing-1',
          emails: [{ value: 'existing@test.com' }],
        },
      ]);

      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Existing User',
        'N:User;Existing;;;',
        'EMAIL:existing@test.com',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
      expect(mockPrismaService.contact.create).not.toHaveBeenCalled();
    });

    it('should skip duplicates within the same import file', async () => {
      const vcardContent = [
        vcard(
          'BEGIN:VCARD',
          'VERSION:3.0',
          'FN:First Entry',
          'N:Entry;First;;;',
          'EMAIL:duplicate@test.com',
          'END:VCARD',
        ),
        vcard(
          'BEGIN:VCARD',
          'VERSION:3.0',
          'FN:Second Entry Same Email',
          'N:Entry;Second;;;',
          'EMAIL:duplicate@test.com',
          'END:VCARD',
        ),
      ].join('\r\n');

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(mockPrismaService.contact.create).toHaveBeenCalledTimes(1);
    });

    it('should be case-insensitive when detecting duplicates', async () => {
      mockPrismaService.contact.findMany.mockResolvedValue([
        {
          id: 'existing-1',
          emails: [{ value: 'test@example.com' }],
        },
      ]);

      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Case Test',
        'N:Test;Case;;;',
        'EMAIL:TEST@EXAMPLE.COM',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it('should detect duplicate when any email matches', async () => {
      mockPrismaService.contact.findMany.mockResolvedValue([
        {
          id: 'existing-1',
          emails: [{ value: 'primary@test.com' }],
        },
      ]);

      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Multi Email',
        'N:Email;Multi;;;',
        'EMAIL:new@test.com',
        'EMAIL:primary@test.com',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should skip contacts without email', async () => {
      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:No Email User',
        'N:User;NoEmail;;;',
        'TEL:+1-555-1234',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
      expect(mockPrismaService.contact.create).not.toHaveBeenCalled();
    });

    it('should handle contacts with only FN (no N field)', async () => {
      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Single Name Only',
        'EMAIL:singlename@test.com',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(1);

      const createCall = mockPrismaService.contact.create.mock.calls[0][0];
      expect(createCall.data.displayName).toBe('Single Name Only');
      expect(createCall.data.firstName).toBe('Single');
      expect(createCall.data.lastName).toBe('Name Only');
    });

    it('should handle special characters in names', async () => {
      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:José García-Fernández',
        'N:García-Fernández;José;;;',
        'EMAIL:jose@example.com',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(1);

      const createCall = mockPrismaService.contact.create.mock.calls[0][0];
      expect(createCall.data.firstName).toBe('José');
      expect(createCall.data.lastName).toBe('García-Fernández');
    });

    it('should handle empty vCard file', async () => {
      const vcardContent = '';

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('should handle vCard with minimal content', async () => {
      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:3.0',
        'EMAIL:minimal@test.com',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(1);

      const createCall = mockPrismaService.contact.create.mock.calls[0][0];
      // Should use email as display name when no name is provided
      expect(createCall.data.displayName).toBe('minimal@test.com');
    });

    it('should handle organization with department separator', async () => {
      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Org Test',
        'N:Test;Org;;;',
        'EMAIL:org@test.com',
        'ORG:Company Inc;Engineering;Backend Team',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(1);

      const createCall = mockPrismaService.contact.create.mock.calls[0][0];
      // Should extract only the company name (first part before semicolon)
      expect(createCall.data.company).toBe('Company Inc');
    });

    it('should trim whitespace from email addresses', async () => {
      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Whitespace Test',
        'N:Test;Whitespace;;;',
        'EMAIL:  whitespace@test.com  ',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(1);

      const createCall = mockPrismaService.contact.create.mock.calls[0][0];
      expect(createCall.data.emails[0].value).toBe('whitespace@test.com');
    });

    it('should handle invalid birthday gracefully', async () => {
      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Invalid Bday',
        'N:Bday;Invalid;;;',
        'EMAIL:bday@test.com',
        'BDAY:not-a-date',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(1);

      const createCall = mockPrismaService.contact.create.mock.calls[0][0];
      expect(createCall.data.birthday).toBeUndefined();
    });
  });

  describe('Outlook Export Format', () => {
    it('should import Outlook vCard export format', async () => {
      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:2.1',
        'N;CHARSET=UTF-8:Smith;John;;;',
        'FN;CHARSET=UTF-8:John Smith',
        'EMAIL;PREF;INTERNET:john.smith@outlook.com',
        'TEL;WORK;VOICE:+1 (555) 123-4567',
        'ORG:Microsoft Corporation',
        'TITLE:Product Manager',
        'NOTE;CHARSET=UTF-8:Met at Build Conference 2024',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(1);
    });
  });

  describe('Apple Contacts Export Format', () => {
    it('should import Apple Contacts vCard export format', async () => {
      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:3.0',
        'PRODID:-//Apple Inc.//iPhone OS 17.0//EN',
        'N:Cook;Tim;;;',
        'FN:Tim Cook',
        'ORG:Apple Inc.;',
        'TEL;type=CELL;type=VOICE;type=pref:(555) 123-4567',
        'EMAIL;type=INTERNET;type=WORK;type=pref:tim@apple.com',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(1);
    });
  });

  describe('Google Contacts Export Format', () => {
    it('should import Google Contacts vCard export format', async () => {
      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Sundar Pichai',
        'N:Pichai;Sundar;;;',
        'EMAIL;TYPE=INTERNET:sundar@google.com',
        'ORG:Google LLC',
        'TITLE:CEO',
        'BDAY:1972-06-10',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(1);

      const createCall = mockPrismaService.contact.create.mock.calls[0][0];
      expect(createCall.data.company).toBe('Google LLC');
      expect(createCall.data.jobTitle).toBe('CEO');
    });
  });

  describe('Metadata and Source Tracking', () => {
    it('should set correct metadata source for imported contacts', async () => {
      const vcardContent = vcard(
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Metadata Test',
        'N:Test;Metadata;;;',
        'EMAIL:meta@test.com',
        'END:VCARD',
      );

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(1);

      const createCall = mockPrismaService.contact.create.mock.calls[0][0];
      expect(createCall.data.metadata).toEqual(
        expect.objectContaining({
          source: 'vcard_import',
          importedAt: expect.any(String),
        }),
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed vCard gracefully', async () => {
      const vcardContent = 'This is not a valid vCard file\nJust some random text';

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      // Should not crash, just return empty results
      expect(result.imported).toBe(0);
    });

    it('should continue processing after individual contact error', async () => {
      // First contact create fails, second succeeds
      mockPrismaService.contact.create
        .mockRejectedValueOnce(new Error('DB Error'))
        .mockResolvedValueOnce({ id: 'success-id' });

      const vcardContent = [
        vcard(
          'BEGIN:VCARD',
          'VERSION:3.0',
          'FN:Fail Contact',
          'EMAIL:fail@test.com',
          'END:VCARD',
        ),
        vcard(
          'BEGIN:VCARD',
          'VERSION:3.0',
          'FN:Success Contact',
          'EMAIL:success@test.com',
          'END:VCARD',
        ),
      ].join('\r\n');

      const result = await service.importFromVCard(mockTenantId, vcardContent);

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('DB Error');
    });
  });
});
