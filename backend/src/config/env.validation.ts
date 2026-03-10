import { plainToClass } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsUrl,
  validateSync,
  Min,
  Max,
} from 'class-validator';

/**
 * Environment types
 */
export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Staging = 'staging',
}

/**
 * EnvironmentVariables
 *
 * Validates all required environment variables at application startup.
 * Prevents the application from starting if critical config is missing.
 *
 * Benefits:
 * - Fail fast on misconfiguration
 * - Type-safe environment variables
 * - Clear error messages for missing config
 * - Documentation of required variables
 */
export class EnvironmentVariables {
  // Application
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @Min(1024)
  @Max(65535)
  API_PORT: number = 3000;

  // Database - supports both DATABASE_URL or individual DB_* vars
  // configuration.ts builds URL from DB_* vars, so DATABASE_URL is optional
  @IsString()
  @IsOptional()
  DATABASE_URL?: string;

  @IsString()
  @IsOptional()
  DB_HOST?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(65535)
  DB_PORT?: number;

  @IsString()
  @IsOptional()
  DB_USER?: string;

  @IsString()
  @IsOptional()
  DB_PASSWORD?: string;

  @IsString()
  @IsOptional()
  DB_NAME?: string;

  // Redis (optional in development)
  @IsString()
  @IsOptional()
  REDIS_HOST?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(65535)
  REDIS_PORT?: number;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsNumber()
  @IsOptional()
  REDIS_DB?: number;

  // Redis TLS (AUDIT-06)
  @IsBoolean()
  @IsOptional()
  REDIS_TLS_ENABLED?: boolean;

  @IsBoolean()
  @IsOptional()
  REDIS_TLS_REJECT_UNAUTHORIZED?: boolean;

  @IsString()
  @IsOptional()
  REDIS_TLS_CA?: string;

  @IsString()
  @IsOptional()
  REDIS_TLS_CERT?: string;

  @IsString()
  @IsOptional()
  REDIS_TLS_KEY?: string;

  // OAuth Providers (Gmail/Google)
  @IsString()
  GMAIL_CLIENT_ID: string;

  @IsString()
  GMAIL_CLIENT_SECRET: string;

  // Optional: derived from API_PUBLIC_URL if not set
  @IsString()
  @IsOptional()
  GOOGLE_REDIRECT_URI?: string;

  @IsString()
  MICROSOFT_CLIENT_ID: string;

  @IsString()
  MICROSOFT_CLIENT_SECRET: string;

  // Optional: derived from API_PUBLIC_URL if not set
  @IsString()
  @IsOptional()
  MICROSOFT_REDIRECT_URI?: string;

  // Mistral AI
  @IsString()
  MISTRAL_API_KEY: string;

  @IsString()
  @IsOptional()
  MISTRAL_API_URL?: string;

  // Encryption
  @IsString()
  @IsOptional()
  AES_SECRET_KEY?: string;

  // Field-level encryption (database at-rest, opt-in)
  @IsString()
  @IsOptional()
  FIELD_ENCRYPTION_MASTER_KEY?: string;

  @IsString()
  @IsOptional()
  FIELD_ENCRYPTION_OLD_KEYS?: string;

  // SMTP (Optional)
  @IsString()
  @IsOptional()
  SMTP_HOST?: string;

  @IsNumber()
  @IsOptional()
  SMTP_PORT?: number;

  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  @IsString()
  @IsOptional()
  SMTP_PASS?: string;

  // Frontend URL
  @IsUrl({ require_tld: false })
  @IsOptional()
  FRONTEND_URL?: string;

  // Features
  // Better-Auth secret (shared with frontend for session signing)
  @IsString()
  @IsOptional()
  BETTER_AUTH_SECRET?: string;

  @IsBoolean()
  @IsOptional()
  ENABLE_SWAGGER?: boolean;

  @IsBoolean()
  @IsOptional()
  ENABLE_METRICS?: boolean;

  @IsBoolean()
  @IsOptional()
  LOG_REQUESTS?: boolean;

  // Webhook tokens (for security)
  @IsString()
  @IsOptional()
  WEBHOOK_SECRET?: string;

  @IsString()
  @IsOptional()
  GOOGLE_WEBHOOK_TOKEN?: string;

  @IsString()
  @IsOptional()
  MICROSOFT_WEBHOOK_SECRET?: string;
}

/**
 * Validate and coerce raw environment key-value pairs into an EnvironmentVariables instance.
 *
 * @param config - Raw environment key-value pairs to validate and coerce
 * @returns The validated EnvironmentVariables instance
 * @throws Error - If validation fails; the error message lists each property and its constraint violations
 */
export function validate(config: Record<string, unknown>): EnvironmentVariables {
  // Convert numbers from string to number
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  // Validate
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    whitelist: true,
    forbidNonWhitelisted: false, // Allow extra env vars
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((error) => {
        const constraints = Object.values(error.constraints || {}).join(', ');
        return `${error.property}: ${constraints}`;
      })
      .join('\n');

    throw new Error(`Environment validation failed:\n${errorMessages}`);
  }

  return validatedConfig;
}
