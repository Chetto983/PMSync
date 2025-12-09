/**
 * Logger Utility
 *
 * Production-ready logging utility for Next.js applications.
 * - Disables debug/info/warn logs in production
 * - Always logs errors (for monitoring)
 * - Provides structured logging with timestamps and context
 * - SSR-safe (works on both server and client)
 *
 * @see https://www.loggly.com/blog/best-practices-for-client-side-logging-and-error-handling-in-react/
 * @see https://blog.arcjet.com/structured-logging-in-json-for-next-js/
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  component?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Determine current environment
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// Set minimum log level based on environment
const MIN_LOG_LEVEL: LogLevel = isProduction ? 'warn' : 'debug';

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  // Always log errors
  if (level === 'error') return true;
  // In test environment, suppress all non-error logs
  if (isTest) return false;
  // Check against minimum log level
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LOG_LEVEL];
}

/**
 * Format log entry for output
 */
function formatLogEntry(entry: LogEntry): string {
  const { timestamp, level, message, context, component } = entry;
  const prefix = component ? `[${component}]` : '';
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';

  if (isProduction) {
    // JSON format for production (easier to parse in log aggregators)
    return JSON.stringify({
      ts: timestamp,
      level,
      msg: message,
      ...(component && { component }),
      ...(context && { ctx: context }),
    });
  }

  // Human-readable format for development
  return `${timestamp} ${level.toUpperCase().padEnd(5)} ${prefix} ${message}${contextStr}`;
}

/**
 * Core logging function
 */
function log(level: LogLevel, message: string, context?: LogContext, component?: string): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context && { context }),
    ...(component && { component }),
  };

  const formattedMessage = formatLogEntry(entry);

  /* eslint-disable no-console -- This is the logger implementation that wraps console */
  switch (level) {
    case 'debug':
      console.debug(formattedMessage);
      break;
    case 'info':
      console.info(formattedMessage);
      break;
    case 'warn':
      console.warn(formattedMessage);
      break;
    case 'error':
      console.error(formattedMessage);
      break;
  }
  /* eslint-enable no-console */
}

/**
 * Create a namespaced logger for a specific component/module
 */
export function createLogger(component: string) {
  return {
    debug: (message: string, context?: LogContext) => log('debug', message, context, component),
    info: (message: string, context?: LogContext) => log('info', message, context, component),
    warn: (message: string, context?: LogContext) => log('warn', message, context, component),
    error: (message: string, context?: LogContext) => log('error', message, context, component),
  };
}

/**
 * Default logger instance
 */
export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),
};

/**
 * Performance measurement utility
 */
export function measurePerformance(label: string): () => void {
  if (!isDevelopment) return () => {};

  const start = performance.now();
  return () => {
    const duration = performance.now() - start;
    logger.debug(`Performance: ${label}`, { durationMs: duration.toFixed(2) });
  };
}

/**
 * Utility to log and re-throw errors (useful in catch blocks)
 */
export function logError(error: unknown, context?: LogContext): never {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  logger.error(message, {
    ...context,
    ...(stack && { stack }),
  });

  throw error;
}

export default logger;
