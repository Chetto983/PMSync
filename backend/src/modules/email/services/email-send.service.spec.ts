import { BadRequestException } from '@nestjs/common';
import { EmailSendService } from './email-send.service';

describe('EmailSendService', () => {
  const mockPrisma = {
    email: {
      findFirst: jest.fn(),
    },
    providerConfig: {
      findFirst: jest.fn(),
    },
  };

  const mockCrypto = {};
  const mockAttachmentStorage = {};
  const mockProviderTokenService = {};
  const mockEmailSendQueue = {};
  const mockDriverFactory = {};

  let service: EmailSendService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EmailSendService(
      mockPrisma as any,
      mockCrypto as any,
      mockAttachmentStorage as any,
      mockProviderTokenService as any,
      mockEmailSendQueue as any,
      mockDriverFactory as any,
    );
  });

  it('extracts a plain email address from the original sender when replying', async () => {
    mockPrisma.email.findFirst.mockResolvedValue({
      id: 'email-1',
      providerId: 'provider-1',
      from: 'Davide Marchetto <dvdmarchetto@gmail.com>',
      to: ['support@example.com'],
      cc: [],
      replyTo: null,
      subject: 'Hello',
      messageId: '<msg-1>',
      references: null,
      threadId: 'thread-1',
    });
    mockPrisma.providerConfig.findFirst.mockResolvedValue({
      email: 'davide@example.com',
    });

    const sendSpy = jest
      .spyOn(service, 'sendEmail')
      .mockResolvedValue({ success: true, messageId: 'sent-1' });

    await service.replyToEmail('email-1', 'tenant-1', {
      bodyHtml: '<p>Reply</p>',
      bodyText: 'Reply',
    });

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['dvdmarchetto@gmail.com'],
        subject: 'Re: Hello',
      }),
    );
  });

  it('falls back to the original recipients for self-sent messages', async () => {
    mockPrisma.email.findFirst.mockResolvedValue({
      id: 'email-1',
      providerId: 'provider-1',
      from: 'Davide <davide@example.com>',
      to: ['davide@example.com'],
      cc: [],
      replyTo: null,
      subject: 'Self mail',
      messageId: '<msg-2>',
      references: null,
      threadId: 'thread-2',
    });
    mockPrisma.providerConfig.findFirst.mockResolvedValue({
      email: 'davide@example.com',
    });

    const sendSpy = jest
      .spyOn(service, 'sendEmail')
      .mockResolvedValue({ success: true, messageId: 'sent-2' });

    await service.replyToEmail('email-1', 'tenant-1', {
      bodyHtml: '<p>Reply</p>',
      bodyText: 'Reply',
    });

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['davide@example.com'],
      }),
    );
  });

  it('throws when no reply recipient can be resolved', async () => {
    mockPrisma.email.findFirst.mockResolvedValue({
      id: 'email-1',
      providerId: 'provider-1',
      from: '',
      to: [],
      cc: [],
      replyTo: null,
      subject: 'Broken mail',
      messageId: '<msg-3>',
      references: null,
      threadId: 'thread-3',
    });
    mockPrisma.providerConfig.findFirst.mockResolvedValue({
      email: 'davide@example.com',
    });

    await expect(
      service.replyToEmail('email-1', 'tenant-1', {
        bodyHtml: '<p>Reply</p>',
        bodyText: 'Reply',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('preserves a custom reply subject when provided by the composer', async () => {
    mockPrisma.email.findFirst.mockResolvedValue({
      id: 'email-1',
      providerId: 'provider-1',
      from: 'Sender <sender@example.com>',
      to: ['davide@example.com'],
      cc: [],
      replyTo: null,
      subject: 'Original subject',
      messageId: '<msg-4>',
      references: null,
      threadId: 'thread-4',
    });
    mockPrisma.providerConfig.findFirst.mockResolvedValue({
      email: 'davide@example.com',
    });

    const sendSpy = jest
      .spyOn(service, 'sendEmail')
      .mockResolvedValue({ success: true, messageId: 'sent-4' });

    await service.replyToEmail('email-1', 'tenant-1', {
      subject: 'Re: Updated by user',
      bodyHtml: '<p>Reply</p>',
      bodyText: 'Reply',
    });

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Re: Updated by user',
      }),
    );
  });

  it('preserves custom forward subject and body when provided by the composer', async () => {
    mockPrisma.email.findFirst.mockResolvedValue({
      id: 'email-1',
      providerId: 'provider-1',
      from: 'Sender <sender@example.com>',
      to: ['davide@example.com'],
      subject: 'Original forward subject',
      bodyHtml: '<p>Original body</p>',
      bodyText: 'Original body',
      sentAt: new Date('2026-03-20T10:00:00Z'),
      threadId: 'thread-5',
    });

    const sendSpy = jest
      .spyOn(service, 'sendEmail')
      .mockResolvedValue({ success: true, messageId: 'sent-5' });

    await service.forwardEmail(
      'email-1',
      'tenant-1',
      {
        to: ['target@example.com'],
        subject: 'Fwd: User edited subject',
        bodyHtml: '<p>Custom forward body</p>',
        bodyText: 'Custom forward body',
      },
      '<p>Signature</p>',
    );

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Fwd: User edited subject',
        bodyHtml: expect.stringContaining('<p>Custom forward body</p>'),
        bodyText: 'Custom forward body',
      }),
    );
  });
});
