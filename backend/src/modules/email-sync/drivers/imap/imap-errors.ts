/**
 * IMAP/SMTP Connection Error Hierarchy — T-1401
 *
 * Typed error classes for IMAP and SMTP operations. Callers use
 * `error instanceof ImapAuthError` to decide retry vs notify user.
 *
 * Error types:
 * - ImapAuthError: credentials wrong/expired — NOT retryable
 * - ImapNetworkError: timeout, DNS, connection reset — retryable with backoff
 * - ImapServerError: server-side errors, mailbox locked — retryable with delay
 * - ImapProtocolError: malformed response, unsupported command — NOT retryable
 */

export type ImapErrorCode =
  | 'auth-failed'
  | 'auth-expired'
  | 'network-timeout'
  | 'network-reset'
  | 'network-dns'
  | 'network-refused'
  | 'network-unreachable'
  | 'server-bye'
  | 'server-busy'
  | 'server-error'
  | 'protocol-bad'
  | 'protocol-unsupported'
  | 'pool-timeout'
  | 'pool-exhausted';

/**
 * Base class for all IMAP/SMTP connection errors.
 * Use `instanceof` checks on subclasses for branching.
 */
export class ImapConnectionError extends Error {
  readonly code: ImapErrorCode;
  readonly retryable: boolean;
  declare readonly cause?: Error;

  constructor(opts: {
    code: ImapErrorCode;
    retryable: boolean;
    message: string;
    cause?: Error;
  }) {
    super(opts.message);
    this.name = 'ImapConnectionError';
    this.code = opts.code;
    this.retryable = opts.retryable;
    if (opts.cause) this.cause = opts.cause;
  }
}

/** Wrong credentials, expired password, SASL failure — NOT retryable */
export class ImapAuthError extends ImapConnectionError {
  constructor(message: string, cause?: Error) {
    super({ code: 'auth-failed', retryable: false, message, cause });
    this.name = 'ImapAuthError';
  }
}

/** Timeout, DNS, connection reset, unreachable — retryable with backoff */
export class ImapNetworkError extends ImapConnectionError {
  constructor(code: ImapErrorCode, message: string, cause?: Error) {
    super({ code, retryable: true, message, cause });
    this.name = 'ImapNetworkError';
  }
}

/** Server-side errors (BYE, temporary failure, mailbox locked) — retryable with delay */
export class ImapServerError extends ImapConnectionError {
  constructor(code: ImapErrorCode, message: string, cause?: Error) {
    super({ code, retryable: true, message, cause });
    this.name = 'ImapServerError';
  }
}

/** Malformed response, unsupported command, protocol violation — NOT retryable */
export class ImapProtocolError extends ImapConnectionError {
  constructor(message: string, cause?: Error) {
    super({ code: 'protocol-bad', retryable: false, message, cause });
    this.name = 'ImapProtocolError';
  }
}

/**
 * Classify a raw IMAP/SMTP error into the typed hierarchy.
 *
 * Maps imapflow error codes and common Node.js/network error patterns
 * to the appropriate error class.
 */
export function classifyImapError(error: unknown): ImapConnectionError {
  if (error instanceof ImapConnectionError) return error;

  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  const code = (error as any)?.code as string | undefined;
  const responseCode = (error as any)?.responseCode as string | undefined;

  // ── Authentication errors ──
  if (
    code === 'AUTHENTICATIONFAILED' ||
    responseCode === 'AUTHENTICATIONFAILED' ||
    lower.includes('authentication failed') ||
    lower.includes('login failed') ||
    lower.includes('invalid credentials') ||
    lower.includes('incorrect password') ||
    lower.includes('authorizationfailed') ||
    lower.includes('invalid login') ||
    lower.includes('authenticate') && lower.includes('fail')
  ) {
    return new ImapAuthError(
      `IMAP authentication failed: ${msg}`,
      error instanceof Error ? error : undefined,
    );
  }

  // ── Network errors ──
  if (code === 'ETIMEDOUT' || code === 'ESOCKET' || lower.includes('timed out') || lower.includes('timeout')) {
    return new ImapNetworkError(
      'network-timeout',
      `IMAP connection timeout: ${msg}`,
      error instanceof Error ? error : undefined,
    );
  }

  if (code === 'ECONNRESET' || lower.includes('connection reset') || lower.includes('socket hang up')) {
    return new ImapNetworkError(
      'network-reset',
      `IMAP connection reset: ${msg}`,
      error instanceof Error ? error : undefined,
    );
  }

  if (code === 'ENOTFOUND' || lower.includes('getaddrinfo') || lower.includes('dns')) {
    return new ImapNetworkError(
      'network-dns',
      `IMAP DNS resolution failed: ${msg}`,
      error instanceof Error ? error : undefined,
    );
  }

  if (code === 'ECONNREFUSED') {
    return new ImapNetworkError(
      'network-refused',
      `IMAP connection refused: ${msg}`,
      error instanceof Error ? error : undefined,
    );
  }

  if (
    code === 'EHOSTUNREACH' || code === 'ENETUNREACH' ||
    lower.includes('host unreachable') || lower.includes('network unreachable')
  ) {
    return new ImapNetworkError(
      'network-unreachable',
      `IMAP host unreachable: ${msg}`,
      error instanceof Error ? error : undefined,
    );
  }

  // ── Server errors ──
  if (lower.includes('* bye') || lower.includes('server closing') || lower.includes('connection dropped')) {
    return new ImapServerError(
      'server-bye',
      `IMAP server disconnected: ${msg}`,
      error instanceof Error ? error : undefined,
    );
  }

  if (
    lower.includes('mailbox locked') || lower.includes('try again') ||
    lower.includes('temporary') || lower.includes('too many connections')
  ) {
    return new ImapServerError(
      'server-busy',
      `IMAP server busy: ${msg}`,
      error instanceof Error ? error : undefined,
    );
  }

  // ── Protocol errors ──
  if (lower.includes('bad command') || lower.includes('unknown command') || lower.includes('not supported')) {
    return new ImapProtocolError(
      `IMAP protocol error: ${msg}`,
      error instanceof Error ? error : undefined,
    );
  }

  // ── Default: server error (retryable) ──
  return new ImapServerError(
    'server-error',
    `IMAP error: ${msg}`,
    error instanceof Error ? error : undefined,
  );
}

// ── SMTP Error Types ──

export type SmtpErrorCode =
  | 'smtp-auth-failed'
  | 'smtp-recipient-rejected'
  | 'smtp-message-too-large'
  | 'smtp-try-again'
  | 'smtp-rate-limited'
  | 'smtp-network'
  | 'smtp-server-error';

/** Base SMTP error */
export class SmtpError extends Error {
  readonly code: SmtpErrorCode;
  readonly retryable: boolean;
  readonly smtpResponseCode?: number;
  declare readonly cause?: Error;

  constructor(opts: {
    code: SmtpErrorCode;
    retryable: boolean;
    message: string;
    smtpResponseCode?: number;
    cause?: Error;
  }) {
    super(opts.message);
    this.name = 'SmtpError';
    this.code = opts.code;
    this.retryable = opts.retryable;
    this.smtpResponseCode = opts.smtpResponseCode;
    if (opts.cause) this.cause = opts.cause;
  }
}

/**
 * Classify a raw SMTP/nodemailer error into a typed SmtpError.
 */
export function classifySmtpError(error: unknown): SmtpError {
  if (error instanceof SmtpError) return error;

  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  const code = (error as any)?.code as string | undefined;
  const responseCode = (error as any)?.responseCode as number | undefined;
  const cause = error instanceof Error ? error : undefined;

  // SMTP response codes
  if (responseCode) {
    // 421: Service not available, try again later
    if (responseCode === 421) {
      return new SmtpError({ code: 'smtp-try-again', retryable: true, message: msg, smtpResponseCode: responseCode, cause });
    }
    // 450: Mailbox unavailable (busy/locked)
    if (responseCode === 450) {
      return new SmtpError({ code: 'smtp-try-again', retryable: true, message: msg, smtpResponseCode: responseCode, cause });
    }
    // 452: Insufficient storage
    if (responseCode === 452) {
      return new SmtpError({ code: 'smtp-message-too-large', retryable: false, message: msg, smtpResponseCode: responseCode, cause });
    }
    // 535, 534: Authentication failed
    if (responseCode === 535 || responseCode === 534) {
      return new SmtpError({ code: 'smtp-auth-failed', retryable: false, message: msg, smtpResponseCode: responseCode, cause });
    }
    // 550: Recipient rejected
    if (responseCode === 550 || responseCode === 553 || responseCode === 551) {
      return new SmtpError({ code: 'smtp-recipient-rejected', retryable: false, message: msg, smtpResponseCode: responseCode, cause });
    }
    // 552: Message too large
    if (responseCode === 552) {
      return new SmtpError({ code: 'smtp-message-too-large', retryable: false, message: msg, smtpResponseCode: responseCode, cause });
    }
  }

  // Rate limiting (various forms)
  if (lower.includes('rate limit') || lower.includes('too many') || responseCode === 451) {
    return new SmtpError({ code: 'smtp-rate-limited', retryable: true, message: msg, smtpResponseCode: responseCode, cause });
  }

  // Network errors
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ESOCKET') {
    return new SmtpError({ code: 'smtp-network', retryable: true, message: msg, cause });
  }

  // Auth errors by message
  if (lower.includes('authentication') || lower.includes('auth') && lower.includes('fail')) {
    return new SmtpError({ code: 'smtp-auth-failed', retryable: false, message: msg, cause });
  }

  // Default: server error (retryable)
  return new SmtpError({
    code: 'smtp-server-error',
    retryable: true,
    message: `SMTP error: ${msg}`,
    smtpResponseCode: responseCode,
    cause,
  });
}
