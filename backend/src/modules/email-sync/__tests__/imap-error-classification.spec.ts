/**
 * T-1701: IMAP/SMTP Error Classification Tests
 *
 * Tests classifyImapError and classifySmtpError for complete coverage
 * of error-type mapping. Focus on error handling paths per Phase 5.
 */
import { describe, it, expect } from '@jest/globals';
import {
  classifyImapError,
  classifySmtpError,
  ImapAuthError,
  ImapNetworkError,
  ImapServerError,
  ImapProtocolError,
  ImapConnectionError,
  SmtpError,
} from '../drivers/imap/imap-errors';
import {
  classifyFolderError,
  FolderOperationError,
} from '../drivers/interfaces/folder-errors';

// ─── classifyImapError ───

describe('classifyImapError', () => {
  describe('authentication errors (NOT retryable)', () => {
    it.each([
      ['AUTHENTICATIONFAILED code', { message: 'Login failed', code: 'AUTHENTICATIONFAILED' }],
      ['AUTHENTICATIONFAILED responseCode', { message: 'Bad creds', responseCode: 'AUTHENTICATIONFAILED' }],
      ['authentication failed message', new Error('NO [AUTHENTICATIONFAILED] authentication failed')],
      ['login failed message', new Error('LOGIN failed')],
      ['invalid credentials', new Error('Invalid credentials provided')],
      ['incorrect password', new Error('Incorrect password')],
    ])('should classify %s as ImapAuthError', (_label, error) => {
      const result = classifyImapError(error);
      expect(result).toBeInstanceOf(ImapAuthError);
      expect(result.retryable).toBe(false);
      expect(result.code).toBe('auth-failed');
    });
  });

  describe('network errors (retryable)', () => {
    it('should classify ETIMEDOUT as network-timeout', () => {
      const err: any = new Error('connect ETIMEDOUT');
      err.code = 'ETIMEDOUT';
      const result = classifyImapError(err);
      expect(result).toBeInstanceOf(ImapNetworkError);
      expect(result.code).toBe('network-timeout');
      expect(result.retryable).toBe(true);
    });

    it('should classify ESOCKET as network-timeout', () => {
      const err: any = new Error('Socket error');
      err.code = 'ESOCKET';
      const result = classifyImapError(err);
      expect(result).toBeInstanceOf(ImapNetworkError);
      expect(result.code).toBe('network-timeout');
      expect(result.retryable).toBe(true);
    });

    it('should classify ECONNRESET as network-reset', () => {
      const err: any = new Error('Connection reset');
      err.code = 'ECONNRESET';
      const result = classifyImapError(err);
      expect(result).toBeInstanceOf(ImapNetworkError);
      expect(result.code).toBe('network-reset');
      expect(result.retryable).toBe(true);
    });

    it('should classify "socket hang up" as network-reset', () => {
      const result = classifyImapError(new Error('socket hang up'));
      expect(result).toBeInstanceOf(ImapNetworkError);
      expect(result.code).toBe('network-reset');
    });

    it('should classify ENOTFOUND as network-dns', () => {
      const err: any = new Error('getaddrinfo ENOTFOUND');
      err.code = 'ENOTFOUND';
      const result = classifyImapError(err);
      expect(result).toBeInstanceOf(ImapNetworkError);
      expect(result.code).toBe('network-dns');
    });

    it('should classify ECONNREFUSED as network-refused', () => {
      const err: any = new Error('Connection refused');
      err.code = 'ECONNREFUSED';
      const result = classifyImapError(err);
      expect(result).toBeInstanceOf(ImapNetworkError);
      expect(result.code).toBe('network-refused');
    });

    it('should classify EHOSTUNREACH as network-unreachable', () => {
      const err: any = new Error('Host unreachable');
      err.code = 'EHOSTUNREACH';
      const result = classifyImapError(err);
      expect(result).toBeInstanceOf(ImapNetworkError);
      expect(result.code).toBe('network-unreachable');
    });

    it('should classify ENETUNREACH as network-unreachable', () => {
      const err: any = new Error('Network unreachable');
      err.code = 'ENETUNREACH';
      const result = classifyImapError(err);
      expect(result).toBeInstanceOf(ImapNetworkError);
      expect(result.code).toBe('network-unreachable');
    });
  });

  describe('server errors (retryable)', () => {
    it('should classify "* BYE" as server-bye', () => {
      const result = classifyImapError(new Error('* BYE server closing connection'));
      expect(result).toBeInstanceOf(ImapServerError);
      expect(result.code).toBe('server-bye');
      expect(result.retryable).toBe(true);
    });

    it('should classify "server closing" as server-bye', () => {
      const result = classifyImapError(new Error('Server closing connection'));
      expect(result).toBeInstanceOf(ImapServerError);
      expect(result.code).toBe('server-bye');
    });

    it('should classify "mailbox locked" as server-busy', () => {
      const result = classifyImapError(new Error('Mailbox locked by another session'));
      expect(result).toBeInstanceOf(ImapServerError);
      expect(result.code).toBe('server-busy');
    });

    it('should classify "too many connections" as server-busy', () => {
      const result = classifyImapError(new Error('Too many connections from your IP'));
      expect(result).toBeInstanceOf(ImapServerError);
      expect(result.code).toBe('server-busy');
    });

    it('should classify "try again" as server-busy', () => {
      const result = classifyImapError(new Error('Temporary failure, try again later'));
      expect(result).toBeInstanceOf(ImapServerError);
      expect(result.code).toBe('server-busy');
    });
  });

  describe('protocol errors (NOT retryable)', () => {
    it('should classify "BAD command" as protocol-bad', () => {
      const result = classifyImapError(new Error('BAD command unknown'));
      expect(result).toBeInstanceOf(ImapProtocolError);
      expect(result.code).toBe('protocol-bad');
      expect(result.retryable).toBe(false);
    });

    it('should classify "not supported" as protocol-bad', () => {
      const result = classifyImapError(new Error('Command not supported'));
      expect(result).toBeInstanceOf(ImapProtocolError);
      expect(result.code).toBe('protocol-bad');
    });
  });

  describe('edge cases', () => {
    it('should return same error if already ImapConnectionError', () => {
      const original = new ImapAuthError('already classified');
      const result = classifyImapError(original);
      expect(result).toBe(original);
    });

    it('should classify non-Error as server-error', () => {
      const result = classifyImapError('random string error');
      expect(result).toBeInstanceOf(ImapServerError);
      expect(result.code).toBe('server-error');
      expect(result.retryable).toBe(true);
    });

    it('should classify unknown Error as server-error', () => {
      const result = classifyImapError(new Error('Some unexpected error'));
      expect(result).toBeInstanceOf(ImapServerError);
      expect(result.code).toBe('server-error');
    });

    it('should preserve original error as cause', () => {
      const original = new Error('Original ETIMEDOUT');
      (original as any).code = 'ETIMEDOUT';
      const result = classifyImapError(original);
      expect(result.cause).toBe(original);
    });
  });
});

// ─── classifySmtpError ───

describe('classifySmtpError', () => {
  describe('SMTP response codes', () => {
    it('should classify 421 as smtp-try-again (retryable)', () => {
      const err: any = new Error('Service not available');
      err.responseCode = 421;
      const result = classifySmtpError(err);
      expect(result.code).toBe('smtp-try-again');
      expect(result.retryable).toBe(true);
      expect(result.smtpResponseCode).toBe(421);
    });

    it('should classify 450 as smtp-try-again (retryable)', () => {
      const err: any = new Error('Mailbox busy');
      err.responseCode = 450;
      const result = classifySmtpError(err);
      expect(result.code).toBe('smtp-try-again');
      expect(result.retryable).toBe(true);
    });

    it('should classify 452 as smtp-message-too-large (NOT retryable)', () => {
      const err: any = new Error('Insufficient storage');
      err.responseCode = 452;
      const result = classifySmtpError(err);
      expect(result.code).toBe('smtp-message-too-large');
      expect(result.retryable).toBe(false);
    });

    it('should classify 535 as smtp-auth-failed (NOT retryable)', () => {
      const err: any = new Error('Auth failed');
      err.responseCode = 535;
      const result = classifySmtpError(err);
      expect(result.code).toBe('smtp-auth-failed');
      expect(result.retryable).toBe(false);
    });

    it('should classify 534 as smtp-auth-failed', () => {
      const err: any = new Error('App password required');
      err.responseCode = 534;
      const result = classifySmtpError(err);
      expect(result.code).toBe('smtp-auth-failed');
      expect(result.retryable).toBe(false);
    });

    it('should classify 550 as smtp-recipient-rejected (NOT retryable)', () => {
      const err: any = new Error('User not found');
      err.responseCode = 550;
      const result = classifySmtpError(err);
      expect(result.code).toBe('smtp-recipient-rejected');
      expect(result.retryable).toBe(false);
    });

    it('should classify 553 as smtp-recipient-rejected', () => {
      const err: any = new Error('Address not permitted');
      err.responseCode = 553;
      const result = classifySmtpError(err);
      expect(result.code).toBe('smtp-recipient-rejected');
    });

    it('should classify 551 as smtp-recipient-rejected', () => {
      const err: any = new Error('User not local');
      err.responseCode = 551;
      const result = classifySmtpError(err);
      expect(result.code).toBe('smtp-recipient-rejected');
    });

    it('should classify 552 as smtp-message-too-large', () => {
      const err: any = new Error('Message exceeds size limit');
      err.responseCode = 552;
      const result = classifySmtpError(err);
      expect(result.code).toBe('smtp-message-too-large');
      expect(result.retryable).toBe(false);
    });
  });

  describe('rate limiting', () => {
    it('should classify "rate limit" in message as smtp-rate-limited', () => {
      const result = classifySmtpError(new Error('Rate limit exceeded'));
      expect(result.code).toBe('smtp-rate-limited');
      expect(result.retryable).toBe(true);
    });

    it('should classify "too many" in message as smtp-rate-limited', () => {
      const result = classifySmtpError(new Error('Too many messages sent'));
      expect(result.code).toBe('smtp-rate-limited');
      expect(result.retryable).toBe(true);
    });

    it('should classify 451 responseCode as smtp-rate-limited', () => {
      const err: any = new Error('Try again');
      err.responseCode = 451;
      const result = classifySmtpError(err);
      expect(result.code).toBe('smtp-rate-limited');
      expect(result.retryable).toBe(true);
    });
  });

  describe('network errors', () => {
    it.each([
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ESOCKET',
    ])('should classify %s as smtp-network (retryable)', (nodeCode) => {
      const err: any = new Error(`Connect ${nodeCode}`);
      err.code = nodeCode;
      const result = classifySmtpError(err);
      expect(result.code).toBe('smtp-network');
      expect(result.retryable).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should return same error if already SmtpError', () => {
      const original = new SmtpError({
        code: 'smtp-auth-failed',
        retryable: false,
        message: 'already typed',
      });
      const result = classifySmtpError(original);
      expect(result).toBe(original);
    });

    it('should default to smtp-server-error for unknown', () => {
      const result = classifySmtpError(new Error('Something weird'));
      expect(result.code).toBe('smtp-server-error');
      expect(result.retryable).toBe(true);
    });

    it('should handle non-Error input', () => {
      const result = classifySmtpError('plain string error');
      expect(result).toBeInstanceOf(SmtpError);
      expect(result.code).toBe('smtp-server-error');
    });
  });
});

// ─── classifyFolderError ───

describe('classifyFolderError', () => {
  it('should classify timeout errors', () => {
    const result = classifyFolderError(
      new Error('Operation timed out'),
      'google',
      'list',
    );
    expect(result).toBeInstanceOf(FolderOperationError);
    expect(result.code).toBe('timeout');
    expect(result.driver).toBe('google');
    expect(result.operation).toBe('list');
    expect(result.recoverable).toBe(true);
  });

  it('should classify not-found errors', () => {
    const result = classifyFolderError(
      new Error('Folder not found'),
      'microsoft',
      'get',
    );
    expect(result.code).toBe('not-found');
    expect(result.recoverable).toBe(false);
  });

  it('should classify 404 as not-found', () => {
    const result = classifyFolderError(
      new Error('HTTP 404'),
      'imap',
      'get',
    );
    expect(result.code).toBe('not-found');
  });

  it('should classify permission-denied', () => {
    const result = classifyFolderError(
      new Error('Access denied'),
      'google',
      'delete',
    );
    expect(result.code).toBe('permission-denied');
    expect(result.recoverable).toBe(false);
  });

  it('should classify 403 as permission-denied', () => {
    const result = classifyFolderError(
      new Error('403 Forbidden'),
      'microsoft',
      'create',
    );
    expect(result.code).toBe('permission-denied');
  });

  it('should classify has-children', () => {
    const result = classifyFolderError(
      new Error('Cannot delete folder with children'),
      'imap',
      'delete',
    );
    expect(result.code).toBe('has-children');
    expect(result.recoverable).toBe(false);
  });

  it('should classify unsupported', () => {
    const result = classifyFolderError(
      new Error('Not supported on this server'),
      'imap',
      'rename',
    );
    expect(result.code).toBe('unsupported');
  });

  it('should classify already-exists', () => {
    const result = classifyFolderError(
      new Error('Folder already exists'),
      'google',
      'create',
    );
    expect(result.code).toBe('already-exists');
  });

  it('should classify 409 as already-exists', () => {
    const result = classifyFolderError(
      new Error('409 Conflict'),
      'microsoft',
      'create',
    );
    expect(result.code).toBe('already-exists');
  });

  it('should classify circuit breaker errors', () => {
    const result = classifyFolderError(
      new Error('Circuit breaker open for google/createFolder'),
      'google',
      'create',
    );
    expect(result.code).toBe('circuit-breaker');
    expect(result.recoverable).toBe(true);
  });

  it('should classify name-invalid', () => {
    const result = classifyFolderError(
      new Error('Folder name is invalid or empty'),
      'imap',
      'create',
    );
    expect(result.code).toBe('name-invalid');
    expect(result.recoverable).toBe(false);
  });

  it('should default to server-error for unknown', () => {
    const result = classifyFolderError(
      new Error('Something unexpected'),
      'google',
      'list',
    );
    expect(result.code).toBe('server-error');
    expect(result.recoverable).toBe(true);
  });

  it('should return same error if already FolderOperationError', () => {
    const original = new FolderOperationError({
      code: 'not-found',
      driver: 'google',
      operation: 'get',
      recoverable: false,
      message: 'Already typed',
    });
    const result = classifyFolderError(original, 'microsoft', 'list');
    expect(result).toBe(original);
  });

  it('should serialize to JSON correctly', () => {
    const error = new FolderOperationError({
      code: 'timeout',
      driver: 'imap',
      operation: 'list',
      recoverable: true,
      message: 'Timed out',
    });
    const json = error.toJSON();
    expect(json).toEqual({
      error: 'FolderOperationError',
      code: 'timeout',
      driver: 'imap',
      operation: 'list',
      recoverable: true,
      message: 'Timed out',
    });
  });
});
