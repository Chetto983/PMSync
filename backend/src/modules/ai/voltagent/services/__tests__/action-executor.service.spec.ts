import { Test, TestingModule } from '@nestjs/testing';
import { ActionExecutorService, ActionExecutionResult } from '../action-executor.service';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { EmailSendService } from '../../../../email/services/email-send.service';
import { EmailSyncBackService } from '../../../../email/services/email-sync-back.service';
import { CalendarService } from '../../../../calendar/services/calendar.service';
import { FolderSyncService } from '../../../../email-sync/services/folder-sync.service';
import { BulkOperationsQueueService } from '../../../../email-sync/services/bulk-operations-queue.service';
import { CacheService } from '../../../../../common/services/cache.service';
import { PiiResolutionService } from '../../../guards';
import { AgentAction, AgentActionType } from '../../interfaces/agent-action.interface';
import { AgentContext } from '../../interfaces/agent-context.interface';

// Default provider for resolveProviderId queries
const defaultProvider = { id: 'provider-123', tenantId: 'tenant-123', isActive: true };

// Mock services
const mockPrismaService = {
  providerConfig: {
    findFirst: jest.fn().mockResolvedValue(defaultProvider),
  },
  email: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  contact: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  calendarEvent: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockEmailSendService = {
  sendEmail: jest.fn(),
};

const mockEmailSyncBackService = {
  deleteEmail: jest.fn(),
  archiveEmail: jest.fn(),
  updateFlags: jest.fn(),
  syncOperationToProvider: jest.fn().mockResolvedValue({ success: true }),
};

const mockCalendarService = {
  createEvent: jest.fn(),
  updateEvent: jest.fn(),
  deleteEvent: jest.fn(),
  getEvents: jest.fn(),
  checkAvailability: jest.fn(),
};

const mockFolderSyncService = {
  createFolder: jest.fn(),
  renameFolder: jest.fn(),
  deleteFolder: jest.fn(),
};

const mockBulkOperationsQueue = {
  enqueueBulkOperation: jest.fn(),
};

const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
};

const mockPiiResolutionService = {
  resolvePayload: jest.fn((_, __, payload) => Promise.resolve(payload)),
};

describe('ActionExecutorService', () => {
  let service: ActionExecutorService;
  let emailSendService: typeof mockEmailSendService;
  let emailSyncBackService: typeof mockEmailSyncBackService;
  let calendarService: typeof mockCalendarService;
  let folderSyncService: typeof mockFolderSyncService;
  let bulkOperationsQueue: typeof mockBulkOperationsQueue;

  // Test context and action helpers
  const createContext = (overrides?: Partial<AgentContext>): AgentContext => ({
    tenantId: 'tenant-123',
    userId: 'user-456',
    sessionId: 'session-789',
    correlationId: 'corr-abc',
    locale: 'en',
    ...overrides,
  });

  const createAction = <T extends AgentActionType>(
    type: T,
    payload: Record<string, unknown>,
    overrides?: Partial<AgentAction>,
  ): AgentAction => ({
    type,
    payload,
    reasoning: 'Test action',
    confidence: 0.9,
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionExecutorService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailSendService, useValue: mockEmailSendService },
        { provide: EmailSyncBackService, useValue: mockEmailSyncBackService },
        { provide: CalendarService, useValue: mockCalendarService },
        { provide: FolderSyncService, useValue: mockFolderSyncService },
        { provide: BulkOperationsQueueService, useValue: mockBulkOperationsQueue },
        { provide: CacheService, useValue: mockCacheService },
        { provide: PiiResolutionService, useValue: mockPiiResolutionService },
      ],
    }).compile();

    service = module.get<ActionExecutorService>(ActionExecutorService);
    emailSendService = module.get(EmailSendService);
    emailSyncBackService = module.get(EmailSyncBackService);
    calendarService = module.get(CalendarService);
    folderSyncService = module.get(FolderSyncService);
    bulkOperationsQueue = module.get(BulkOperationsQueueService);
  });

  describe('Email Actions', () => {
    const mockEmail = {
      id: 'email-123',
      subject: 'Test Subject',
      from: 'sender@example.com',
      externalId: 'ext-123',
      providerId: 'provider-123',
      folder: 'INBOX',
      labels: [],
    };

    it('should dispatch SEND_EMAIL to EmailExecutor', async () => {
      const action = createAction(AgentActionType.SEND_EMAIL, {
        to: ['test@example.com'],
        subject: 'Test Email',
        body: 'Test body',
      });
      const context = createContext();

      mockEmailSendService.sendEmail.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
      });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(emailSendService.sendEmail).toHaveBeenCalled();
    });

    it('should dispatch ARCHIVE_EMAIL to EmailExecutor', async () => {
      const action = createAction(AgentActionType.ARCHIVE_EMAIL, {
        emailId: 'email-123',
      });
      const context = createContext();

      mockPrismaService.email.findFirst.mockResolvedValue(mockEmail);
      mockPrismaService.email.update.mockResolvedValue({ ...mockEmail, folder: 'ARCHIVE' });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
    });

    it('should dispatch DELETE_EMAIL to EmailExecutor', async () => {
      const action = createAction(AgentActionType.DELETE_EMAIL, {
        emailId: 'email-123',
      });
      const context = createContext();

      mockPrismaService.email.findFirst.mockResolvedValue(mockEmail);
      mockPrismaService.email.update.mockResolvedValue({ ...mockEmail, isDeleted: true, folder: 'TRASH' });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
    });

    it('should dispatch MARK_READ to EmailExecutor', async () => {
      const action = createAction(AgentActionType.MARK_READ, {
        emailId: 'email-123',
      });
      const context = createContext();

      mockPrismaService.email.findFirst.mockResolvedValue(mockEmail);
      mockPrismaService.email.update.mockResolvedValue({ ...mockEmail, isRead: true });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
    });
  });

  describe('Calendar Actions', () => {
    const mockEvent = { id: 'event-123', externalId: 'ext-event-123', title: 'Test Meeting' };

    it('should dispatch CREATE_EVENT to CalendarExecutor', async () => {
      const action = createAction(AgentActionType.CREATE_EVENT, {
        title: 'Test Meeting',
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T11:00:00Z',
      });
      const context = createContext();

      mockCalendarService.createEvent.mockResolvedValue(mockEvent);

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(calendarService.createEvent).toHaveBeenCalled();
    });

    it('should dispatch UPDATE_EVENT to CalendarExecutor', async () => {
      const action = createAction(AgentActionType.UPDATE_EVENT, {
        eventId: 'event-123',
        title: 'Updated Meeting',
      });
      const context = createContext();

      mockCalendarService.updateEvent.mockResolvedValue({ ...mockEvent, title: 'Updated Meeting' });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(calendarService.updateEvent).toHaveBeenCalled();
    });

    it('should dispatch DELETE_EVENT to CalendarExecutor', async () => {
      const action = createAction(AgentActionType.DELETE_EVENT, {
        eventId: 'event-123',
      });
      const context = createContext();

      mockPrismaService.calendarEvent.findFirst.mockResolvedValue(mockEvent);
      mockCalendarService.deleteEvent.mockResolvedValue(undefined);

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(calendarService.deleteEvent).toHaveBeenCalled();
    });

    it('should dispatch CHECK_AVAILABILITY to CalendarExecutor', async () => {
      const action = createAction(AgentActionType.CHECK_AVAILABILITY, {
        startDate: '2026-03-01T10:00:00Z',
        endDate: '2026-03-01T11:00:00Z',
      });
      const context = createContext();

      // CalendarExecutor.executeCheckAvailability uses prisma.calendarEvent.findMany directly
      mockPrismaService.calendarEvent.findMany.mockResolvedValue([]);

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(mockPrismaService.calendarEvent.findMany).toHaveBeenCalled();
    });
  });

  describe('Contact Actions', () => {
    const mockContact = { id: 'contact-123', displayName: 'John Doe', tenantId: 'tenant-123' };

    it('should dispatch CREATE_CONTACT to ContactExecutor', async () => {
      const action = createAction(AgentActionType.CREATE_CONTACT, {
        name: 'John Doe',
        email: 'john@example.com',
      });
      const context = createContext();

      mockPrismaService.contact.create.mockResolvedValue(mockContact);

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
    });

    it('should dispatch UPDATE_CONTACT to ContactExecutor', async () => {
      const action = createAction(AgentActionType.UPDATE_CONTACT, {
        contactId: 'contact-123',
        name: 'Jane Doe',
      });
      const context = createContext();

      mockPrismaService.contact.findFirst.mockResolvedValue(mockContact);
      mockPrismaService.contact.update.mockResolvedValue({ ...mockContact, displayName: 'Jane Doe' });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
    });

    it('should dispatch DELETE_CONTACT to ContactExecutor', async () => {
      const action = createAction(AgentActionType.DELETE_CONTACT, {
        contactId: 'contact-123',
      });
      const context = createContext();

      mockPrismaService.contact.findFirst.mockResolvedValue(mockContact);
      mockPrismaService.contact.delete.mockResolvedValue(mockContact);

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
    });
  });

  describe('Folder Actions', () => {
    it('should dispatch CREATE_FOLDER to FolderExecutor', async () => {
      const action = createAction(AgentActionType.CREATE_FOLDER, {
        name: 'Important',
      });
      const context = createContext();

      mockFolderSyncService.createFolder.mockResolvedValue({
        id: 'folder-123',
        name: 'Important',
      });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(folderSyncService.createFolder).toHaveBeenCalled();
    });

    it('should dispatch RENAME_FOLDER to FolderExecutor', async () => {
      const action = createAction(AgentActionType.RENAME_FOLDER, {
        folderPath: 'Important',
        newName: 'Very Important',
      });
      const context = createContext();

      mockFolderSyncService.renameFolder.mockResolvedValue({
        id: 'folder-123',
        name: 'Very Important',
        path: 'Very Important',
      });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(folderSyncService.renameFolder).toHaveBeenCalled();
    });

    it('should dispatch DELETE_FOLDER to FolderExecutor', async () => {
      const action = createAction(AgentActionType.DELETE_FOLDER, {
        folderPath: 'Important',
      });
      const context = createContext();

      mockFolderSyncService.deleteFolder.mockResolvedValue(undefined);

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(folderSyncService.deleteFolder).toHaveBeenCalled();
    });
  });

  describe('Bulk Email Actions', () => {
    beforeEach(() => {
      // BulkEmailExecutor looks up provider from first email
      mockPrismaService.email.findFirst.mockResolvedValue({ providerId: 'provider-123' });
      // And gets provider type
      mockPrismaService.providerConfig.findFirst.mockResolvedValue({
        ...defaultProvider,
        providerType: 'GOOGLE',
      });
    });

    it('should dispatch BULK_DELETE_EMAILS to BulkEmailExecutor', async () => {
      const action = createAction(AgentActionType.BULK_DELETE_EMAILS, {
        emailIds: ['email-1', 'email-2', 'email-3'],
      });
      const context = createContext();

      mockBulkOperationsQueue.enqueueBulkOperation.mockResolvedValue('job-123');

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(bulkOperationsQueue.enqueueBulkOperation).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'delete' }),
      );
    });

    it('should dispatch BULK_ARCHIVE_EMAILS to BulkEmailExecutor', async () => {
      const action = createAction(AgentActionType.BULK_ARCHIVE_EMAILS, {
        emailIds: ['email-1', 'email-2'],
      });
      const context = createContext();

      mockBulkOperationsQueue.enqueueBulkOperation.mockResolvedValue('job-456');

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(bulkOperationsQueue.enqueueBulkOperation).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'archive' }),
      );
    });

    it('should dispatch BULK_MARK_READ to BulkEmailExecutor', async () => {
      const action = createAction(AgentActionType.BULK_MARK_READ, {
        emailIds: ['email-1', 'email-2'],
      });
      const context = createContext();

      mockBulkOperationsQueue.enqueueBulkOperation.mockResolvedValue('job-789');

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(bulkOperationsQueue.enqueueBulkOperation).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'mark-read' }),
      );
    });
  });

  describe('Unknown Action Type Handling', () => {
    it('should return error result for unknown action type without throwing', async () => {
      const action = createAction('UNKNOWN_ACTION' as AgentActionType, {});
      const context = createContext();

      const result = await service.execute(action, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown action type');
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Executor Failure Handling', () => {
    it('should catch and return error result when executor throws', async () => {
      const action = createAction(AgentActionType.SEND_EMAIL, {
        to: ['test@example.com'],
        subject: 'Test',
        body: 'Test',
      });
      const context = createContext();

      // Mock provider resolution to succeed
      mockPrismaService.providerConfig.findFirst.mockResolvedValue(defaultProvider);
      // Mock sendEmail to fail
      const expectedError = new Error('Email service unavailable');
      mockEmailSendService.sendEmail.mockRejectedValue(expectedError);

      const result = await service.execute(action, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe(expectedError.message);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle non-Error exceptions gracefully', async () => {
      const action = createAction(AgentActionType.CREATE_EVENT, {
        title: 'Test',
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T11:00:00Z',
      });
      const context = createContext();

      // Mock provider resolution to succeed
      mockPrismaService.providerConfig.findFirst.mockResolvedValue(defaultProvider);
      mockCalendarService.createEvent.mockRejectedValue('String error');

      const result = await service.execute(action, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('String error');
    });
  });

  describe('Result Format Validation', () => {
    it('should return ActionExecutionResult with required fields on success', async () => {
      const action = createAction(AgentActionType.CREATE_FOLDER, {
        name: 'Test Folder',
      });
      const context = createContext();

      mockFolderSyncService.createFolder.mockResolvedValue({
        id: 'folder-123',
        name: 'Test Folder',
      });

      const result = await service.execute(action, context);

      // Verify interface compliance
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('executionTimeMs');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.executionTimeMs).toBe('number');
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return ActionExecutionResult with required fields on error', async () => {
      const action = createAction(AgentActionType.DELETE_EVENT, {
        eventId: 'nonexistent',
      });
      const context = createContext();

      mockPrismaService.calendarEvent.findFirst.mockResolvedValue(null);
      mockCalendarService.deleteEvent.mockRejectedValue(
        new Error('Event not found'),
      );

      const result = await service.execute(action, context);

      // Verify interface compliance
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('executionTimeMs');
      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
      expect(typeof result.executionTimeMs).toBe('number');
    });

    it('should include optional data and summary fields when available', async () => {
      const action = createAction(AgentActionType.SEND_EMAIL, {
        to: ['test@example.com'],
        subject: 'Test',
        body: 'Test body',
      });
      const context = createContext();

      mockEmailSendService.sendEmail.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
      });

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      // Data or summary may be present
      if (result.data) {
        expect(typeof result.data).toBe('object');
      }
      if (result.summary) {
        expect(typeof result.summary === 'string' || Array.isArray(result.summary)).toBe(true);
      }
    });
  });

  describe('Idempotency Support', () => {
    it('should skip execution if idempotency key already exists', async () => {
      const action = createAction(AgentActionType.SEND_EMAIL, {
        to: ['test@example.com'],
        subject: 'Test',
        body: 'Test',
      }, {
        idempotencyKey: 'unique-key-123',
      });
      const context = createContext();

      const cachedResult: ActionExecutionResult = {
        success: true,
        summary: 'Email already sent',
        executionTimeMs: 100,
      };

      mockCacheService.get.mockResolvedValue(cachedResult);

      const result = await service.execute(action, context);

      expect(result).toEqual(cachedResult);
      expect(emailSendService.sendEmail).not.toHaveBeenCalled();
    });

    it('should store result with idempotency key on success', async () => {
      const action = createAction(AgentActionType.CREATE_FOLDER, {
        name: 'Test',
      }, {
        idempotencyKey: 'folder-create-123',
      });
      const context = createContext();

      mockFolderSyncService.createFolder.mockResolvedValue({
        id: 'folder-123',
        name: 'Test',
      });
      mockCacheService.get.mockResolvedValue(null);

      const result = await service.execute(action, context);

      expect(result.success).toBe(true);
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'folder-create-123',
        expect.objectContaining({
          success: true,
          executionTimeMs: expect.any(Number),
        }),
        expect.any(Object),
      );
    });
  });
});
