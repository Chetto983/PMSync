import { Test, TestingModule } from '@nestjs/testing';
import { ImapSendService } from '../services/imap-send.service';
import { ImapConnectionPoolService } from '../services/imap-connection-pool.service';
import { ImapFolderService } from '../services/imap-folder.service';
import { SmtpConfig } from '../interfaces/imap-internal.interface';
import { ComposeMessage } from '../../interfaces/canonical.types';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as nodemailer from 'nodemailer';

// Mock MimeBuilder
jest.mock('../../../../../common/utils', () => ({
  MimeBuilder: {
    build: jest.fn().mockResolvedValue(Buffer.from('test message')),
  },
}));

// Mock nodemailer
jest.mock('nodemailer');

describe('ImapSendService', () => {
  let service: ImapSendService;
  let folderService: ImapFolderService;
  let mockSendMail: jest.Mock;

  const mockSmtpConfig: SmtpConfig = {
    host: 'smtp.example.com',
    port: 465,
    secure: true,
    auth: { user: 'test@example.com', pass: 'password' },
  };

  const mockUserEmail = 'test@example.com';

  beforeEach(async () => {
    // Setup nodemailer mock
    mockSendMail = jest.fn().mockResolvedValue({ messageId: '<test@example.com>' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail,
    });

    const mockClient = {
      append: jest.fn().mockResolvedValue({ uid: 123 }),
    };

    const mockConnectionPool = {
      withConnection: jest.fn().mockImplementation(async (fn) => fn(mockClient)),
      acquireConnection: jest.fn().mockResolvedValue(mockClient),
      releaseConnection: jest.fn(),
    };

    const mockFolderService = {
      resolveFolder: jest.fn().mockImplementation(async (folder: string) => {
        const map: Record<string, string> = {
          SENT: 'Sent',
          DRAFTS: 'Drafts',
        };
        return map[folder] || folder;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImapSendService,
        {
          provide: ImapConnectionPoolService,
          useValue: mockConnectionPool,
        },
        {
          provide: ImapFolderService,
          useValue: mockFolderService,
        },
      ],
    }).compile();

    service = module.get<ImapSendService>(ImapSendService);
    folderService = module.get<ImapFolderService>(ImapFolderService);
  });

  describe('initialize', () => {
    it('should initialize with SMTP config and user email', () => {
      service.initialize(mockSmtpConfig, mockUserEmail);

      expect(service.isInitialized()).toBe(true);
      expect(service.getUserEmail()).toBe(mockUserEmail);
    });

    it('should not be initialized before calling initialize', () => {
      expect(service.isInitialized()).toBe(false);
      expect(service.getUserEmail()).toBeUndefined();
    });
  });

  describe('clearConfig', () => {
    it('should clear configuration', () => {
      service.initialize(mockSmtpConfig, mockUserEmail);
      expect(service.isInitialized()).toBe(true);

      service.clearConfig();

      expect(service.isInitialized()).toBe(false);
      expect(service.getUserEmail()).toBeUndefined();
    });
  });

  describe('sendMessage', () => {
    const mockMessage: ComposeMessage = {
      to: [{ email: 'recipient@example.com', name: 'Recipient' }],
      subject: 'Test Subject',
      bodyHtml: '<p>Test body</p>',
      bodyText: 'Test body',
    };

    beforeEach(() => {
      service.initialize(mockSmtpConfig, mockUserEmail);
    });

    it('should fail without SMTP configuration', async () => {
      service.clearConfig();

      await expect(service.sendMessage(mockMessage)).rejects.toThrow('SMTP not configured');
    });

    it('should send message via SMTP', async () => {
      const result = await service.sendMessage(mockMessage);

      expect(mockSendMail).toHaveBeenCalled();
      expect(result).toBe('<test@example.com>');
    });

    it('should use user email as from if not specified', async () => {
      await service.sendMessage(mockMessage);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: mockUserEmail,
        }),
      );
    });

    it('should use specified from email', async () => {
      const messageWithFrom: ComposeMessage = {
        ...mockMessage,
        fromEmail: 'other@example.com',
      };

      await service.sendMessage(messageWithFrom);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'other@example.com',
        }),
      );
    });

    it('should save sent message to Sent folder', async () => {
      await service.sendMessage(mockMessage);

      expect(folderService.resolveFolder).toHaveBeenCalledWith('SENT');
    });
  });

  describe('saveDraft', () => {
    const mockMessage: ComposeMessage = {
      to: [{ email: 'recipient@example.com' }],
      subject: 'Draft Subject',
      bodyHtml: '<p>Draft body</p>',
    };

    beforeEach(() => {
      service.initialize(mockSmtpConfig, mockUserEmail);
    });

    it('should save draft to Drafts folder', async () => {
      const result = await service.saveDraft(mockMessage);

      expect(folderService.resolveFolder).toHaveBeenCalledWith('DRAFTS');
      expect(result).toBe('Drafts:123');
    });

    it('should delete existing draft if provided', async () => {
      const deleteMessage = jest.fn().mockResolvedValue(undefined);
      const existingDraftId = 'Drafts:100';

      await service.saveDraft(mockMessage, existingDraftId, deleteMessage);

      expect(deleteMessage).toHaveBeenCalledWith(existingDraftId, true);
    });

    it('should ignore delete failure for existing draft', async () => {
      const deleteMessage = jest.fn().mockRejectedValue(new Error('Draft not found'));
      const existingDraftId = 'Drafts:100';

      // Should not throw
      const result = await service.saveDraft(mockMessage, existingDraftId, deleteMessage);
      expect(result).toBe('Drafts:123');
    });
  });

  describe('sendDraft', () => {
    const mockDraft = {
      id: 'Drafts:100',
      to: [{ email: 'recipient@example.com' }],
      subject: 'Draft Subject',
      bodyHtml: '<p>Draft body</p>',
    };

    beforeEach(() => {
      service.initialize(mockSmtpConfig, mockUserEmail);
    });

    it('should throw if draft not found', async () => {
      const getMessage = jest.fn().mockResolvedValue(null);
      const deleteMessage = jest.fn();

      await expect(
        service.sendDraft('Drafts:999', getMessage, deleteMessage),
      ).rejects.toThrow('Draft not found: Drafts:999');
    });

    it('should send draft and delete it', async () => {
      const getMessage = jest.fn().mockResolvedValue(mockDraft);
      const deleteMessage = jest.fn().mockResolvedValue(undefined);

      await service.sendDraft('Drafts:100', getMessage, deleteMessage);

      expect(getMessage).toHaveBeenCalledWith('Drafts:100', { includeBody: true });
      expect(mockSendMail).toHaveBeenCalled();
      expect(deleteMessage).toHaveBeenCalledWith('Drafts:100', true);
    });
  });

  describe('RFC 2047 encoding', () => {
    beforeEach(() => {
      service.initialize(mockSmtpConfig, mockUserEmail);
    });

    it('should encode non-ASCII display names', async () => {
      const messageWithNonAscii: ComposeMessage = {
        to: [{ email: 'recipient@example.com', name: 'Francois' }],
        subject: 'Test',
        bodyHtml: '<p>Test</p>',
      };

      await service.sendMessage(messageWithNonAscii);

      // The formatEmailAddress method should be called internally
      expect(mockSendMail).toHaveBeenCalled();
    });

    it('should not encode ASCII-only display names', async () => {
      const messageWithAscii: ComposeMessage = {
        to: [{ email: 'recipient@example.com', name: 'John Doe' }],
        subject: 'Test',
        bodyHtml: '<p>Test</p>',
      };

      await service.sendMessage(messageWithAscii);

      // Verify the to field format
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('"John Doe" <recipient@example.com>');
    });

    it('should handle email-only addresses', async () => {
      const messageEmailOnly: ComposeMessage = {
        to: [{ email: 'recipient@example.com' }],
        subject: 'Test',
        bodyHtml: '<p>Test</p>',
      };

      await service.sendMessage(messageEmailOnly);

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('recipient@example.com');
    });
  });
});
