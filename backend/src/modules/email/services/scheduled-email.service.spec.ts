import { Test, TestingModule } from '@nestjs/testing';
import { ScheduledEmailService } from './scheduled-email.service';
import { EmailSendService } from './email-send.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('ScheduledEmailService', () => {
  let service: ScheduledEmailService;

  const mockPrismaService = {
    scheduledEmail: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockEmailSendService = {
    sendEmail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduledEmailService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: EmailSendService,
          useValue: mockEmailSendService,
        },
      ],
    }).compile();

    service = module.get<ScheduledEmailService>(ScheduledEmailService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('scheduleEmail', () => {
    const mockScheduleData = {
      tenantId: 'tenant-1',
      providerId: 'provider-1',
      to: ['test@example.com'],
      cc: ['cc@example.com'],
      bcc: [],
      subject: 'Test Subject',
      bodyHtml: '<p>Test body</p>',
      bodyText: 'Test body',
      scheduledAt: new Date(Date.now() + 3600000), // 1 hour from now
    };

    it('should schedule an email successfully', async () => {
      const mockCreated = {
        id: 'scheduled-1',
        ...mockScheduleData,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.scheduledEmail.create.mockResolvedValue(mockCreated);

      const result = await service.scheduleEmail(mockScheduleData);

      expect(result).toEqual({
        id: 'scheduled-1',
        scheduledAt: mockScheduleData.scheduledAt,
      });

      expect(mockPrismaService.scheduledEmail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          providerId: 'provider-1',
          to: ['test@example.com'],
          subject: 'Test Subject',
          status: 'pending',
        }),
      });
    });

    it('should store attachments as JSON', async () => {
      const dataWithAttachments = {
        ...mockScheduleData,
        attachments: [
          {
            filename: 'test.pdf',
            content: Buffer.from('test content'),
            contentType: 'application/pdf',
          },
        ],
      };

      const mockCreated = {
        id: 'scheduled-2',
        ...dataWithAttachments,
        attachments: JSON.stringify([{
          filename: 'test.pdf',
          contentType: 'application/pdf',
          contentBase64: Buffer.from('test content').toString('base64'),
        }]),
        status: 'pending',
      };

      mockPrismaService.scheduledEmail.create.mockResolvedValue(mockCreated);

      await service.scheduleEmail(dataWithAttachments);

      expect(mockPrismaService.scheduledEmail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          attachments: expect.any(String),
        }),
      });
    });
  });

  describe('cancelScheduledEmail', () => {
    it('should cancel a pending scheduled email', async () => {
      mockPrismaService.scheduledEmail.findFirst.mockResolvedValue({
        id: 'scheduled-1',
        status: 'pending',
      });
      mockPrismaService.scheduledEmail.delete.mockResolvedValue({});

      const result = await service.cancelScheduledEmail('scheduled-1', 'tenant-1');

      expect(result).toBe(true);
      expect(mockPrismaService.scheduledEmail.delete).toHaveBeenCalledWith({
        where: { id: 'scheduled-1' },
      });
    });

    it('should return false if email not found', async () => {
      mockPrismaService.scheduledEmail.findFirst.mockResolvedValue(null);

      const result = await service.cancelScheduledEmail('not-found', 'tenant-1');

      expect(result).toBe(false);
      expect(mockPrismaService.scheduledEmail.delete).not.toHaveBeenCalled();
    });
  });

  describe('getScheduledEmails', () => {
    it('should return scheduled emails for a tenant', async () => {
      const mockEmails = [
        {
          id: 'scheduled-1',
          to: ['test@example.com'],
          subject: 'Test 1',
          scheduledAt: new Date(),
          status: 'pending',
        },
        {
          id: 'scheduled-2',
          to: ['test2@example.com'],
          subject: 'Test 2',
          scheduledAt: new Date(),
          status: 'sent',
        },
      ];

      mockPrismaService.scheduledEmail.findMany.mockResolvedValue(mockEmails);

      const result = await service.getScheduledEmails('tenant-1');

      expect(result).toEqual(mockEmails);
      expect(mockPrismaService.scheduledEmail.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        select: {
          id: true,
          to: true,
          subject: true,
          scheduledAt: true,
          status: true,
        },
        orderBy: { scheduledAt: 'asc' },
      });
    });
  });

  describe('processScheduledEmails', () => {
    it('should not process when already processing', async () => {
      // Set isProcessing to true via reflection
      (service as any).isProcessing = true;

      await service.processScheduledEmails();

      expect(mockPrismaService.scheduledEmail.findMany).not.toHaveBeenCalled();

      // Reset
      (service as any).isProcessing = false;
    });

    it('should process pending emails that are due', async () => {
      const mockScheduled = {
        id: 'scheduled-1',
        tenantId: 'tenant-1',
        providerId: 'provider-1',
        to: ['test@example.com'],
        cc: [],
        bcc: [],
        subject: 'Test Subject',
        bodyHtml: '<p>Test</p>',
        bodyText: 'Test',
        inReplyTo: null,
        references: null,
        attachments: null,
        retryCount: 0,
      };

      mockPrismaService.scheduledEmail.findMany.mockResolvedValue([mockScheduled]);
      mockPrismaService.scheduledEmail.update.mockResolvedValue({});
      mockEmailSendService.sendEmail.mockResolvedValue({ success: true, messageId: 'msg-1' });

      await service.processScheduledEmails();

      // Should mark as processing first
      expect(mockPrismaService.scheduledEmail.update).toHaveBeenCalledWith({
        where: { id: 'scheduled-1' },
        data: { status: 'processing' },
      });

      // Should send the email
      expect(mockEmailSendService.sendEmail).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        providerId: 'provider-1',
        to: ['test@example.com'],
        cc: undefined,
        bcc: undefined,
        subject: 'Test Subject',
        bodyHtml: '<p>Test</p>',
        bodyText: 'Test',
        inReplyTo: undefined,
        references: undefined,
        attachments: undefined,
      });

      // Should mark as sent
      expect(mockPrismaService.scheduledEmail.update).toHaveBeenCalledWith({
        where: { id: 'scheduled-1' },
        data: {
          status: 'sent',
          sentAt: expect.any(Date),
        },
      });
    });

    it('should handle send failure and retry', async () => {
      const mockScheduled = {
        id: 'scheduled-1',
        tenantId: 'tenant-1',
        providerId: 'provider-1',
        to: ['test@example.com'],
        cc: [],
        bcc: [],
        subject: 'Test Subject',
        bodyHtml: '<p>Test</p>',
        bodyText: 'Test',
        inReplyTo: null,
        references: null,
        attachments: null,
        retryCount: 0,
      };

      mockPrismaService.scheduledEmail.findMany.mockResolvedValue([mockScheduled]);
      mockPrismaService.scheduledEmail.update.mockResolvedValue({});
      mockEmailSendService.sendEmail.mockRejectedValue(new Error('Send failed'));

      await service.processScheduledEmails();

      // Should update with error and increment retry
      expect(mockPrismaService.scheduledEmail.update).toHaveBeenLastCalledWith({
        where: { id: 'scheduled-1' },
        data: {
          status: 'pending', // Still pending since retryCount < 3
          errorMessage: 'Send failed',
          retryCount: 1,
        },
      });
    });

    it('should mark as failed after max retries', async () => {
      const mockScheduled = {
        id: 'scheduled-1',
        tenantId: 'tenant-1',
        providerId: 'provider-1',
        to: ['test@example.com'],
        cc: [],
        bcc: [],
        subject: 'Test Subject',
        bodyHtml: '<p>Test</p>',
        bodyText: 'Test',
        inReplyTo: null,
        references: null,
        attachments: null,
        retryCount: 2, // Already 2 retries, this is the 3rd attempt
      };

      mockPrismaService.scheduledEmail.findMany.mockResolvedValue([mockScheduled]);
      mockPrismaService.scheduledEmail.update.mockResolvedValue({});
      mockEmailSendService.sendEmail.mockRejectedValue(new Error('Send failed'));

      await service.processScheduledEmails();

      // Should mark as failed
      expect(mockPrismaService.scheduledEmail.update).toHaveBeenLastCalledWith({
        where: { id: 'scheduled-1' },
        data: {
          status: 'failed',
          errorMessage: 'Send failed',
          retryCount: 3,
        },
      });
    });

    it('should process attachments from JSON', async () => {
      const attachmentsJson = JSON.stringify([{
        filename: 'test.pdf',
        contentType: 'application/pdf',
        contentBase64: Buffer.from('test content').toString('base64'),
      }]);

      const mockScheduled = {
        id: 'scheduled-1',
        tenantId: 'tenant-1',
        providerId: 'provider-1',
        to: ['test@example.com'],
        cc: [],
        bcc: [],
        subject: 'Test Subject',
        bodyHtml: '<p>Test</p>',
        bodyText: 'Test',
        inReplyTo: null,
        references: null,
        attachments: attachmentsJson,
        retryCount: 0,
      };

      mockPrismaService.scheduledEmail.findMany.mockResolvedValue([mockScheduled]);
      mockPrismaService.scheduledEmail.update.mockResolvedValue({});
      mockEmailSendService.sendEmail.mockResolvedValue({ success: true, messageId: 'msg-1' });

      await service.processScheduledEmails();

      expect(mockEmailSendService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            expect.objectContaining({
              filename: 'test.pdf',
              contentType: 'application/pdf',
              content: expect.any(Buffer),
            }),
          ],
        }),
      );
    });
  });

  describe('cleanupOldScheduledEmails', () => {
    it('should delete old sent and failed emails', async () => {
      mockPrismaService.scheduledEmail.deleteMany.mockResolvedValue({ count: 5 });

      await service.cleanupOldScheduledEmails();

      expect(mockPrismaService.scheduledEmail.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { status: 'sent', sentAt: { lt: expect.any(Date) } },
            { status: 'failed', updatedAt: { lt: expect.any(Date) } },
          ],
        },
      });
    });
  });
});