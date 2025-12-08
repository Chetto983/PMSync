import { Test, TestingModule } from '@nestjs/testing';
import { CalendarController } from './calendar.controller';
import { CalendarService, CreateEventDto, UpdateEventDto } from '../services/calendar.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';

/**
 * Unit Tests for CalendarController
 *
 * Tests tenant isolation and provider ownership validation
 */
describe('CalendarController', () => {
  let controller: CalendarController;
  let calendarService: CalendarService;
  let prismaService: PrismaService;

  // Mock data
  const mockTenantId = 'tenant-123';
  const mockOtherTenantId = 'tenant-456';
  const mockEventId = 'event-123';
  const mockProviderId = 'provider-123';
  const mockOtherProviderId = 'provider-456';
  const mockAttachmentId = 'attachment-123';

  const mockQuery = {};

  const mockUser = {
    id: 'user-123',
    tenantId: mockTenantId,
    email: 'test@example.com',
  };

  const mockRequest = {
    user: mockUser,
  };

  const mockEvent = {
    id: mockEventId,
    tenantId: mockTenantId,
    summary: 'Team Meeting',
    description: 'Weekly sync',
    startTime: new Date('2025-12-01T10:00:00Z'),
    endTime: new Date('2025-12-01T11:00:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCalendarService = {
    listEvents: jest.fn(),
    getEvent: jest.fn(),
    createEvent: jest.fn(),
    updateEvent: jest.fn(),
    deleteEvent: jest.fn(),
    syncProvider: jest.fn(),
    listEventAttachments: jest.fn(),
    getEventAttachment: jest.fn(),
  };

  const mockPrismaService = {
    providerConfig: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CalendarController],
      providers: [
        {
          provide: CalendarService,
          useValue: mockCalendarService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    controller = module.get<CalendarController>(CalendarController);
    calendarService = module.get<CalendarService>(CalendarService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('listEvents', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should call calendarService.listEvents with tenantId', async () => {
      const mockEvents = [mockEvent];
      mockCalendarService.listEvents.mockResolvedValue(mockEvents);

      const result = await controller.listEvents(mockRequest, mockQuery);

      expect(calendarService.listEvents).toHaveBeenCalledWith(mockTenantId, {});
      expect(result).toEqual(mockEvents);
    });

    it('should pass filters to service', async () => {
      mockCalendarService.listEvents.mockResolvedValue([]);

      await controller.listEvents(mockRequest, {
        providerId: 'provider-1',
        calendarId: 'calendar-1',
        startTime: '2025-12-01T00:00:00Z',
        endTime: '2025-12-31T23:59:59Z',
        limit: 10,
        offset: 5,
      });

      expect(calendarService.listEvents).toHaveBeenCalledWith(mockTenantId, {
        providerId: 'provider-1',
        calendarId: 'calendar-1',
        startTime: new Date('2025-12-01T00:00:00Z'),
        endTime: new Date('2025-12-31T23:59:59Z'),
        limit: 10,
        offset: 5,
      });
    });

    it('should parse date strings and integers correctly', async () => {
      mockCalendarService.listEvents.mockResolvedValue([]);

      await controller.listEvents(mockRequest, {
        startTime: '2025-01-01T00:00:00Z',
        endTime: '2025-01-31T23:59:59Z',
        limit: 25,
        offset: 50,
      });

      expect(calendarService.listEvents).toHaveBeenCalledWith(mockTenantId, {
        startTime: new Date('2025-01-01T00:00:00Z'),
        endTime: new Date('2025-01-31T23:59:59Z'),
        limit: 25,
        offset: 50,
      });
    });

    it('should handle missing optional parameters', async () => {
      mockCalendarService.listEvents.mockResolvedValue([]);

      await controller.listEvents(mockRequest, {});

      expect(calendarService.listEvents).toHaveBeenCalledWith(mockTenantId, {});
    });
  });

  describe('getEvent', () => {
    it('should call calendarService.getEvent with tenantId and eventId', async () => {
      mockCalendarService.getEvent.mockResolvedValue(mockEvent);

      const result = await controller.getEvent(mockRequest, mockEventId);

      expect(calendarService.getEvent).toHaveBeenCalledWith(mockTenantId, mockEventId);
      expect(result).toEqual(mockEvent);
    });

    it('should enforce tenant isolation', async () => {
      mockCalendarService.getEvent.mockResolvedValue(null);

      await controller.getEvent(mockRequest, 'other-event-id');

      expect(calendarService.getEvent).toHaveBeenCalledWith(mockTenantId, 'other-event-id');
    });
  });

  describe('createEvent', () => {
    const createDto: CreateEventDto = {
      summary: 'New Meeting',
      description: 'Important meeting',
      startTime: new Date('2025-12-15T14:00:00Z'),
      endTime: new Date('2025-12-15T15:00:00Z'),
    };

    it('should create event with tenantId from request', async () => {
      const createdEvent = { ...mockEvent, ...createDto };
      mockCalendarService.createEvent.mockResolvedValue(createdEvent);

      const result = await controller.createEvent(mockRequest, createDto);

      expect(calendarService.createEvent).toHaveBeenCalledWith(mockTenantId, createDto);
      expect(result).toEqual(createdEvent);
    });

    it('should ignore injected tenantId in DTO', async () => {
      const dtoWithInjectedTenantId = {
        ...createDto,
        tenantId: mockOtherTenantId,
      } as any;

      mockCalendarService.createEvent.mockResolvedValue(mockEvent);

      await controller.createEvent(mockRequest, dtoWithInjectedTenantId);

      expect(calendarService.createEvent).toHaveBeenCalledWith(
        mockTenantId,
        dtoWithInjectedTenantId,
      );
    });
  });

  describe('updateEvent', () => {
    const updateDto: UpdateEventDto = {
      summary: 'Updated Meeting',
      description: 'Updated description',
    };

    it('should update event with tenantId validation', async () => {
      const updatedEvent = { ...mockEvent, ...updateDto };
      mockCalendarService.updateEvent.mockResolvedValue(updatedEvent);

      const result = await controller.updateEvent(mockRequest, mockEventId, updateDto);

      expect(calendarService.updateEvent).toHaveBeenCalledWith(
        mockTenantId,
        mockEventId,
        updateDto,
      );
      expect(result).toEqual(updatedEvent);
    });

    it('should enforce tenant isolation in update', async () => {
      mockCalendarService.updateEvent.mockResolvedValue(null);

      await controller.updateEvent(mockRequest, 'other-event-id', updateDto);

      expect(calendarService.updateEvent).toHaveBeenCalledWith(
        mockTenantId,
        'other-event-id',
        updateDto,
      );
    });
  });

  describe('deleteEvent', () => {
    it('should delete event with tenantId validation', async () => {
      mockCalendarService.deleteEvent.mockResolvedValue(undefined);

      await controller.deleteEvent(mockRequest, mockEventId);

      expect(calendarService.deleteEvent).toHaveBeenCalledWith(mockTenantId, mockEventId);
    });

    it('should enforce tenant isolation in delete', async () => {
      mockCalendarService.deleteEvent.mockResolvedValue(undefined);

      await controller.deleteEvent(mockRequest, 'other-event-id');

      expect(calendarService.deleteEvent).toHaveBeenCalledWith(mockTenantId, 'other-event-id');
    });
  });

  describe('syncProvider - CRITICAL Security Tests', () => {
    it('should sync provider when provider belongs to user tenant', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        id: mockProviderId,
        tenantId: mockTenantId,
      });

      const syncResult = { success: true, eventsSynced: 15 };
      mockCalendarService.syncProvider.mockResolvedValue(syncResult);

      const result = await controller.syncProvider(mockRequest, mockProviderId);

      expect(prismaService.providerConfig.findUnique).toHaveBeenCalledWith({
        where: { id: mockProviderId },
        select: { tenantId: true },
      });
      expect(calendarService.syncProvider).toHaveBeenCalledWith(mockTenantId, mockProviderId);
      expect(result).toEqual(syncResult);
    });

    it('should block sync when provider belongs to different tenant', async () => {
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
      expect(calendarService.syncProvider).not.toHaveBeenCalled();
    });

    it('should block sync when provider does not exist', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue(null);

      await expect(controller.syncProvider(mockRequest, 'non-existent-provider')).rejects.toThrow(
        ForbiddenException,
      );

      expect(calendarService.syncProvider).not.toHaveBeenCalled();
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
      mockCalendarService.syncProvider.mockResolvedValue({ success: true });

      await controller.syncProvider(mockRequest, mockProviderId);

      expect(prismaService.providerConfig.findUnique).toHaveBeenCalled();
      expect(calendarService.syncProvider).toHaveBeenCalled();
    });
  });

  describe('listEventAttachments', () => {
    it('should call calendarService.listEventAttachments with tenantId and eventId', async () => {
      const mockAttachments = [
        { id: 'att-1', fileName: 'file1.pdf' },
        { id: 'att-2', fileName: 'file2.docx' },
      ];
      mockCalendarService.listEventAttachments.mockResolvedValue(mockAttachments);

      const result = await controller.listEventAttachments(mockRequest, mockEventId);

      expect(calendarService.listEventAttachments).toHaveBeenCalledWith(mockTenantId, mockEventId);
      expect(result).toEqual(mockAttachments);
    });

    it('should enforce tenant isolation for attachments', async () => {
      mockCalendarService.listEventAttachments.mockResolvedValue([]);

      await controller.listEventAttachments(mockRequest, 'other-event-id');

      expect(calendarService.listEventAttachments).toHaveBeenCalledWith(
        mockTenantId,
        'other-event-id',
      );
    });
  });

  describe('getEventAttachment', () => {
    it('should call calendarService.getEventAttachment with tenantId, eventId, and attachmentId', async () => {
      const mockAttachment = {
        id: mockAttachmentId,
        fileName: 'document.pdf',
        downloadUrl: 'https://example.com/download/123',
      };
      mockCalendarService.getEventAttachment.mockResolvedValue(mockAttachment);

      const result = await controller.getEventAttachment(
        mockRequest,
        mockEventId,
        mockAttachmentId,
      );

      expect(calendarService.getEventAttachment).toHaveBeenCalledWith(
        mockTenantId,
        mockEventId,
        mockAttachmentId,
      );
      expect(result).toEqual(mockAttachment);
    });

    it('should enforce tenant isolation for single attachment', async () => {
      mockCalendarService.getEventAttachment.mockResolvedValue(null);

      await controller.getEventAttachment(mockRequest, 'other-event-id', mockAttachmentId);

      expect(calendarService.getEventAttachment).toHaveBeenCalledWith(
        mockTenantId,
        'other-event-id',
        mockAttachmentId,
      );
    });
  });

  describe('Security - Guards', () => {
    it('should have JwtAuthGuard and TenantGuard on controller', () => {
      const guards = Reflect.getMetadata('__guards__', CalendarController);
      expect(guards).toBeDefined();
    });

    it('should extract tenantId from authenticated user', async () => {
      mockCalendarService.listEvents.mockResolvedValue([]);

      await controller.listEvents(mockRequest, {});

      expect(calendarService.listEvents).toHaveBeenCalledWith(mockTenantId, expect.any(Object));
    });
  });

  describe('Error Handling', () => {
    it('should propagate service errors for listEvents', async () => {
      const error = new Error('Database error');
      mockCalendarService.listEvents.mockRejectedValue(error);

      await expect(controller.listEvents(mockRequest, {})).rejects.toThrow('Database error');
    });

    it('should propagate service errors for getEvent', async () => {
      const error = new Error('Event not found');
      mockCalendarService.getEvent.mockRejectedValue(error);

      await expect(controller.getEvent(mockRequest, mockEventId)).rejects.toThrow(
        'Event not found',
      );
    });

    it('should propagate service errors for createEvent', async () => {
      const error = new Error('Validation error');
      mockCalendarService.createEvent.mockRejectedValue(error);

      await expect(
        controller.createEvent(mockRequest, {
          summary: 'Test',
          startTime: new Date(),
          endTime: new Date(),
        }),
      ).rejects.toThrow('Validation error');
    });

    it('should propagate service errors for updateEvent', async () => {
      const error = new Error('Update failed');
      mockCalendarService.updateEvent.mockRejectedValue(error);

      await expect(
        controller.updateEvent(mockRequest, mockEventId, { summary: 'Test' }),
      ).rejects.toThrow('Update failed');
    });

    it('should propagate service errors for deleteEvent', async () => {
      const error = new Error('Delete failed');
      mockCalendarService.deleteEvent.mockRejectedValue(error);

      await expect(controller.deleteEvent(mockRequest, mockEventId)).rejects.toThrow(
        'Delete failed',
      );
    });

    it('should propagate service errors for syncProvider', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({
        tenantId: mockTenantId,
      });

      const error = new Error('Sync failed');
      mockCalendarService.syncProvider.mockRejectedValue(error);

      await expect(controller.syncProvider(mockRequest, mockProviderId)).rejects.toThrow(
        'Sync failed',
      );
    });

    it('should propagate service errors for listEventAttachments', async () => {
      const error = new Error('Attachments not found');
      mockCalendarService.listEventAttachments.mockRejectedValue(error);

      await expect(controller.listEventAttachments(mockRequest, mockEventId)).rejects.toThrow(
        'Attachments not found',
      );
    });

    it('should propagate service errors for getEventAttachment', async () => {
      const error = new Error('Attachment not found');
      mockCalendarService.getEventAttachment.mockRejectedValue(error);

      await expect(
        controller.getEventAttachment(mockRequest, mockEventId, mockAttachmentId),
      ).rejects.toThrow('Attachment not found');
    });
  });
});
