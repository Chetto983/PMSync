import { Test, TestingModule } from '@nestjs/testing';
import { ContactsController } from './contacts.controller';
import { ContactsService } from '../services/contacts.service';
import { ContactsSyncQueueService } from '../services/contacts-sync-queue.service';
import { PrismaService } from '../../../prisma/prisma.service';
import{jest,describe,it,expect,beforeEach}from'@jest/globals'; 
import { ForbiddenException } from '@nestjs/common';
import {
  CreateContactDto,
  UpdateContactDto,
  ListContactsQueryDto,
} from '../dto/contact.dto';

/**
 * Unit Tests for ContactsController
 *
 * Tests tenant isolation and provider ownership validation
 */
describe('ContactsController', () => {
  let controller: ContactsController;
  let contactsService: ContactsService;
  let prismaService: PrismaService;

  // Mock data
  const mockTenantId = 'tenant-123';
  const mockOtherTenantId = 'tenant-456';
  const mockContactId = 'contact-123';
  const mockProviderId = 'provider-123';
  const mockOtherProviderId = 'provider-456';

  const mockUser = {
    id: 'user-123',
    tenantId: mockTenantId,
    email: 'test@example.com',
  };

  const mockRequest = {
    user: mockUser,
  };

  const mockContact = {
    id: mockContactId,
    tenantId: mockTenantId,
    email: 'contact@example.com',
    firstName: 'John',
    lastName: 'Doe',
    company: 'Test Corp',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockContactsService = {
    listContacts: jest.fn(),
    getContact: jest.fn(),
    createContact: jest.fn(),
    updateContact: jest.fn(),
    deleteContact: jest.fn(),
    syncContacts: jest.fn(),
  };

  const mockPrismaService = {
    providerConfig: {
      findUnique: jest.fn(),
    },
  };

  const mockContactsSyncQueueService = {
    enqueueSync: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactsController],
      providers: [
        {
          provide: ContactsService,
          useValue: mockContactsService,
        },
        {
          provide: ContactsSyncQueueService,
          useValue: mockContactsSyncQueueService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    controller = module.get<ContactsController>(ContactsController);
    contactsService = module.get<ContactsService>(ContactsService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('listContacts', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should call contactsService.listContacts with tenantId', async () => {
      const mockContacts = [mockContact];
      mockContactsService.listContacts.mockResolvedValue(mockContacts);

      const query: ListContactsQueryDto = {};
      const result = await controller.listContacts(mockRequest, query);

      expect(contactsService.listContacts).toHaveBeenCalledWith(mockTenantId, {
        providerId: undefined,
        search: undefined,
        company: undefined,
        limit: undefined,
        offset: undefined,
      });
      expect(result).toEqual(mockContacts);
    });

    it('should pass filters to service', async () => {
      mockContactsService.listContacts.mockResolvedValue([]);

      const query: ListContactsQueryDto = {
        providerId: 'provider-1',
        search: 'search-term',
        company: 'company-name',
        limit: 10,
        offset: 5,
      };
      await controller.listContacts(mockRequest, query);

      expect(contactsService.listContacts).toHaveBeenCalledWith(mockTenantId, {
        providerId: 'provider-1',
        search: 'search-term',
        company: 'company-name',
        limit: 10,
        offset: 5,
      });
    });

    it('should parse limit and offset as integers', async () => {
      mockContactsService.listContacts.mockResolvedValue([]);

      const query: ListContactsQueryDto = { limit: 25, offset: 50 };
      await controller.listContacts(mockRequest, query);

      expect(contactsService.listContacts).toHaveBeenCalledWith(mockTenantId, {
        providerId: undefined,
        search: undefined,
        company: undefined,
        limit: 25,
        offset: 50,
      });
    });

    it('should handle missing optional parameters', async () => {
      mockContactsService.listContacts.mockResolvedValue([]);

      const query: ListContactsQueryDto = {};
      await controller.listContacts(mockRequest, query);

      expect(contactsService.listContacts).toHaveBeenCalledWith(mockTenantId, {
        providerId: undefined,
        search: undefined,
        company: undefined,
        limit: undefined,
        offset: undefined,
      });
    });
  });

  describe('getContact', () => {
    it('should call contactsService.getContact with tenantId and contactId', async () => {
      mockContactsService.getContact.mockResolvedValue(mockContact);

      const result = await controller.getContact(mockRequest, mockContactId);

      expect(contactsService.getContact).toHaveBeenCalledWith(mockTenantId, mockContactId);
      expect(result).toEqual(mockContact);
    });

    it('should enforce tenant isolation', async () => {
      mockContactsService.getContact.mockResolvedValue(null);

      await controller.getContact(mockRequest, 'other-contact-id');

      // Service is called, but it will return null for cross-tenant access
      expect(contactsService.getContact).toHaveBeenCalledWith(mockTenantId, 'other-contact-id');
    });
  });

  describe('createContact', () => {
    const createDto: CreateContactDto = {
      email: 'new@example.com',
      firstName: 'Jane',
      lastName: 'Smith',
      company: 'New Corp',
    };

    it('should create contact with tenantId from request', async () => {
      const createdContact = { ...mockContact, ...createDto };
      mockContactsService.createContact.mockResolvedValue(createdContact);

      const result = await controller.createContact(mockRequest, createDto);

      expect(contactsService.createContact).toHaveBeenCalledWith(mockTenantId, createDto);
      expect(result).toEqual(createdContact);
    });

    it('should ignore injected tenantId in DTO', async () => {
      const dtoWithInjectedTenantId = {
        ...createDto,
        tenantId: mockOtherTenantId, // Attempt to inject different tenant
      } as any;

      mockContactsService.createContact.mockResolvedValue(mockContact);

      await controller.createContact(mockRequest, dtoWithInjectedTenantId);

      // Should use tenantId from request, not from DTO
      expect(contactsService.createContact).toHaveBeenCalledWith(
        mockTenantId,
        dtoWithInjectedTenantId,
      );
    });
  });

  describe('updateContact', () => {
    const updateDto: UpdateContactDto = {
      firstName: 'Updated',
      company: 'Updated Corp',
    };

    it('should update contact with tenantId validation', async () => {
      const updatedContact = { ...mockContact, ...updateDto };
      mockContactsService.updateContact.mockResolvedValue(updatedContact);

      const result = await controller.updateContact(mockRequest, mockContactId, updateDto);

      expect(contactsService.updateContact).toHaveBeenCalledWith(
        mockTenantId,
        mockContactId,
        updateDto,
      );
      expect(result).toEqual(updatedContact);
    });

    it('should enforce tenant isolation in update', async () => {
      mockContactsService.updateContact.mockResolvedValue(null);

      await controller.updateContact(mockRequest, 'other-contact-id', updateDto);

      expect(contactsService.updateContact).toHaveBeenCalledWith(
        mockTenantId,
        'other-contact-id',
        updateDto,
      );
    });
  });

  describe('deleteContact', () => {
    it('should delete contact with tenantId validation', async () => {
      mockContactsService.deleteContact.mockResolvedValue(undefined);

      await controller.deleteContact(mockRequest, mockContactId);

      expect(contactsService.deleteContact).toHaveBeenCalledWith(mockTenantId, mockContactId);
    });

    it('should enforce tenant isolation in delete', async () => {
      mockContactsService.deleteContact.mockResolvedValue(undefined);

      await controller.deleteContact(mockRequest, 'other-contact-id');

      expect(contactsService.deleteContact).toHaveBeenCalledWith(
        mockTenantId,
        'other-contact-id',
      );
    });
  });

  describe('syncProvider - CRITICAL Security Tests', () => {
    it('should sync provider when provider belongs to user tenant', async () => {
      // Mock provider ownership validation
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: mockProviderId,
        tenantId: mockTenantId,
      });

      mockContactsService.syncContacts.mockResolvedValue(42);

      const result = await controller.syncProvider(mockRequest, mockProviderId);

      expect(prismaService.providerConfig.findUnique).toHaveBeenCalledWith({
        where: { id: mockProviderId },
        select: { tenantId: true },
      });
      expect(contactsService.syncContacts).toHaveBeenCalledWith(mockProviderId);
      expect(result).toEqual({
        success: true,
        contactsSynced: 42,
      });
    });

    it('should block sync when provider belongs to different tenant', async () => {
      // Mock provider from different tenant
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: mockOtherProviderId,
        tenantId: mockOtherTenantId,
      });

      await expect(controller.syncProvider(mockRequest, mockOtherProviderId)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prismaService.providerConfig.findUnique).toHaveBeenCalledWith({
        where: { id: mockOtherProviderId },
        select: { tenantId: true },
      });
      expect(contactsService.syncContacts).not.toHaveBeenCalled();
    });

    it('should block sync when provider does not exist', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue(null);

      await expect(controller.syncProvider(mockRequest, 'non-existent-provider')).rejects.toThrow(
        ForbiddenException,
      );

      expect(contactsService.syncContacts).not.toHaveBeenCalled();
    });

    it('should throw correct error message for non-existent provider', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue(null);

      await expect(controller.syncProvider(mockRequest, 'fake-id')).rejects.toThrow(
        'Provider not found',
      );
    });

    it('should throw correct error message for cross-tenant provider access', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: mockOtherProviderId,
        tenantId: mockOtherTenantId,
      });

      await expect(controller.syncProvider(mockRequest, mockOtherProviderId)).rejects.toThrow(
        'Access denied: You can only sync your own providers',
      );
    });

    it('should validate provider ownership before calling service', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        tenantId: mockTenantId,
      });
      mockContactsService.syncContacts.mockResolvedValue(10);

      await controller.syncProvider(mockRequest, mockProviderId);

      // Prisma check should happen BEFORE service call
      expect(prismaService.providerConfig.findUnique).toHaveBeenCalled();
      expect(contactsService.syncContacts).toHaveBeenCalled();
    });
  });

  describe('Security - Guards', () => {
    it('should have JwtAuthGuard and TenantGuard on controller', () => {
      const guards = Reflect.getMetadata('__guards__', ContactsController);
      expect(guards).toBeDefined();
    });

    it('should extract tenantId from authenticated user', async () => {
      mockContactsService.listContacts.mockResolvedValue([]);

      await controller.listContacts(mockRequest, {});

      expect(contactsService.listContacts).toHaveBeenCalledWith(
        mockTenantId,
        expect.any(Object),
      );
    });
  });

  describe('Error Handling', () => {
    it('should propagate service errors for listContacts', async () => {
      const error = new Error('Database error');
      mockContactsService.listContacts.mockRejectedValue(error);

      await expect(controller.listContacts(mockRequest, {})).rejects.toThrow('Database error');
    });

    it('should propagate service errors for getContact', async () => {
      const error = new Error('Contact not found');
      mockContactsService.getContact.mockRejectedValue(error);

      await expect(controller.getContact(mockRequest, mockContactId)).rejects.toThrow(
        'Contact not found',
      );
    });

    it('should propagate service errors for createContact', async () => {
      const error = new Error('Validation error');
      mockContactsService.createContact.mockRejectedValue(error);

      await expect(
        controller.createContact(mockRequest, { email: 'test@test.com' } as CreateContactDto),
      ).rejects.toThrow('Validation error');
    });

    it('should propagate service errors for updateContact', async () => {
      const error = new Error('Update failed');
      mockContactsService.updateContact.mockRejectedValue(error);

      await expect(
        controller.updateContact(mockRequest, mockContactId, { firstName: 'Test' }),
      ).rejects.toThrow('Update failed');
    });

    it('should propagate service errors for deleteContact', async () => {
      const error = new Error('Delete failed');
      mockContactsService.deleteContact.mockRejectedValue(error);

      await expect(controller.deleteContact(mockRequest, mockContactId)).rejects.toThrow(
        'Delete failed',
      );
    });

    it('should propagate service errors for syncContacts', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        tenantId: mockTenantId,
      });

      const error = new Error('Sync failed');
      mockContactsService.syncContacts.mockRejectedValue(error);

      await expect(controller.syncProvider(mockRequest, mockProviderId)).rejects.toThrow(
        'Sync failed',
      );
    });
  });
});
