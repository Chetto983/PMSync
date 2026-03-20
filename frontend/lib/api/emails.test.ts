import { emailsApi } from './emails';
import { apiClient } from '../api-client';

jest.mock('../api-client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('emailsApi reply/forward payloads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('replyToEmail sends the edited subject and composed body', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: { success: true, messageId: 'msg-1' },
    });

    await emailsApi.replyToEmail('email-123', {
      subject: 'Re: Edited by user',
      bodyHtml: '<p>Reply body</p>',
      bodyText: 'Reply body',
      cc: ['cc@example.com'],
      bcc: ['bcc@example.com'],
      signatureId: null,
    });

    expect(apiClient.post).toHaveBeenCalledWith('/emails/email-123/reply', {
      subject: 'Re: Edited by user',
      bodyHtml: '<p>Reply body</p>',
      bodyText: 'Reply body',
      cc: ['cc@example.com'],
      bcc: ['bcc@example.com'],
      attachments: undefined,
      signatureId: null,
    });
  });

  it('forwardEmail sends the edited subject and forward body', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: { success: true, messageId: 'msg-2' },
    });

    await emailsApi.forwardEmail('email-456', {
      to: ['to@example.com'],
      subject: 'Fwd: Custom subject',
      bodyHtml: '<p>Forward body</p>',
      bodyText: 'Forward body',
      cc: ['cc@example.com'],
      bcc: ['bcc@example.com'],
      signatureId: null,
    });

    expect(apiClient.post).toHaveBeenCalledWith('/emails/email-456/forward', {
      to: ['to@example.com'],
      subject: 'Fwd: Custom subject',
      bodyHtml: '<p>Forward body</p>',
      bodyText: 'Forward body',
      cc: ['cc@example.com'],
      bcc: ['bcc@example.com'],
      attachments: undefined,
      signatureId: null,
    });
  });
});
