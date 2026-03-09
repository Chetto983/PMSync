import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, RequestMethod } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

interface StartupTrap {
  attachLogger(logger: Logger): void;
  log(message: string): void;
  mark(phase: string): void;
  setContext(name: string, value: string): void;
  stop(message?: string): void;
  fail(error: unknown): void;
}

function parseTrapTimeout(
  rawValue: string | undefined,
  fallbackMs: number,
): number {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackMs;
}

function summarizeActiveHandles(): string {
  const inspector = process as NodeJS.Process & {
    _getActiveHandles?: () => unknown[];
    _getActiveRequests?: () => unknown[];
  };
  const handles = inspector._getActiveHandles?.() ?? [];
  const requests = inspector._getActiveRequests?.() ?? [];
  const counts = handles.reduce<Record<string, number>>((acc, handle) => {
    const handleName =
      typeof handle === 'object' && handle !== null && 'constructor' in handle
        ? ((handle as { constructor?: { name?: string } }).constructor?.name ??
          'Unknown')
        : typeof handle;
    acc[handleName] = (acc[handleName] ?? 0) + 1;
    return acc;
  }, {});

  const samples = handles.slice(0, 5).map((handle) => {
    if (typeof handle !== 'object' || handle === null) {
      return String(handle);
    }

    const constructorName =
      (handle as { constructor?: { name?: string } }).constructor?.name ??
      'Unknown';
    if (constructorName === 'Socket') {
      const socket = handle as {
        localAddress?: string;
        localPort?: number;
        remoteAddress?: string;
        remotePort?: number;
        connecting?: boolean;
        destroyed?: boolean;
      };
      const local =
        socket.localAddress && socket.localPort
          ? `${socket.localAddress}:${socket.localPort}`
          : 'unbound';
      const remote =
        socket.remoteAddress && socket.remotePort
          ? `${socket.remoteAddress}:${socket.remotePort}`
          : 'n/a';
      return `${constructorName}(local=${local},remote=${remote},connecting=${Boolean(socket.connecting)},destroyed=${Boolean(socket.destroyed)})`;
    }

    if (constructorName === 'Timeout') {
      const timeout = handle as { _idleTimeout?: number };
      return `${constructorName}(idleTimeout=${timeout._idleTimeout ?? 'unknown'})`;
    }

    return constructorName;
  });

  return JSON.stringify({
    handleCount: handles.length,
    requestCount: requests.length,
    counts,
    samples,
  });
}

function formatStartupError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function describeNestToken(token: unknown): string {
  if (typeof token === 'function') {
    return token.name || '[anonymous function]';
  }
  if (typeof token === 'symbol') {
    return token.toString();
  }
  if (typeof token === 'string') {
    return token;
  }
  if (token && typeof token === 'object') {
    const candidate = token as { name?: string; constructor?: { name?: string } };
    if (candidate.name) {
      return candidate.name;
    }
    if (candidate.constructor?.name) {
      return candidate.constructor.name;
    }
  }
  return String(token);
}

function describeNestModule(moduleRef: unknown): string {
  if (!moduleRef || typeof moduleRef !== 'object') {
    return String(moduleRef);
  }

  const candidate = moduleRef as {
    metatype?: unknown;
    token?: unknown;
    name?: string;
    constructor?: { name?: string };
  };
  return describeNestToken(
    candidate.metatype ?? candidate.token ?? candidate.name ?? candidate.constructor?.name ?? 'UnknownModule',
  );
}

function createStartupTrap(): StartupTrap {
  const warnAfterMs = parseTrapTimeout(
    process.env.STARTUP_TRAP_WARN_AFTER_MS,
    15_000,
  );
  const repeatAfterMs = parseTrapTimeout(
    process.env.STARTUP_TRAP_REPEAT_MS,
    Math.max(warnAfterMs, 15_000),
  );
  const abortAfterMs = parseTrapTimeout(
    process.env.STARTUP_TRAP_ABORT_AFTER_MS,
    0,
  );
  const startedAt = Date.now();
  const context = new Map<string, string>();
  let currentPhase = 'bootstrap:init';
  let currentPhaseStartedAt = startedAt;
  let sink: Pick<Console, 'log' | 'warn' | 'error'> = console;

  const reportStall = (reason: string, level: 'warn' | 'error' = 'warn') => {
    const contextSuffix =
      context.size > 0
        ? `; context=${JSON.stringify(Object.fromEntries(context.entries()))}`
        : '';
    const message =
      `[startup-trap] ${reason}; phase="${currentPhase}"; ` +
      `phaseElapsedMs=${Date.now() - currentPhaseStartedAt}; totalElapsedMs=${Date.now() - startedAt}; ` +
      `active=${summarizeActiveHandles()}${contextSuffix}`;

    if (level === 'error') {
      sink.error(message);
      return;
    }

    sink.warn(message);
  };

  const interval = setInterval(() => {
    if (Date.now() - currentPhaseStartedAt >= warnAfterMs) {
      reportStall('startup still waiting');
    }
  }, repeatAfterMs);
  interval.unref?.();

  const abortTimer =
    abortAfterMs > 0
      ? setTimeout(() => {
          reportStall('startup exceeded abort timeout', 'error');
          process.exit(1);
        }, abortAfterMs)
      : null;
  abortTimer?.unref?.();

  const clearTimers = () => {
    clearInterval(interval);
    if (abortTimer) {
      clearTimeout(abortTimer);
    }
  };

  return {
    attachLogger(logger: Logger) {
      sink = {
        log: (message: string) => logger.log(message),
        warn: (message: string) => logger.warn(message),
        error: (message: string) => logger.error(message),
      };
    },
    log(message: string) {
      sink.log(message);
    },
    mark(phase: string) {
      currentPhase = phase;
      currentPhaseStartedAt = Date.now();
      sink.log(`[startup] entering ${phase}`);
    },
    setContext(name: string, value: string) {
      context.set(name, value);
    },
    stop(message?: string) {
      clearTimers();
      if (message) {
        sink.log(message);
      }
    },
    fail(error: unknown) {
      reportStall(`startup failed with ${formatStartupError(error)}`, 'error');
      clearTimers();
    },
  };
}

async function runStartupStep<T>(
  trap: StartupTrap,
  phase: string,
  operation: () => Promise<T> | T,
): Promise<T> {
  trap.mark(phase);
  const startedAt = Date.now();
  const result = await operation();
  trap.log(`[startup] completed ${phase} in ${Date.now() - startedAt}ms`);
  return result;
}

function isEnvEnabled(value: string | undefined): boolean {
  return ['1', 'true', 'yes'].includes((value || '').toLowerCase());
}

async function enableNestDiTrace(trap: StartupTrap): Promise<void> {
  if (!isEnvEnabled(process.env.STARTUP_TRAP_TRACE_DI)) {
    return;
  }

  const globalKey = Symbol.for('pmsync.startup-trap.nest-di-trace.enabled');
  const globalRegistry = globalThis as typeof globalThis & Record<symbol, boolean | undefined>;
  if (globalRegistry[globalKey]) {
    return;
  }
  globalRegistry[globalKey] = true;

  const slowThresholdMs = parseTrapTimeout(
    process.env.STARTUP_TRAP_TRACE_DI_SLOW_MS,
    2_000,
  );
  trap.setContext('traceDi', 'true');
  trap.setContext('traceDiSlowMs', String(slowThresholdMs));

  const [{ Injector }, { InstanceLoader }] = await Promise.all([
    import('@nestjs/core/injector/injector'),
    import('@nestjs/core/injector/instance-loader'),
  ]);

  const traceResolution = async <T>(
    kind: string,
    wrapper: { token?: unknown; name?: string; metatype?: unknown } | undefined,
    moduleRef: unknown,
    operation: () => Promise<T>,
  ): Promise<T> => {
    const providerName = describeNestToken(
      wrapper?.token ?? wrapper?.name ?? wrapper?.metatype ?? 'UnknownProvider',
    );
    const moduleName = describeNestModule(moduleRef);
    const startedAt = Date.now();

    const waitingTimer = setTimeout(() => {
      trap.log(
        `[di-trace] waiting ${kind} ${providerName} in ${moduleName} for ${Date.now() - startedAt}ms`,
      );
    }, slowThresholdMs);
    waitingTimer.unref?.();

    try {
      const result = await operation();
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= slowThresholdMs) {
        trap.log(
          `[di-trace] completed ${kind} ${providerName} in ${moduleName} after ${elapsedMs}ms`,
        );
      }
      return result;
    } catch (error) {
      trap.log(
        `[di-trace] failed ${kind} ${providerName} in ${moduleName}: ${formatStartupError(error)}`,
      );
      throw error;
    } finally {
      clearTimeout(waitingTimer);
    }
  };

  const patchAsyncMethod = (
    target: Record<string, unknown>,
    methodName: string,
    kind: string,
  ) => {
    const original = target[methodName];
    if (typeof original !== 'function') {
      return;
    }

    target[methodName] = async function patchedMethod(this: unknown, ...args: unknown[]) {
      const [wrapper, moduleRef] = args as [
        { token?: unknown; name?: string; metatype?: unknown } | undefined,
        unknown,
      ];
      return traceResolution(kind, wrapper, moduleRef, () =>
        Promise.resolve((original as (...innerArgs: unknown[]) => unknown).apply(this, args)),
      );
    };
  };

  patchAsyncMethod(Injector.prototype as unknown as Record<string, unknown>, 'loadProvider', 'provider');
  patchAsyncMethod(Injector.prototype as unknown as Record<string, unknown>, 'loadInjectable', 'injectable');
  patchAsyncMethod(Injector.prototype as unknown as Record<string, unknown>, 'loadController', 'controller');

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalCreateInstances = InstanceLoader.prototype.createInstancesOfDependencies;
  if (typeof originalCreateInstances === 'function') {
    InstanceLoader.prototype.createInstancesOfDependencies = async function patchedCreateInstances(
      this: unknown,
      ...args: unknown[]
    ) {
      const startedAt = Date.now();
      trap.log('[di-trace] InstanceLoader.createInstancesOfDependencies started');
      try {
        const result = await Promise.resolve(
          originalCreateInstances.apply(this, args as Parameters<typeof originalCreateInstances>),
        );
        trap.log(
          `[di-trace] InstanceLoader.createInstancesOfDependencies completed in ${Date.now() - startedAt}ms`,
        );
        return result;
      } catch (error) {
        trap.log(
          `[di-trace] InstanceLoader.createInstancesOfDependencies failed: ${formatStartupError(error)}`,
        );
        throw error;
      }
    };
  }

  trap.log('[di-trace] Nest DI trace enabled');
}

/**
 * Bootstraps and starts the NestJS HTTP server with configured middleware, docs, legacy-route handling, and graceful shutdown.
 *
 * Configures proxy trust, Helmet security, CORS (allowlist, regex, or allow-all), global validation and exception filters, and Swagger when not in production. Mounts a legacy watchdog for /email-configs that responds 410, enables shutdown hooks, starts listening on the configured port, logs startup details (URL, Swagger, database, Redis), and registers SIGTERM/SIGINT handlers that attempt a graceful shutdown before exiting.
 *
 * Usa Pino logger per structured logging con rotazione FIFO di 2 giorni.
 */
async function bootstrap() {
  const trap = createStartupTrap();

  try {
    const [
      { AppModule },
      { ApiExceptionFilter },
      { CorrelationInterceptor },
      { getConfiguration },
      { csrfMiddleware },
      { RedisIoAdapter },
    ] = await runStartupStep(trap, 'import local bootstrap modules', () =>
      Promise.all([
        import('./app.module'),
        import('./common/filters/api-exception.filter'),
        import('./common/interceptors/correlation.interceptor'),
        import('./config/configuration'),
        import('./common/middleware/csrf.middleware'),
        import('./common/adapters/redis-io.adapter'),
      ]),
    );

    await enableNestDiTrace(trap);

    const bufferLogs = !isEnvEnabled(
      process.env.STARTUP_TRAP_DISABLE_BUFFER_LOGS,
    );
    trap.setContext('bufferLogs', String(bufferLogs));

    const app = await runStartupStep(
      trap,
      'NestFactory.create(AppModule)',
      () =>
        NestFactory.create<NestExpressApplication>(AppModule, {
          bufferLogs,
        }),
    );

    // Usa Pino logger al posto del Logger di NestJS
    app.useLogger(app.get(Logger));
    const logger = app.get(Logger);
    trap.attachLogger(logger);

    const config = await runStartupStep(trap, 'load configuration', () =>
      Promise.resolve(getConfiguration()),
    );
    trap.setContext('api', config.api.url);
    trap.setContext(
      'database',
      `${config.database.host}:${config.database.port}/${config.database.database}`,
    );
    trap.setContext(
      'redis',
      `${config.redis.host}:${config.redis.port}${config.redis.tls.enabled ? ' (TLS)' : ''}`,
    );

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
    // SEC: CORS_ALLOW_ALL is forcibly disabled in production to prevent open CORS
    const corsAllowAll =
      config.api.corsAllowAll && config.nodeEnv !== 'production';
    if (config.api.corsAllowAll && config.nodeEnv === 'production') {
      logger.warn(
        '[SECURITY] CORS_ALLOW_ALL is ignored in production environment',
      );
    }

    app.enableCors({
      origin: (origin, callback) => {
        // Allow same-origin/SSR calls without origin
        if (!origin) {
          return callback(null, true);
        }

        if (corsAllowAll) {
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
        { path: 'health/{*path}', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.ALL },
        { path: 'webhooks/{*path}', method: RequestMethod.ALL },
        { path: 'auth/gmail/callback', method: RequestMethod.GET },
        { path: 'auth/microsoft/callback', method: RequestMethod.GET },
        { path: 'metrics', method: RequestMethod.ALL },
        { path: 'api/auth/{*path}', method: RequestMethod.ALL },
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
      ['1', 'true', 'yes'].includes(
        (process.env.ENABLE_SWAGGER || '').toLowerCase(),
      );

    if (enableSwagger) {
      const swaggerConfig = new DocumentBuilder()
        .setTitle('PMSync API')
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
    const server: any =
      typeof httpAdapter.getInstance === 'function'
        ? httpAdapter.getInstance()
        : null;
    if (server?.use) {
      server.use('/email-configs', (req: any, res: any) => {
        const requestInfo = {
          method: req.method,
          url: req.originalUrl ?? req.url,
          ip: req.ip,
          userAgent: req.headers?.['user-agent'],
        };
        logger.warn(
          'Legacy /email-configs endpoint accessed: ' +
            JSON.stringify(requestInfo),
        );
        res.status(410).json({
          message:
            'This endpoint has been removed. Please migrate to /providers/*.',
          documentation: 'docs/implementation/PROVIDER_INTEGRATION_GUIDE.md',
        });
      });
    }

    // Wire Redis-backed WebSocket adapter for horizontal scaling (INFRA-01)
    const redisIoAdapter = new RedisIoAdapter(app);
    await runStartupStep(trap, 'RedisIoAdapter.connectToRedis()', () =>
      redisIoAdapter.connectToRedis(),
    );
    app.useWebSocketAdapter(redisIoAdapter);

    // Enable graceful shutdown
    app.enableShutdownHooks();

    const listenHost = process.env.RAILWAY_ENVIRONMENT ? '0.0.0.0' : undefined;
    await runStartupStep(
      trap,
      `app.listen(${config.api.port}${listenHost ? ', ' + listenHost : ''})`,
      () => (listenHost ? app.listen(config.api.port, listenHost) : app.listen(config.api.port)),
    );
    logger.log(`Application is running on ${config.api.url}`);
    if (enableSwagger) {
      logger.log(`Swagger docs available at ${config.api.url}/api/docs`);
    }
    logger.log(
      `Database: ${config.database.host}:${config.database.port}/${config.database.database}`,
    );
    logger.log(
      `Redis: ${config.redis.host}:${config.redis.port}${config.redis.tls.enabled ? ' (TLS)' : ''}`,
    );
    trap.stop('[startup] application bootstrap completed');

    // Graceful shutdown handlers
    const gracefulShutdown = async (signal: string) => {
      logger.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);
      try {
        await app.close();
        logger.log('✅ Application closed gracefully');
        process.exit(0);
      } catch (error) {
        // Properly serialize error for Pino logger
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        logger.error(
          { err: { message: errorMessage, stack: errorStack } },
          '❌ Error during shutdown',
        );
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    trap.fail(error);
    throw error;
  }
}

bootstrap().catch((err) => {
  // The trap uses console before Nest logger is ready, so failing here still emits the last phase.
  console.error('Failed to start application:', err);
  process.exit(1);
});
