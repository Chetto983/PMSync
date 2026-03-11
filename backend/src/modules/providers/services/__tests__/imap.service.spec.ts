/**
 * ImapService unit tests — BTEST-03
 * ImapFlow is fully mocked — no real IMAP connections made.
 * No DB rows created — ImapService has no Prisma dependency.
 */
jest.mock('imapflow');

import { ImapFlow } from 'imapflow';
import { ImapService } from '../imap.service';

const MockedImapFlow = ImapFlow as jest.MockedClass<typeof ImapFlow>;

describe('ImapService', () => {
  let service: ImapService;

  const baseConfig = {
    host: 'imap.test.local',
    port: 993,
    username: 'user@test.local',
    password: 'secret',
    useTls: true,
  };

  beforeAll(() => {
    service = new ImapService();
  });

  afterAll(() => {
    // No DB rows — no cleanup needed
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // testConnection
  // ---------------------------------------------------------------------------

  describe('testConnection', () => {
    it('returns true when ImapFlow.connect resolves successfully', async () => {
      MockedImapFlow.prototype.connect = jest.fn().mockResolvedValue(undefined);
      MockedImapFlow.prototype.logout = jest.fn().mockResolvedValue(undefined);

      const result = await service.testConnection(baseConfig);

      expect(result).toBe(true);
      expect(MockedImapFlow.prototype.connect).toHaveBeenCalledTimes(1);
      expect(MockedImapFlow.prototype.logout).toHaveBeenCalledTimes(1);
    });

    it('returns false when ImapFlow.connect rejects with auth error', async () => {
      MockedImapFlow.prototype.connect = jest.fn().mockRejectedValue(new Error('auth failed'));
      MockedImapFlow.prototype.logout = jest.fn().mockResolvedValue(undefined);

      const result = await service.testConnection(baseConfig);

      expect(result).toBe(false);
      expect(MockedImapFlow.prototype.connect).toHaveBeenCalledTimes(1);
    });

    it('returns false when ImapFlow.connect rejects with connection refused', async () => {
      MockedImapFlow.prototype.connect = jest
        .fn()
        .mockRejectedValue(new Error('ECONNREFUSED'));
      MockedImapFlow.prototype.logout = jest.fn().mockResolvedValue(undefined);

      const result = await service.testConnection(baseConfig);

      expect(result).toBe(false);
    });

    it('still returns false and does not throw when logout also rejects after failed connect', async () => {
      MockedImapFlow.prototype.connect = jest.fn().mockRejectedValue(new Error('auth failed'));
      MockedImapFlow.prototype.logout = jest.fn().mockRejectedValue(new Error('already closed'));

      // Should not throw even if logout fails
      await expect(service.testConnection(baseConfig)).resolves.toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // testSmtpConnection (nodemailer path — just verify integration via result type)
  // ---------------------------------------------------------------------------

  describe('testSmtpConnection', () => {
    it('returns a boolean (false expected — no real SMTP in test env)', async () => {
      const smtpConfig = {
        host: 'smtp.test.local',
        port: 587,
        username: 'user@test.local',
        password: 'secret',
        useTls: false,
      };

      // This will fail to connect (no real SMTP server) but must not throw
      const result = await service.testSmtpConnection(smtpConfig);

      expect(typeof result).toBe('boolean');
      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // createClient
  // ---------------------------------------------------------------------------

  describe('createClient', () => {
    it('creates an ImapFlow instance with the provided config', () => {
      const client = service.createClient(baseConfig);

      expect(client).toBeInstanceOf(ImapFlow);
      expect(MockedImapFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          host: baseConfig.host,
          port: baseConfig.port,
          secure: baseConfig.useTls,
          auth: {
            user: baseConfig.username,
            pass: baseConfig.password,
          },
        }),
      );
    });
  });
});
