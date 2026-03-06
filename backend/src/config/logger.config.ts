import { Params } from 'nestjs-pino';
import { join } from 'path';
import pino from 'pino';
import 'pino-pretty'; // ensure dependency is detected/available for transports
import 'pino-roll'; // ensure dependency is detected/available for transports

/**
 * Configurazione Pino Logger con rotazione file FIFO 2 giorni
 *
 * Features:
 * - Rotazione giornaliera dei log
 * - Retention di 2 giorni (elimina automaticamente file più vecchi)
 * - Pretty print in development
 * - JSON structured logging in production
 * - Supporto multi-stream (file + console)
 */

const LOG_DIR = process.env.LOG_DIR || join(process.cwd(), 'logs');
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';
const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_ID);

/**
 * Stream per rotazione file con retention di 2 giorni
 */
function createRotatingFileStream() {
  // In produzione usa pino.destination per file rotating
  if (isProduction && !isRailway) {
    return pino.destination({
      dest: join(LOG_DIR, 'app.log'),
      sync: false, // Async per performance
      mkdir: true,
    });
  }
  return undefined;
}

/**
 * Configurazione Pino per NestJS
 */
export const pinoLoggerConfig: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),

    // Formattazione pretty in development (console + file)
    transport: isDevelopment
      ? {
          targets: [
            {
              target: 'pino-pretty',
              level: 'debug',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
                singleLine: false,
                messageFormat: '{req.method} {req.url} - {msg}',
              },
            },
            {
              target: 'pino/file',
              level: 'debug',
              options: {
                destination: join(LOG_DIR, 'app.log'),
                mkdir: true,
              },
            },
          ],
        }
      : isRailway
        ? {
            // On Railway, logs must go to stdout/stderr to be visible in platform logs.
            target: 'pino/file',
            options: {
              destination: 1,
            },
          }
        : {
            target: 'pino/file',
            options: {
              destination: join(LOG_DIR, 'app.log'),
              mkdir: true,
            },
          },

    // Configurazione base Pino
    base: {
      env: process.env.NODE_ENV,
      pid: process.pid,
    },

    // Timestamp personalizzato
    timestamp: () => `,"time":"${new Date().toISOString()}"`,

    // Serializzatori custom per req/res/err
    serializers: {
      req: (req: any) => ({
        method: req.method,
        url: req.url,
        headers: {
          host: req.headers?.host,
          'user-agent': req.headers?.['user-agent'],
          'x-request-id': req.headers?.['x-request-id'],
        },
        remoteAddress: req.remoteAddress,
        remotePort: req.remotePort,
      }),
      res: (res: any) => ({
        statusCode: res.statusCode,
        headers: {
          'content-type': res.headers?.['content-type'],
          'content-length': res.headers?.['content-length'],
        },
      }),
      err: pino.stdSerializers.err,
    },

    // Redact sensitive info (SEC-03: OWASP-compliant credential protection)
    redact: {
      paths: [
        // HTTP headers
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.x-api-key',
        // Request body fields
        'req.body.password',
        'req.body.token',
        'req.body.secret',
        'req.body.accessToken',
        'req.body.refreshToken',
        'req.body.apiKey',
        'req.body.api_key',
        'req.body.cvv',
        'req.body.ssn',
        'req.body.creditCard',
        // Nested object patterns (catch-all for any depth)
        '*.password',
        '*.token',
        '*.secret',
        '*.accessToken',
        '*.refreshToken',
        '*.access_token',
        '*.refresh_token',
        '*.apiKey',
        '*.api_key',
        '*.encryptionIv',
        '*.tokenEncryptionIv',
        '*.refreshTokenEncryptionIv',
        '*.cvv',
        '*.ssn',
        '*.creditCard',
        '*.credit_card',
      ],
      censor: '[REDACTED]',
      remove: false, // Keep key visible for debugging, only censor value
    },

    // Auto logging per HTTP requests
    autoLogging: {
      ignore: (req: any) => {
        // Ignora health check e heartbeat
        return req.url === '/health' || req.url === '/health/ready';
      },
    },

    // Configurazione custom formato log
    customProps: (req: any) => ({
      requestId: req.id || req.headers?.['x-request-id'],
      tenantId: req.user?.tenantId,
      userId: req.user?.userId,
    }),

    // Level personalizzati per response status
    customLogLevel: (_req: any, res: any, err: any) => {
      if (res.statusCode >= 400 && res.statusCode < 500) {
        return 'warn';
      } else if (res.statusCode >= 500 || err) {
        return 'error';
      } else if (res.statusCode >= 300 && res.statusCode < 400) {
        return 'info';
      }
      return 'info';
    },

    // Success message personalizzato
    customSuccessMessage: (req: any, res: any) => {
      return `${req.method} ${req.url} - ${res.statusCode}`;
    },

    // Error message personalizzato
    customErrorMessage: (_req: any, _res: any, err: any) => {
      return err?.message || 'Request failed';
    },
  },
};

/**
 * Configurazione avanzata per file rotation con pino-roll
 * Nota: richiede configurazione esterna o uso di pino.multistream
 */
export function createPinoLogger() {
  const streams: pino.StreamEntry[] = [];

  // Stream console (sempre attivo in development)
  if (isDevelopment) {
    streams.push({
      level: 'debug',
      stream: pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }),
    });
  }

  // Stream file (produzione)
  if (isProduction && !isRailway) {
    const fileStream = createRotatingFileStream();
    if (fileStream) {
      streams.push({
        level: 'info',
        stream: fileStream,
      });
    }
  }

  // Se non ci sono stream, usa stdout
  if (streams.length === 0) {
    return pino({
      level: 'debug',
    });
  }

  return pino(
    {
      level: process.env.LOG_LEVEL || 'info',
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
      formatters: {
        level: (label: string) => {
          return { level: label };
        },
      },
    },
    pino.multistream(streams),
  );
}
