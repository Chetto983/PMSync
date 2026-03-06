/**
 * Configuration service
 * Builds derived variables from environment variables
 * No hardcoded values - everything comes from .env
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment files before computing configuration to avoid missing values
// Priority: .env.{NODE_ENV} > .env (environment-specific overrides base)
const nodeEnv = process.env.NODE_ENV || 'development';
const envPaths = [
  `.env.${nodeEnv}`, // highest priority: .env.development or .env.production
  '.env',            // base defaults
  '../.env',         // root docker-compose vars
  '../../.env',
];
for (const envPath of envPaths) {
  const resolved = path.resolve(process.cwd(), envPath);
  if (fs.existsSync(resolved)) {
    dotenv.config({ path: resolved });
  }
}

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  url: string;
}

export interface RedisTlsConfig {
  enabled: boolean;
  rejectUnauthorized: boolean;
  ca?: string;
  cert?: string;
  key?: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  url: string;
  maxRetries: number;
  retryDelayMs: number;
  tls: RedisTlsConfig;
}

/**
 * Get Redis connection options for BullMQ/ioredis
 * Use this function to get consistent Redis connection config across the app
 */
export interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
  db?: number;
  maxRetriesPerRequest?: null;
  enableReadyCheck?: boolean;
  lazyConnect?: boolean;
  tls?: {
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
}

export function getRedisConnectionOptions(config?: RedisConfig): RedisConnectionOptions {
  const redisConfig = config || getConfiguration().redis;
  const options: RedisConnectionOptions = {
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password || undefined,
    db: redisConfig.db,
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    lazyConnect: true, // Don't block app startup waiting for Redis
  };

  // Add TLS options if enabled (AUDIT-06)
  if (redisConfig.tls?.enabled) {
    options.tls = {
      rejectUnauthorized: redisConfig.tls.rejectUnauthorized,
    };
    // Add certificate paths if provided
    if (redisConfig.tls.ca) {
      options.tls.ca = redisConfig.tls.ca;
    }
    if (redisConfig.tls.cert) {
      options.tls.cert = redisConfig.tls.cert;
    }
    if (redisConfig.tls.key) {
      options.tls.key = redisConfig.tls.key;
    }
  }

  return options;
}

export interface ApiConfig {
  host: string;
  port: number;
  url: string;
  corsOrigins: string[];
  corsAllowAll: boolean;
  corsRegexOrigins: RegExp[];
  trustProxy: string | boolean;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiration: string;
  otpExpiration: number;
  passwordResetExpiration: number;
}

export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  fromEmail: string;
  fromDomain: string;
}

export interface OAuthConfig {
  gmail: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  microsoft: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
}

export interface AiConfig {
  mistral: {
    apiKey: string;
    // Model tiers configured via ai.config.ts (AI_MODEL_SIMPLE/MEDIUM/COMPLEX/CREATIVE)
  };
}

export interface RateLimitConfig {
  ttlMs: number;
  limit: number;
}

export interface Configuration {
  nodeEnv: 'development' | 'production' | 'test';
  logLevel: string;
  frontendUrl: string;
  database: DatabaseConfig;
  redis: RedisConfig;
  api: ApiConfig;
  auth: AuthConfig;
  email: EmailConfig;
  oauth: OAuthConfig;
  ai: AiConfig;
  rateLimit: RateLimitConfig;
  encryption: {
    aesSecretKey: string;
  };
  fieldEncryption: {
    masterKey: string;
    oldMasterKeys: string;
  };
  stt: {
    provider: string;
    googleApiKey?: string;
  };
  tts: {
    provider: string;
    piperLanguage?: string;
  };
}

/**
 * Load and build configuration from environment variables
 */
export function loadConfiguration(): Configuration {
  // Database configuration
  // Priority:
  // 1) DATABASE_URL (Railway/Neon style)
  // 2) Explicit DB_* components
  // 3) Development defaults
  const rawDatabaseUrl = (process.env.DATABASE_URL || '').trim();
  let dbHost = process.env.DB_HOST || 'localhost';
  let dbPort = parseInt(process.env.DB_PORT || '5432', 10);
  let dbUser = process.env.DB_USER || 'mailuser';
  let dbPassword = process.env.DB_PASSWORD || 'mailpass';
  let dbName = process.env.DB_NAME || 'pmsync';
  let databaseUrl = rawDatabaseUrl || `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;

  // If DATABASE_URL is present, derive components from it so production
  // security checks and logs use real credentials instead of defaults.
  if (rawDatabaseUrl) {
    try {
      const parsed = new URL(rawDatabaseUrl);
      if (parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:') {
        if (parsed.hostname) dbHost = parsed.hostname;
        if (parsed.port) {
          const parsedPort = parseInt(parsed.port, 10);
          if (!isNaN(parsedPort)) dbPort = parsedPort;
        }
        if (parsed.username) dbUser = decodeURIComponent(parsed.username);
        // Keep empty string if password is intentionally omitted in URL
        dbPassword = decodeURIComponent(parsed.password || '');
        const pathname = parsed.pathname.replace(/^\/+/, '');
        if (pathname) dbName = pathname;
      }
    } catch {
      // Preserve existing fallback behavior if DATABASE_URL is malformed.
      databaseUrl = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
    }
  }

  // Redis configuration - built from components
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379');
  const redisPassword = process.env.REDIS_PASSWORD || '';
  const redisDb = parseInt(process.env.REDIS_DB || '0');
  const redisMaxRetries = parseInt(process.env.REDIS_MAX_RETRIES || '3');
  const redisRetryDelayMs = parseInt(process.env.REDIS_RETRY_DELAY_MS || '1000');

  // Redis TLS configuration (AUDIT-06)
  const redisTlsEnabled = ['1', 'true', 'yes'].includes((process.env.REDIS_TLS_ENABLED || '').toLowerCase());
  const redisTlsRejectUnauthorized = !['0', 'false', 'no'].includes(
    (process.env.REDIS_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase(),
  );
  const redisTlsCa = process.env.REDIS_TLS_CA || undefined;
  const redisTlsCert = process.env.REDIS_TLS_CERT || undefined;
  const redisTlsKey = process.env.REDIS_TLS_KEY || undefined;

  // Build Redis URL with optional password and TLS protocol
  const redisProtocol = redisTlsEnabled ? 'rediss' : 'redis';
  const redisUrl = redisPassword
    ? `${redisProtocol}://:${encodeURIComponent(redisPassword)}@${redisHost}:${redisPort}/${redisDb}`
    : `${redisProtocol}://${redisHost}:${redisPort}/${redisDb}`;

  // API configuration - built from components
  const apiHost = process.env.API_HOST || 'localhost';
  const apiPort = parseInt(process.env.PORT || process.env.API_PORT || '3000');
  const defaultApiUrl = `http://${apiHost}:${apiPort}`;
  const apiUrl = process.env.API_PUBLIC_URL || defaultApiUrl;
  const trustProxyOverride = process.env.TRUST_PROXY;
  const trustProxy =
    trustProxyOverride === undefined || trustProxyOverride === ''
      ? // Trust first proxy hops on local networks by default (nginx/traefik)
      'loopback, linklocal, uniquelocal'
      : ['true', '1'].includes(trustProxyOverride.toLowerCase())
        ? true
        : ['false', '0'].includes(trustProxyOverride.toLowerCase())
          ? false
          : trustProxyOverride;

  // CORS origins - honor explicit env list when provided
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  // Regex origins (e.g. vercel preview)
  const allowedOriginRegexes = (process.env.CORS_ALLOWED_REGEX || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const defaultOrigins = [
    apiUrl,
    `http://localhost:${apiPort}`,
    process.env.FRONTEND_URL || 'http://localhost:3001',
    'https://localhost',
    'https://localhost:443',
  ];

  const corsOrigins = Array.from(new Set((allowedOrigins.length > 0 ? allowedOrigins : defaultOrigins).filter(Boolean)));

  const corsRegexOrigins: RegExp[] = [
    // Localhost with any port
    /^https?:\/\/localhost(?::\d+)?$/i,
    /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
    // Vercel previews
    /^https?:\/\/([a-z0-9-]+\.)?vercel\.app$/i,
    // Custom user-provided regex
    ...allowedOriginRegexes.map((pattern) => {
      try {
        return new RegExp(pattern, 'i');
      } catch {
        return null;
      }
    }).filter((regex): regex is RegExp => Boolean(regex)),
  ];

  // OAuth redirect URIs - use explicit environment variables or fallback to API_URL
  const gmailRedirectUri = process.env.GOOGLE_REDIRECT_URI || `${apiUrl}/auth/gmail/callback`;
  const microsoftRedirectUri = process.env.MICROSOFT_REDIRECT_URI || `${apiUrl}/auth/microsoft/callback`;

  // SMTP config
  const smtpFromEmail = process.env.SMTP_FROM_EMAIL || 'noreply';
  const smtpFromDomain = process.env.SMTP_FROM_DOMAIN || 'pmsync.local';

  // Rate limiting
  const rateLimitTtlMs = parseInt(process.env.RATE_LIMIT_TTL_MS || '60000');
  const rateLimitLimit = parseInt(process.env.RATE_LIMIT_MAX || '300');

  // Security validation - throw error in production if critical secrets are not set
  const nodeEnv = (process.env.NODE_ENV as any) || 'development';
  const jwtSecret = process.env.JWT_SECRET;
  const aesSecretKey = process.env.AES_SECRET_KEY;
  const debugAuthLog = (process.env.DEBUG_AUTH_LOG || 'false').toLowerCase() === 'true';
  const aesSecretKeyBytes = aesSecretKey ? Buffer.from(aesSecretKey, 'base64') : null;

  // Weak password detection patterns
  const weakPasswords = ['mailpass', 'password', 'admin', '123456', 'postgres', 'root'];
  const isWeakDbPassword = weakPasswords.includes(dbPassword.toLowerCase());
  const isDefaultMinioCredentials =
    process.env.S3_ACCESS_KEY === 'minioadmin' || process.env.S3_SECRET_KEY === 'minioadmin';

  if (nodeEnv === 'production') {
    // Critical security checks - will throw and prevent startup
    if (!jwtSecret || jwtSecret === 'change-me-in-production' || jwtSecret === 'secret') {
      throw new Error('SECURITY ERROR: JWT_SECRET must be set to a strong secret in production. Generate one with: openssl rand -base64 64');
    }
    if (jwtSecret.length < 32) {
      throw new Error('SECURITY ERROR: JWT_SECRET must be at least 32 characters long');
    }
    if (!aesSecretKey || aesSecretKey === 'default-key-change-in-production') {
      throw new Error('SECURITY ERROR: AES_SECRET_KEY must be set to a strong secret in production. Generate one with: openssl rand -base64 32');
    }
    if (!aesSecretKeyBytes || aesSecretKeyBytes.length !== 32) {
      throw new Error('SECURITY ERROR: AES_SECRET_KEY must be a base64-encoded 32-byte key for AES-256. Generate one with: openssl rand -base64 32');
    }
    if (isWeakDbPassword) {
      throw new Error('SECURITY ERROR: DB_PASSWORD is too weak for production. Use a strong, unique password.');
    }
    if (debugAuthLog) {
      throw new Error('SECURITY ERROR: DEBUG_AUTH_LOG must be false in production (logs sensitive auth data)');
    }
    if (rateLimitLimit > 1000) {
      console.warn('\x1b[33m⚠️  WARNING: RATE_LIMIT_MAX is very high (' + rateLimitLimit + '). Consider lowering for DDoS protection.\x1b[0m');
    }
    if (isDefaultMinioCredentials) {
      throw new Error('SECURITY ERROR: S3_ACCESS_KEY and S3_SECRET_KEY cannot use default MinIO credentials in production');
    }
    // Field encryption key validation (opt-in: only validated if set)
    const fieldEncMasterKey = process.env.FIELD_ENCRYPTION_MASTER_KEY;
    if (fieldEncMasterKey && fieldEncMasterKey.length < 44) {
      // 32 bytes base64-encoded = 44 chars minimum
      throw new Error('SECURITY ERROR: FIELD_ENCRYPTION_MASTER_KEY must be at least 32 bytes (44 base64 chars). Generate with: openssl rand -base64 32');
    }
  } else {
    // Development - warn about insecure defaults but don't prevent startup
    if (!jwtSecret || jwtSecret === 'change-me-in-production' || jwtSecret === 'secret') {
      console.warn('\x1b[33m⚠️  WARNING: Using default JWT_SECRET in development. Set JWT_SECRET environment variable.\x1b[0m');
    }
    if (!aesSecretKey || aesSecretKey === 'default-key-change-in-production') {
      console.warn('\x1b[33m⚠️  WARNING: Using default AES_SECRET_KEY in development. Set AES_SECRET_KEY environment variable.\x1b[0m');
    }
    if (isWeakDbPassword) {
      console.warn('\x1b[33m⚠️  WARNING: DB_PASSWORD is weak. Consider using a stronger password.\x1b[0m');
    }
    if (isDefaultMinioCredentials) {
      console.warn('\x1b[33m⚠️  WARNING: Using default MinIO credentials. Change for any non-local deployment.\x1b[0m');
    }
  }

  // Frontend URL - for email links (password reset, etc.)
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

  return {
    nodeEnv,
    logLevel: process.env.LOG_LEVEL || 'debug',
    frontendUrl,

    database: {
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      url: databaseUrl,
    },

    redis: {
      host: redisHost,
      port: redisPort,
      password: redisPassword || undefined,
      db: redisDb,
      url: redisUrl,
      maxRetries: redisMaxRetries,
      retryDelayMs: redisRetryDelayMs,
      tls: {
        enabled: redisTlsEnabled,
        rejectUnauthorized: redisTlsRejectUnauthorized,
        ca: redisTlsCa,
        cert: redisTlsCert,
        key: redisTlsKey,
      },
    },

    api: {
      host: apiHost,
      port: apiPort,
      url: apiUrl,
      corsOrigins,
      corsAllowAll: ['1', 'true', 'yes'].includes((process.env.CORS_ALLOW_ALL || '').toLowerCase()),
      corsRegexOrigins,
      trustProxy,
    },

    auth: {
      jwtSecret: jwtSecret || 'change-me-in-production',
      jwtExpiration: process.env.JWT_EXPIRATION || '24h',
      otpExpiration: parseInt(process.env.OTP_EXPIRATION || '900000'),
      passwordResetExpiration: parseInt(process.env.PASSWORD_RESET_EXPIRATION || '900000'),
    },

    email: {
      smtpHost: process.env.SMTP_HOST || 'localhost',
      smtpPort: parseInt(process.env.SMTP_PORT || '587'),
      smtpUser: process.env.SMTP_USER || 'mailuser',
      smtpPassword: process.env.SMTP_PASSWORD || 'mailpass',
      fromEmail: smtpFromEmail,
      fromDomain: smtpFromDomain,
    },

    oauth: {
      gmail: {
        clientId: process.env.GMAIL_CLIENT_ID || '',
        clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
        redirectUri: gmailRedirectUri,
      },
      microsoft: {
        clientId: process.env.MICROSOFT_CLIENT_ID || '',
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
        redirectUri: microsoftRedirectUri,
      },
    },

    ai: {
      mistral: {
        apiKey: process.env.MISTRAL_API_KEY || '',
        // Model tiers configured via AI_MODEL_SIMPLE/MEDIUM/COMPLEX/CREATIVE
        // See: ai.config.ts and mistral.provider.ts
      },
    },

    rateLimit: {
      ttlMs: rateLimitTtlMs,
      limit: rateLimitLimit,
    },

    encryption: {
      aesSecretKey: aesSecretKey || 'default-key-change-in-production',
    },

    fieldEncryption: {
      masterKey: process.env.FIELD_ENCRYPTION_MASTER_KEY || '',
      oldMasterKeys: process.env.FIELD_ENCRYPTION_OLD_KEYS || '',
    },

    stt: {
      provider: process.env.STT_PROVIDER || 'google',
      googleApiKey: process.env.GOOGLE_STT_API_KEY,
    },

    tts: {
      provider: process.env.TTS_PROVIDER || 'piper',
      piperLanguage: process.env.PIPER_LANGUAGE || 'it_IT',
    },
  };
}

// Export singleton instance
let configInstance: Configuration | null = null;

export function getConfiguration(): Configuration {
  if (!configInstance) {
    configInstance = loadConfiguration();
  }
  return configInstance;
}
