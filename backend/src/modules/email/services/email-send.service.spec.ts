import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmailSendService, SendEmailDto } from './email-send.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { AttachmentStorageService } from './attachment.storage';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { EmailSendQueueService } from '../../email-sync/services/email-send-queue.service';
import { ProviderFactory } from '../../providers/factory/provider.factory';

// Mock the ProviderFactory
jest.mock('../../providers/factory/provider.factory', () => ({
  ProviderFactory: {
    create: jest.fn(),
  },
}));

describe('EmailSendService', () => {
  let service: EmailSendService;
  let prismaService: jest.Mocked<PrismaService>;
  let attachmentStorage: jest.Mocked<AttachmentStorageService>;
  let providerTokenService: jest.Mocked<ProviderTokenService>;

  const mockProvider = {
    id: 'provider-1',
    tenantId: 'tenant-1',
    providerType: 'google',
    email: 'user@example.com',
    isActive: true,
    supportsEmail: true,
    accessToken: 'encrypted-token',
  };

  const mockProviderFactory = ProviderFactory as jest.Mocked<typeof ProviderFactory>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailSendService,
        {
          provide: PrismaService,
          useValue: {
            providerConfig: {
              findFirst: jest.fn(),
            },
            email: {
              create: jest.fn(),
              findFirst: jest.fn(),
            },
            scheduledEmail: {
              create: jest.fn(),
            },
            folder: {
              findFirst: jest.fn().mockResolvedValue({ path: 'SENT', name: 'Sent' }),
            },
          },
        },
        {
          provide: CryptoService,
          useValue: {
            decrypt: jest.fn(),
          },
        },
        {
          provide: AttachmentStorageService,
          useValue: {
            uploadAttachment: jest.fn(),
          },
        },
        {
          provide: ProviderTokenService,
          useValue: {
            getProviderWithToken: jest.fn(),
          },
        },
        {
          provide: EmailSendQueueService,
          useValue: {
            enqueueSend: jest.fn().mockResolvedValue('job-123'),
            getJobStatus: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<EmailSendService>(EmailSendService);
    prismaService = module.get(PrismaService);
    attachmentStorage = module.get(AttachmentStorageService);
    providerTokenService = module.get(ProviderTokenService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('sendEmail', () => {
    const baseEmailDto: SendEmailDto = {
      tenantId: 'tenant-1',
      providerId: 'provider-1',
      to: ['recipient@example.com'],
      subject: 'Test Subject',
      bodyHtml: '<p>Test HTML</p>',
      bodyText: 'Test Text',
    };

    it('should send an email successfully', async () => {
      const mockEmailProvider = {
        sendEmail: jest.fn().mockResolvedValue({ id: 'message-123' }),
      };

      prismaService.providerConfig.findFirst = jest.fn().mockResolvedValue(mockProvider);
      providerTokenService.getProviderWithToken = jest.fn().mockResolvedValue({
        accessToken: 'decrypted-token',
      });
      mockProviderFactory.create.mockReturnValue(mockEmailProvider as any);
      prismaService.email.create = jest.fn().mockResolvedValue({ id: 'email-1' });

      const result = await service.sendEmail(baseEmailDto);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('message-123');
      expect(prismaService.providerConfig.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'provider-1',
          tenantId: 'tenant-1',
          isActive: true,
          supportsEmail: true,
        },
      });
      expect(mockProviderFactory.create).toHaveBeenCalledWith(
        'google',
        expect.objectContaining({
          userId: 'tenant-1',
          providerId: 'provider-1',
        }),
      );
    });

    it('should throw NotFoundException when provider is not found', async () => {
      prismaService.providerConfig.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.sendEmail(baseEmailDto)).rejects.toThrow(NotFoundException);
      await expect(service.sendEmail(baseEmailDto)).rejects.toThrow(
        'Provider not found or inactive',
      );
    });

    it('should handle cc and bcc recipients', async () => {
      const emailWithCcBcc: SendEmailDto = {
        ...baseEmailDto,
        cc: ['cc@example.com'],
        bcc: ['bcc@example.com'],
      };

      const mockEmailProvider = {
        sendEmail: jest.fn().mockResolvedValue({ id: 'message-456' }),
      };

      prismaService.providerConfig.findFirst = jest.fn().mockResolvedValue(mockProvider);
      providerTokenService.getProviderWithToken = jest.fn().mockResolvedValue({
        accessToken: 'decrypted-token',
      });
      mockProviderFactory.create.mockReturnValue(mockEmailProvider as any);
      prismaService.email.create = jest.fn().mockResolvedValue({ id: 'email-2' });

      await service.sendEmail(emailWithCcBcc);

      expect(mockEmailProvider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: [{ email: 'recipient@example.com' }],
          cc: [{ email: 'cc@example.com' }],
          bcc: [{ email: 'bcc@example.com' }],
        }),
      );
    });

    it('should handle attachments correctly', async () => {
      const emailWithAttachments: SendEmailDto = {
        ...baseEmailDto,
        attachments: [
          {
            filename: 'test.pdf',
            content: Buffer.from('PDF content'),
            contentType: 'application/pdf',
          },
        ],
      };

      const mockUploadedAttachment = {
        storageType: 's3' as const,
        storagePath: 's3://bucket/test.pdf',
        contentHash: 'abc123',
        dedupHit: false,
        size: 1000,
        mimeType: 'application/pdf',
        filename: 'test.pdf',
      };

      const mockEmailProvider = {
        sendEmail: jest.fn().mockResolvedValue({ id: 'message-789' }),
      };

      prismaService.providerConfig.findFirst = jest.fn().mockResolvedValue(mockProvider);
      providerTokenService.getProviderWithToken = jest.fn().mockResolvedValue({
        accessToken: 'decrypted-token',
      });
      attachmentStorage.uploadAttachment = jest.fn().mockResolvedValue(mockUploadedAttachment);
      mockProviderFactory.create.mockReturnValue(mockEmailProvider as any);
      prismaService.email.create = jest.fn().mockResolvedValue({ id: 'email-3' });

      await service.sendEmail(emailWithAttachments);

      expect(attachmentStorage.uploadAttachment).toHaveBeenCalledWith(
        'tenant-1',
        'provider-1',
        expect.objectContaining({
          filename: 'test.pdf',
          contentType: 'application/pdf',
        }),
      );
    });

    it('should handle in-reply-to and references headers', async () => {
      const replyEmail: SendEmailDto = {
        ...baseEmailDto,
        inReplyTo: '<original@example.com>',
        references: '<ref1@example.com> <ref2@example.com>',
      };

      const mockEmailProvider = {
        sendEmail: jest.fn().mockResolvedValue({ id: 'message-reply' }),
      };

      prismaService.providerConfig.findFirst = jest.fn().mockResolvedValue(mockProvider);
      providerTokenService.getProviderWithToken = jest.fn().mockResolvedValue({
        accessToken: 'decrypted-token',
      });
      mockProviderFactory.create.mockReturnValue(mockEmailProvider as any);
      prismaService.email.create = jest.fn().mockResolvedValue({ id: 'email-4' });

      await service.sendEmail(replyEmail);

      expect(mockEmailProvider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          inReplyTo: '<original@example.com>',
          references: '<ref1@example.com> <ref2@example.com>',
        }),
      );
    });

    it('should save sent email to database', async () => {
      const mockEmailProvider = {
        sendEmail: jest.fn().mockResolvedValue({ id: 'message-saved' }),
      };

      prismaService.providerConfig.findFirst = jest.fn().mockResolvedValue(mockProvider);
      providerTokenService.getProviderWithToken = jest.fn().mockResolvedValue({
        accessToken: 'decrypted-token',
      });
      mockProviderFactory.create.mockReturnValue(mockEmailProvider as any);
      prismaService.email.create = jest.fn().mockResolvedValue({ id: 'email-5' });

      await service.sendEmail(baseEmailDto);

      expect(prismaService.email.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          providerId: 'provider-1',
          subject: 'Test Subject',
          bodyHtml: '<p>Test HTML</p>',
          bodyText: 'Test Text',
          folder: 'SENT',
          isRead: true,
        }),
      });
    });

    it('should throw BadRequestException when provider send fails', async () => {
      const mockEmailProvider = {
        sendEmail: jest.fn().mockRejectedValue(new Error('Provider API error')),
      };

      prismaService.providerConfig.findFirst = jest.fn().mockResolvedValue(mockProvider);
      providerTokenService.getProviderWithToken = jest.fn().mockResolvedValue({
        accessToken: 'decrypted-token',
      });
      mockProviderFactory.create.mockReturnValue(mockEmailProvider as any);

      await expect(service.sendEmail(baseEmailDto)).rejects.toThrow(BadRequestException);
      await expect(service.sendEmail(baseEmailDto)).rejects.toThrow(
        'Failed to send email: Provider API error',
      );
    });
  });

  describe('scheduleEmail', () => {
    const futureDate = new Date(Date.now() + 3600000); // 1 hour from now

    const scheduleDto: SendEmailDto = {
      tenantId: 'tenant-1',
      providerId: 'provider-1',
      to: ['recipient@example.com'],
      subject: 'Scheduled Email',
      bodyHtml: '<p>Scheduled content</p>',
      bodyText: 'Scheduled content',
      scheduledAt: futureDate.toISOString(),
    };

    it('should schedule an email for future delivery', async () => {
      const mockScheduled = {
        id: 'scheduled-1',
        scheduledAt: futureDate,
      };

      prismaService.providerConfig.findFirst = jest.fn().mockResolvedValue(mockProvider);
      prismaService.scheduledEmail.create = jest.fn().mockResolvedValue(mockScheduled);

      const result = await service.scheduleEmail(scheduleDto);

      expect(result.id).toBe('scheduled-1');
      expect(result.scheduledAt).toEqual(futureDate);
      expect(prismaService.providerConfig.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'provider-1',
          tenantId: 'tenant-1',
          isActive: true,
          supportsEmail: true,
        },
      });
      expect(prismaService.scheduledEmail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          providerId: 'provider-1',
          subject: 'Scheduled Email',
          status: 'pending',
        }),
      });
    });

    it('should throw NotFoundException when provider is not found for scheduling', async () => {
      prismaService.providerConfig.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.scheduleEmail(scheduleDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when scheduledAt is missing', async () => {
      const noScheduledAt: SendEmailDto = {
        ...scheduleDto,
        scheduledAt: undefined,
      };

      await expect(service.scheduleEmail(noScheduledAt)).rejects.toThrow(BadRequestException);
      await expect(service.scheduleEmail(noScheduledAt)).rejects.toThrow(
        'scheduledAt is required for scheduling',
      );
    });

    it('should throw BadRequestException when scheduledAt is in the past', async () => {
      const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
      const pastSchedule: SendEmailDto = {
        ...scheduleDto,
        scheduledAt: pastDate.toISOString(),
      };

      await expect(service.scheduleEmail(pastSchedule)).rejects.toThrow(BadRequestException);
      await expect(service.scheduleEmail(pastSchedule)).rejects.toThrow(
        'scheduledAt must be in the future',
      );
    });

    it('should serialize attachments as JSON', async () => {
      const withAttachments: SendEmailDto = {
        ...scheduleDto,
        attachments: [
          {
            filename: 'report.pdf',
            content: Buffer.from('PDF data'),
            contentType: 'application/pdf',
          },
        ],
      };

      prismaService.providerConfig.findFirst = jest.fn().mockResolvedValue(mockProvider);
      prismaService.scheduledEmail.create = jest.fn().mockResolvedValue({
        id: 'scheduled-2',
        scheduledAt: futureDate,
      });

      await service.scheduleEmail(withAttachments);

      expect(prismaService.scheduledEmail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          attachments: expect.stringContaining('contentBase64'),
        }),
      });
    });
  });

  describe('replyToEmail', () => {
    const originalEmail = {
      id: 'email-original',
      tenantId: 'tenant-1',
      providerId: 'provider-1',
      messageId: '<original@example.com>',
      references: '<ref1@example.com>',
      threadId: 'thread-1',
    };

    const replyData = {
      to: ['reply-to@example.com'],
      subject: 'Re: Original Subject',
      bodyHtml: '<p>Reply content</p>',
      bodyText: 'Reply content',
    };

    it('should reply to an email with proper headers', async () => {
      const mockEmailProvider = {
        sendEmail: jest.fn().mockResolvedValue({ id: 'reply-message-1' }),
      };

      prismaService.email.findFirst = jest.fn().mockResolvedValue(originalEmail);
      prismaService.providerConfig.findFirst = jest.fn().mockResolvedValue(mockProvider);
      providerTokenService.getProviderWithToken = jest.fn().mockResolvedValue({
        accessToken: 'decrypted-token',
      });
      mockProviderFactory.create.mockReturnValue(mockEmailProvider as any);
      prismaService.email.create = jest.fn().mockResolvedValue({ id: 'reply-email' });

      const result = await service.replyToEmail('email-original', 'tenant-1', replyData);

      expect(result.success).toBe(true);
      expect(mockEmailProvider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          inReplyTo: '<original@example.com>',
        }),
      );
    });

    it('should build references chain from original email', async () => {
      const mockEmailProvider = {
        sendEmail: jest.fn().mockResolvedValue({ id: 'reply-message-2' }),
      };

      prismaService.email.findFirst = jest.fn().mockResolvedValue(originalEmail);
      prismaService.providerConfig.findFirst = jest.fn().mockResolvedValue(mockProvider);
      providerTokenService.getProviderWithToken = jest.fn().mockResolvedValue({
        accessToken: 'decrypted-token',
      });
      mockProviderFactory.create.mockReturnValue(mockEmailProvider as any);
      prismaService.email.create = jest.fn().mockResolvedValue({ id: 'reply-email-2' });

      await service.replyToEmail('email-original', 'tenant-1', replyData);

      // References should include original references + original message ID
      expect(mockEmailProvider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          references: '<ref1@example.com> <original@example.com>',
        }),
      );
    });

    it('should throw NotFoundException when original email not found', async () => {
      prismaService.email.findFirst = jest.fn().mockResolvedValue(null);

      await expect(
        service.replyToEmail('nonexistent', 'tenant-1', replyData),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.replyToEmail('nonexistent', 'tenant-1', replyData),
      ).rejects.toThrow('Original email not found');
    });

    it('should use threadId from original email', async () => {
      const mockEmailProvider = {
        sendEmail: jest.fn().mockResolvedValue({ id: 'reply-message-3' }),
      };

      prismaService.email.findFirst = jest.fn().mockResolvedValue(originalEmail);
      prismaService.providerConfig.findFirst = jest.fn().mockResolvedValue(mockProvider);
      providerTokenService.getProviderWithToken = jest.fn().mockResolvedValue({
        accessToken: 'decrypted-token',
      });
      mockProviderFactory.create.mockReturnValue(mockEmailProvider as any);
      prismaService.email.create = jest.fn().mockResolvedValue({ id: 'reply-email-3' });

      await service.replyToEmail('email-original', 'tenant-1', replyData);

      expect(prismaService.email.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          threadId: 'thread-1',
        }),
      });
    });
  });

  describe('forwardEmail', () => {
    const originalEmail = {
      id: 'email-forward',
      tenantId: 'tenant-1',
      providerId: 'provider-1',
      from: 'original-sender@example.com',
      to: ['original-recipient@example.com'],
      subject: 'Original Subject',
      bodyHtml: '<p>Original content</p>',
      bodyText: 'Original content',
      sentAt: new Date('2024-01-15T10:00:00Z'),
      threadId: 'thread-2',
    };

    const forwardData = {
      to: ['forward-to@example.com'],
    };

    it('should forward an email with proper formatting', async () => {
      const mockEmailProvider = {
        sendEmail: jest.fn().mockResolvedValue({ id: 'forward-message-1' }),
      };

      prismaService.email.findFirst = jest.fn().mockResolvedValue(originalEmail);
      prismaService.providerConfig.findFirst = jest.fn().mockResolvedValue(mockProvider);
      providerTokenService.getProviderWithToken = jest.fn().mockResolvedValue({
        accessToken: 'decrypted-token',
      });
      mockProviderFactory.create.mockReturnValue(mockEmailProvider as any);
      prismaService.email.create = jest.fn().mockResolvedValue({ id: 'forward-email' });

      const result = await service.forwardEmail('email-forward', 'tenant-1', forwardData);

      expect(result.success).toBe(true);
      expect(mockEmailProvider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Fwd: Original Subject',
        }),
      );
    });

    it('should include forwarded message header in body', async () => {
      const mockEmailProvider = {
        sendEmail: jest.fn().mockResolvedValue({ id: 'forward-message-2' }),
      };

      prismaService.email.findFirst = jest.fn().mockResolvedValue(originalEmail);
      prismaService.providerConfig.findFirst = jest.fn().mockResolvedValue(mockProvider);
      providerTokenService.getProviderWithToken = jest.fn().mockResolvedValue({
        accessToken: 'decrypted-token',
      });
      mockProviderFactory.create.mockReturnValue(mockEmailProvider as any);
      prismaService.email.create = jest.fn().mockResolvedValue({ id: 'forward-email-2' });

      await service.forwardEmail('email-forward', 'tenant-1', forwardData);

      expect(mockEmailProvider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyHtml: expect.stringContaining('Forwarded message'),
          bodyHtml: expect.stringContaining('original-sender@example.com'),
        }),
      );
    });

    it('should not duplicate Fwd: prefix if already present', async () => {
      const alreadyForwarded = {
        ...originalEmail,
        subject: 'Fwd: Already forwarded',
      };

      const mockEmailProvider = {
        sendEmail: jest.fn().mockResolvedValue({ id: 'forward-message-3' }),
      };

      prismaService.email.findFirst = jest.fn().mockResolvedValue(alreadyForwarded);
      prismaService.providerConfig.findFirst = jest.fn().mockResolvedValue(mockProvider);
      providerTokenService.getProviderWithToken = jest.fn().mockResolvedValue({
        accessToken: 'decrypted-token',
      });
      mockProviderFactory.create.mockReturnValue(mockEmailProvider as any);
      prismaService.email.create = jest.fn().mockResolvedValue({ id: 'forward-email-3' });

      await service.forwardEmail('email-forward', 'tenant-1', forwardData);

      expect(mockEmailProvider.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Fwd: Already forwarded', // Not "Fwd: Fwd: ..."
        }),
      );
    });

    it('should throw NotFoundException when email to forward not found', async () => {
      prismaService.email.findFirst = jest.fn().mockResolvedValue(null);

      await expect(
        service.forwardEmail('nonexistent', 'tenant-1', forwardData),
      ).rejects.toThrow(NotFoundException);
    });
  });
});