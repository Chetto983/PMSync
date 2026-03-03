import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, RequestMethod } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { CorrelationInterceptor } from './common/interceptors/correlation.interceptor';
import { getConfiguration } from './config/configuration';
import { csrfMiddleware } from './common/middleware/csrf.middleware';

/**
 * Bootstraps and starts the NestJS HTTP server with configured middleware, docs, legacy-route handling, and graceful shutdown.
 *
 * Configures proxy trust, Helmet security, CORS (allowlist, regex, or allow-all), global validation and exception filters, and Swagger when not in production. Mounts a legacy watchdog for /email-configs that responds 410, enables shutdown hooks, starts listening on the configured port, logs startup details (URL, Swagger, database, Redis), and registers SIGTERM/SIGINT handlers that attempt a graceful shutdown before exiting.
 *
 * Usa Pino logger per structured logging con rotazione FIFO di 2 giorni.
 */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // Usa Pino logger al posto del Logger di NestJS
  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);

  const config = getConfiguration();

  // Respect real client IPs behind reverse proxies (prevents rate-limit false positives)
  app.set('trust proxy', config.api.trustProxy);

  // Parse signed/unsigned cookies for auth flows (JWT, MFA device tokens, etc.)
  app.use(cookieParser());

  // Security middleware with Content Security Policy
  // BUG-023: Only allow unsafe-inline in non-production (needed for Swagger UI)
  const isProduction = process.env.NODE_ENV === 'production';
  const scriptSrc: string[] = isProduction
    ? ["'self'"]
    : ["'self'", "'unsafe-inline'"];
  const styleSrc: string[] = isProduction
    ? ["'self'", "'unsafe-inline'"] // Swagger/MUI needs inline styles even in prod
    : ["'self'", "'unsafe-inline'"];
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc,
          styleSrc,
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'wss:', 'https:'],
          fontSrc: ["'self'", 'https:', 'data:'],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false, // Allow embedding from other origins (for OAuth callbacks)
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // Allow OAuth popups
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin resources (API)
    }),
  );

  // CORS configuration - allowlist + regex + optional allow-all
  app.enableCors({
    origin: (origin, callback) => {
      // Allow same-origin/SSR calls without origin
      if (!origin) {
        return callback(null, true);
      }

      if (config.api.corsAllowAll) {
        return callback(null, true);
      }

      if (config.api.corsOrigins.includes(origin)) {
        return callback(null, true);
      }

      if (config.api.corsRegexOrigins.some((regex) => regex.test(origin))) {
        return callback(null, true);
      }

      return callback(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'ngrok-skip-browser-warning',
      'x-webhook-token',
      'X-CSRF-Token', // SEC-04: CSRF protection header
    ],
    optionsSuccessStatus: 204,
    preflightContinue: false,
  });

  // CSRF Protection (SEC-04) - must be after cookieParser
  app.use(csrfMiddleware);

  // Phase 33: API versioning -- all routes under api/v1/ except webhooks and health
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.ALL },
      { path: 'webhooks/(.*)', method: RequestMethod.ALL },
      { path: 'auth/gmail/callback', method: RequestMethod.GET },
      { path: 'auth/microsoft/callback', method: RequestMethod.GET },
    ],
  });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global filters -- Phase 33: unified ApiExceptionFilter replaces AllExceptionsFilter + HttpExceptionFilter
  app.useGlobalFilters(new ApiExceptionFilter());

  // Phase 33: CorrelationInterceptor globally -- sets correlation context for all requests
  app.useGlobalInterceptors(new CorrelationInterceptor());

  // Swagger documentation - disabled in production unless explicitly enabled
  // ENABLE_SWAGGER=true can be set to enable in staging/production (not recommended)
  const enableSwagger =
    config.nodeEnv !== 'production' ||
    ['1', 'true', 'yes'].includes((process.env.ENABLE_SWAGGER || '').toLowerCase());

  if (enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('MailAgent API')
      .setDescription('AI-powered multi-tenant email assistant API')
      .setVersion('1.0')
      .addBearerAuth()
      .addServer(config.api.url, 'Current server')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true, // Keep auth token between refreshes
      },
    });
  }

  // Legacy route watchdog (email-configs)
  const httpAdapter = app.getHttpAdapter();
  const server: any = typeof httpAdapter.getInstance === 'function' ? httpAdapter.getInstance() : null;
  if (server?.use) {
    server.use('/email-configs', (req: any, res: any) => {
      const requestInfo = {
        method: req.method,
        url: req.originalUrl ?? req.url,
        ip: req.ip,
        userAgent: req.headers?.['user-agent'],
      };
      logger.warn('Legacy /email-configs endpoint accessed: ' + JSON.stringify(requestInfo));
      res.status(410).json({
        message: 'This endpoint has been removed. Please migrate to /providers/*.',
        documentation: 'docs/implementation/PROVIDER_INTEGRATION_GUIDE.md',
      });
    });
  }

  // Enable graceful shutdown
  app.enableShutdownHooks();

  await app.listen(config.api.port);
  logger.log(`Application is running on ${config.api.url}`);
  if (enableSwagger) {
    logger.log(`Swagger docs available at ${config.api.url}/api/docs`);
  }
  logger.log(`Database: ${config.database.host}:${config.database.port}/${config.database.database}`);
  logger.log(`Redis: ${config.redis.host}:${config.redis.port}${config.redis.tls.enabled ? ' (TLS)' : ''}`);

  // Graceful shutdown handlers
  const gracefulShutdown = async (signal: string) => {
    logger.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);
    try {
      await app.close();
      logger.log('✅ Application closed gracefully');
      process.exit(0);
    } catch (error) {
      // Properly serialize error for Pino logger
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error({ err: { message: errorMessage, stack: errorStack } }, '❌ Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
