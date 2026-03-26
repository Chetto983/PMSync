/**
 * FolderOperationError — T-0905
 *
 * Typed error hierarchy for folder operations across all drivers.
 * Provides consistent error codes, driver identification, and recoverability hints.
 */

export type FolderErrorCode =
  | 'not-found'
  | 'permission-denied'
  | 'server-error'
  | 'timeout'
  | 'has-children'
  | 'unsupported'
  | 'circuit-breaker'
  | 'name-invalid'
  | 'already-exists';

export type FolderOperation = 'create' | 'delete' | 'rename' | 'list' | 'get';

export type FolderDriverType = 'google' | 'microsoft' | 'imap';

export class FolderOperationError extends Error {
  readonly code: FolderErrorCode;
  readonly driver: FolderDriverType;
  readonly operation: FolderOperation;
  readonly recoverable: boolean;
  declare readonly cause?: Error;

  constructor(opts: {
    code: FolderErrorCode;
    driver: FolderDriverType;
    operation: FolderOperation;
    recoverable: boolean;
    message: string;
    cause?: Error;
  }) {
    super(opts.message);
    this.name = 'FolderOperationError';
    this.code = opts.code;
    this.driver = opts.driver;
    this.operation = opts.operation;
    this.recoverable = opts.recoverable;
    if (opts.cause) this.cause = opts.cause;
  }

  /** Serialise for HTTP response body */
  toJSON() {
    return {
      error: 'FolderOperationError',
      code: this.code,
      driver: this.driver,
      operation: this.operation,
      recoverable: this.recoverable,
      message: this.message,
    };
  }
}

/**
 * Helper to classify a raw driver error into a FolderOperationError.
 * Re-throws the original error if it's already a FolderOperationError.
 */
export function classifyFolderError(
  error: unknown,
  driver: FolderDriverType,
  operation: FolderOperation,
): FolderOperationError {
  if (error instanceof FolderOperationError) return error;

  const msg = error instanceof Error ? error.message : String(error);
  const lowerMsg = msg.toLowerCase();

  // Timeout
  if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out')) {
    return new FolderOperationError({
      code: 'timeout',
      driver,
      operation,
      recoverable: true,
      message: msg,
      cause: error instanceof Error ? error : undefined,
    });
  }

  // Not found (404 / no such mailbox)
  if (lowerMsg.includes('not found') || lowerMsg.includes('404') || lowerMsg.includes('no such')) {
    return new FolderOperationError({
      code: 'not-found',
      driver,
      operation,
      recoverable: false,
      message: msg,
      cause: error instanceof Error ? error : undefined,
    });
  }

  // Permission denied
  if (
    lowerMsg.includes('permission') ||
    lowerMsg.includes('forbidden') ||
    lowerMsg.includes('403') ||
    lowerMsg.includes('access denied') ||
    lowerMsg.includes('not permitted') ||
    lowerMsg.includes('not allowed')
  ) {
    return new FolderOperationError({
      code: 'permission-denied',
      driver,
      operation,
      recoverable: false,
      message: msg,
      cause: error instanceof Error ? error : undefined,
    });
  }

  // Has children
  if (lowerMsg.includes('subfolder') || lowerMsg.includes('hierarchi') || lowerMsg.includes('inferior') || lowerMsg.includes('children')) {
    return new FolderOperationError({
      code: 'has-children',
      driver,
      operation,
      recoverable: false,
      message: msg,
      cause: error instanceof Error ? error : undefined,
    });
  }

  // Unsupported
  if (lowerMsg.includes('not supported') || lowerMsg.includes('use webmail')) {
    return new FolderOperationError({
      code: 'unsupported',
      driver,
      operation,
      recoverable: false,
      message: msg,
      cause: error instanceof Error ? error : undefined,
    });
  }

  // Already exists
  if (lowerMsg.includes('already exists') || lowerMsg.includes('duplicate') || lowerMsg.includes('409')) {
    return new FolderOperationError({
      code: 'already-exists',
      driver,
      operation,
      recoverable: false,
      message: msg,
      cause: error instanceof Error ? error : undefined,
    });
  }

  // Circuit breaker
  if (lowerMsg.includes('circuit breaker')) {
    return new FolderOperationError({
      code: 'circuit-breaker',
      driver,
      operation,
      recoverable: true,
      message: msg,
      cause: error instanceof Error ? error : undefined,
    });
  }

  // Name invalid
  if (lowerMsg.includes('name') && (lowerMsg.includes('invalid') || lowerMsg.includes('empty') || lowerMsg.includes('cannot contain'))) {
    return new FolderOperationError({
      code: 'name-invalid',
      driver,
      operation,
      recoverable: false,
      message: msg,
      cause: error instanceof Error ? error : undefined,
    });
  }

  // Default: server error
  return new FolderOperationError({
    code: 'server-error',
    driver,
    operation,
    recoverable: true,
    message: msg,
    cause: error instanceof Error ? error : undefined,
  });
}
